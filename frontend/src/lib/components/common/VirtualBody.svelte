<!--
  VirtualBody

  Virtualized `<tbody>` slotted into DataTable's `body` escape hatch (WP9 § 6.2 Tier 4 - see
  DataTable.svelte's doc comment "this is the seam WP9 will use"). Only DeviceList uses this, and
  only above its 60-row threshold - small tables keep DataTable's own `<tbody>` (with
  `animate:flip`), since recycled DOM nodes make a "move" flip animate the wrong row.

  Design notes:
  - `@tanstack/svelte-virtual` (the one new runtime dependency allowed for the whole revamp, § 11
    Q5 option B) is headless: it decides which row *indices* are in view, this component still
    owns every `<tr>`/`<td>`. That's what lets a real `<table>` keep its native column widths
    instead of degrading to fixed pixel widths per cell.
  - Rows stay in normal table flow (no `position: absolute`/`transform`) - two padding `<tr>`s
    before/after the rendered window reserve the scrolled-past space instead. This keeps column
    widths correct (an absolutely-positioned `<tr>` becomes its own anonymous table and loses
    alignment with the real `<thead>`), at the cost of the transform-based smoothness some
    virtualizers use - an acceptable trade for a settings/ops table, not a 60fps feed.
  - The scroll container is the ancestor `.table-wrapper` div DataTable itself renders (found via
    `closest()` from this component's own root, since `body` only replaces the `<tbody>`, not
    DataTable's wrapper). DataTable adds `.virtualized-scroll` to that div whenever its own
    `virtualized` prop is true, giving it a bounded height + `overflow-y: auto` - see
    DataTable.svelte's `.table-wrapper.virtualized-scroll` rule.
  - `measureElement` (called via the `measureRow` action below) lets the virtualizer learn a
    row's *real* rendered height after layout, so rows with wrapped text/badges - variable height
    - still get accurate windowing after their first paint. `estimateSize` is the height used
    before that measurement lands (and is all jsdom ever produces - see the test file for how it's
    overridden there).
-->
<script lang="ts" generics="T">
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { SvelteSet } from 'svelte/reactivity';
	import { createVirtualizer, type VirtualItem } from '@tanstack/svelte-virtual';
	import type { DataTableColumn } from './DataTable.svelte';

	const DEFAULT_ROW_HEIGHT = 56;
	const OVERSCAN = 8;

	interface Props {
		/** Full sorted/filtered row set - NOT the virtualized window. Selection ranges resolve against this. */
		rows: T[];
		columns: DataTableColumn<T>[];
		getRowId: (row: T) => string;
		selectable?: boolean;
		selected?: Set<string>;
		onSelectionChange?: (selected: Set<string>) => void;
		rowClass?: (row: T) => string | undefined;
		onRowClick?: (row: T) => void;
		/** Row height before it's measured - override in tests (jsdom never lays out real heights). */
		estimateSize?: (index: number) => number;
	}

	let {
		rows,
		columns,
		getRowId,
		selectable = false,
		selected = undefined,
		onSelectionChange,
		rowClass,
		onRowClick,
		estimateSize
	}: Props = $props();

	let tbodyEl: HTMLTableSectionElement | undefined = $state();

	let virtualItems: VirtualItem[] = $state([]);
	let totalSize = $state(0);

	/**
	 * Pulls the latest window/size off the virtualizer into plain `$state`. Passed as `onChange`
	 * to every `setOptions` call below (virtual-core invokes it on every internal range/offset/size
	 * change - scroll, resize, `measureElement`, everything) and also called once eagerly after
	 * each `setOptions` push, since `onChange` only fires on a *subsequent* recompute, not for the
	 * options push itself.
	 *
	 * This is a plain function call, not a store read - see the note below on why that matters.
	 */
	function syncFromVirtualizer() {
		virtualItems = instance.getVirtualItems();
		totalSize = instance.getTotalSize();
	}

	// `rows.length` here is only ever the *initial* count - the effect below re-pushes the current
	// count on every relevant change. `untrack` makes that one-shot intent explicit and silences
	// Svelte's "state_referenced_locally" warning (which otherwise assumes a top-level, non-effect
	// read of a reactive prop is a mistake).
	const virtualizerStore = createVirtualizer<HTMLElement, HTMLTableRowElement>({
		count: untrack(() => rows.length),
		getScrollElement: () => null,
		estimateSize: (index) => estimateSize?.(index) ?? DEFAULT_ROW_HEIGHT,
		overscan: OVERSCAN,
		onChange: syncFromVirtualizer
	});

	// `@tanstack/svelte-virtual` wraps a single, stable `Virtualizer` instance (from
	// `@tanstack/virtual-core`) in a Svelte store purely as a convenience for auto-subscribing in
	// components - the instance itself is mutated in place and is the SAME object reference for the
	// component's entire lifetime (confirmed in its source: `virtualizerWritable.set(virtualizer)`
	// always re-sets the same reference). That's a problem for `$derived($virtualizer.foo())`:
	// Svelte 5's `$store` auto-subscription bridges a store into a signal via reference equality,
	// so a store that only ever emits the *same* reference never invalidates that signal again
	// after the first emission - a derived reading it goes stale and never updates, including on
	// scroll (confirmed empirically: the instance's own methods are always correct, but a derived
	// bound to `$virtualizer` freezes on its first computed value).
	//
	// The fix is to not route reads through the Svelte store layer at all. `get()` here is called
	// exactly ONCE, synchronously, purely to obtain the raw `Virtualizer` instance underneath the
	// store (svelte-virtual's `derived` mapping attaches its enhanced `setOptions` onto that same
	// instance the first time it's read, so `instance.setOptions` keeps working after this). Every
	// read/write below goes through `instance` directly - no further `.subscribe()`/`get()` calls -
	// which also sidesteps a *second* problem: this store's `start` notifier (`setOptions` +
	// resize/scroll observer setup) reruns on every 0->1 subscriber transition and its `stop`
	// notifier tears those observers down on every 1->0 transition, so repeatedly calling `get()`
	// reactively (e.g. from inside a `$derived`) creates churn at best and, at worst, reentrant
	// `setOptions` calls in the middle of another one still finishing - that combination is what
	// produced a real infinite synchronous loop when this was first written using
	// `virtualizer.subscribe(...)` to drive a `$state` tick instead.
	const instance = get(virtualizerStore);

	// Resolving `scrollElement` and re-pushing it (plus `count`) into the virtualizer happen in one
	// effect so there's no ordering dependency between "look up the ancestor `.table-wrapper`" and
	// "tell the virtualizer about it". `tbodyEl.closest(...)` is read directly in the effect body
	// (not only inside the `getScrollElement` closure below) so this effect actually depends on
	// `tbodyEl` - a closest() call that only happens inside an unevaluated arrow function wouldn't
	// register as a dependency, leaving the virtualizer stuck with the initial `null` scroll
	// element forever. `onChange` must be re-passed on every call - svelte-virtual's `setOptions`
	// wrapper replaces it wholesale (`onChange: options.onChange`) rather than merging, so omitting
	// it here would silently stop all future updates from reaching `syncFromVirtualizer`.
	$effect(() => {
		const el = (tbodyEl?.closest('.table-wrapper') as HTMLElement | null) ?? null;
		const rowCount = rows.length;
		instance.setOptions({
			count: rowCount,
			getScrollElement: () => el,
			estimateSize: (index) => estimateSize?.(index) ?? DEFAULT_ROW_HEIGHT,
			overscan: OVERSCAN,
			onChange: syncFromVirtualizer
		});
		// `onChange` only fires on the *next* recompute after this call, not for this push itself -
		// sync once eagerly so `virtualItems`/`totalSize` reflect the new scroll element/count/rows
		// immediately rather than one update cycle late.
		syncFromVirtualizer();
	});

	const paddingTop = $derived(virtualItems.length > 0 ? virtualItems[0].start : 0);
	const paddingBottom = $derived(
		virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0
	);

	function measureRow(node: HTMLTableRowElement) {
		instance.measureElement(node);
		return {
			destroy() {
				// No explicit unobserve API on the virtualizer for a single element - it tracks
				// elements it has measured internally and stops caring once this node is gone.
			}
		};
	}

	// --- Selection (mirrors DataTable's own toggleRow - see its comment on why range resolves
	// against the *full* row list, not whatever happens to be in the virtualized window) --------

	let lastClickedId: string | null = null;

	function toggleRow(row: T, index: number, shiftKey: boolean) {
		const rid = getRowId(row);
		const next = new SvelteSet(selected ?? []);

		const lastIndex =
			lastClickedId !== null ? rows.findIndex((r) => getRowId(r) === lastClickedId) : -1;

		if (shiftKey && lastIndex !== -1) {
			const shouldSelect = !next.has(rid);
			const [start, end] = [Math.min(lastIndex, index), Math.max(lastIndex, index)];
			for (let i = start; i <= end; i++) {
				const id = getRowId(rows[i]);
				if (shouldSelect) next.add(id);
				else next.delete(id);
			}
		} else if (next.has(rid)) {
			next.delete(rid);
		} else {
			next.add(rid);
		}

		lastClickedId = rid;
		onSelectionChange?.(next);
	}

	function handleRowKeydown(event: KeyboardEvent, row: T) {
		if (!onRowClick) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onRowClick(row);
	}

	function cellValue(col: DataTableColumn<T>, row: T): string {
		const value = col.accessor?.(row);
		return value === null || value === undefined ? '' : String(value);
	}
</script>

<tbody bind:this={tbodyEl}>
	{#if paddingTop > 0}
		<tr class="virtual-spacer" aria-hidden="true" style="height: {paddingTop}px">
			<td colspan={columns.length + (selectable ? 1 : 0)}></td>
		</tr>
	{/if}

	{#each virtualItems as virtualRow (getRowId(rows[virtualRow.index]))}
		{@const row = rows[virtualRow.index]}
		{@const index = virtualRow.index}
		<tr
			use:measureRow
			data-index={index}
			class={rowClass?.(row)}
			role={onRowClick ? 'button' : undefined}
			tabindex={onRowClick ? 0 : undefined}
			onclick={onRowClick ? () => onRowClick(row) : undefined}
			onkeydown={onRowClick ? (e) => handleRowKeydown(e, row) : undefined}
		>
			{#if selectable}
				<td class="select-col">
					<input
						type="checkbox"
						checked={(selected ?? new Set()).has(getRowId(row))}
						onclick={(e) => toggleRow(row, index, (e as MouseEvent).shiftKey)}
						aria-label={`Select row ${getRowId(row)}`}
					/>
				</td>
			{/if}
			{#each columns as col (col.key)}
				<td
					data-col={col.key}
					class:align-right={col.align === 'right'}
					class:align-center={col.align === 'center'}
				>
					{#if col.render}
						{@render col.render(row)}
					{:else}
						{cellValue(col, row)}
					{/if}
				</td>
			{/each}
		</tr>
	{/each}

	{#if paddingBottom > 0}
		<tr class="virtual-spacer" aria-hidden="true" style="height: {paddingBottom}px">
			<td colspan={columns.length + (selectable ? 1 : 0)}></td>
		</tr>
	{/if}
</tbody>

<style>
	.virtual-spacer td {
		padding: 0;
		border: none;
	}

	.select-col {
		width: 40px;
		text-align: center;
	}

	.select-col input {
		width: 16px;
		height: 16px;
		accent-color: var(--color-accent);
		cursor: pointer;
	}

	.align-right {
		text-align: right;
	}

	.align-center {
		text-align: center;
	}
</style>
