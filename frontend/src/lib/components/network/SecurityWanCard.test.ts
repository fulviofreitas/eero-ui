/**
 * Tests for SecurityWanCard (phase-6.0-revamp.md § 7 WP6, deliverable 12;
 * consistency pass, 2026-10-07).
 *
 * Coverage:
 * - loads and renders every family section with its `data-family` attribute
 * - a controls snippet renders inside its named section (WP8 seam, WAN only
 *   - "wifi-security"/"network" controls are folded into this card's own rows)
 * - a 5xx renders ErrorState with a working retry
 * - gate-off hides the DDNS toggle button / Thread buttons / every row control
 *   on this card, leaving value-only rows
 * - gate-on: the DDNS/Thread toggles go through ConfirmDialog naming "not
 *   verified end-to-end" before any PUT fires; a successful toggle re-fetches;
 *   `changed:false` renders an informational message, not a success toast;
 *   a failed toggle surfaces an error toast
 * - every setting renders exactly once (no duplicate read-only + control rows)
 * - WPA3 per-band select is pre-selected from lower-case API values; one
 *   field per PUT, 6 GHz stays read-only
 * - a cancelled confirm snaps a toggle back to the store's value
 * - DHCP & NAT tri-state initialises correctly from the API (Automatic,
 *   Manual IP, Bridge) and derives the IP address prefix
 * - an unmodified DHCP & NAT Save is disabled and issues no request; a
 *   modified manual range issues exactly one PUT /dhcp with mode manual
 * - subnets table drops id columns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { createRawSnippet } from 'svelte';
import SecurityWanCard from './SecurityWanCard.svelte';
import { securityWanStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
import { resetSettingsLock } from '#lib/stores/settingsLock.js';
import { server } from '../../../../tests/mocks/server';

function mockEntitlements(experimentalWrites: boolean) {
	server.use(
		http.get('/api/networks/:networkId/entitlements', () =>
			HttpResponse.json({
				features: [],
				upsell_features: [],
				is_premium: null,
				premium_status: null,
				capabilities: [],
				experimental_writes: experimentalWrites
			})
		)
	);
}

async function renderWithWrites(enabled: boolean) {
	mockEntitlements(enabled);
	await entitlementsStore.fetch('network-123');
	const result = render(SecurityWanCard, { props: { networkId: 'network-123' } });
	await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());
	return result;
}

describe('SecurityWanCard', () => {
	beforeEach(() => {
		securityWanStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
		resetSettingsLock();
	});

	it('loads and renders every family section with its data-family attribute', async () => {
		const { container } = render(SecurityWanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		for (const family of [
			'wifi-security',
			'network',
			'power-thread',
			'updates',
			'subnets',
			'wan'
		]) {
			expect(container.querySelector(`[data-family="${family}"]`)).toBeInTheDocument();
		}
	});

	it('renders a controls snippet inside its named section', async () => {
		const controls = createRawSnippet(() => ({
			render: () => `<button>Edit WAN</button>`
		}));

		render(SecurityWanCard, {
			props: { networkId: 'network-123', wanControls: controls }
		});

		await waitFor(() => expect(screen.getByText('Edit WAN')).toBeInTheDocument());
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: false,
					band_steering: false,
					upnp: false,
					ipv6: null,
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: null,
					updates: null
				})
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());
	});

	it('hides the DDNS toggle button when the experimental-writes gate is off', async () => {
		await renderWithWrites(false);
		expect(screen.queryByRole('button', { name: /dynamic dns/i })).not.toBeInTheDocument();
	});

	it('gate-on: the DDNS toggle goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		await renderWithWrites(true);

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/ddns', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, ddns: { enabled: true } });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it('a successful toggle confirmation re-fetches the security/WAN state', async () => {
		await renderWithWrites(true);

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ success: true, changed: true, ddns: { enabled: true } })
			),
			http.get('/api/networks/:networkId/advanced', () =>
				HttpResponse.json({
					dhcp: { starting_address: '10.0.0.10', ending_address: '10.0.0.254', mode: 'automatic' },
					connection_mode: 'router',
					power_saving: false,
					ddns: { enabled: true }
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /disable dynamic dns/i })).toBeInTheDocument()
		);
	});

	it('shows an informational message, not a success toast, when the backend reports changed:false', async () => {
		await renderWithWrites(true);

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ success: true, changed: false, ddns: { enabled: false } })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
	});

	it('surfaces a failed toggle as an error toast', async () => {
		await renderWithWrites(true);

		server.use(
			http.put('/api/networks/:networkId/ddns', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /enable dynamic dns/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('hides the Thread enable/disable and regenerate-credentials buttons when the gate is off', async () => {
		await renderWithWrites(false);
		expect(screen.queryByRole('button', { name: /disable thread/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /enable thread/i })).not.toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'Regenerate Credentials' })
		).not.toBeInTheDocument();
	});

	it('gate-on: toggling Thread goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		await renderWithWrites(true);

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/thread', () => {
				putCalls++;
				return HttpResponse.json({ success: true, changed: true, thread: { enabled: false } });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable thread/i }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it('a successful Thread toggle confirmation re-fetches the security/WAN state', async () => {
		await renderWithWrites(true);

		server.use(
			http.put('/api/networks/:networkId/thread', () =>
				HttpResponse.json({
					success: true,
					changed: true,
					thread: { enabled: false, name: 'thread-net', channel: 15, pan_id: '0x1234' }
				})
			),
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: 'enabled',
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: { enabled: false, name: 'thread-net', channel: 15, pan_id: '0x1234' },
					updates: null
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable thread/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() =>
			expect(screen.getByRole('button', { name: /enable thread/i })).toBeInTheDocument()
		);
	});

	it('surfaces a failed Thread toggle as an error toast', async () => {
		await renderWithWrites(true);

		server.use(
			http.put('/api/networks/:networkId/thread', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: /disable thread/i }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('renders WPA3 per band as three labelled rows, 2.4/5 GHz editable and 6 GHz read-only', async () => {
		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		expect(screen.getByText('WPA3 (2.4 GHz)')).toBeInTheDocument();
		expect(screen.getByText('WPA3 (5 GHz)')).toBeInTheDocument();
		expect(screen.getByText('WPA3 (6 GHz)')).toBeInTheDocument();

		const row24 = screen.getByText('WPA3 (2.4 GHz)').closest('.setting-row');
		const row6 = screen.getByText('WPA3 (6 GHz)').closest('.setting-row');
		expect(row24).not.toBeNull();
		expect(row6).not.toBeNull();
		expect(row24!.querySelector('.badge')?.textContent?.trim()).toBe('WPA3');
		expect(row6!.querySelector('.badge')?.textContent?.trim()).toBe('WPA2');
		expect(row6).toHaveClass('readonly');
	});

	it('renders the fast transition badge as Disabled from {fast_transition: false}', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: null,
					wpa3_per_band: null,
					fast_transition: { fast_transition: false },
					sqm: false,
					thread: null,
					updates: null
				})
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		const row = screen.getByText('Fast transition').closest('.setting-row');
		expect(row).not.toBeNull();
		expect(row!.querySelector('.badge')?.textContent?.trim()).toBe('Disabled');
	});

	it('lists IPv6 custom name servers in a mono list, read-only', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: { name_servers: { mode: 'custom', custom: ['1.1.1.1', '8.8.8.8'] } },
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: null,
					updates: null
				})
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		const row = screen.getByText('IPv6 name servers').closest('.setting-row');
		expect(row).not.toBeNull();
		expect(row).toHaveClass('readonly');
		expect(screen.getByText('1.1.1.1, 8.8.8.8')).toBeInTheDocument();
	});

	it('shows a release-notes link only when manifest_resource is an http(s) URL', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: null,
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: null,
					updates: { has_update: false, manifest_resource: 'https://example.com/notes' }
				})
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		const link = screen.getByRole('link', { name: /view release notes/i });
		expect(link).toHaveAttribute('href', 'https://example.com/notes');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	it('hides the release-notes link when manifest_resource is not an http(s) URL', async () => {
		server.use(
			http.get('/api/networks/:networkId/security', () =>
				HttpResponse.json({
					wpa3: true,
					band_steering: true,
					upnp: false,
					ipv6: null,
					wpa3_per_band: null,
					fast_transition: null,
					sqm: false,
					thread: null,
					updates: { has_update: false, manifest_resource: 's3://internal-bucket/notes' }
				})
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		expect(screen.queryByRole('link', { name: /view release notes/i })).not.toBeInTheDocument();
	});

	it('renders exactly one "Disabled by operator" note when the gate is off', async () => {
		await renderWithWrites(false);
		expect(screen.getAllByText(/disabled by operator/i)).toHaveLength(1);
		expect(screen.getByText('EERO_DASHBOARD_EXPERIMENTAL_WRITES=true')).toBeInTheDocument();
	});

	it('renders no "Disabled by operator" note when the gate is on', async () => {
		await renderWithWrites(true);
		expect(screen.queryByText(/disabled by operator/i)).not.toBeInTheDocument();
	});

	it('drops id columns from the subnets table', async () => {
		server.use(
			http.get('/api/networks/:networkId/subnets', () =>
				HttpResponse.json({
					subnets: [
						{
							subnet_id: 'sub-1',
							network_id: 'network-123',
							name: 'guest',
							enabled: true,
							wan_access: true,
							lan_access: false,
							nat_port_randomization: true,
							password_set: true
						}
					]
				})
			)
		);

		render(SecurityWanCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('UPnP')).toBeInTheDocument());

		const subnetsSection = document.querySelector('[data-family="subnets"]');
		expect(subnetsSection).not.toBeNull();
		expect(subnetsSection!.textContent).not.toMatch(/subnet id/i);
		expect(subnetsSection!.textContent).not.toMatch(/network id/i);
		expect(subnetsSection!.querySelector('th')?.textContent?.toLowerCase()).not.toContain('id');
	});

	it('gate-on: regenerating Thread credentials names the re-commissioning consequence', async () => {
		await renderWithWrites(true);

		let postCalls = 0;
		server.use(
			http.post('/api/networks/:networkId/thread/regenerate', () => {
				postCalls++;
				return HttpResponse.json({ success: true });
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Regenerate Credentials' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(dialog!.details).toContain(
			'Thread and Matter devices must be re-commissioned after this change.'
		);
		expect(postCalls).toBe(0);

		await dialog!.onConfirm();
		expect(postCalls).toBe(1);
	});

	// ==================================================================
	// Consistency pass, 2026-10-07: one row per setting + inline controls.
	// ==================================================================

	describe('one row per setting', () => {
		it('renders UPnP exactly once', async () => {
			await renderWithWrites(true);
			expect(screen.getAllByText('UPnP')).toHaveLength(1);
		});

		it('renders SQM exactly once', async () => {
			await renderWithWrites(true);
			expect(screen.getAllByText('SQM')).toHaveLength(1);
		});

		it('renders Band Steering exactly once', async () => {
			await renderWithWrites(true);
			expect(screen.getAllByText('Band Steering')).toHaveLength(1);
		});
	});

	describe('experimental gate off: value-only rows', () => {
		it('renders no checkbox/select controls in the wifi-security or network sections', async () => {
			const { container } = await renderWithWrites(false);

			const wifiSection = container.querySelector('[data-family="wifi-security"]');
			const networkSection = container.querySelector('[data-family="network"]');
			expect(wifiSection!.querySelectorAll('input[type="checkbox"], select')).toHaveLength(0);
			expect(networkSection!.querySelectorAll('input[type="checkbox"], select')).toHaveLength(0);

			// Values are still shown.
			expect(screen.getByText('UPnP')).toBeInTheDocument();
		});
	});

	describe('WPA3 per band (editable)', () => {
		beforeEach(() => {
			server.use(
				http.get('/api/networks/:networkId/security', () =>
					HttpResponse.json({
						wpa3: true,
						band_steering: true,
						upnp: false,
						ipv6: 'enabled',
						wpa3_per_band: { band_2_4_ghz: 'wpa2', band_5_ghz: 'wpa3', band_6_ghz: 'wpa2' },
						fast_transition: null,
						sqm: false,
						thread: null,
						updates: null
					})
				)
			);
		});

		it('pre-selects the 2.4/5 GHz selects from lower-case API values', async () => {
			await renderWithWrites(true);

			const select24 = screen.getByRole('combobox', {
				name: 'WPA3 (2.4 GHz)'
			}) as HTMLSelectElement;
			const select5 = screen.getByRole('combobox', { name: 'WPA3 (5 GHz)' }) as HTMLSelectElement;
			expect(select24.value).toBe('WPA2');
			expect(select5.value).toBe('WPA3');
		});

		it('sends exactly one field in the PUT /wpa3 body when changed', async () => {
			await renderWithWrites(true);

			let receivedBody: Record<string, unknown> | null = null;
			server.use(
				http.put('/api/networks/:networkId/wpa3', async ({ request }) => {
					receivedBody = (await request.json()) as Record<string, unknown>;
					return HttpResponse.json({
						success: true,
						changed: true,
						reboot_expected: true,
						band_2_4_ghz: 'WPA2_WPA3',
						band_5_ghz: 'WPA3'
					});
				})
			);

			const select24 = screen.getByRole('combobox', { name: 'WPA3 (2.4 GHz)' });
			await fireEvent.change(select24, { target: { value: 'WPA2_WPA3' } });

			const dialog = get(confirmDialog);
			expect(dialog).not.toBeNull();
			expect(receivedBody).toBeNull();

			await dialog!.onConfirm();

			expect(receivedBody).toEqual({ band_2_4_ghz: 'WPA2_WPA3' });
			expect(Object.keys(receivedBody!)).toHaveLength(1);
		});
	});

	describe('cancelling a confirm snaps the control back', () => {
		it('reverts the UPnP toggle on cancel', async () => {
			await renderWithWrites(true);

			const toggle = screen.getByRole('switch', { name: 'UPnP' }) as HTMLInputElement;
			expect(toggle.checked).toBe(false);

			await fireEvent.click(toggle);
			expect(toggle.checked).toBe(true);

			const dialog = get(confirmDialog);
			expect(dialog).not.toBeNull();
			dialog!.onCancel?.();

			expect(toggle.checked).toBe(false);
		});
	});

	describe('DHCP & NAT tri-state', () => {
		function advancedHandler(connectionMode: string, dhcp: Record<string, unknown>) {
			return http.get('/api/networks/:networkId/advanced', () =>
				HttpResponse.json({
					dhcp,
					connection_mode: connectionMode,
					power_saving: false,
					ddns: { enabled: false }
				})
			);
		}

		it('initialises to Manual IP for a "custom" dhcp mode under NAT, with the IP prefix derived', async () => {
			server.use(
				advancedHandler('NAT', {
					mode: 'custom',
					subnet_ip: '10.0.4.0',
					subnet_mask: '255.255.252.0',
					starting_address: '10.0.4.20',
					ending_address: '10.0.5.254',
					lease_time_seconds: 86400
				})
			);

			await renderWithWrites(true);

			const manualRadio = screen.getByRole('radio', { name: 'Manual IP' }) as HTMLInputElement;
			expect(manualRadio.checked).toBe(true);
			expect(screen.getByText('10.0.0.0/8')).toBeInTheDocument();
		});

		it('initialises to Bridge when connection mode is BRIDGE', async () => {
			server.use(advancedHandler('BRIDGE', { mode: 'automatic' }));

			await renderWithWrites(true);

			const bridgeRadio = screen.getByRole('radio', { name: 'Bridge' }) as HTMLInputElement;
			expect(bridgeRadio.checked).toBe(true);
		});

		it('initialises to Automatic for an automatic dhcp mode under NAT', async () => {
			server.use(advancedHandler('NAT', { mode: 'automatic' }));

			await renderWithWrites(true);

			const autoRadio = screen.getByRole('radio', { name: 'Automatic' }) as HTMLInputElement;
			expect(autoRadio.checked).toBe(true);
		});

		it('disables Save and issues no request for an unmodified form', async () => {
			server.use(
				advancedHandler('NAT', {
					mode: 'custom',
					subnet_ip: '10.0.4.0',
					subnet_mask: '255.255.252.0',
					starting_address: '10.0.4.20',
					ending_address: '10.0.5.254'
				})
			);

			let dhcpCalls = 0;
			server.use(
				http.put('/api/networks/:networkId/dhcp', () => {
					dhcpCalls++;
					return HttpResponse.json({
						success: true,
						changed: true,
						reboot_expected: true,
						dhcp: null
					});
				})
			);

			await renderWithWrites(true);

			const saveButton = screen.getByRole('button', { name: 'Save' });
			expect(saveButton).toBeDisabled();

			// Even bypassing the disabled attribute, the handler itself must no-op.
			const infoSpy = vi.spyOn(uiStore, 'info');
			await fireEvent.click(saveButton);
			expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
			expect(dhcpCalls).toBe(0);
			infoSpy.mockRestore();
		});

		it('a modified manual range issues exactly one PUT /dhcp with mode manual', async () => {
			server.use(
				advancedHandler('NAT', {
					mode: 'custom',
					subnet_ip: '10.0.4.0',
					subnet_mask: '255.255.252.0',
					starting_address: '10.0.4.20',
					ending_address: '10.0.5.254'
				})
			);

			let dhcpCalls = 0;
			let receivedBody: Record<string, unknown> | null = null;
			server.use(
				http.put('/api/networks/:networkId/dhcp', async ({ request }) => {
					dhcpCalls++;
					receivedBody = (await request.json()) as Record<string, unknown>;
					return HttpResponse.json({
						success: true,
						changed: true,
						reboot_expected: true,
						dhcp: null
					});
				})
			);

			await renderWithWrites(true);

			const endIpInput = screen.getByRole('textbox', { name: 'Ending IP' }) as HTMLInputElement;
			await fireEvent.input(endIpInput, { target: { value: '10.0.6.254' } });

			const saveButton = screen.getByRole('button', { name: 'Save' });
			expect(saveButton).not.toBeDisabled();
			await fireEvent.click(saveButton);

			const dialog = get(confirmDialog);
			expect(dialog).not.toBeNull();
			await dialog!.onConfirm();

			expect(dhcpCalls).toBe(1);
			expect(receivedBody).toEqual({
				mode: 'manual',
				custom: {
					start_ip: '10.0.4.20',
					end_ip: '10.0.6.254',
					subnet_ip: '10.0.4.0',
					subnet_mask: '255.255.252.0'
				}
			});
		});
	});
});
