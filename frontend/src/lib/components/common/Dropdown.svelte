<!--
  Dropdown / Menu

  Keyboard-navigable menu button. Replaces the three near-identical hand-rolled dropdowns in
  DeviceList.svelte (column selector, profile selector) and ExportMenu.svelte, none of which
  supported arrow keys and all of which closed on outside-click only (via a raw
  `document.addEventListener`) with no Escape handling and no `role="menu"`.

  Contract:
  - Trigger is a real `<button>`; `aria-haspopup="menu"`, `aria-expanded`.
  - Menu is `role="menu"`, items are `role="menuitem"` `<button>`s (real buttons so Enter/Space
    activate them for free).
  - Roving tabindex: only the active item is `tabindex="0"`, the rest are `-1`.
  - ArrowUp/Down move focus, Home/End jump to the ends, Escape closes and refocuses the
    trigger, Enter/Space activate (native button behaviour).
  - Closes on outside click AND Escape — never on `mouseleave`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons/paths';

	export interface DropdownItem {
		id: string;
		label: string;
		icon?: IconName;
		onSelect: () => void;
		disabled?: boolean;
		danger?: boolean;
	}

	interface Props {
		label: string;
		items: DropdownItem[];
		align?: 'left' | 'right';
		disabled?: boolean;
	}

	let { label, items, align = 'right', disabled = false }: Props = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let wrapperEl: HTMLDivElement | undefined;
	let triggerEl: HTMLButtonElement | undefined;
	let itemRefs: (HTMLButtonElement | null)[] = [];

	function enabledIndexes(): number[] {
		return items.reduce<number[]>((acc, item, i) => {
			if (!item.disabled) acc.push(i);
			return acc;
		}, []);
	}

	function openMenu() {
		if (disabled || items.length === 0) return;
		open = true;
		const enabled = enabledIndexes();
		activeIndex = enabled[0] ?? -1;
		queueMicrotask(() => itemRefs[activeIndex]?.focus());
	}

	function closeMenu({ refocusTrigger = false }: { refocusTrigger?: boolean } = {}) {
		open = false;
		activeIndex = -1;
		if (refocusTrigger) triggerEl?.focus();
	}

	function toggleMenu() {
		if (open) {
			closeMenu();
		} else {
			openMenu();
		}
	}

	function selectItem(item: DropdownItem) {
		if (item.disabled) return;
		item.onSelect();
		closeMenu({ refocusTrigger: true });
	}

	function moveFocus(delta: 1 | -1) {
		const enabled = enabledIndexes();
		if (enabled.length === 0) return;
		const pos = enabled.indexOf(activeIndex);
		const nextPos = (pos + delta + enabled.length) % enabled.length;
		activeIndex = enabled[nextPos];
		itemRefs[activeIndex]?.focus();
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				moveFocus(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				moveFocus(-1);
				break;
			case 'Home': {
				event.preventDefault();
				const enabled = enabledIndexes();
				if (enabled.length > 0) {
					activeIndex = enabled[0];
					itemRefs[activeIndex]?.focus();
				}
				break;
			}
			case 'End': {
				event.preventDefault();
				const enabled = enabledIndexes();
				if (enabled.length > 0) {
					activeIndex = enabled[enabled.length - 1];
					itemRefs[activeIndex]?.focus();
				}
				break;
			}
			case 'Escape':
				event.preventDefault();
				closeMenu({ refocusTrigger: true });
				break;
			case 'Tab':
				// Don't trap focus; let it leave naturally, but close first.
				closeMenu();
				break;
		}
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !open) {
			event.preventDefault();
			openMenu();
		}
	}

	function handleWindowClick(event: MouseEvent) {
		if (!open || !wrapperEl) return;
		if (!wrapperEl.contains(event.target as Node)) {
			closeMenu();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			closeMenu({ refocusTrigger: true });
		}
	}

	onMount(() => {
		document.addEventListener('click', handleWindowClick);
		document.addEventListener('keydown', handleWindowKeydown);
		return () => {
			document.removeEventListener('click', handleWindowClick);
			document.removeEventListener('keydown', handleWindowKeydown);
		};
	});
</script>

<div class="dropdown" bind:this={wrapperEl}>
	<button
		type="button"
		bind:this={triggerEl}
		class="btn btn-secondary btn-sm dropdown-trigger"
		aria-haspopup="menu"
		aria-expanded={open}
		{disabled}
		onclick={toggleMenu}
		onkeydown={handleTriggerKeydown}
	>
		{label}
		<Icon name="chevron-down" size={14} />
	</button>
	{#if open}
		<div
			class="dropdown-menu align-{align}"
			role="menu"
			tabindex="-1"
			aria-label={label}
			onkeydown={handleMenuKeydown}
		>
			{#each items as item, index (item.id)}
				<button
					bind:this={itemRefs[index]}
					type="button"
					role="menuitem"
					class="dropdown-item"
					class:danger={item.danger}
					tabindex={activeIndex === index ? 0 : -1}
					disabled={item.disabled}
					onclick={() => selectItem(item)}
				>
					{#if item.icon}
						<Icon name={item.icon} size={14} />
					{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
		display: inline-block;
	}

	.dropdown-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.dropdown-menu {
		position: absolute;
		top: 100%;
		margin-top: var(--space-1);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		min-width: 180px;
		z-index: var(--z-dropdown);
		padding: var(--space-1) 0;
	}

	.dropdown-menu.align-right {
		right: 0;
	}

	.dropdown-menu.align-left {
		left: 0;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-primary);
		font-size: var(--text-base);
	}

	.dropdown-item:hover:not(:disabled),
	.dropdown-item:focus-visible {
		background-color: var(--color-bg-tertiary);
	}

	.dropdown-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropdown-item.danger {
		color: var(--color-danger);
	}
</style>
