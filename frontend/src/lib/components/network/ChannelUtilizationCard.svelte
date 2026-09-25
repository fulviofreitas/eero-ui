<!--
  ChannelUtilizationCard

  Network Diagnostics tab card (phase-6.0-revamp.md § 7 WP6, deliverable 8):
  Wi-Fi channel utilisation (`GET /networks/{id}/channel-utilization`) with a
  band selector, an eero selector and a time range. `eero_id` is an integer
  in the backend, distinct from the eero's opaque `id`/`url` string - options
  are built from `api.eeros.list()`, mapping each eero's numeric id from its
  `id` (if numeric) or the trailing digits of its `url`, and omitting any
  eero neither yields a numeric id for (no `eerosStore` exists to reuse; this
  is a plain on-mount fetch, matching `+page.svelte` routes elsewhere).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { ChannelUtilizationBand, EeroSummary } from '$api/types';
	import {
		channelUtilizationStore,
		type ChannelUtilizationRange
	} from '$stores/channelUtilization';
	import Card from '$components/common/Card.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	const rangeOptions: { value: ChannelUtilizationRange; label: string }[] = [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: '30d', label: '30d' }
	];

	const bandOptions: { value: ChannelUtilizationBand; label: string }[] = [
		{ value: 'band_2_4GHz', label: '2.4 GHz' },
		{ value: 'band_5GHz_low', label: '5 GHz (low)' },
		{ value: 'band_5GHz_high', label: '5 GHz (high)' },
		{ value: 'band_5GHz_full', label: '5 GHz (full)' },
		{ value: 'band_6GHz', label: '6 GHz' }
	];

	let cu = $derived($channelUtilizationStore);
	let eeroOptions: { value: string; label: string; numericId: number }[] = $state([]);

	/** Numeric backend id from `eero.id` if numeric, else the trailing digits of `eero.url`. */
	function numericIdOf(eero: EeroSummary): number | null {
		const fromId = Number(eero.id);
		if (Number.isFinite(fromId) && String(fromId) === eero.id) return fromId;
		const match = eero.url?.match(/(\d+)\s*$/);
		if (match) {
			const fromUrl = Number(match[1]);
			if (Number.isFinite(fromUrl)) return fromUrl;
		}
		return null;
	}

	async function loadEeroOptions() {
		try {
			const eeros = await api.eeros.list();
			eeroOptions = eeros
				.map((eero) => {
					const numericId = numericIdOf(eero);
					return numericId === null
						? null
						: { value: String(numericId), label: eero.location || eero.model, numericId };
				})
				.filter((o): o is { value: string; label: string; numericId: number } => o !== null);
		} catch {
			// Eero selector is a nice-to-have - a failed list load just leaves it
			// empty; the card still works with band/range alone.
			eeroOptions = [];
		}
	}

	function load(
		range: ChannelUtilizationRange = cu.range,
		band: ChannelUtilizationBand | null = cu.band,
		eeroId: number | null = cu.eeroId
	) {
		channelUtilizationStore.fetch(networkId, { range, band, eeroId });
	}

	function handleBandChange(value: string) {
		load(cu.range, value === '' ? null : (value as ChannelUtilizationBand));
	}

	function handleEeroChange(value: string) {
		load(cu.range, cu.band, value === '' ? null : Number(value));
	}

	const records = $derived.by((): Record<string, unknown>[] => {
		if (!cu.data) return [];
		// The dict itself may already be a single record, or carry a list under
		// a `series`/`values`/`utilization` key - shape is undocumented upstream.
		for (const key of ['series', 'values', 'utilization', 'data']) {
			const value = cu.data[key];
			if (Array.isArray(value)) {
				return value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
			}
		}
		return [cu.data];
	});

	onMount(() => {
		loadEeroOptions();
		load();
	});
</script>

<Card title="Channel Utilisation">
	{#snippet actions()}
		<TimeRangeSelector options={rangeOptions} value={cu.range} onChange={(r) => load(r)} />
	{/snippet}

	<div class="filters">
		<label class="filter">
			<span class="text-muted text-sm">Band</span>
			<select value={cu.band ?? ''} onchange={(e) => handleBandChange(e.currentTarget.value)}>
				<option value="">All bands</option>
				{#each bandOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		{#if eeroOptions.length > 0}
			<label class="filter">
				<span class="text-muted text-sm">Eero</span>
				<select
					value={cu.eeroId === null ? '' : String(cu.eeroId)}
					onchange={(e) => handleEeroChange(e.currentTarget.value)}
				>
					<option value="">All eeros</option>
					{#each eeroOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	{#if cu.loading && !cu.data}
		<Skeleton variant="table-rows" rows={3} columns={3} />
	{:else if cu.unavailable}
		<p class="text-muted text-sm">
			Channel utilisation is not available on this network right now.
		</p>
	{:else if cu.error}
		<ErrorState message={cu.error} onRetry={() => load()} />
	{:else}
		<GenericRecordList
			{records}
			emptyTitle="No channel utilisation data"
			recordLabel={(_r, i) => `Sample ${i + 1}`}
		/>
	{/if}
</Card>

<style>
	.filters {
		display: flex;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.filter {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.filter select {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		background: var(--color-bg-primary);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: 0.8rem;
	}
</style>
