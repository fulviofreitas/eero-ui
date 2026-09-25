<!--
  NetworkSpeedTestCard

  Network detail "Speed Test" section. Extracted from routes/network/[id]/+page.svelte
  (WP5 decomposition). Presentational only - the run/poll logic (Verified write, plan § 5)
  stays in the parent route alongside the AbortController it owns for cleanup on unmount.
-->
<script lang="ts">
	import type { SpeedTestResult } from '$api/types';
	import Icon from '$components/common/Icon.svelte';

	interface Props {
		speedTest: SpeedTestResult | null;
		loading: boolean;
		elapsedSeconds: number;
		/** Set once a run fails or times out (see stores/networks.ts's SpeedTestState.error). */
		error?: string | null;
		onRunTest: () => void;
	}

	let { speedTest, loading, elapsedSeconds, error = null, onRunTest }: Props = $props();

	function formatSpeed(mbps: number | null): string {
		if (mbps === null) return '—';
		return `${mbps.toFixed(1)} Mbps`;
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString();
	}
</script>

<section class="card info-card speed-test-card">
	<div class="card-header-flex">
		<h2>Speed Test</h2>
		<button class="btn btn-primary btn-sm" onclick={onRunTest} disabled={loading}>
			{#if loading}
				<span class="loading-spinner"></span>
				Running...
			{:else}
				<Icon name="play" size={12} /> Run Test
			{/if}
		</button>
	</div>

	{#if loading}
		<p class="text-muted text-sm">
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
	{:else if speedTest && (speedTest.download_mbps || speedTest.upload_mbps)}
		<div class="speed-results">
			<div class="speed-item download">
				<div class="speed-icon">↓</div>
				<div class="speed-data">
					<span class="speed-value">{formatSpeed(speedTest.download_mbps)}</span>
					<span class="speed-label">Download</span>
				</div>
			</div>
			<div class="speed-item upload">
				<div class="speed-icon">↑</div>
				<div class="speed-data">
					<span class="speed-value">{formatSpeed(speedTest.upload_mbps)}</span>
					<span class="speed-label">Upload</span>
				</div>
			</div>
		</div>
		{#if speedTest.timestamp}
			<p class="text-muted text-sm speed-timestamp">
				Last tested: {formatDate(speedTest.timestamp)}
			</p>
		{/if}
	{:else}
		<p class="text-muted text-sm">
			No speed test data available. Run a test to measure your network speed.
		</p>
	{/if}
</section>

<style>
	.info-card {
		display: flex;
		flex-direction: column;
	}

	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.speed-test-card {
		grid-column: span 2;
	}

	.card-header-flex {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.card-header-flex h2 {
		margin: 0;
		padding: 0;
		border: none;
	}

	.speed-results {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-4);
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

	.speed-item.download .speed-value {
		color: var(--color-success);
	}

	.speed-item.upload .speed-value {
		color: var(--color-accent);
	}

	.speed-timestamp {
		margin-top: var(--space-4);
		text-align: center;
	}

	.speed-test-progress {
		width: 100%;
		height: 6px;
		margin-top: var(--space-2);
		accent-color: var(--color-accent);
	}

	@media (max-width: 768px) {
		.speed-test-card {
			grid-column: span 1;
		}

		.speed-results {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
