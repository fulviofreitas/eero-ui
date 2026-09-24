/**
 * Tests for DnsCachingCard.
 *
 * Coverage:
 * - Saving requires going through `uiStore.confirm()` - no PUT fires until
 *   the confirmation is actually acknowledged.
 * - The PUT body contains `caching` alone - no `ipv4`/`ipv6` keys.
 * - `changed: false` renders an informational message, not a success toast.
 * - The shared `dnsStore.applying` flag disables this control while
 *   DnsSettingsCard (or this card itself) has a write in flight, and
 *   vice versa - the two controls can never fire concurrent PUTs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import DnsCachingCard from './DnsCachingCard.svelte';
import DnsSettingsCard from './DnsSettingsCard.svelte';
import { dnsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

const automaticSettings = {
	ipv4: { mode: 'automatic' as const, servers: [] },
	ipv6: { mode: 'automatic' as const, servers: [] },
	caching: true,
	parent_ips: ['203.0.113.1'],
	providers: []
};

async function renderLoaded() {
	server.use(http.get('/api/networks/:networkId/dns', () => HttpResponse.json(automaticSettings)));
	const utils = render(DnsCachingCard, { props: { networkId: 'network-123' } });
	await waitFor(() => expect(screen.getByLabelText('DNS Caching')).toBeInTheDocument());
	return utils;
}

describe('DnsCachingCard', () => {
	beforeEach(() => {
		dnsStore.clear();
		uiStore.closeConfirm();
	});

	it('disables Save when the toggle matches the loaded setting', async () => {
		await renderLoaded();

		expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
	});

	it('does not fire a PUT request until the confirmation is acknowledged', async () => {
		await renderLoaded();

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/dns', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, dns: automaticSettings });
			})
		);

		await fireEvent.click(screen.getByLabelText('DNS Caching'));

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		expect(get(confirmDialog)).not.toBeNull();
		expect(putCalls).toBe(0);

		uiStore.closeConfirm();
		expect(putCalls).toBe(0);
	});

	it('sends caching alone, with no ipv4/ipv6 keys, once confirmed', async () => {
		await renderLoaded();

		let requestBody: unknown = null;
		server.use(
			http.put('/api/networks/:networkId/dns', async ({ request }) => {
				requestBody = await request.json();
				return HttpResponse.json({
					success: true,
					changed: true,
					dns: { ...automaticSettings, caching: false }
				});
			})
		);

		await fireEvent.click(screen.getByLabelText('DNS Caching'));

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog?.details?.length).toBeGreaterThanOrEqual(2);

		await dialog!.onConfirm();

		expect(requestBody).toEqual({ caching: false });
		await waitFor(() =>
			expect(screen.getByText(/applying — your network will restart shortly/i)).toBeInTheDocument()
		);
	});

	it('shows an informational message, not a success toast, when nothing changed', async () => {
		await renderLoaded();

		server.use(
			http.put('/api/networks/:networkId/dns', () =>
				HttpResponse.json({ success: true, changed: false, dns: automaticSettings })
			)
		);

		await fireEvent.click(screen.getByLabelText('DNS Caching'));

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	describe('shared applying lock with DnsSettingsCard', () => {
		it('disables the caching Save button while the servers form is applying', async () => {
			server.use(
				http.get('/api/networks/:networkId/dns', () => HttpResponse.json(automaticSettings))
			);

			let resolvePut: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolvePut = resolve;
			});
			server.use(
				http.put('/api/networks/:networkId/dns', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						changed: true,
						dns: { ...automaticSettings, ipv4: { mode: 'custom' as const, servers: ['1.1.1.1'] } }
					});
				})
			);

			const serversUtils = render(DnsSettingsCard, { props: { networkId: 'network-123' } });
			await waitFor(() => expect(serversUtils.getByText('ISP DNS (Default)')).toBeInTheDocument());
			const cachingUtils = render(DnsCachingCard, { props: { networkId: 'network-123' } });
			await waitFor(() => expect(cachingUtils.getByLabelText('DNS Caching')).toBeInTheDocument());

			// Both cards mount into document.body, so the render-result queries are
			// not scoped to their own card. Narrow to the container explicitly.
			const cachingSaveButton = within(cachingUtils.container).getByRole('button', {
				name: /save/i
			});

			// Make the caching form dirty too (untouched, its own Save would
			// already be disabled by `!dirty`, which would make this test pass
			// trivially and prove nothing about the shared lock). With a real
			// pending change, disabled must come from the shared `applying`
			// flag alone.
			await fireEvent.click(cachingUtils.getByLabelText('DNS Caching'));
			await waitFor(() => expect(cachingSaveButton).not.toBeDisabled());

			await fireEvent.click(serversUtils.getByLabelText('Custom DNS'));
			await fireEvent.input(serversUtils.getByLabelText('IPv4 Primary'), {
				target: { value: '1.1.1.1' }
			});

			const serversSaveButton = within(serversUtils.container).getByRole('button', {
				name: /save/i
			});
			await waitFor(() => expect(serversSaveButton).not.toBeDisabled());
			await fireEvent.click(serversSaveButton);

			const dialog = get(confirmDialog);
			const confirmPromise = dialog!.onConfirm();

			// Mid-flight: the servers write is applying, so the caching card's
			// own Save button must be disabled even though ITS toggle is dirty
			// on its own terms. `dnsStore.applying` flips synchronously (the
			// store sets it before the first `await` inside `updateDns`), but
			// Svelte flushes the resulting DOM update asynchronously - assert
			// through `waitFor` rather than immediately after the raw store
			// read, or this is racy under load.
			await waitFor(() => expect(get(dnsStore).applying).toBe(true));
			await waitFor(() => expect(cachingSaveButton).toBeDisabled());

			resolvePut!();
			await confirmPromise;

			await waitFor(() => expect(get(dnsStore).applying).toBe(false));
			await waitFor(() => expect(cachingSaveButton).not.toBeDisabled());
		});
	});
});
