<!--
  Dashboard Page

  Main dashboard with network overview and quick stats.
  Inspired by comprehensive Grafana dashboard for eero mesh networks.

  WP5 (6.0 revamp) note: decomposed into lib/components/dashboard/* feature components; this
  file is now data fetching + layout + composition only. Behaviour unchanged except:
  skeleton-first loading with stale-while-revalidate (item 4 of the WP5 brief) in place of the
  previous full-block spinner.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$api/client';
	import type { NetworkDetail, EeroSummary, ProfileSummary, DeviceSummary } from '$api/types';
	import { devicesStore, deviceCounts, uiStore, selectedNetworkId, networksStore } from '$stores';
	import PageHeader from '$components/common/PageHeader.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import ClientCountChart from '$lib/components/charts/ClientCountChart.svelte';
	import NetworkStatusCard from '$lib/components/dashboard/NetworkStatusCard.svelte';
	import DeviceStatCard from '$lib/components/dashboard/DeviceStatCard.svelte';
	import EeroStatCard from '$lib/components/dashboard/EeroStatCard.svelte';
	import ProfileStatCard from '$lib/components/dashboard/ProfileStatCard.svelte';
	import SpeedTestCard from '$lib/components/dashboard/SpeedTestCard.svelte';
	import DeviceInsightsSection from '$lib/components/dashboard/DeviceInsightsSection.svelte';
	import EeroHealthSection from '$lib/components/dashboard/EeroHealthSection.svelte';

	let network: NetworkDetail | null = $state(null);
	let eeros: EeroSummary[] = $state([]);
	let profiles: ProfileSummary[] = $state([]);
	let loading = $state(true);
	let speedTestLoading = $state(false);
	let lastNetworkId: string | null = $state(null);

	onMount(async () => {
		lastNetworkId = $selectedNetworkId;
		await Promise.all([loadNetworkData(), devicesStore.fetch()]);
	});

	async function loadNetworkData() {
		// Stale-while-revalidate: keep showing the previous `network`/`eeros`/`profiles` while
		// this refetch is in flight rather than blanking the page.
		loading = true;
		try {
			const networkId = $selectedNetworkId;
			if (networkId) {
				network = await api.networks.get(networkId);
				eeros = await api.eeros.list();
				profiles = await api.profiles.list();
			} else {
				// Fallback: get first network
				const networks = await api.networks.list();
				if (networks.length > 0) {
					network = await api.networks.get(networks[0].id);
					eeros = await api.eeros.list();
					profiles = await api.profiles.list();
				}
			}
		} catch (_error) {
			console.error('Failed to load network data:', _error);
		} finally {
			loading = false;
		}
	}

	// NOTE (6.0 revamp, frontend SME): `POST /speedtest` now only starts the
	// test (202, no result) - the result is fetched separately by polling
	// history (plan decision 4). Routed through `networksStore.runSpeedTest`,
	// the same helper the network detail page uses, rather than duplicating
	// the poll loop here.
	/** Cancelled on unmount (REVIEWER finding, Medium) so an in-flight poll loop stops immediately rather than leaking past navigation. */
	let speedTestController: AbortController | null = null;

	onDestroy(() => {
		speedTestController?.abort();
	});

	async function runSpeedTest() {
		if (!network) return;

		speedTestController?.abort();
		const controller = new AbortController();
		speedTestController = controller;

		speedTestLoading = true;
		uiStore.info('Starting speed test... this can take up to 90 seconds.');

		try {
			const result = await networksStore.runSpeedTest(network.id, { signal: controller.signal });
			network = { ...network, speed_test: result };
			uiStore.success('Speed test completed!');
		} catch (error) {
			const isAbort = error instanceof Error && error.name === 'AbortError';
			const isSuperseded = error instanceof Error && error.message.includes('superseded');
			if (!isAbort && !isSuperseded) {
				uiStore.error('Speed test failed. Please try again.');
			}
		} finally {
			if (speedTestController === controller) {
				speedTestLoading = false;
			}
		}
	}

	// React to network changes
	$effect(() => {
		if ($selectedNetworkId && $selectedNetworkId !== lastNetworkId && lastNetworkId !== null) {
			lastNetworkId = $selectedNetworkId;
			loadNetworkData();
			devicesStore.fetch(true);
		}
	});
	// Computed values for profiles
	let totalProfileDevices = $derived(profiles.reduce((sum, p) => sum + p.device_count, 0));
	let pausedProfiles = $derived(profiles.filter((p) => p.paused).length);
	// Computed values for charts
	let connectionTypeData = $derived([
		{ label: 'Wireless', value: $deviceCounts.wireless, color: 'rgba(99, 102, 241, 0.8)' },
		{ label: 'Wired', value: $deviceCounts.wired, color: 'rgba(251, 146, 60, 0.8)' }
	]);
	let wifiBandData = $derived([
		{ label: '2.4 GHz', value: $deviceCounts.freq24, color: 'rgba(34, 197, 94, 0.8)' },
		{ label: '5 GHz', value: $deviceCounts.freq5, color: 'rgba(168, 85, 247, 0.8)' },
		{ label: '6 GHz', value: $deviceCounts.freq6, color: 'rgba(59, 130, 246, 0.8)' }
	]);
	let clientsPerEeroData = $derived(
		eeros.map((eero, index) => ({
			label: eero.location || eero.model,
			value: eero.connected_clients_count,
			color: `hsl(${(index * 360) / Math.max(eeros.length, 1)}, 70%, 60%)`
		}))
	);
	let meshQualityItems = $derived(
		eeros
			.filter((e) => e.mesh_quality_bars !== null)
			.map((eero) => ({
				label: eero.location || eero.model,
				value: eero.mesh_quality_bars ?? 0,
				maxValue: 5
			}))
			.sort((a, b) => b.value - a.value)
	);
	// Top manufacturers from devices
	let topManufacturers = $derived(
		(() => {
			const devices = $devicesStore?.devices ?? [];
			// Using plain Map for intermediate computation (not reactive state)
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const manufacturerCounts = new Map<string, number>();

			devices.forEach((d: DeviceSummary) => {
				if (d.connected && d.manufacturer) {
					const manufacturer = d.manufacturer;
					manufacturerCounts.set(manufacturer, (manufacturerCounts.get(manufacturer) ?? 0) + 1);
				}
			});

			return Array.from(manufacturerCounts.entries())
				.map(([label, value]) => ({
					label,
					value,
					maxValue: Math.max(...Array.from(manufacturerCounts.values()))
				}))
				.sort((a, b) => b.value - a.value)
				.slice(0, 8);
		})()
	);
	// Eero status summary (backend normalizes: green->online, yellow->warning, red->offline)
	let eeroStatusCounts = $derived({
		online: eeros.filter((e) => e.status === 'online' || e.status === 'green').length,
		warning: eeros.filter((e) => e.status === 'warning' || e.status === 'yellow').length,
		offline: eeros.filter((e) => e.status === 'offline' || e.status === 'red').length
	});
