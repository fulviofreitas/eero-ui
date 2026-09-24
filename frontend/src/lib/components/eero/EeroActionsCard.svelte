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
-->
<script lang="ts">
	import Icon from '$components/common/Icon.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';

	interface Props {
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
