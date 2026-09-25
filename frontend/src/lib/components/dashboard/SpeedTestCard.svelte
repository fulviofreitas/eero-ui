<!--
  SpeedTestCard

  Dashboard "Speed Test" card + history chart. Extracted from routes/+page.svelte
  (WP5 decomposition). Behaviour unchanged: same run-test button, same helper formatting.
-->
<script lang="ts">
	import type { NetworkDetail, SpeedTestResult } from '$api/types';
	import SpeedtestChart from '$lib/components/charts/SpeedtestChart.svelte';

	interface Props {
		network: NetworkDetail;
		/** Best available result; when omitted the card falls back to `network.speed_test`. */
		speedTest?: SpeedTestResult | null;
		loading: boolean;
		/** Whole seconds elapsed since the run started (see stores/networks.ts's speedTestFor). */
		elapsedSeconds?: number;
		/** Set once a run fails or times out. */
		error?: string | null;
		onRunTest: () => void;
	}

	let {
		network,
		speedTest = undefined,
		loading,
		elapsedSeconds = 0,
		error = null,
		onRunTest
	}: Props = $props();

	// Bug-fix follow-up (6.0.0): the card only ever read `network.speed_test`, which the
	// backend used to pass through un-normalised, so a completed run and a reload both showed
	// the empty state. The page now hands in the best available result (poll result, then the
	// network detail, then the latest history entry); `network.speed_test` stays the fallback.
	let effectiveSpeedTest = $derived(speedTest === undefined ? network.speed_test : speedTest);

	function getDownloadSpeed(speedTest: SpeedTestResult | null): string {
		if (!speedTest) return '—';
		const value = speedTest.download_mbps;
		return value ? value.toFixed(1) : '—';
	}

	function getUploadSpeed(speedTest: SpeedTestResult | null): string {
		if (!speedTest) return '—';
		const value = speedTest.upload_mbps;
		return value ? value.toFixed(1) : '—';
	}

	function getSpeedTestDate(speedTest: SpeedTestResult | null): string {
		if (!speedTest) return '';
		const dateStr = speedTest.timestamp;
		if (!dateStr) return '';
		return new Date(dateStr).toLocaleString();
	}
</script>

<div class="speedtest-row">
	<div class="card stat-card speed-card">
		<div class="stat-header">
			<span class="stat-label">Speed Test</span>
			<button class="btn btn-secondary btn-sm" onclick={onRunTest} disabled={loading}>
				{#if loading}
					<span class="loading-spinner"></span>
				{:else}
					Run Test
				{/if}
			</button>
		</div>
		{#if loading}
			<p class="text-muted text-sm" role="status">
				Running… {elapsedSeconds}s (this can take up to 90 seconds)
			</p>
			<progress
				class="speed-test-progress"
				max={90}
				value={Math.min(elapsedSeconds, 90)}
				aria-label="Speed test progress"
				aria-valuenow={Math.min(elapsedSeconds, 90)}
				aria-valuemin={0}
				aria-valuemax={90}
			></progress>
		{:else if error}
			<p class="text-danger text-sm" role="alert">{error}</p>
		{:else if effectiveSpeedTest && (getDownloadSpeed(effectiveSpeedTest) !== '—' || getUploadSpeed(effectiveSpeedTest) !== '—')}
			<div class="speed-results">
				<div class="speed-item download">
					<div class="speed-icon">↓</div>
					<div class="speed-data">
						<span class="speed-value">
							{getDownloadSpeed(effectiveSpeedTest)}
							<span class="speed-unit">Mbps</span>
						</span>
						<span class="speed-label">Download</span>
					</div>
				</div>
				<div class="speed-item upload">
					<div class="speed-icon">↑</div>
					<div class="speed-data">
						<span class="speed-value">
							{getUploadSpeed(effectiveSpeedTest)}
							<span class="speed-unit">Mbps</span>
						</span>
						<span class="speed-label">Upload</span>
					</div>
				</div>
			</div>
			{#if getSpeedTestDate(effectiveSpeedTest)}
				<p class="speed-timestamp text-muted text-sm">
					Last tested: {getSpeedTestDate(effectiveSpeedTest)}
				</p>
			{/if}
		{:else}
			<p class="text-muted text-sm">
				No speed test data available. Run a test to see your network speed.
			</p>
		{/if}
	</div>

	<div class="speedtest-history">
		<SpeedtestChart networkId={network.id} />
	</div>
</div>

<style>
	.stat-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.speedtest-row {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.speedtest-history {
		min-width: 0;
	}

	.speedtest-history :global(.speedtest-chart) {
		height: 100%;
	}

	.speed-results {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.speed-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		background-color: var(--color-bg-primary);
		border-radius: var(--radius-md);
	}

	.speed-icon {
		font-size: 1.5rem;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		background-color: var(--color-bg-tertiary);
	}

	.speed-item.download .speed-icon {
		color: var(--color-success);
	}

	.speed-item.upload .speed-icon {
		color: var(--color-accent);
	}

	.speed-data {
		display: flex;
		flex-direction: column;
	}

	.speed-label {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.speed-value {
		font-size: 1.25rem;
		font-weight: 600;
		font-family: var(--font-mono);
	}

	.speed-unit {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		margin-left: var(--space-1);
	}

	.speed-item.download .speed-value {
		color: var(--color-success);
	}

	.speed-item.upload .speed-value {
		color: var(--color-accent);
	}

	.speed-timestamp {
		margin-top: var(--space-3);
		text-align: center;
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border);
	}

	.speed-test-progress {
		width: 100%;
		height: 6px;
		margin-top: var(--space-2);
		accent-color: var(--color-accent);
	}

	@media (max-width: 900px) {
		.speedtest-row {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 768px) {
		.speed-results {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
