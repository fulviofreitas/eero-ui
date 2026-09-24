/**
 * Tests for DnsSettingsCard.
 *
 * Coverage:
 * - Save is disabled when the form is clean, enabled when dirty + valid,
 *   and disabled again when dirty but invalid.
 * - Saving requires going through `uiStore.confirm()` - no PUT fires until
 *   the confirmation is actually acknowledged.
 * - `changed: false` renders an informational message, not a success toast.
 * - A 422 response renders inline instead of only as a toast.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import DnsSettingsCard from './DnsSettingsCard.svelte';
import DnsCachingCard from './DnsCachingCard.svelte';
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
	const utils = render(DnsSettingsCard, { props: { networkId: 'network-123' } });
	await waitFor(() => expect(screen.getByText('ISP DNS (Default)')).toBeInTheDocument());
	return utils;
}

describe('DnsSettingsCard', () => {
	beforeEach(() => {
		dnsStore.clear();
		uiStore.closeConfirm();
	});

	it('disables Save when the form is clean', async () => {
		await renderLoaded();

		const saveButton = screen.getByRole('button', { name: /save/i });
		expect(saveButton).toBeDisabled();
	});

	it('enables Save once the form is dirty and valid, and disables it again when invalid', async () => {
		await renderLoaded();

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		const ipv4Primary = screen.getByLabelText('IPv4 Primary') as HTMLInputElement;
		await fireEvent.input(ipv4Primary, { target: { value: '1.1.1.1' } });

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());

		await fireEvent.input(ipv4Primary, { target: { value: 'not-an-ip' } });
		await waitFor(() => expect(saveButton).toBeDisabled());
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

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		// Confirmation is pending; cancelling must not have issued a request.
		expect(get(confirmDialog)).not.toBeNull();
		expect(putCalls).toBe(0);

		uiStore.closeConfirm();
		expect(putCalls).toBe(0);
	});

	it('never sends a caching key - caching has its own control now', async () => {
		await renderLoaded();

		let requestBody: unknown = null;
		server.use(
			http.put('/api/networks/:networkId/dns', async ({ request }) => {
				requestBody = await request.json();
				return HttpResponse.json({
					success: true,
					changed: true,
					dns: { ...automaticSettings, ipv4: { mode: 'custom' as const, servers: ['1.1.1.1'] } }
				});
			})
		);

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		expect(requestBody).not.toHaveProperty('caching');
		expect(requestBody).toEqual({
			ipv4: { mode: 'custom', servers: ['1.1.1.1'] },
			ipv6: { mode: 'custom', servers: [] }
		});
	});

	it('fires the PUT only after the confirmation is accepted', async () => {
		await renderLoaded();

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/dns', () => {
				putCalls++;
				return HttpResponse.json({
					success: true,
					changed: true,
					dns: {
						...automaticSettings,
						ipv4: { mode: 'custom' as const, servers: ['1.1.1.1'] }
					}
				});
			})
		);

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog?.details?.length).toBeGreaterThanOrEqual(2);

		await dialog!.onConfirm();

		expect(putCalls).toBe(1);
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

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});

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

	it('renders a 422 validation error inline', async () => {
		await renderLoaded();

		server.use(
			http.put('/api/networks/:networkId/dns', () =>
				HttpResponse.json(
					{ detail: { field: 'ipv4', message: 'At most 2 ipv4 DNS servers are supported' } },
					{ status: 422 }
				)
			)
		);

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() =>
			expect(screen.getByText('At most 2 ipv4 DNS servers are supported')).toBeInTheDocument()
		);
	});

	describe('sharing dnsStore with DnsCachingCard', () => {
		it('does not lose an in-progress edit when the sibling caching card writes first', async () => {
			const serversUtils = await renderLoaded();

			const cachingUtils = render(DnsCachingCard, { props: { networkId: 'network-123' } });
			await waitFor(() => expect(cachingUtils.getByLabelText('DNS Caching')).toBeInTheDocument());

			// Start an unsaved edit in the servers form.
			await fireEvent.click(within(serversUtils.container).getByLabelText('Custom DNS'));
			await fireEvent.input(within(serversUtils.container).getByLabelText('IPv4 Primary'), {
				target: { value: '1.1.1.1' }
			});

			// The sibling caching card now saves its own, unrelated change.
			// This replaces `dnsStore.settings` with a brand-new object -
			// ipv4/ipv6 are untouched by that write, but the object identity
			// changes.
			server.use(
				http.put('/api/networks/:networkId/dns', () =>
					HttpResponse.json({
						success: true,
						changed: true,
						dns: { ...automaticSettings, caching: false }
					})
				)
			);
			await fireEvent.click(cachingUtils.getByLabelText('DNS Caching'));
			const cachingSaveButton = within(cachingUtils.container).getByRole('button', {
				name: /save/i
			});
			await waitFor(() => expect(cachingSaveButton).not.toBeDisabled());
			await fireEvent.click(cachingSaveButton);
			await get(confirmDialog)!.onConfirm();

			await waitFor(() => expect(get(dnsStore).settings?.caching).toBe(false));

			// The servers form's in-progress, unsaved edit must survive.
			expect(within(serversUtils.container).getByLabelText('Custom DNS')).toBeChecked();
			expect(
				(within(serversUtils.container).getByLabelText('IPv4 Primary') as HTMLInputElement).value
			).toBe('1.1.1.1');
			const serversSaveButton = within(serversUtils.container).getByRole('button', {
				name: /save/i
			});
			await waitFor(() => expect(serversSaveButton).not.toBeDisabled());
		});
	});
});
