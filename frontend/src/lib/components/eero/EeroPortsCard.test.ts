/**
 * Tests for EeroPortsCard (phase-6.0-revamp.md § 7 WP7, family 6).
 *
 * Coverage:
 * - renders nothing when there are no ports
 * - renders one card per port
 * - gate-off hides the per-port action control
 * - gate-on: running a port action goes through ConfirmDialog naming "not
 *   verified end-to-end" before any POST fires
 * - a successful run shows a success toast
 * - a 422 port_protected response renders inline against that port, not as
 *   a toast
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import EeroPortsCard from './EeroPortsCard.svelte';
import { entitlementsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';
import type { EthernetPort } from '$api/types';

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

const PORTS: EthernetPort[] = [
	{
		port_name: 'eth1',
		interface_number: 1,
		has_carrier: true,
		speed: '1000',
		is_wan_port: false,
		is_lte: false,
		neighbor_location: null,
		neighbor_port: null
	}
];

describe('EeroPortsCard', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('renders nothing when there are no ports', () => {
		const { container } = render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: null } });
		expect(container.querySelector('.wide-card')).not.toBeInTheDocument();
	});

	it('renders one card per port', () => {
		render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: PORTS } });
		expect(screen.getByText('eth1')).toBeInTheDocument();
	});

	it('hides the per-port action control when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: PORTS } });

		expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
	});

	it('gate-on: running a port action goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: PORTS } });

		let postCalls = 0;
		server.use(
			http.post('/api/eeros/:eeroId/ports/:portNumber/action', () => {
				postCalls++;
				return HttpResponse.json({
					success: true,
					eero_id: 'eero-1',
					port_number: 'eth1',
					action: 'ENABLE_DATA'
				});
			})
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Run' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(postCalls).toBe(0);
	});

	it('a successful run shows a success toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: PORTS } });

		server.use(
			http.post('/api/eeros/:eeroId/ports/:portNumber/action', () =>
				HttpResponse.json({
					success: true,
					eero_id: 'eero-1',
					port_number: 'eth1',
					action: 'ENABLE_DATA'
				})
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'success')).toBe(true));
	});

	it('renders a 422 port_protected response inline against that port, not as a toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(EeroPortsCard, { props: { eeroId: 'eero-1', ports: PORTS } });

		server.use(
			http.post('/api/eeros/:eeroId/ports/:portNumber/action', () =>
				HttpResponse.json(
					{
						detail:
							"Refusing to disable data/power/the port on the gateway's WAN/uplink port - this would disconnect the whole network.",
						type: 'port_protected'
					},
					{ status: 422 }
				)
			)
		);

		await fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DISABLE_DATA' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Run' }));
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
		expect(screen.getByRole('alert').textContent).toContain('WAN/uplink port');
		expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(false);
	});
});
