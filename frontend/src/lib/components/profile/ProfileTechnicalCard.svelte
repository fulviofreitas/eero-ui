<!--
  ProfileTechnicalCard

  Profile detail "Technical" section. Extracted from routes/profiles/[id]/+page.svelte
  (WP5 decomposition). Uses the shared InfoRow primitive in place of the bespoke `dt`/`dd`
  `.info-row` markup duplicated across this file, network/[id] and devices/[id].
-->
<script lang="ts">
	import type { ProfileSummary } from '$api/types';
	import InfoRow from '$components/common/InfoRow.svelte';

	interface Props {
		profile: ProfileSummary;
		networkId: string | null;
	}

	let { profile, networkId }: Props = $props();
</script>

<section class="card info-card technical-card wide-card">
	<h2>Technical</h2>
	<div class="info-list technical-list">
		<InfoRow label="Profile ID" value={profile.id || '—'} mono />
		<InfoRow label="Network ID" value={networkId || '—'} mono />
		{#if profile.url}
			<InfoRow label="API URL" value={profile.url} mono />
		{/if}
	</div>
</section>

<style>
	.info-card h2 {
		font-size: 1rem;
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.technical-card {
		margin-bottom: var(--space-6);
	}

	.wide-card {
		grid-column: 1 / -1;
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.technical-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-2) var(--space-6);
	}
</style>
