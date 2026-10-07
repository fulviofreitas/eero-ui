<!--
  EeroConnectionsCard

  Eero detail card (phase-6.0-revamp.md § 7 WP6, deliverable 5): this eero's client/eero
  connections (`GET /eeros/{id}/connections`), a Verified read.

  Consistency pass (2026-10-07): the backend now flattens both the wireless-device list and the
  per-port interfaces into one typed `EeroConnection[]` (`kind`/`entity_type`/`port`/
  `is_upstream`/`negotiated_speed` - see types.ts), so this renders a proper row per connection
  instead of delegating to GenericRecordList. Each row links to the connected entity's own
  detail page: `/devices/{id}` for a client, `/eeros/{id}` for a mesh eero reachable through
  this one.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiClientError } from '$api/client';
	import type { EeroConnection } from '$api/types';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';

	interface Props {
		eeroId: string;
	}

	let { eeroId }: Props = $props();

	let connections: EeroConnection[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let unavailable = $state(false);

	let wirelessCount = $derived(connections.filter((c) => c.kind === 'wireless').length);
	let wiredCount = $derived(connections.filter((c) => c.kind === 'wired').length);

	function entityHref(connection: EeroConnection): string | null {
		if (!connection.id) return null;
		return connection.entity_type === 'eero'
			? `/eeros/${connection.id}`
			: `/devices/${connection.id}`;
	}

	function displayName(connection: EeroConnection): string {
		return (
			connection.display_name ||
			connection.nickname ||
			connection.hostname ||
			connection.mac ||
			'Unknown device'
		);
	}

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
	<div class="connections-header">
		<h2>Connections</h2>
		{#if !loading && !error && !unavailable && connections.length > 0}
			<span class="connections-count text-muted text-sm">
				{wirelessCount} wireless · {wiredCount} wired
			</span>
		{/if}
	</div>
	{#if loading}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if unavailable}
		<p class="text-muted text-sm">Connections are not available on this eero right now.</p>
	{:else if error}
		<ErrorState message={error} onRetry={load} />
	{:else if connections.length === 0}
		<EmptyState
			title="No connections"
			description="No clients are currently connected to this eero."
		/>
	{:else}
		<ul class="connection-list">
			{#each connections as connection, index (connection.id ?? connection.mac ?? index)}
				{@const href = entityHref(connection)}
				<li class="connection-row">
					<div class="connection-name">
						{#if href}
							<a {href}>{displayName(connection)}</a>
						{:else}
							<span>{displayName(connection)}</span>
						{/if}
						{#if connection.device_type}
							<span class="connection-device-type text-muted text-sm">{connection.device_type}</span
							>
						{/if}
					</div>
					<div class="connection-meta">
						{#if connection.kind === 'wired'}
							<span class="badge badge-info">
								Wired{connection.port ? ` · Port ${connection.port}` : ''}
							</span>
							{#if connection.is_upstream}
								<span class="badge badge-warning">Upstream</span>
							{/if}
							{#if connection.negotiated_speed}
								<span class="connection-speed text-muted text-sm"
									>{connection.negotiated_speed}</span
								>
							{/if}
						{:else}
							<span class="badge badge-success"
								>Wireless{connection.band ? ` · ${connection.band}` : ''}</span
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.detail-card h2 {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.connections-card {
		grid-column: 1 / -1;
	}

	.connections-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.connection-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.connection-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.connection-row:last-child {
		border-bottom: none;
	}

	.connection-name {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		overflow: hidden;
	}

	.connection-name a {
		color: var(--color-accent);
		text-decoration: none;
		font-weight: 500;
	}

	.connection-name a:hover {
		text-decoration: underline;
	}

	.connection-device-type {
		white-space: nowrap;
	}

	.connection-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.connection-speed {
		white-space: nowrap;
	}
</style>
