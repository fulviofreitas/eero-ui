<!--
  DataUsageCard

  Network Overview tab card (phase-6.0-revamp.md § 7 WP6, deliverable 7):
  totals (`GET /networks/{id}/data-usage`), a breakdown
  (`/data-usage/breakdown`) and a top-N per-device table
  (`/data-usage/devices`). Wrapped in `<PremiumGate feature="Data usage">` by
  the caller. Renders totals as human-readable bytes always; the time-series
  chart only appears when `deriveTimeSeries` can find a usable shape in
  `values` (the upstream shape is not guaranteed) - otherwise a
  `GenericRecordList` shows the raw values.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { dataUsageFor, dataUsageStore, type DataUsageRange } from '$stores/dataUsage';
	import Card from '$components/common/Card.svelte';
	import TimeRangeSelector from '$components/common/TimeRangeSelector.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import GenericRecordList from '$components/common/GenericRecordList.svelte';
	import DataTable, { type DataTableColumn } from '$components/common/DataTable.svelte';
	import Icon from '$components/common/Icon.svelte';
	import TimeSeriesChart from '$lib/components/charts/TimeSeriesChart.svelte';
	import { seriesColor, withAlpha } from '$lib/charts/defaults';
	import { formatBytes } from '$lib/utils/format-bytes';
	import { deriveTimeSeries, labelOf, downloadOf, uploadOf } from '$lib/utils/data-usage';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	const rangeOptions: { value: DataUsageRange; label: string }[] = [
		{ value: '24h', label: '24h' },
		{ value: '7d', label: '7d' },
		{ value: '30d', label: '30d' }
	];

	let networkUsage = dataUsageFor('network');
	let breakdownUsage = dataUsageFor('breakdown');
	let devicesUsage = dataUsageFor('devices');

	let network = $derived($networkUsage);
	let breakdown = $derived($breakdownUsage);
	let devices = $derived($devicesUsage);

	const timeSeries = $derived.by(() => {
		if (!network.data) return null;
		return deriveTimeSeries(network.data.values);
	});

	const chartDatasets = $derived.by(() => {
		if (!timeSeries) return [];
		return [
			{
				label: 'Download',
				data: timeSeries.download,
				borderColor: seriesColor(0),
				backgroundColor: withAlpha(seriesColor(0), 0.1),
				fill: true
			},
			{
				label: 'Upload',
				data: timeSeries.upload,
				borderColor: seriesColor(3),
				backgroundColor: withAlpha(seriesColor(3), 0.1),
				fill: true
			}
		];
	});

	interface DeviceRow {
		record: Record<string, unknown>;
		index: number;
	}

	const topDevices = $derived.by((): DeviceRow[] => {
		const raw = devices.data?.values ?? [];
		return raw
			.map((record, index) => ({ record, index }))
			.sort((a, b) => {
				const totalA = (downloadOf(a.record) ?? 0) + (uploadOf(a.record) ?? 0);
				const totalB = (downloadOf(b.record) ?? 0) + (uploadOf(b.record) ?? 0);
				return totalB - totalA;
			})
			.slice(0, 10);
	});

	const deviceColumns: DataTableColumn<DeviceRow>[] = [
		{
			key: 'label',
			header: 'Device',
			required: true,
			accessor: (row) => labelOf(row.record)
		},
		{
			key: 'download',
			header: 'Download',
			align: 'right',
			accessor: (row) => downloadOf(row.record) ?? 0,
			render: downloadCell
		},
		{
			key: 'upload',
			header: 'Upload',
			align: 'right',
			accessor: (row) => uploadOf(row.record) ?? 0,
			render: uploadCell
		}
	];

	function getRowId(row: DeviceRow): string {
		return String(row.record.mac ?? row.record.id ?? row.index);
	}

	function load(range: DataUsageRange = network.range) {
		dataUsageStore.fetchNetwork(networkId, range);
		dataUsageStore.fetchBreakdown(networkId, range);
		dataUsageStore.fetchDevices(networkId, range);
	}

	onMount(() => {
		load();
	});
</script>

{#snippet downloadCell(row: DeviceRow)}
	{formatBytes(downloadOf(row.record))}
{/snippet}

{#snippet uploadCell(row: DeviceRow)}
	{formatBytes(uploadOf(row.record))}
{/snippet}

<Card title="Data Usage">
	{#snippet actions()}
		<TimeRangeSelector options={rangeOptions} value={network.range} onChange={(r) => load(r)} />
	{/snippet}

	{#if network.premiumRequired}
		<div class="premium-note" role="note">
			<span class="premium-note-icon"><Icon name="lock" size={20} /></span>
			<div>
				<p class="premium-note-title">Data usage requires eero Plus/Secure</p>
				<p class="premium-note-description text-muted">
					Upgrade the network's subscription to unlock this card.
				</p>
			</div>
		</div>
	{:else if network.error}
		<ErrorState message={network.error} onRetry={() => load()} />
	{:else if network.loading && !network.data}
		<Skeleton variant="card" height="220px" />
	{:else}
		<div class="totals">
			<div class="total">
				<span class="total-label text-muted">Download</span>
				<span class="total-value">{formatBytes(network.data?.download_bytes)}</span>
			</div>
			<div class="total">
				<span class="total-label text-muted">Upload</span>
				<span class="total-value">{formatBytes(network.data?.upload_bytes)}</span>
			</div>
		</div>

		{#if timeSeries}
			<TimeSeriesChart datasets={chartDatasets} loading={network.loading} />
		{:else if network.data && network.data.values.length > 0}
			<GenericRecordList
				records={network.data.values}
				emptyTitle="No usage data"
				recordLabel={(_r, i) => `Entry ${i + 1}`}
			/>
		{/if}

		{#if breakdown.data && breakdown.data.values.length > 0}
			<section class="breakdown">
				<h4>Breakdown</h4>
				<GenericRecordList
					records={breakdown.data.values}
					emptyTitle="No breakdown data"
					recordLabel={(_r, i) => `Entry ${i + 1}`}
				/>
			</section>
		{/if}

		<section class="devices-table">
			<h4>Top Devices</h4>
			<DataTable
				id="data-usage-devices"
				columns={deviceColumns}
				rows={topDevices}
				{getRowId}
				loading={devices.loading}
				emptyTitle="No per-device usage data"
				showColumnToggle={false}
			/>
		</section>
	{/if}
</Card>

<style>
	.totals {
		display: flex;
		gap: var(--space-6);
		margin-bottom: var(--space-4);
	}

	.total {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.total-label {
		font-size: var(--text-sm);
	}

	.total-value {
		font-size: var(--text-xl, 1.25rem);
		font-weight: 600;
	}

	.breakdown,
	.devices-table {
		margin-top: var(--space-4);
	}

	.breakdown h4,
	.devices-table h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-2);
	}

	.premium-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}

	.premium-note-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.premium-note-title {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}

	.premium-note-description {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
