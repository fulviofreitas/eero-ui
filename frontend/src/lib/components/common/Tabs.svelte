<!--
  Tabs

  Renders the tablist only — the caller owns the panel content and switches on `value`. Roving
  tabindex (only the selected tab is in the tab order; arrow keys move focus AND selection,
  matching the standard tabs pattern), `aria-selected`, Home/End support.
-->
<script lang="ts">
	interface TabItem {
		id: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		tabs: TabItem[];
		value: string;
		onChange: (id: string) => void;
		label?: string;
	}

	let { tabs, value, onChange, label = 'Tabs' }: Props = $props();

	// R3 (WP5 reviewer fix): must be reactive state, not a plain array - `bind:this` writes to it
	// on every mount/each-block change, and non-reactive writes to a `bind:this` target trigger
	// Svelte's `binding_property_non_reactive` warning.
	let tabRefs: (HTMLButtonElement | null)[] = $state([]);

	function enabledIndexes(): number[] {
		return tabs.reduce<number[]>((acc, t, i) => {
			if (!t.disabled) acc.push(i);
			return acc;
		}, []);
	}

	function focusAndSelect(index: number) {
		const tab = tabs[index];
		if (!tab || tab.disabled) return;
		onChange(tab.id);
		tabRefs[index]?.focus();
	}

	function handleKeydown(event: KeyboardEvent, currentIndex: number) {
		const enabled = enabledIndexes();
		if (enabled.length === 0) return;
		const posInEnabled = enabled.indexOf(currentIndex);

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown': {
				event.preventDefault();
				const next = enabled[(posInEnabled + 1) % enabled.length];
				focusAndSelect(next);
				break;
			}
			case 'ArrowLeft':
			case 'ArrowUp': {
				event.preventDefault();
				const prev = enabled[(posInEnabled - 1 + enabled.length) % enabled.length];
				focusAndSelect(prev);
				break;
			}
			case 'Home': {
				event.preventDefault();
				focusAndSelect(enabled[0]);
				break;
			}
			case 'End': {
				event.preventDefault();
				focusAndSelect(enabled[enabled.length - 1]);
				break;
			}
		}
	}
</script>

<div class="tabs" role="tablist" aria-label={label}>
	{#each tabs as tab, index (tab.id)}
		<button
			bind:this={tabRefs[index]}
			type="button"
			role="tab"
			id="tab-{tab.id}"
			aria-selected={value === tab.id}
			aria-controls="tabpanel-{tab.id}"
			tabindex={value === tab.id ? 0 : -1}
			disabled={tab.disabled}
			class:active={value === tab.id}
			onclick={() => onChange(tab.id)}
			onkeydown={(e) => handleKeydown(e, index)}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		gap: var(--space-1);
		border-bottom: 1px solid var(--color-border);
		/* Narrow viewports (network page has 5 tabs) scroll horizontally instead of wrapping or
		   overflowing the container; scroll-snap lands each tab flush against the edge instead of
		   stopping mid-label. */
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
	}

	.tabs button {
		padding: var(--space-2) var(--space-4);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--color-text-secondary);
		font-size: var(--text-base);
		cursor: pointer;
		white-space: nowrap;
		scroll-snap-align: start;
		transition: color var(--transition-fast);
	}

	.tabs button:hover:not(:disabled) {
		color: var(--color-text-primary);
	}

	.tabs button.active {
		color: var(--color-text-primary);
		border-bottom-color: var(--color-accent);
	}

	.tabs button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
