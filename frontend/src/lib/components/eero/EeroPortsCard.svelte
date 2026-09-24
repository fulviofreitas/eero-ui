<!--
  EeroPortsCard

  Eero detail "Ethernet Ports" card. Extracted from routes/eeros/[id]/+page.svelte
  (WP5 decomposition).

  Per-port action controls (phase-6.0-revamp.md § 7 WP7, family 6) are an
  unverified, non-settings write (plan § 5) - self-contained here (like
  `BackupInternetCard`'s toggle), gated on `EERO_DASHBOARD_EXPERIMENTAL_WRITES`,
  every write goes through a `ConfirmDialog` naming "not verified end-to-end".
  A 422 `port_protected` response (the backend refuses a disruptive action
  against a gateway's WAN/uplink port) is rendered inline against that port's
  own card, not as a toast - every other failure is a toast.
-->
<script lang="ts">
	import { api, ApiClientError } from '$api/client';
	import { uiStore } from '$stores';
	import type { EeroDetail } from '$api/types';
	import { PORT_ACTIONS, type PortAction } from '$api/types';
	import { formatPortSpeed } from '$lib/utils/eero-format';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
		eeroId: string;
		ports: EeroDetail['ethernet_ports'];
	}

	let { eeroId, ports }: Props = $props();

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';
	const PORT_ACTION_LABELS: Record<PortAction, string> = {
		ENABLE_DATA: 'Enable Data',
		DISABLE_DATA: 'Disable Data',
		ENABLE_POE: 'Enable PoE',
		DISABLE_POE: 'Disable PoE',
		ENABLE_PORT: 'Enable Port',
		DISABLE_PORT: 'Disable Port',
		RESTART_POWER: 'Restart Power',
		ENABLE_PORT_SECURITY: 'Enable Port Security',
		DISABLE_PORT_SECURITY: 'Disable Port Security'
	};
	const DISRUPTIVE_PORT_ACTIONS: PortAction[] = ['DISABLE_DATA', 'DISABLE_POE', 'DISABLE_PORT'];

	let selectedAction = $state<Record<string, PortAction>>({});
	let applyingPort = $state<string | null>(null);
	let portErrors = $state<Record<string, string>>({});

	function portKey(portName: string | null, index: number): string {
		return portName ?? `port-${index}`;
	}

	function actionForPort(key: string): PortAction {
		return selectedAction[key] ?? PORT_ACTIONS[0];
	}

	function requestPortAction(portName: string | null, index: number) {
		if (!portName) return;
		const key = portKey(portName, index);
		const action = actionForPort(key);
		const disruptive = DISRUPTIVE_PORT_ACTIONS.includes(action);
		uiStore.confirm({
			title: 'Run Port Action',
			message: `Run "${PORT_ACTION_LABELS[action]}" on port "${portName}"?`,
			details: [
				NOT_VERIFIED_DETAIL,
				...(disruptive ? ['Whatever is connected to this port may lose connectivity.'] : [])
			],
			confirmText: 'Run Action',
			danger: disruptive,
			onConfirm: async () => {
				applyingPort = key;
				portErrors = { ...portErrors, [key]: '' };
				try {
					const result = await api.eeros.portAction(eeroId, portName, action);
					if (result.success) {
						uiStore.success(`Port action "${PORT_ACTION_LABELS[action]}" applied.`);
					}
				} catch (err) {
					if (err instanceof ApiClientError && err.type === 'port_protected') {
						portErrors = { ...portErrors, [key]: err.detail };
					} else {
						uiStore.error(err instanceof Error ? err.message : 'Failed to run port action');
					}
				} finally {
					applyingPort = null;
				}
			}
		});
	}
</script>

{#if ports && ports.length > 0}
	<section class="card detail-card wide-card">
		<h2>Ethernet Ports</h2>
		<div class="ports-grid">
			{#each ports as port, i}
				<div class="port-card" class:has-carrier={port.has_carrier}>
					<div class="port-header">
						<span class="port-name">{port.port_name || `Port ${i + 1}`}</span>
						{#if port.is_wan_port}
							<span class="badge badge-info">WAN</span>
						{/if}
						{#if port.is_lte}
							<span class="badge badge-warning">LTE</span>
						{/if}
					</div>
					<span class="port-status">
						{#if port.has_carrier}
							<span class="text-success">●</span> Connected {#if port.speed}<span
									class="port-speed-badge">{formatPortSpeed(port.speed)}</span
								>{/if}
						{:else}
							<span class="text-muted">○ No link</span>
						{/if}
					</span>
					{#if port.neighbor_location}
						<div class="port-neighbor text-sm text-muted">
							→ {port.neighbor_location}{port.neighbor_port ? ` (${port.neighbor_port})` : ''}
						</div>
					{/if}
					<ExperimentalGate>
						<div class="port-action-row">
							<select
								bind:value={selectedAction[portKey(port.port_name, i)]}
								disabled={applyingPort === portKey(port.port_name, i)}
							>
								{#each PORT_ACTIONS as action (action)}
									<option value={action}>{PORT_ACTION_LABELS[action]}</option>
								{/each}
							</select>
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => requestPortAction(port.port_name, i)}
								disabled={applyingPort === portKey(port.port_name, i) || !port.port_name}
							>
								{#if applyingPort === portKey(port.port_name, i)}
									<span class="loading-spinner"></span>
								{/if}
								Run
							</button>
						</div>
						{#if portErrors[portKey(port.port_name, i)]}
							<p class="port-error text-danger text-sm" role="alert">
								{portErrors[portKey(port.port_name, i)]}
							</p>
						{/if}
					</ExperimentalGate>
				</div>
			{/each}
		</div>
	</section>
{/if}

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

	.ports-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-3);
	}

	.port-card {
		background-color: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-muted);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		transition: all var(--transition-fast);
	}

	.port-card.has-carrier {
		border-color: var(--color-success);
		background-color: rgba(16, 185, 129, 0.05);
	}

	.port-header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.port-name {
		font-weight: 500;
		font-size: 0.875rem;
	}

	.port-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 0.8125rem;
		flex-wrap: nowrap;
		white-space: nowrap;
	}

	.port-speed-badge {
		display: inline-block;
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		background-color: var(--color-bg-primary);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		margin-left: 4px;
		vertical-align: middle;
	}

	.port-neighbor {
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	.port-action-row {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border-muted);
	}

	.port-action-row select {
		flex: 1;
		min-width: 0;
		padding: var(--space-1) var(--space-2);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: 0.75rem;
	}

	.port-error {
		margin: var(--space-2) 0 0;
	}

	@media (max-width: 768px) {
		.ports-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
