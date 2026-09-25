<!--
  DataTable

  Generic, keyboard-accessible table extracted from DeviceList.svelte's hand-rolled
  `<th on:click>` sorting (11 sortable headers, mouse-only, no `tabindex`/`aria-sort`/keydown —
  see phase-6.0-revamp.md § 6.1 "Accessibility"). Applied fresh to the eeros, profiles and
  profile-devices tables, which had no sort/column-visibility at all.

  Sort is a controlled/uncontrolled hybrid: pass `sortBy`/`sortDirection`/`onSort` to drive it
  from an external store (as DeviceList does, to stay in sync with its search/filter pipeline);
  omit them and DataTable manages its own sort state, using each sortable column's `accessor`.
  Either way, DataTable performs the actual sort — a caller-driven `sortBy` only changes *whose
  state* is authoritative, not who does the comparison.

  `body` is an escape hatch: if supplied, DataTable renders it instead of its own `<tbody>`,
  handing back the already-sorted rows and the resolved visible columns. This is the seam WP9
  will use to slot in a virtual-scrolling body without changing this component's public API
  (§ 11 Q5 — no virtual-list dependency is added in this WP).

  Two more caller hooks, added for WP3's DeviceList migration and kept generic:
  - `rowClass(row)`: DataTable owns the default `<tr>`, so this is the only way for a caller to
    apply row-state classes (blocked/offline/selected dimming, etc.) — only consulted when `body`
    is not supplied; style the returned classes with `:global(...)` in the caller.
  - `onVisibleColumnsChange(visible)`: fires whenever the resolved visible-column set changes
    (including on mount). Column visibility is otherwise private to DataTable; this lets a caller
    mirror it, e.g. to suppress a value shown as a fallback sub-label elsewhere once its own
    column is visible.
-->
<script module lang="ts">
	import type { Snippet } from 'svelte';

	export type SortDirection = 'ascending' | 'descending' | 'none';

	export interface DataTableColumn<T> {
		key: string;
		header: string;
		sortable?: boolean;
		/** Cannot be hidden via the column-visibility toggle. */
		required?: boolean;
		/** Initial visibility (ignored for `required` columns, which are always visible). */
		visible?: boolean;
		width?: string;
		align?: 'left' | 'right' | 'center';
		/** Plain value used both for the default sort comparator and, absent `render`, display. */
		accessor?: (row: T) => string | number | null | undefined;
		render?: Snippet<[T]>;
	}
</script>

