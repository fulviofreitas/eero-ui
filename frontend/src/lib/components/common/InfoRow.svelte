<!--
  InfoRow

  Extracted from the `.info-row` pattern duplicated across 9 files. A label/value pair, with
  an optional monospace value (IPs, MACs, IDs) and an optional copy-to-clipboard action.
-->
<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		label: string;
		value: string | number;
		mono?: boolean;
		copyable?: boolean;
	}

	let { label, value, mono = false, copyable = false }: Props = $props();

	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(String(value));
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard API can be denied/unavailable; fail silently, nothing to roll back.
		}
	}
</script>

<div class="info-row">
	<span class="info-label">{label}</span>
	<span class="info-value-wrapper">
		<span class="info-value" class:mono>{value}</span>
		{#if copyable}
			<button
				type="button"
				class="copy-btn"
				onclick={copy}
				aria-label={copied ? `${label} copied` : `Copy ${label}`}
				title={copied ? 'Copied' : 'Copy'}
			>
				<Icon name={copied ? 'check' : 'copy'} size={14} />
			</button>
		{/if}
	</span>
</div>

<style>
	.info-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-label {
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	.info-value-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}

	.info-value {
		font-size: var(--text-sm);
		color: var(--color-text-primary);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.info-value.mono {
		font-family: var(--font-mono);
	}

	.copy-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		flex-shrink: 0;
	}

	.copy-btn:hover {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}
</style>
