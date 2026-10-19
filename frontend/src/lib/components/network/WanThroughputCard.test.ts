/**
 * Tests for WanThroughputCard (eero-ui#458).
 *
 * Coverage: data (summary + chart), unavailable, not-enabled, partial, stale,
 * query forwarding, range switching, error with working retry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import WanThroughputCard from './WanThroughputCard.svelte';
import { wanThroughputStore } from '$stores';
import { server } from '../../../../tests/mocks/server';
import { wanFixture, wanVmResult } from '../../../../tests/mocks/handlers';

describe('WanThroughputCard', () => {
	beforeEach(() => {
		wanThroughputStore.clear();
	});

	it('renders the latest download/upload summary and an accessible chart', async () => {
		render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('87.3 Mbps')).toBeInTheDocument());
		expect(screen.getByText('9.8 Mbps')).toBeInTheDocument();
		expect(screen.getByRole('img', { name: /WAN throughput/ })).toBeInTheDocument();
		expect(document.querySelector('[data-stale="true"]')).toBeNull();
		expect(screen.queryByText(/Last reported/)).not.toBeInTheDocument();
	});

	it('shows the unavailable state, never 0 Mbps, when enabled with no samples', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ enabled: true, download: wanVmResult([]), upload: wanVmResult([]) })
			)
		);
		const { container } = render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByRole('status')).toHaveTextContent(/WAN throughput is unavailable/)
		);
		expect(container.querySelector('canvas')).toBeNull();
		expect(screen.queryByText(/0(\.0)? Mbps/)).not.toBeInTheDocument();
	});

	it('shows the not-enabled state when the server has the feature off', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ enabled: false, download: null, upload: null })
			)
		);
		const { container } = render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByRole('status')).toHaveTextContent(
				'WAN throughput is not enabled on this server.'
			)
		);
		expect(container.querySelector('canvas')).toBeNull();
	});

	it('renders a dash for the missing direction when only download has samples', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({
					enabled: true,
					download: wanVmResult([[30, 55]]),
					upload: wanVmResult([])
				})
			)
		);
		render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('55.0 Mbps')).toBeInTheDocument());
		expect(screen.getByText('—')).toBeInTheDocument();
	});

	it('mutes the summary and captions the age when the latest point is over 2 minutes old', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({
					enabled: true,
					download: wanVmResult([[600, 42]]),
					upload: wanVmResult([[600, 8]])
				})
			)
		);
		render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('42.0 Mbps')).toBeInTheDocument());
		expect(document.querySelector('[data-stale="true"]')).not.toBeNull();
		expect(screen.getByText(/Last reported .*10 minutes ago/)).toBeInTheDocument();
	});

	it('forwards network_id/start/end/step and refetches with step=5m for 6h', async () => {
		const seen: URLSearchParams[] = [];
		server.use(
			http.get('/api/metrics/network/wan', ({ request }) => {
				seen.push(new URL(request.url).searchParams);
				return HttpResponse.json(wanFixture());
			})
		);
		render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(seen).toHaveLength(1));
		expect(seen[0].get('network_id')).toBe('network-123');
		expect(seen[0].get('step')).toBe('15m');
		expect(seen[0].get('start')).toBeTruthy();
		expect(seen[0].get('end')).toBeTruthy();
		expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(screen.getByRole('button', { name: '6h' }));

		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1].get('step')).toBe('5m');
		await waitFor(() =>
			expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute('aria-pressed', 'true')
		);
		expect(screen.getByRole('group', { name: 'WAN throughput time range' })).toBeInTheDocument();
	});

	it('shows an error state on a 500 and retry refetches', async () => {
		server.use(
			http.get('/api/metrics/network/wan', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);
		render(WanThroughputCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), {
			timeout: 5000
		});
		expect(screen.queryByText(/unavailable\. The collector/)).not.toBeInTheDocument();

		server.use(http.get('/api/metrics/network/wan', () => HttpResponse.json(wanFixture())));
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('87.3 Mbps')).toBeInTheDocument());
	}, 15000);
});
