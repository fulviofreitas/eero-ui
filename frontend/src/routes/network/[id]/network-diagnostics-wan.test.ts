/**
 * The Diagnostics tab shows the WAN throughput card before speed-test history, and swaps it for a
 * one-line note in bridge mode (no request made). A null connection_mode still shows the card.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { entitlementsStore, networksStore, wanThroughputStore } from '$stores';
import { server } from '../../../../tests/mocks/server';
import { wanFixture } from '../../../../tests/mocks/handlers';

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost/network/network-123'),
		params: { id: 'network-123' },
		route: { id: '/network/[id]' },
		status: 200,
		error: null,
		data: {},
		form: null
	}
}));

function networkWithMode(mode: string | null) {
	return http.get('/api/networks/:networkId', ({ params }) =>
		HttpResponse.json({
			id: params.networkId,
			name: 'Home Network',
			status: 'online',
			guest_network_enabled: false,
			public_ip: '203.0.113.1',
			isp_name: 'Example ISP',
			device_count: 15,
			eero_count: 3,
			speed_test: null,
			health: null,
			connection_mode: mode
		})
	);
}

async function openDiagnostics() {
	const Page = (await import('./+page.svelte')).default;
	render(Page);
	await waitFor(
		() =>
			expect(screen.getByRole('heading', { level: 1, name: 'Home Network' })).toBeInTheDocument(),
		{ timeout: 15000 }
	);
	await fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }));
}

describe('network detail page - diagnostics WAN throughput', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		networksStore.clear();
		wanThroughputStore.clear();
	});

	it('shows the note and requests no WAN series in bridge mode', async () => {
		let wanRequests = 0;
		server.use(
			networkWithMode('bridge'),
			http.get('/api/metrics/network/wan', () => {
				wanRequests += 1;
				return HttpResponse.json(wanFixture());
			})
		);
		await openDiagnostics();

		await waitFor(() => expect(screen.getByText('Speed Test History')).toBeInTheDocument(), {
			timeout: 15000
		});
		expect(screen.getByText('WAN throughput is not collected in bridge mode.')).toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'WAN Throughput' })).not.toBeInTheDocument();
		expect(wanRequests).toBe(0);
	}, 20000);

	it('renders the card ahead of speed-test history in NAT mode', async () => {
		server.use(networkWithMode('NAT'));
		await openDiagnostics();

		const wan = await screen.findByRole('heading', { name: 'WAN Throughput' }, { timeout: 15000 });
		const history = await screen.findByRole('heading', { name: 'Speed Test History' });
		expect(wan.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(screen.queryByText(/not collected in bridge mode/)).not.toBeInTheDocument();
	}, 20000);

	it('renders the card when connection_mode is null', async () => {
		server.use(networkWithMode(null));
		await openDiagnostics();

		expect(
			await screen.findByRole('heading', { name: 'WAN Throughput' }, { timeout: 15000 })
		).toBeInTheDocument();
	}, 20000);
});
