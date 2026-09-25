<!--
  EeroActionsCard

  Eero detail "Actions" card (LED toggle, reboot, location rename). Extracted from
  routes/eeros/[id]/+page.svelte (WP5 decomposition). Presentational only - the optimistic
  LED toggle and the reboot confirm flow (plan § 5, "Verified" write class) stay in the parent
  route, which owns the `eero` state every other card on the page also reads.

  The location rename control (phase-6.0-revamp.md § 7 WP7 follow-up (c)) is an
  unverified, non-settings write (plan § 5) - wrapped in `ExperimentalGate`, the
  parent route owns the `ConfirmDialog` naming "not verified end-to-end" (same
  split of responsibility as `onReboot`).

  The node action control (phase-6.0-revamp.md § 7 WP7, family 6) is a second
  unverified, non-settings write - self-contained here (like
  `BackupInternetCard`'s toggle) since it needs no state from the parent
  route: it calls `api.eeros.nodeAction` directly, owns its own `applying`
  flag and `ConfirmDialog`, and names the reboot consequence for
  `POWER_CYCLE_ALL_PORTS_AND_REBOOT` specifically.
-->
<script lang="ts">
	import { api } from '$api/client';
	import { uiStore } from '$stores';
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import { NODE_ACTIONS, type NodeAction } from '$api/types';

	interface Props {
		eeroId: string;
		ledOn: boolean | null;
		/** `null` when the eero hasn't reported a brightness (older firmware). */
		ledBrightness?: number | null;
		location?: string | null;
		loading: boolean;
		onToggleLed: () => void;
		onReboot: () => void;
		/**
		 * Fired on every slider input event - the parent is responsible for the
		 * optimistic update, the commit-on-release debounce and the
		 * rollback-on-error (phase-6.0-revamp.md § 7 WP6, deliverable 3).
		 */
		onSetLedBrightness?: (brightness: number) => void;
		/** Fired with the trimmed input value when the Rename button is clicked. */
		onSetLocation?: (location: string) => void;
	}

	let {
		eeroId,
		ledOn,
		ledBrightness = null,
		location = null,
		loading,
		onToggleLed,
		onReboot,
		onSetLedBrightness,
		onSetLocation
	}: Props = $props();

	let locationInput = $derived(location ?? '');

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';
	const NODE_ACTION_LABELS: Record<NodeAction, string> = {
		POWER_CYCLE_ALL_PORTS: 'Power-Cycle All Ports',
		POWER_CYCLE_ALL_PORTS_AND_REBOOT: 'Power-Cycle All Ports & Reboot'
	};

	let selectedNodeAction = $state<NodeAction>(NODE_ACTIONS[0]);
	let nodeActionApplying = $state(false);

	function requestNodeAction() {
		const action = selectedNodeAction;
		const reboots = action === 'POWER_CYCLE_ALL_PORTS_AND_REBOOT';
		uiStore.confirm({
			title: 'Run Node Action',
			message: `Run "${NODE_ACTION_LABELS[action]}" on this eero?`,
			details: [
				NOT_VERIFIED_DETAIL,
				'Wired clients on this eero will drop while ports renegotiate.',
				...(reboots ? ['This action reboots this node.'] : [])
			],
			confirmText: 'Run Action',
			danger: reboots,
			onConfirm: async () => {
				nodeActionApplying = true;
				try {
					const result = await api.eeros.nodeAction(eeroId, action);
					if (result.success) {
						uiStore.success(
							result.reboots_node
								? 'Node action started; this eero is rebooting.'
								: 'Node action started.'
						);
					}
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to run node action');
				} finally {
					nodeActionApplying = false;
				}
			}
		});
	}

	function handleSliderInput(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		onSetLedBrightness?.(value);
	}

	function handleRenameSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = locationInput.trim();
		if (!trimmed) return;
		onSetLocation?.(trimmed);
	}
</script>

<section class="card detail-card actions-card">
	<h2>Actions</h2>
	<div class="action-buttons">
		<button class="btn btn-secondary" onclick={onToggleLed} disabled={loading}>
			{#if loading}
				<span class="loading-spinner"></span>
			{/if}
			<Icon name={ledOn ? 'moon' : 'lightbulb'} size={14} />
			{ledOn ? 'Turn LED Off' : 'Turn LED On'}
		</button>
		<button class="btn btn-danger" onclick={onReboot} disabled={loading}>
			{#if loading}
				<span class="loading-spinner"></span>
			{/if}
			<Icon name="refresh" size={14} /> Reboot Eero
		</button>
	</div>

	{#if onSetLedBrightness}
		<div class="led-brightness-row">
			<label for="led-brightness-slider" class="led-brightness-label">
				LED Brightness
				<span class="led-brightness-value">{ledBrightness ?? 0}%</span>
			</label>
			<input
				id="led-brightness-slider"
				type="range"
				min="0"
				max="100"
				step="1"
				value={ledBrightness ?? 0}
				disabled={loading || !ledOn}
				oninput={handleSliderInput}
			/>
		</div>
	{/if}

	<ExperimentalGate>
		<div class="node-action-row">
			<label for="node-action-select" class="node-action-label">Node Action</label>
			<div class="node-action-input-row">
				<select
					id="node-action-select"
					bind:value={selectedNodeAction}
					disabled={nodeActionApplying}
				>
					{#each NODE_ACTIONS as action (action)}
						<option value={action}>{NODE_ACTION_LABELS[action]}</option>
					{/each}
				</select>
				<button
					class="btn btn-secondary btn-sm"
					onclick={requestNodeAction}
					disabled={nodeActionApplying}
				>
					{#if nodeActionApplying}
						<span class="loading-spinner"></span>
					{/if}
					Run
				</button>
			</div>
		</div>
	</ExperimentalGate>

	{#if onSetLocation}
		<ExperimentalGate>
			<form class="location-row" onsubmit={handleRenameSubmit}>
				<label for="eero-location-input" class="location-label">Location</label>
				<div class="location-input-row">
					<input
						id="eero-location-input"
						type="text"
						bind:value={locationInput}
						disabled={loading}
					/>
					<button
						type="submit"
						class="btn btn-secondary btn-sm"
						disabled={loading || !locationInput.trim()}
					>
						Rename
					</button>
				</div>
			</form>
		</ExperimentalGate>
	{/if}

	<p class="action-warning text-muted text-sm">
		<Icon name="alert-triangle" size={14} /> Rebooting will temporarily disconnect all devices connected
		to this node.
	</p>
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

	.actions-card {
		grid-column: 1 / -1;
	}

	.action-buttons {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.led-brightness-row {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.led-brightness-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.led-brightness-value {
		font-family: var(--font-mono);
		color: var(--color-text-primary);
	}

	.led-brightness-row input[type='range'] {
		width: 100%;
		accent-color: var(--color-accent);
	}

	.action-warning {
		margin: 0;
	}

	.node-action-row {
		margin-bottom: var(--space-3);
	}

	.node-action-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.node-action-input-row {
		display: flex;
		gap: var(--space-2);
	}

	.node-action-input-row select {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	.location-row {
		margin-bottom: var(--space-3);
	}

	.location-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.location-input-row {
		display: flex;
		gap: var(--space-2);
	}

	.location-input-row input {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
	}

	@media (max-width: 768px) {
		.action-buttons {
			flex-direction: column;
		}
	}
</style>