</script>

<svelte:head>
	<title>Dashboard | Eero Dashboard</title>
</svelte:head>

<div class="dashboard">
	<PageHeader title="Dashboard" description="Network overview and quick stats" />

	{#if loading && !network}
		<div class="stats-grid">
			<Skeleton variant="card" height="220px" />
			<Skeleton variant="card" height="220px" />
			<Skeleton variant="card" height="220px" />
			<Skeleton variant="card" height="220px" />
		</div>
	{:else if network}
		<!-- Stats Grid -->
		<div class="stats-grid">
			<NetworkStatusCard {network} />
			<DeviceStatCard
				connected={$deviceCounts.connected}
				total={$deviceCounts.total}
				wireless={$deviceCounts.wireless}
				wired={$deviceCounts.wired}
			/>
			<EeroStatCard {eeros} />
			<ProfileStatCard {profiles} totalDevices={totalProfileDevices} pausedCount={pausedProfiles} />
		</div>

		<SpeedTestCard {network} loading={speedTestLoading} onRunTest={runSpeedTest} />

		<DeviceInsightsSection {connectionTypeData} {wifiBandData} {topManufacturers} />

		<EeroHealthSection
			{eeros}
			statusCounts={eeroStatusCounts}
			{clientsPerEeroData}
			{meshQualityItems}
		/>

		<!-- Network Metrics Section -->
		<section class="dashboard-section">
			<h2 class="section-title">Network Metrics</h2>
			<div class="metrics-grid">
				<div class="metrics-chart-full">
					<ClientCountChart />
				</div>
			</div>
		</section>
	{:else}
		<div class="empty-state">
			<p>No network data available.</p>
		</div>
	{/if}
</div>

<style>
	.dashboard {
		max-width: 1200px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.dashboard-section {
		margin-bottom: var(--space-8);
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
		color: var(--color-text);
	}

	.metrics-grid {
		display: grid;
		gap: var(--space-4);
	}

	.metrics-chart-full {
		grid-column: 1 / -1;
	}

	.empty-state {
		text-align: center;
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}
</style>
