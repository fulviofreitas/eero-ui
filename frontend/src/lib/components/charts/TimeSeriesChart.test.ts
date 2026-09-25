/**
 * Tests for TimeSeriesChart's accessible canvas label (A8 a11y fix).
 *
 * Chart.js draws to a <canvas> with no text content for assistive tech to read, so the canvas
 * carries role="img" and an aria-label summarizing the most recent data point.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TimeSeriesChart from './TimeSeriesChart.svelte';

describe('TimeSeriesChart', () => {
	it('exposes the latest data point to assistive tech via an aria-label on the canvas', () => {
		const latestTime = new Date('2026-09-25T10:00:00Z').getTime();
		const datasets = [
			{
				label: 'Download',
				data: [
					{ x: new Date('2026-09-25T09:00:00Z').getTime(), y: 50 },
					{ x: latestTime, y: 120 }
				],
				borderColor: '#58a6ff'
			}
		];

		render(TimeSeriesChart, { props: { title: 'Bandwidth', datasets, loading: false } });

		const expectedTime = new Date(latestTime).toLocaleTimeString();
		expect(
			screen.getByRole('img', { name: `Bandwidth: latest 120 at ${expectedTime}` })
		).toBeInTheDocument();
	});

	it('picks the latest point across multiple datasets, not just the first', () => {
		const earlierTime = new Date('2026-09-25T09:00:00Z').getTime();
		const laterTime = new Date('2026-09-25T11:00:00Z').getTime();
		const datasets = [
			{ label: 'Download', data: [{ x: laterTime, y: 200 }], borderColor: '#58a6ff' },
			{ label: 'Upload', data: [{ x: earlierTime, y: 30 }], borderColor: '#3fb950' }
		];

		render(TimeSeriesChart, { props: { title: 'Bandwidth', datasets, loading: false } });

		const expectedTime = new Date(laterTime).toLocaleTimeString();
		expect(
			screen.getByRole('img', { name: `Bandwidth: latest 200 at ${expectedTime}` })
		).toBeInTheDocument();
	});

	it('does not render a canvas (or aria-label) when there is no data', () => {
		render(TimeSeriesChart, { props: { title: 'Bandwidth', datasets: [], loading: false } });

		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByText('No data available for the selected time range')).toBeInTheDocument();
	});
});
