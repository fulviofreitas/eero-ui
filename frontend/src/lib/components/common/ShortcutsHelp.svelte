<!--
  Shortcuts Help

  Lists every entry in lib/shortcuts.ts (WP9 § 6.2 Tier 3) so the shortcut table never drifts
  from what's documented - opened via the bare "?" key (see +layout.svelte's global keydown
  handler) and built on the same Modal primitive as CommandPalette.
-->
<script lang="ts">
	import Modal from './Modal.svelte';
	import { shortcuts } from '$lib/shortcuts';

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	function close() {
		open = false;
	}

	function keyLabel(key: string): string {
		return key === 'Mod' ? '⌘' : key;
	}
</script>

<Modal {open} title="Keyboard Shortcuts" onClose={close}>
	<ul class="shortcuts-list">
		{#each shortcuts as shortcut (shortcut.id)}
			<li class="shortcut-row">
				<span class="shortcut-description">{shortcut.description}</span>
				<span class="shortcut-keys">
					{#each shortcut.keys as key, i (key)}
						{#if i > 0}<span class="shortcut-plus">+</span>{/if}
						<kbd>{keyLabel(key)}</kbd>
					{/each}
				</span>
			</li>
		{/each}
	</ul>
</Modal>

<style>
	.shortcuts-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.shortcut-description {
		color: var(--color-text-secondary);
	}

	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}

	.shortcut-plus {
		color: var(--color-text-muted);
	}

	kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.5rem;
		padding: 2px 6px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
	}
</style>
