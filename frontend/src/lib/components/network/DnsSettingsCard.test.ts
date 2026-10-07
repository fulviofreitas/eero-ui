/**
 * Tests for DnsSettingsCard.
 *
 * DNS caching merged into this card (consistency pass, 2026-10-07) - the former sibling
 * DnsCachingCard is gone, along with its own Save button. One Save now covers both halves of
 * the form; still only one PUT per submit.
 *
 * Coverage:
 * - Save is disabled when the form is clean, enabled when servers are dirty + valid, and
 *   disabled again when dirty but invalid.
 * - Save is enabled by a caching-only change, even while an in-progress, not-yet-valid
 *   servers edit sits in the form.
 * - Saving requires going through `uiStore.confirm()` - no PUT fires until the confirmation
 *   is actually acknowledged.
 * - A caching-only change sends `{caching}` alone, with no `ipv4`/`ipv6` keys.
 * - A servers-only change sends `{ipv4, ipv6}`, with no `caching` key.
 * - When both changed, ONE request carries both, and the confirm dialog's details mention
 *   two separate DNS writes / more than one restart.
 * - `changed: false` renders an informational message, not a success toast.
 * - A 422 response renders inline instead of only as a toast.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
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

async function renderLoaded(settings: typeof automaticSettings = automaticSettings) {
	server.use(http.get('/api/networks/:networkId/dns', () => HttpResponse.json(settings)));
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

	it('enables Save once the servers form is dirty and valid, and disables it again when invalid', async () => {
		await renderLoaded();

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		const ipv4Primary = screen.getByLabelText('IPv4 Primary') as HTMLInputElement;
		await fireEvent.input(ipv4Primary, { target: { value: '1.1.1.1' } });

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());

		await fireEvent.input(ipv4Primary, { target: { value: 'not-an-ip' } });
		await waitFor(() => expect(saveButton).toBeDisabled());
	});

	it('enables Save from a caching-only change, even with an in-progress invalid servers edit', async () => {
		await renderLoaded();

		// Start an in-progress, invalid servers edit - this alone must not enable Save, and
		// must not block the caching-only save below either.
		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: 'not-an-ip' }
		});
		const saveButton = screen.getByRole('button', { name: /save/i });
		expect(saveButton).toBeDisabled();

		await fireEvent.click(screen.getByLabelText('DNS Caching'));
		await waitFor(() => expect(saveButton).not.toBeDisabled());
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

	it('sends caching alone, with no ipv4/ipv6 keys, on a caching-only change', async () => {
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
		await dialog!.onConfirm();

		expect(requestBody).toEqual({ caching: false });
	});

	it('sends servers alone, with no caching key, on a servers-only change', async () => {
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
		expect(dialog?.details?.some((d) => /two separate/i.test(d))).toBe(false);
		await dialog!.onConfirm();

		expect(requestBody).not.toHaveProperty('caching');
		expect(requestBody).toEqual({
			ipv4: { mode: 'custom', servers: ['1.1.1.1'] },
			ipv6: { mode: 'custom', servers: [] }
		});
	});

	it('sends one combined request and warns about two writes when both servers and caching changed', async () => {
		await renderLoaded();

		let putCalls = 0;
		let requestBody: unknown = null;
		server.use(
			http.put('/api/networks/:networkId/dns', async ({ request }) => {
				putCalls++;
				requestBody = await request.json();
				return HttpResponse.json({
					success: true,
					changed: true,
					dns: {
						...automaticSettings,
						ipv4: { mode: 'custom' as const, servers: ['1.1.1.1'] },
						caching: false
					}
				});
			})
		);

		await fireEvent.click(screen.getByLabelText('Custom DNS'));
		await fireEvent.input(screen.getByLabelText('IPv4 Primary'), {
			target: { value: '1.1.1.1' }
		});
		await fireEvent.click(screen.getByLabelText('DNS Caching'));

		const saveButton = screen.getByRole('button', { name: /save/i });
		await waitFor(() => expect(saveButton).not.toBeDisabled());
		await fireEvent.click(saveButton);

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog?.details?.some((d) => /two separate/i.test(d))).toBe(true);
		expect(dialog?.details?.some((d) => /more than once/i.test(d))).toBe(true);

		await dialog!.onConfirm();

		// One PUT, carrying both halves.
		expect(putCalls).toBe(1);
		expect(requestBody).toEqual({
			ipv4: { mode: 'custom', servers: ['1.1.1.1'] },
			ipv6: { mode: 'custom', servers: [] },
			caching: false
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
});
