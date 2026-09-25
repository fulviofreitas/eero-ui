<!--
  EeroConnectionsCard

  Eero detail card (phase-6.0-revamp.md § 7 WP6, deliverable 5): this eero's client
  connections (`GET /eeros/{id}/connections`), a Verified read whose entry shape is unfixtured
  upstream - rendered defensively via GenericRecordList.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiClientError } from '$api/client';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';

	interface Props {
		eeroId: string;
	}

	let { eeroId }: Props = $props();

	let connections: Record<string, unknown>[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let unavailable = $state(false);

	async function load() {
		loading = true;
		error = null;
		unavailable = false;
		try {
			const result = await api.eeros.getConnections(eeroId);
			connections = result.connections;
		} catch (err) {
			if (err instanceof ApiClientError && err.type === 'feature_unavailable') {
				unavailable = true;
			} else {
				error = err instanceof Error ? err.message : 'Failed to load connections';
			}
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<section class="card detail-card connections-card">
	<h2>Connections</h2>
	{#if loading}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if unavailable}
		<p class="text-muted text-sm">Connections are not available on this eero right now.</p>
	{:else if error}
		<ErrorState message={error} onRetry={load} />
	{:else}
		<GenericRecordList
			records={connections}
			emptyTitle="No connections"
			emptyDescription="No clients are currently connected to this eero."
			recordLabel={(_r, i) => `Connection ${i + 1}`}
		/>
	{/if}
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

	.connections-card {
		grid-column: 1 / -1;
	}
</style>
