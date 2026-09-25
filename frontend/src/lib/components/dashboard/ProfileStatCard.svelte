<!--
  ProfileStatCard

  Dashboard "Profiles" stat card. Extracted from routes/+page.svelte (WP5 decomposition).
-->
<script lang="ts">
	import type { ProfileSummary } from '$api/types';

	interface Props {
		profiles: ProfileSummary[];
		totalDevices: number;
		pausedCount: number;
	}

	let { profiles, totalDevices, pausedCount }: Props = $props();

	let topProfiles = $derived(
		[...profiles].sort((a, b) => b.device_count - a.device_count).slice(0, 4)
	);
</script>

<a href="/profiles" class="card stat-card clickable-card">
	<div class="stat-header">
		<span class="stat-label">Profiles</span>
	</div>
	<div class="stat-value">{profiles.length}</div>
	<div class="stat-meta">
		<span class="text-muted">{totalDevices} devices assigned</span>
		{#if pausedCount > 0}
			<span class="text-muted">•</span>
			<span class="text-warning">{pausedCount} paused</span>
		{/if}
	</div>
	<div class="stat-breakdown">
		{#each topProfiles as profile}
			<div class="breakdown-item">
				<span class="breakdown-name">
					<span
						class="status-dot small"
						class:online={!profile.paused}
						class:warning={profile.paused}
					></span>
					{profile.name}
				</span>
				<span class="mono text-sm">{profile.device_count}</span>
			</div>
		{/each}
		{#if profiles.length > 4}
			<div class="breakdown-item text-muted">
				<span>+{profiles.length - 4} more</span>
			</div>
		{/if}
		{#if profiles.length === 0}
			<div class="breakdown-item text-muted">
				<span>No profiles configured</span>
			</div>
		{/if}
	</div>
	<span class="card-hint">View all profiles →</span>
</a>

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

	.stat-value {
		font-size: 2rem;
		font-weight: 700;
		font-family: var(--font-mono);
	}

	.stat-meta {
		font-size: 0.875rem;
		display: flex;
		gap: var(--space-2);
	}

	.stat-breakdown {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border-muted);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
	}

	.breakdown-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.status-dot.small {
		width: 6px;
		height: 6px;
	}

	.status-dot.warning {
		background-color: var(--color-warning);
	}

	.text-warning {
		color: var(--color-warning);
	}

	.clickable-card {
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			transform var(--transition-fast),
			box-shadow var(--transition-fast);
		position: relative;
	}

	.clickable-card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
		box-shadow: var(--shadow-md);
	}

	.card-hint {
		font-size: 0.75rem;
		color: var(--color-accent);
		opacity: 0;
		transition: opacity var(--transition-fast);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.clickable-card:hover .card-hint {
		opacity: 1;
	}
</style>
