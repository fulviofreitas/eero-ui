<!--
  NetworkScanCard

  Network Diagnostics tab card (phase-6.0-revamp.md § 7 WP6, deliverable 6): the network's
  channel/neighbour scan result (`GET /networks/{id}/scan`), a Verified read whose entry shape
  is unfixtured upstream - rendered defensively via GenericRecordList.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiClientError } from '$api/client';
	import Card from '$components/common/Card.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let scan: Record<string, unknown>[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let unavailable = $state(false);

	async function load() {
		loading = true;
		error = null;
		unavailable = false;
		try {
			const result = await api.networks.getScan(networkId);
			scan = result.scan;
		} catch (err) {
			if (err instanceof ApiClientError && err.type === 'feature_unavailable') {
				unavailable = true;
			} else {
				error = err instanceof Error ? err.message : 'Failed to load network scan';
			}
		} finally {
			loading = false;
		}
	}

	onMount(load);
</script>

<Card title="Network Scan">
	{#if loading}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if unavailable}
		<p class="text-muted text-sm">Network scan is not available on this network right now.</p>
	{:else if error}
		<ErrorState message={error} onRetry={load} />
	{:else}
		<GenericRecordList
			records={scan}
			emptyTitle="No scan data"
			emptyDescription="No neighbouring networks were detected in the last scan."
			recordLabel={(_r, i) => `Network ${i + 1}`}
		/>
	{/if}
</Card>
