<!--
  Network Detail Page

  WP5 (6.0 revamp) note: decomposed into lib/components/network/* feature components; this
  file is now data fetching + layout + composition only. The 16-card wall is grouped into tabs
  (Overview / Wi-Fi & Guest / DNS / Advanced / Diagnostics) per the WP5 brief. Behaviour is
  unchanged except: the guest-network toggle is now optimistic-with-rollback instead of
  await-then-full-refetch (plan § 5, "Verified" write class), and loading uses a skeleton with
  stale-while-revalidate instead of a full-block spinner.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { api } from '$api/client';
	import type { NetworkDetail } from '$api/types';
	import { uiStore, networksStore, speedTestFor } from '$stores';
	import StatusBadge from '$components/common/StatusBadge.svelte';
	import DetailHeader from '$components/common/DetailHeader.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import Tabs from '$components/common/Tabs.svelte';
	import Icon from '$components/common/Icon.svelte';
	import SpeedtestChart from '$lib/components/charts/SpeedtestChart.svelte';
	import DnsSettingsCard from '$lib/components/network/DnsSettingsCard.svelte';
	import DnsCachingCard from '$lib/components/network/DnsCachingCard.svelte';
	import OverviewCard from '$lib/components/network/OverviewCard.svelte';
	import HardwareFeaturesCard from '$lib/components/network/HardwareFeaturesCard.svelte';
	import LocationPremiumCard from '$lib/components/network/LocationPremiumCard.svelte';
	import GuestNetworkCard from '$lib/components/network/GuestNetworkCard.svelte';
	import GuestPasswordCard from '$lib/components/network/GuestPasswordCard.svelte';
	import PremiumDnsCard from '$lib/components/network/PremiumDnsCard.svelte';
	import AdvancedSettingsCard from '$lib/components/network/AdvancedSettingsCard.svelte';
	import NetworkHealthCard from '$lib/components/network/NetworkHealthCard.svelte';
	import NetworkSpeedTestCard from '$lib/components/network/NetworkSpeedTestCard.svelte';
	import SpeedTestHistoryCard from '$lib/components/network/SpeedTestHistoryCard.svelte';
	import NetworkScanCard from '$lib/components/network/NetworkScanCard.svelte';
	import NetworkRenameModal from '$lib/components/network/NetworkRenameModal.svelte';
	import InsightsCard from '$lib/components/common/InsightsCard.svelte';
	import DataUsageCard from '$lib/components/network/DataUsageCard.svelte';
	import EventsCard from '$lib/components/network/EventsCard.svelte';
	import ChannelUtilizationCard from '$lib/components/network/ChannelUtilizationCard.svelte';
	import MembersCard from '$lib/components/network/MembersCard.svelte';
	import BackupInternetCard from '$lib/components/network/BackupInternetCard.svelte';
	import ForwardsReservationsCard from '$lib/components/network/ForwardsReservationsCard.svelte';
	import SecurityWanCard from '$lib/components/network/SecurityWanCard.svelte';
	import NotificationsCard from '$lib/components/network/NotificationsCard.svelte';
	import PremiumGate from '$components/common/PremiumGate.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	let network: NetworkDetail | null = $state(null);
	let loading = $state(true);
	let error: string | null = $state(null);
	let speedTestLoading = $state(false);
	let guestToggleLoading = $state(false);
	let showRenameModal = $state(false);
	let renameValue = $state('');
	let renaming = $state(false);
	let activeTab = $state('overview');
	/** Cancelled on unmount (REVIEWER finding, Medium) so an in-flight poll loop stops immediately rather than leaking past navigation. */
	let speedTestController: AbortController | null = null;

	let networkId = $derived($page.params.id);
	let speedTestProgress = $derived(speedTestFor(networkId ?? ''));

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'wifi', label: 'Wi-Fi & Guest' },
		{ id: 'dns', label: 'DNS' },
		{ id: 'advanced', label: 'Advanced' },
		{ id: 'diagnostics', label: 'Diagnostics' }
	];

	onMount(() => {
		console.log('Network page mounted, ID:', networkId);
		fetchNetwork();
	});

	onDestroy(() => {
		speedTestController?.abort();
	});

	async function fetchNetwork(refresh = false) {
		console.log('Fetching network with ID:', networkId);

		if (!networkId) {
			console.error('Network ID is missing');
			error = 'Invalid network ID';
			loading = false;
			return;
		}

		// Stale-while-revalidate: keep the previous `network` on screen while this
		// refetch is in flight rather than blanking the page.
		loading = true;
		error = null;
		try {
			const result = await api.networks.get(networkId, refresh);
			console.log('Network detail result:', result);
			network = result;
		} catch (err) {
			console.error('Failed to load network:', err);
			error = err instanceof Error ? err.message : 'Failed to load network details';
		} finally {
			loading = false;
		}
	}

	async function handleSpeedTest() {
		if (!networkId) return;

		// Cancel any run this page previously started before beginning a new one.
		speedTestController?.abort();
		const controller = new AbortController();
		speedTestController = controller;

		speedTestLoading = true;
		uiStore.info('Running speed test… this can take up to 90 seconds.');

		try {
			// Verified write (plan § 5), but the result is not in the POST
			// response on eero-api v8 - the store starts the test, then polls
			// speed-test history until a result at/after the server's
			// `started_at` appears (decision 4).
			const result = await networksStore.runSpeedTest(networkId, { signal: controller.signal });
			uiStore.success('Speed test completed!');
			if (network) {
				network = { ...network, speed_test: result };
			}
		} catch (err) {
			// A deliberate cancel (unmount, or superseded by a newer run for
			// this network) is not a user-facing failure.
			const isAbort = err instanceof Error && err.name === 'AbortError';
			const isSuperseded = err instanceof Error && err.message.includes('superseded');
			if (!isAbort && !isSuperseded) {
				uiStore.error(err instanceof Error ? err.message : 'Speed test failed');
			}
		} finally {
			if (speedTestController === controller) {
				speedTestLoading = false;
			}
		}
	}

	// Verified write (plan § 5): optimistic with rollback and an inline busy
	// state, in place of the previous await-then-full-refetch anti-pattern
	// (`svelte-dashboard.md`, WP5 item 3).
	async function handleToggleGuestNetwork() {
		if (!network || !networkId) return;

		const previous = network.guest_network_enabled;
		const enabling = !previous;
		network = { ...network, guest_network_enabled: enabling };
		guestToggleLoading = true;

		try {
			await api.networks.toggleGuestNetwork(networkId, enabling);
			uiStore.success(`Guest network ${enabling ? 'enabled' : 'disabled'}.`);
		} catch (err) {
			if (network) {
				network = { ...network, guest_network_enabled: previous };
			}
			uiStore.error(err instanceof Error ? err.message : 'Failed to toggle guest network');
		} finally {
			guestToggleLoading = false;
		}
	}

	function openRenameNetworkModal() {
		renameValue = network?.name ?? '';
		showRenameModal = true;
	}

	function handleRenameNetwork(name: string) {
		const trimmed = name.trim();
		if (!trimmed || !networkId) return;
		showRenameModal = false;

		// Settings-class write (plan § 5, decision 5): a network rename is
		// treated as a mesh reboot. Pessimistic, behind a danger confirm
		// naming both the reboot and the operator's own disconnection, same
		// pattern as the DNS settings card.
		uiStore.confirm({
			title: 'Rename Network?',
			message: 'Renaming your network reboots every eero to apply the new name.',
			details: [
				'Every eero on this network will restart, and all connected devices will lose ' +
					'internet access for a minute or two.',
				'If you are connected to this network right now, you will lose your own ' +
					'connection while it restarts.'
			],
			confirmText: 'Rename & Restart Network',
			danger: true,
			onConfirm: async () => {
				renaming = true;
				try {
					const result = await networksStore.renameNetwork(networkId!, trimmed);
					if (!result.changed) {
						uiStore.info('No changes to apply.');
						return;
					}
					if (network) {
						network = { ...network, name: result.name };
					}
					uiStore.success(`Network renamed to "${result.name}"`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to rename network');
				} finally {
					renaming = false;
				}
			}
		});
	}
</script>

<svelte:head>
	<title>{network?.name || 'Network'} | Eero Dashboard</title>
</svelte:head>

<div class="network-detail-page">
	{#if loading && !network}
		<Skeleton variant="card" height="120px" />
		<div class="skeleton-grid">
			<Skeleton variant="card" height="220px" />
			<Skeleton variant="card" height="220px" />
		</div>
	{:else if error}
		<div class="error-state">
			<p class="text-danger">Error: {error}</p>
			<div class="error-actions">
				<button class="btn btn-secondary" onclick={() => fetchNetwork(true)}> Try Again </button>
				<button class="btn btn-ghost" onclick={() => goto('/')}> Back to Dashboard </button>
			</div>
		</div>
	{:else if !network}
		<div class="empty-state">
			<p>No network data available.</p>
			<div class="error-actions">
				<button class="btn btn-secondary" onclick={() => fetchNetwork(true)}> Try Again </button>
				<button class="btn btn-ghost" onclick={() => goto('/')}> Back to Dashboard </button>
			</div>
		</div>
	{:else}
		<DetailHeader
			backHref="/"
			backLabel="Back to dashboard"
			title={network.name}
			subtitle={network.isp_name ?? undefined}
		>
			{#snippet status()}
				<StatusBadge status={network!.status === 'online' ? 'connected' : 'disconnected'} />
			{/snippet}
			{#snippet actions()}
				<button class="btn btn-secondary" onclick={() => fetchNetwork(true)} disabled={loading}>
					<Icon name="refresh" size={14} /> Refresh
				</button>
				<ExperimentalGate>
					<button class="btn btn-secondary" onclick={openRenameNetworkModal} disabled={loading}>
						<Icon name="edit" size={14} /> Rename
					</button>
				</ExperimentalGate>
			{/snippet}
		</DetailHeader>

		<Tabs {tabs} value={activeTab} onChange={(id) => (activeTab = id)} label="Network settings" />

		<div class="tab-content">
			{#if activeTab === 'overview'}
				<div
					class="info-grid"
					role="tabpanel"
					id="tabpanel-overview"
					aria-labelledby="tab-overview"
				>
					<OverviewCard {network} networkId={networkId ?? ''} />
					<HardwareFeaturesCard {network} />
					<LocationPremiumCard {network} />
				</div>
				{#if networkId}
					<div class="info-grid premium-grid">
						<PremiumGate feature="Network insights">
							<InsightsCard scope="network" id={networkId} />
						</PremiumGate>
						<PremiumGate feature="Data usage">
							<DataUsageCard {networkId} />
						</PremiumGate>
					</div>
				{/if}
			{:else if activeTab === 'wifi'}
				<div class="info-grid" role="tabpanel" id="tabpanel-wifi" aria-labelledby="tab-wifi">
					<GuestNetworkCard
						enabled={network.guest_network_enabled}
						loading={guestToggleLoading}
						onToggle={handleToggleGuestNetwork}
					/>
					{#if networkId}
						<GuestPasswordCard {networkId} />
					{/if}
				</div>
			{:else if activeTab === 'dns'}
				<div class="info-grid" role="tabpanel" id="tabpanel-dns" aria-labelledby="tab-dns">
					{#if networkId}
						<DnsSettingsCard {networkId} />
						<DnsCachingCard {networkId} />
					{/if}
					<PremiumDnsCard {network} />
				</div>
			{:else if activeTab === 'advanced'}
				<div
					class="info-grid"
					role="tabpanel"
					id="tabpanel-advanced"
					aria-labelledby="tab-advanced"
				>
					<AdvancedSettingsCard {network} />
				</div>
				{#if networkId}
					<div class="info-grid advanced-secondary">
						<MembersCard {networkId} />
						<PremiumGate feature="Backup internet">
							<BackupInternetCard {networkId} />
						</PremiumGate>
					</div>
					<div class="advanced-full">
						<SecurityWanCard {networkId} />
						<NotificationsCard {networkId} />
						<ForwardsReservationsCard {networkId} />
					</div>
				{/if}
			{:else if activeTab === 'diagnostics'}
				<div
					class="info-grid"
					role="tabpanel"
					id="tabpanel-diagnostics"
					aria-labelledby="tab-diagnostics"
				>
					<NetworkSpeedTestCard
						speedTest={network.speed_test}
						loading={speedTestLoading}
						elapsedSeconds={$speedTestProgress.elapsedSeconds}
						onRunTest={handleSpeedTest}
					/>
					{#if network.health}
						<NetworkHealthCard health={network.health} />
					{/if}
				</div>
				{#if networkId}
					<div class="info-grid diagnostics-secondary">
						<SpeedTestHistoryCard {networkId} />
						<NetworkScanCard {networkId} />
						<EventsCard {networkId} />
						<ChannelUtilizationCard {networkId} />
					</div>
					<section class="network-charts">
						<SpeedtestChart {networkId} />
					</section>
				{/if}
			{/if}
		</div>

		<NetworkRenameModal
			open={showRenameModal}
			value={renameValue}
			submitting={renaming}
			onClose={() => (showRenameModal = false)}
			onSubmit={handleRenameNetwork}
			onValueChange={(v) => (renameValue = v)}
		/>
	{/if}
</div>

<style>
	.network-detail-page {
		max-width: 1200px;
	}

	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-12);
		color: var(--color-text-secondary);
	}

	.error-actions {
		display: flex;
		gap: var(--space-3);
	}

	.tab-content {
		margin-top: var(--space-4);
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: var(--space-4);
	}

	.network-charts {
		margin-top: var(--space-6);
	}

	.diagnostics-secondary {
		margin-top: var(--space-4);
	}

	.premium-grid {
		margin-top: var(--space-4);
	}

	.advanced-secondary {
		margin-top: var(--space-4);
	}

	.advanced-full {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-top: var(--space-4);
	}

	@media (max-width: 768px) {
		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
