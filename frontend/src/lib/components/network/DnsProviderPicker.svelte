<!--
  DNS Provider Picker

  Renders the server-supplied catalogue of DNS providers as selectable
  chips. The list itself always comes from the API (`DnsSettings.providers`)
  - never hardcoded here - so the backend controls what's on offer.
-->
<script lang="ts">
	import type { DnsProvider } from '$api/types';

	interface Props {
		providers: DnsProvider[];
		selectedName?: string | null;
		disabled?: boolean;
		onSelect: (provider: DnsProvider) => void;
	}

	let { providers, selectedName = null, disabled = false, onSelect }: Props = $props();
</script>

{#if providers.length > 0}
	<div class="provider-picker" role="group" aria-label="DNS provider presets">
		{#each providers as provider (provider.name)}
			<button
				type="button"
				class="provider-chip"
				class:selected={selectedName === provider.name}
				{disabled}
				onclick={() => onSelect(provider)}
			>
				{provider.name}
			</button>
		{/each}
	</div>
{/if}

<style>
	.provider-picker {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.provider-chip {
		padding: var(--space-1) var(--space-3);
		font-size: 0.8125rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		background: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.provider-chip:hover:not(:disabled) {
		border-color: var(--color-accent);
		color: var(--color-text-primary);
	}

	.provider-chip.selected {
		border-color: var(--color-accent);
		background: var(--color-info-bg);
		color: var(--color-accent);
	}

	.provider-chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
