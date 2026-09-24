<!--
  DeviceTypePicker

  Device detail "Type" card (phase-6.0-revamp.md § 7 WP6, deliverable 4). A dropdown built on
  the shared Dropdown primitive, offering the union of device types currently present across the
  device list (from devicesStore) plus a small static catalogue (eero-api ships no device-type
  catalogue of its own - backend/app/routes/devices.py validates against
  `^[a-z0-9_]{1,40}$` rather than a fixed enum), plus a free-text "Custom…" entry validated by
  that same pattern. Presentational only - the optimistic write-with-rollback (Verified, plan
  § 5) lives in the parent route, matching DeviceProfileSelector's split.
-->
<script lang="ts">
	import { devicesStore } from '$stores';
	import Icon from '$components/common/Icon.svelte';
	import Dropdown, { type DropdownItem } from '$components/common/Dropdown.svelte';

	interface Props {
		deviceType: string | null;
		changing: boolean;
		onSelect: (deviceType: string) => void;
	}

	let { deviceType, changing, onSelect }: Props = $props();

	const DEVICE_TYPE_PATTERN = /^[a-z0-9_]{1,40}$/;

	const STATIC_TYPES = [
		'computer',
		'phone',
		'tablet',
		'tv',
		'game_console',
		'speaker',
		'camera',
		'printer',
		'iot',
		'other'
	];

	let customOpen = $state(false);
	let customValue = $state('');
	let customError: string | null = $state(null);

	// Union of the static catalogue and every device_type value currently present in the
	// device list, so a type set previously (by this UI or by the eero app) is always selectable.
	let knownTypes = $derived.by(() => {
		const fromList = $devicesStore.devices
			.map((d) => d.device_type)
			.filter((t): t is string => !!t);
		return Array.from(new Set([...STATIC_TYPES, ...fromList])).sort();
	});

	function label(type: string): string {
		return type
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	let items = $derived<DropdownItem[]>([
		...knownTypes.map((type) => ({
			id: type,
			label: deviceType === type ? `✓ ${label(type)}` : label(type),
			onSelect: () => onSelect(type)
		})),
		{
			id: '__custom__',
			label: 'Custom…',
			onSelect: () => {
				customOpen = true;
				customValue = deviceType ?? '';
				customError = null;
			}
		}
	]);

	function submitCustom() {
		const value = customValue.trim().toLowerCase();
		if (!DEVICE_TYPE_PATTERN.test(value)) {
			customError = 'Must be lowercase letters, digits, or underscores (1-40 characters).';
			return;
		}
		customOpen = false;
		onSelect(value);
	}
</script>

<section class="device-type-card card">
	<div class="device-type-header">
		<h2><Icon name="folder" size={18} /> Device Type</h2>
		{#if !customOpen}
			<Dropdown
				label={changing ? 'Updating…' : deviceType ? label(deviceType) : 'Not set'}
				{items}
				disabled={changing}
				align="right"
			/>
		{/if}
	</div>

	{#if customOpen}
		<div class="device-type-custom">
			<label for="device-type-custom-input" class="sr-only">Custom device type</label>
			<input
				id="device-type-custom-input"
				type="text"
				bind:value={customValue}
				placeholder="e.g. smart_speaker"
				disabled={changing}
			/>
			<button
				type="button"
				class="btn btn-primary btn-sm"
				onclick={submitCustom}
				disabled={changing}
			>
				Save
			</button>
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				onclick={() => (customOpen = false)}
				disabled={changing}
			>
				Cancel
			</button>
		</div>
		{#if customError}
			<p class="device-type-error" role="alert">{customError}</p>
		{/if}
	{/if}
</section>

<style>
	.device-type-card {
		padding: var(--space-4);
	}

	.device-type-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.device-type-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.device-type-custom {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.device-type-custom input {
		flex: 1;
		min-width: 0;
	}

	.device-type-error {
		margin-top: var(--space-2);
		color: var(--color-danger);
		font-size: 0.875rem;
	}
</style>
