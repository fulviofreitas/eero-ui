/**
 * Tests for InsightsCard (phase-6.0-revamp.md § 7 WP6, deliverable 6).
 *
 * Coverage:
 * - loads and renders the default insight type/range on mount
 * - switching the range selector re-fetches with the new range
 * - switching the insight-type tab re-fetches with the new type
 * - a 402 renders the upsell notice, not an error
 * - a 5xx (after both GET retries) renders ErrorState with a working retry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import InsightsCard from './InsightsCard.svelte';
import { insightsStore } from '$stores/insights';
import { server } from '../../../../tests/mocks/server';

describe('InsightsCard', () => {
	beforeEach(() => {
		insightsStore.clearAll();
	});

	it('loads on mount at the default range (7d) and type (blocked)', async () => {
		let seenCadence: string | null = null;
		let seenType: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/insights', ({ request }) => {
				const url = new URL(request.url);
				seenCadence = url.searchParams.get('cadence');
				seenType = url.searchParams.get('insight_type');
				return HttpResponse.json({
					series: [
						{
							insight_type: 'blocked',
							sum: 99,
							values: [{ time: '2026-01-01T00:00:00Z', value: 99 }]
						}
					]
				});
			})
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });

		await waitFor(() => expect(seenCadence).toBe('daily'));
		expect(seenType).toBe('blocked');
		await waitFor(() => expect(screen.getByText('99')).toBeInTheDocument());
	});

	it('A2: the content region is a tabpanel whose aria-controls/aria-labelledby resolve to the active tab', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 1, values: [] }] })
			)
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });

		const tab = await screen.findByRole('tab', { name: 'Blocked' });
		const panel = screen.getByRole('tabpanel');

		expect(tab).toHaveAttribute('id', 'tab-blocked');
		expect(tab).toHaveAttribute('aria-controls', 'tabpanel-blocked');
		expect(panel).toHaveAttribute('id', 'tabpanel-blocked');
		expect(panel).toHaveAttribute('aria-labelledby', 'tab-blocked');
	});

	it('re-fetches with the new range when the selector changes', async () => {
		const seenCadences: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/insights', ({ request }) => {
				seenCadences.push(new URL(request.url).searchParams.get('cadence') ?? '');
				return HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 1, values: [] }] });
			})
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });
		await waitFor(() => expect(seenCadences).toContain('daily'));

		await fireEvent.click(screen.getByRole('button', { name: '24h' }));

		await waitFor(() => expect(seenCadences).toContain('hourly'));
	});

	it('re-fetches with the new type when the tab changes', async () => {
		const seenTypes: string[] = [];
		server.use(
			http.get('/api/networks/:networkId/insights', ({ request }) => {
				seenTypes.push(new URL(request.url).searchParams.get('insight_type') ?? '');
				return HttpResponse.json({ series: [{ insight_type: 'blocked', sum: 1, values: [] }] });
			})
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });
		await waitFor(() => expect(seenTypes).toContain('blocked'));

		await fireEvent.click(screen.getByRole('tab', { name: 'Ad Block' }));

		await waitFor(() => expect(seenTypes).toContain('adblock'));
	});

	it('renders an upsell notice — not an error — on a 402', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Insights requires eero Plus/Secure')).toBeInTheDocument()
		);
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(InsightsCard, { props: { scope: 'network', id: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/insights', () =>
				HttpResponse.json({
					series: [
						{
							insight_type: 'blocked',
							sum: 5,
							values: [{ time: '2026-01-01T00:00:00Z', value: 5 }]
						}
					]
				})
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
	});
});
