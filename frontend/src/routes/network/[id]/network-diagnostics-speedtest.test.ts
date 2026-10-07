/**
 * The Diagnostics tab shows speed-test history exactly once.
 *
 * It used to render both `SpeedTestHistoryCard` (the eero cloud's own test history, chart and
 * table) and the VictoriaMetrics-backed `SpeedtestChart` ("Speedtest History") below it - two
 * cards with the same data under near-identical titles. The cloud history is the one kept; the
 * metrics chart stays on the dashboard only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { entitlementsStore, networksStore } from '$stores';

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

describe('network detail page - diagnostics speed test history', () => {
	beforeEach(() => {
		entitlementsStore.clear();
		networksStore.clear();
	});

	it('renders a single speed test history card', async () => {
		const Page = (await import('./+page.svelte')).default;
		render(Page);

		await waitFor(
			() =>
				expect(screen.getByRole('heading', { level: 1, name: 'Home Network' })).toBeInTheDocument(),
			{ timeout: 15000 }
		);
		await fireEvent.click(screen.getByRole('tab', { name: 'Diagnostics' }));

		await waitFor(() => expect(screen.getByText('Speed Test History')).toBeInTheDocument(), {
			timeout: 15000
		});
		expect(screen.queryAllByText(/speed ?test history/i)).toHaveLength(1);
	}, 20000);
});
