/**
 * SpeedTestCard - bug-fix follow-up (6.0.0): the card used to read only
 * `network.speed_test`, which the backend passed through un-normalised, so a
 * completed run and a reload both showed "No speed test data available".
 * The page now hands in the best available normalised result via `speedTest`,
 * and `network.speed_test` stays the fallback.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import SpeedTestCard from './SpeedTestCard.svelte';
import type { NetworkDetail, SpeedTestResult } from '$api/types';

const baseNetwork = {
	id: 'network-123',
	url: '/networks/network-123',
	name: 'Home',
	status: 'connected',
	speed_test: null
} as unknown as NetworkDetail;

const result: SpeedTestResult = {
	download_mbps: 512.4,
	upload_mbps: 48.9,
	latency_ms: 12,
	timestamp: '2026-09-25T10:00:00Z'
};

describe('SpeedTestCard', () => {
	it('shows the empty state when no result is available anywhere', () => {
		render(SpeedTestCard, {
			props: { network: baseNetwork, speedTest: null, loading: false, onRunTest: vi.fn() }
		});
		expect(screen.getByText(/No speed test data available/)).toBeInTheDocument();
	});

	it('renders the result handed in via the speedTest prop', () => {
		render(SpeedTestCard, {
			props: { network: baseNetwork, speedTest: result, loading: false, onRunTest: vi.fn() }
		});
		expect(screen.getByText('512.4')).toBeInTheDocument();
		expect(screen.getByText('48.9')).toBeInTheDocument();
		expect(screen.getByText(/Last tested:/)).toBeInTheDocument();
		expect(screen.queryByText(/No speed test data available/)).not.toBeInTheDocument();
	});

	it('falls back to network.speed_test when no speedTest prop is given', () => {
		render(SpeedTestCard, {
			props: {
				network: { ...baseNetwork, speed_test: result } as unknown as NetworkDetail,
				loading: false,
				onRunTest: vi.fn()
			}
		});
		expect(screen.getByText('512.4')).toBeInTheDocument();
	});

	it('shows the progress bar while a run is in flight', () => {
		render(SpeedTestCard, {
			props: {
				network: baseNetwork,
				speedTest: null,
				loading: true,
				elapsedSeconds: 30,
				onRunTest: vi.fn()
			}
		});
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
		expect(screen.getByText(/Running… 30s/)).toBeInTheDocument();
	});
});
