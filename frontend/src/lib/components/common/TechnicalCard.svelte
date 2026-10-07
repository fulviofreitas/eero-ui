<!--
  TechnicalCard

  Shared detail-page "Technical" section (consistency pass). Replaces four bespoke copies
  (DeviceStatusCard's Technical section, EeroTechnicalCard, ProfileTechnicalCard and
  OverviewCard's Technical section) with one component: a list of id rows plus an optional
  API URL row. Always the last block on a detail page.
-->
<script lang="ts">
	import InfoRow from './InfoRow.svelte';

	interface IdRow {
		label: string;
		value: string | null | undefined;
	}

	interface Props {
		ids: IdRow[];
		apiUrl?: string | null;
	}

	let { ids, apiUrl = null }: Props = $props();
</script>

<section class="card info-card wide-card">
	<h2>Technical</h2>
	<div class="info-list technical-list">
		{#each ids as row (row.label)}
			<InfoRow label={row.label} value={row.value || '—'} mono />
		{/each}
		{#if apiUrl}
			<InfoRow label="API URL" value={apiUrl} mono />
		{/if}
	</div>
</section>

<style>
	.info-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-list {
		display: flex;
		flex-direction: column;
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.technical-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: var(--space-2) var(--space-6);
	}
</style>
