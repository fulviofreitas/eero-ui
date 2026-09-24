/**
 * Tests for PieChart's skeleton-first loading (phase-6.0-revamp.md § 6.1/6.2 Tier 3, WP9).
 *
 * The chart shows a card skeleton only on the very first, data-less load. Once data has
 * arrived, a subsequent `loading=true` (a background refresh) keeps the existing chart on
 * screen with a small inline "refreshing" indicator instead of blanking back to a skeleton.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PieChart from './PieChart.svelte';

const data = [
	{ label: 'Wireless', value: 10, color: 'rgba(99, 102, 241, 0.8)' },
	{ label: 'Wired', value: 5, color: 'rgba(34, 197, 94, 0.8)' }
];

describe('PieChart', () => {
	it('shows a skeleton, not the empty state, before any data has loaded', () => {
		render(PieChart, { props: { data: [], loading: true } });

		expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		expect(screen.queryByText('No data available')).toBeNull();
	});

	it('shows the empty state once loading finishes with no data', () => {
		render(PieChart, { props: { data: [], loading: false } });

		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
		expect(screen.getByText('No data available')).toBeInTheDocument();
	});

	it('keeps the chart on screen during a refresh instead of reverting to a skeleton', () => {
		const { container } = render(PieChart, { props: { data, loading: true } });

		// Stale-while-revalidate: no full-block skeleton once data exists.
		expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
		expect(container.querySelector('canvas')).not.toBeNull();
		// A small inline refreshing indicator replaces the old full-block spinner.
		expect(screen.getByRole('status', { name: 'Refreshing chart data' })).toBeInTheDocument();
	});

	it('shows no refreshing indicator once loading is done', () => {
		render(PieChart, { props: { data, loading: false } });

		expect(screen.queryByRole('status', { name: 'Refreshing chart data' })).toBeNull();
	});
});
