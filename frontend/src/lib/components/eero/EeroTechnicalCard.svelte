<!--
  EeroTechnicalCard

  Eero detail "Technical" section. Extracted from routes/eeros/[id]/+page.svelte
  (WP5 decomposition). Uses the shared InfoRow primitive in place of the bespoke
  `.info-item`/`.info-value` markup this section used for plain key/value pairs.
-->
<script lang="ts">
	import type { EeroDetail } from '$api/types';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		eero: EeroDetail;
		networkId: string | null;
	}

	let { eero, networkId }: Props = $props();
</script>

<section class="card detail-card wide-card">
	<h2>Technical</h2>
	<div class="info-list technical-grid">
		<InfoRow label="Eero ID" value={eero.id || '—'} mono />
		<InfoRow label="Network ID" value={networkId || '—'} mono />
		{#if eero.url}
			<InfoRow label="API URL" value={eero.url} mono />
		{/if}
	</div>
</section>

<style>
	.detail-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.info-list {
		display: flex;
		flex-direction: column;
	}

	.technical-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-3) var(--space-6);
	}
</style>