<script lang="ts" generics="T">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { SvelteSet } from 'svelte/reactivity';
	import EmptyState from './EmptyState.svelte';
	import Skeleton from './Skeleton.svelte';
	import Icon from './Icon.svelte';
	import { flipDuration } from '$lib/motion';

	interface Props {
		/** Stable identifier for this table; used as the localStorage key for column visibility. */
		id: string;
		columns: DataTableColumn<T>[];
		rows: T[];
		getRowId: (row: T) => string;
		loading?: boolean;
		emptyTitle?: string;
		emptyDescription?: string;
		sortBy?: string | null;
		sortDirection?: SortDirection;
		onSort?: (key: string | null, direction: SortDirection) => void;
		selectable?: boolean;
		selected?: Set<string>;
		onSelectionChange?: (selected: Set<string>) => void;
		stickyHeader?: boolean;
		stickyActionsColumn?: boolean;
		showColumnToggle?: boolean;
		skeletonRows?: number;
		body?: Snippet<[{ rows: T[]; columns: DataTableColumn<T>[] }]>;
		/**
		 * Per-row class string, e.g. for status-based dimming/highlighting (blocked, offline,
		 * selected). DataTable owns the `<tr>` in its default body, so callers have no other way
		 * to reach it. Only consulted when `body` is not supplied. Return value is applied as-is
		 * to `class` — compose your own classes and style them with `:global(...)` in the caller.
		 */
		rowClass?: (row: T) => string | undefined;
		/**
		 * Whole-row activation (e.g. navigate to a detail page), replacing the mouse-only
		 * `<tr on:click>` pattern in the pre-DataTable eeros/profiles tables. Unlike that pattern,
		 * this is keyboard-accessible: the row gets `role="button"`, `tabindex="0"` and an
		 * Enter/Space handler for free. Only consulted when `body` is not supplied.
		 */
		onRowClick?: (row: T) => void;
		/**
		 * Fired whenever the resolved visible-column set changes (including on mount). Column
		 * visibility is otherwise private to DataTable; this lets a caller mirror it — e.g. to
		 * avoid showing a value both in its own column and as a fallback sub-label elsewhere when
		 * that column is already visible (see DeviceList's name column).
		 */
		onVisibleColumnsChange?: (visible: Set<string>) => void;
		/**
		 * When true, DataTable's own body renders without `animate:flip` on re-sort/re-filter.
		 * Defaults to false (flip enabled). This is the seam for a future virtualized body (§ 6.1):
		 * a virtual-scrolling list recycles DOM nodes across unrelated rows, so animating a
		 * "move" on those nodes would visually flip the wrong rows. Only consulted when `body` is
		 * not supplied - a caller-supplied `body` owns its own animation strategy.
		 */
		virtualized?: boolean;
	}

	let {
		id,
		columns,
		rows,
		getRowId,
		loading = false,
		emptyTitle = 'No data',
		emptyDescription,
		sortBy = undefined,
		sortDirection = undefined,
		onSort,
		selectable = false,
		selected = undefined,
		onSelectionChange,
		stickyHeader = true,
		stickyActionsColumn = false,
		showColumnToggle = true,
		skeletonRows = 5,
		body,
		rowClass,
		onRowClick,
		onVisibleColumnsChange,
		virtualized = false
	}: Props = $props();

	function handleRowKeydown(event: KeyboardEvent, row: T) {
		if (!onRowClick) return;
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onRowClick(row);
	}

	const storageKey = $derived(`datatable:${id}:columns`);

	function loadVisibility(): Record<string, boolean> {
		const defaults: Record<string, boolean> = {};
		for (const col of columns) defaults[col.key] = col.required ? true : (col.visible ?? true);

		if (typeof localStorage === 'undefined') return defaults;
		try {
			const stored = localStorage.getItem(storageKey);
			if (!stored) return defaults;
			const parsed = JSON.parse(stored) as Record<string, boolean>;
			return { ...defaults, ...parsed };
		} catch {
			return defaults;
		}
	}

	let columnVisibility: Record<string, boolean> = $state(loadVisibility());
	let columnMenuOpen = $state(false);

	function persistVisibility() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(storageKey, JSON.stringify(columnVisibility));
		} catch {
			// Storage can be unavailable (private mode quota, etc.) — visibility just won't persist.
		}
	}

	function toggleColumnVisibility(col: DataTableColumn<T>) {
		if (col.required) return;
		columnVisibility = { ...columnVisibility, [col.key]: !columnVisibility[col.key] };
		persistVisibility();
	}

	const visibleColumns = $derived(columns.filter((c) => columnVisibility[c.key] !== false));
	const optionalColumns = $derived(columns.filter((c) => !c.required));

	$effect(() => {
		onVisibleColumnsChange?.(new Set(visibleColumns.map((c) => c.key)));
	});

	// --- Sort ---------------------------------------------------------------

	let internalSortBy: string | null = $state(null);
	let internalSortDirection: SortDirection = $state('none');

	const activeSortBy = $derived(sortBy !== undefined ? sortBy : internalSortBy);
	const activeSortDirection = $derived(
		sortDirection !== undefined ? sortDirection : internalSortDirection
	);

	function ariaSortFor(col: DataTableColumn<T>): SortDirection | undefined {
		if (!col.sortable) return undefined;
		return activeSortBy === col.key ? activeSortDirection : 'none';
	}

	function handleSort(col: DataTableColumn<T>) {
		if (!col.sortable) return;

		let nextDirection: SortDirection;
		if (activeSortBy !== col.key) {
			nextDirection = 'ascending';
		} else if (activeSortDirection === 'ascending') {
			nextDirection = 'descending';
		} else if (activeSortDirection === 'descending') {
			nextDirection = 'none';
		} else {
			nextDirection = 'ascending';
		}
		const nextKey = nextDirection === 'none' ? null : col.key;

		if (sortBy === undefined) {
			internalSortBy = nextKey;
			internalSortDirection = nextDirection;
		}
		onSort?.(nextKey, nextDirection);
	}

	const sortedRows = $derived.by(() => {
		if (!activeSortBy || activeSortDirection === 'none') return rows;
		const col = columns.find((c) => c.key === activeSortBy);
		if (!col?.accessor) return rows;
		const dir = activeSortDirection === 'ascending' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const av = col.accessor!(a);
			const bv = col.accessor!(b);
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
			return String(av).localeCompare(String(bv)) * dir;
		});
	});

	// --- Selection -----------------------------------------------------------

	let internalSelected: Set<string> = $state(new Set());
	// Row ID, not positional index: sortedRows is re-derived on every filter/sort change, so a
	// remembered index would silently point at a different row (or nothing) after that. Resolving
	// both endpoints from the *current* sortedRows at click time keeps the range correct even when
	// the set of visible rows has changed between the two shift-clicks.
	let lastClickedId: string | null = null;

	const activeSelected = $derived(selected !== undefined ? selected : internalSelected);
	const allSelected = $derived(
		sortedRows.length > 0 && sortedRows.every((r) => activeSelected.has(getRowId(r)))
	);

	function commitSelection(next: Set<string>) {
		if (selected === undefined) internalSelected = next;
		onSelectionChange?.(next);
	}

	function toggleRow(row: T, index: number, shiftKey: boolean) {
		const rid = getRowId(row);
		const next = new SvelteSet(activeSelected);

		const lastIndex =
			lastClickedId !== null ? sortedRows.findIndex((r) => getRowId(r) === lastClickedId) : -1;

		if (shiftKey && lastIndex !== -1) {
			const shouldSelect = !next.has(rid);
			const [start, end] = [Math.min(lastIndex, index), Math.max(lastIndex, index)];
			for (let i = start; i <= end; i++) {
				const id = getRowId(sortedRows[i]);
				if (shouldSelect) next.add(id);
				else next.delete(id);
			}
		} else if (next.has(rid)) {
			next.delete(rid);
		} else {
			next.add(rid);
		}

		lastClickedId = rid;
		commitSelection(next);
	}

	function toggleSelectAll() {
		if (allSelected) {
			commitSelection(new Set());
		} else {
			commitSelection(new Set(sortedRows.map((r) => getRowId(r))));
		}
	}

	function cellValue(col: DataTableColumn<T>, row: T): string {
		const value = col.accessor?.(row);
		return value === null || value === undefined ? '' : String(value);
	}

	// --- Column menu: outside click + Escape close (never mouseleave-only) -------------------

	let columnMenuEl: HTMLDivElement | undefined = $state();

	function handleWindowClick(event: MouseEvent) {
		if (!columnMenuOpen || !columnMenuEl) return;
		if (!columnMenuEl.contains(event.target as Node)) columnMenuOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (columnMenuOpen && event.key === 'Escape') columnMenuOpen = false;
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

<div class="data-table-toolbar">
	{#if showColumnToggle && optionalColumns.length > 0}
		<div class="column-toggle">
			<button
				type="button"
				class="btn btn-secondary btn-sm"
				aria-haspopup="true"
				aria-expanded={columnMenuOpen}
				onclick={() => (columnMenuOpen = !columnMenuOpen)}
			>
				<Icon name="settings" size={14} /> Columns
			</button>
			{#if columnMenuOpen}
				<div class="column-menu" bind:this={columnMenuEl}>
					{#each columns as col (col.key)}
						<label class="column-option" class:disabled={col.required}>
							<input
								type="checkbox"
								checked={columnVisibility[col.key] !== false}
								disabled={col.required}
								onchange={() => toggleColumnVisibility(col)}
							/>
							<span>{col.header}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<div class="table-wrapper" class:virtualized-scroll={virtualized && !!body}>
	{#if loading && rows.length === 0}
		<div class="table-skeleton">
			<Skeleton variant="table-rows" rows={skeletonRows} columns={visibleColumns.length} />
		</div>
	{:else if sortedRows.length === 0}
		<EmptyState title={emptyTitle} description={emptyDescription} />
	{:else}
		<table class="table data-table">
			<thead class:sticky={stickyHeader}>
				<tr>
					{#if selectable}
						<th class="select-col">
							<input
								type="checkbox"
								checked={allSelected}
								onchange={toggleSelectAll}
								aria-label="Select all rows"
							/>
						</th>
					{/if}
					{#each visibleColumns as col, colIndex (col.key)}
						<th
							role="columnheader"
							aria-sort={ariaSortFor(col)}
							style={col.width ? `width: ${col.width}` : undefined}
							class:align-right={col.align === 'right'}
							class:align-center={col.align === 'center'}
							class:sticky-actions={stickyActionsColumn && colIndex === visibleColumns.length - 1}
						>
							{#if col.sortable}
								<button type="button" class="sort-button" onclick={() => handleSort(col)}>
									{col.header}
									{#if activeSortBy === col.key && activeSortDirection !== 'none'}
										<span class="sort-indicator" aria-hidden="true">
											{activeSortDirection === 'ascending' ? '↑' : '↓'}
										</span>
									{/if}
								</button>
							{:else}
								{col.header}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			{#if body}
				{@render body({ rows: sortedRows, columns: visibleColumns })}
			{:else}
				<tbody>
					{#each sortedRows as row, index (getRowId(row))}
						<tr
							class={rowClass?.(row)}
							role={onRowClick ? 'button' : undefined}
							tabindex={onRowClick ? 0 : undefined}
							onclick={onRowClick ? () => onRowClick(row) : undefined}
							onkeydown={onRowClick ? (e) => handleRowKeydown(e, row) : undefined}
							animate:flip={{ duration: virtualized ? 0 : flipDuration(200) }}
						>
							{#if selectable}
								<td class="select-col">
									<input
										type="checkbox"
										checked={activeSelected.has(getRowId(row))}
										onclick={(e) => toggleRow(row, index, (e as MouseEvent).shiftKey)}
										aria-label={`Select row ${getRowId(row)}`}
									/>
								</td>
							{/if}
							{#each visibleColumns as col, colIndex (col.key)}
								<td
									data-col={col.key}
									class:align-right={col.align === 'right'}
									class:align-center={col.align === 'center'}
									class:sticky-actions={stickyActionsColumn &&
										colIndex === visibleColumns.length - 1}
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
				</tbody>
			{/if}
		</table>
	{/if}
</div>

<style>
	.data-table-toolbar {
		display: flex;
		justify-content: flex-end;
		margin-bottom: var(--space-2);
	}

	.column-toggle {
		position: relative;
	}

	.column-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-1);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		min-width: 200px;
		z-index: var(--z-dropdown);
		padding: var(--space-1) 0;
	}

	.column-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.column-option:hover {
		background-color: var(--color-bg-tertiary);
	}

	.column-option.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.column-option input {
		accent-color: var(--color-accent);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	/* WP9 § 6.2 Tier 4: only set when both `virtualized` and a caller-supplied `body` are present
	   (VirtualBody.svelte finds this element via `closest('.table-wrapper')` to use as its
	   scroll container). Bounded height + vertical scroll here, rather than the page/window,
	   keeps the virtualizer's math simple and keeps this element as the single sticky-header
	   scroll root in both the virtualized and non-virtualized cases. */
	.table-wrapper.virtualized-scroll {
		max-height: 70vh;
		overflow-y: auto;
	}

	.table-skeleton {
		padding: var(--space-4);
	}

	.data-table {
		width: 100%;
		min-width: max-content;
	}

	/* `.table` (app.css) already gives every DataTable its th/td padding and row hover; the
	   `<table class="table data-table">` below just opts in. Only the pointer affordance for
	   onRowClick rows is DataTable-specific. */
	.data-table tbody tr[role='button'] {
		cursor: pointer;
	}

	.data-table thead.sticky th {
		position: sticky;
		top: 0;
		z-index: var(--z-base);
		background-color: var(--color-bg-primary);
	}

	.sort-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.sort-button:hover {
		color: var(--color-text-primary);
	}

	.sort-indicator {
		font-size: var(--text-xs);
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

	.sticky-actions {
		position: sticky;
		right: 0;
		background-color: var(--color-bg-primary);
		z-index: var(--z-dropdown);
	}

	/* Below --bp-sm (app.css:116) a pinned actions column eats too much of a ~390px viewport and
	   pushes readable columns (e.g. device IP) off-screen. Drop the pin so the table scrolls as a
	   normal block and every column stays legible. */
	@media (max-width: 480px) {
		.sticky-actions {
			position: static;
			right: auto;
		}
	}
</style>
