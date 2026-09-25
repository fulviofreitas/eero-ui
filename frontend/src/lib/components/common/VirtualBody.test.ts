/**
 * Tests for VirtualBody (WP9 § 6.2 Tier 4). Rendered inside a real `<table>` (as DataTable's
 * `body` escape hatch does) since `<tr>`/`<td>` accessible roles need a table context, and the
 * `.table-wrapper` ancestor VirtualBody looks for via `closest()` as its scroll container.
 *
 * jsdom does no layout, so `offsetHeight` is 0 for every element by default - both what
 * @tanstack/virtual-core's `observeElementRect` reads for the scroll container's viewport size,
 * *and* what its `measureElement` fallback reads when `use:measureRow` fires for each mounted
 * `<tr>` (see VirtualBody.svelte's doc comment). `estimateSize` is passed explicitly as the
 * "test-only" row-height override the task calls for, but that alone isn't enough: stubbing
 * `offsetHeight` globally to a single viewport-sized value (as an earlier version of this file
 * did) makes every *row* measure at that same inflated height too, which corrects the real,
 * cached row size upward on first mount and collapses the visible window to a handful of rows
 * (each far taller than estimated) - the exact "expected 9" failures this fix addresses.
 * `stubMeasurements` below gives the `.table-wrapper` scroll container a real viewport height
 * while making every row measure back to exactly its own `estimateSize`, so `measureElement`
 * confirms the estimate instead of correcting it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import VirtualBody from './VirtualBody.svelte';
import type { DataTableColumn } from './DataTable.svelte';

interface Row {
	id: string;
	name: string;
}

function makeRows(count: number): Row[] {
	return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }));
}

const columns: DataTableColumn<unknown>[] = [
	{ key: 'name', header: 'Name', accessor: (r) => (r as Row).name }
];

const getRowId = (r: unknown) => (r as Row).id;

/** Matches VirtualBody's own `Props<unknown>` shape - see `renderInTable` below. */
interface VirtualBodyTestProps {
	rows: unknown[];
	columns: DataTableColumn<unknown>[];
	getRowId: (row: unknown) => string;
	selectable?: boolean;
	selected?: Set<string>;
	onSelectionChange?: (selected: Set<string>) => void;
	rowClass?: (row: unknown) => string | undefined;
	onRowClick?: (row: unknown) => void;
	estimateSize?: (index: number) => number;
}

/**
 * Stubs `offsetHeight` so the `.table-wrapper` scroll container reports `viewportHeight` (what
 * `observeElementRect` uses as the virtualizer's viewport size) while every other element -
 * crucially, each virtualized `<tr>` - reports `rowHeight` (matching whatever `estimateSize`
 * this test passes to VirtualBody), so `measureElement`'s jsdom fallback confirms the estimate
 * instead of overwriting it with a viewport-sized value.
 */
function stubMeasurements(viewportHeight: number, rowHeight: number) {
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
		configurable: true,
		get(this: HTMLElement) {
			return this.classList.contains('table-wrapper') ? viewportHeight : rowHeight;
		}
	});
}

/**
 * Renders VirtualBody as DataTable actually mounts it: inside `<table><tbody>` via `body`,
 * wrapped by the `.table-wrapper` div VirtualBody finds via `closest()`.
 *
 * The `.table-wrapper` > `<table>` ancestry must exist *before* VirtualBody mounts, mirroring
 * real usage where DataTable renders that wrapper first and only then renders the `body` snippet
 * inside it - VirtualBody's own `scrollElement` lookup (`tbodyEl.closest('.table-wrapper')`) runs
 * once, on mount, and does not re-run just because a `<tbody>` gets reparented afterwards.
 *
 * `render`'s `target` mount option is used (rather than the default auto-created `<div>`) so the
 * `<tbody>` Svelte creates lands directly inside a real `<table>`, with `.table-wrapper` already
 * its ancestor. The returned `container` is the `.table-wrapper` div itself, so callers can query
 * rendered rows and fire scroll events against it directly.
 *
 * `viewportHeight`/`rowHeight` feed `stubMeasurements` (see above); `rowHeight` should always
 * match the `estimateSize` passed in `props`.
 */
function renderInTable(
	props: VirtualBodyTestProps,
	{ viewportHeight = 600, rowHeight = 40 }: { viewportHeight?: number; rowHeight?: number } = {}
) {
	stubMeasurements(viewportHeight, rowHeight);

	const wrapper = document.createElement('div');
	wrapper.className = 'table-wrapper';
	document.body.appendChild(wrapper);
	const table = document.createElement('table');
	wrapper.appendChild(table);

	const result = render(VirtualBody, { target: table, props });
	return { ...result, container: wrapper };
}

describe('VirtualBody', () => {
	afterEach(() => {
		// @ts-expect-error - restore the real (jsdom default) descriptor between tests.
		delete HTMLElement.prototype.offsetHeight;
	});

	it('renders far fewer <tr>s than the full row count for a large list', async () => {
		const rows = makeRows(200);
		const { container } = renderInTable(
			{ rows, columns, getRowId, estimateSize: () => 40 },
			{ viewportHeight: 600, rowHeight: 40 }
		);

		await waitFor(() => {
			const rendered = container.querySelectorAll('tr[data-index]');
			expect(rendered.length).toBeGreaterThan(0);
			expect(rendered.length).toBeLessThan(50);
		});
	});

	it('does not virtualize away a small list beyond what fits the viewport + overscan', async () => {
		const rows = makeRows(20);
		// 20 rows * 10px = 200px of real content, comfortably under the 600px viewport - every
		// row fits without needing overscan to explain it.
		const { container } = renderInTable(
			{ rows, columns, getRowId, estimateSize: () => 10 },
			{ viewportHeight: 600, rowHeight: 10 }
		);

		await waitFor(() => {
			expect(container.querySelectorAll('tr[data-index]').length).toBe(20);
		});
	});

	it('updates the rendered window on scroll', async () => {
		const rows = makeRows(200);
		const { container } = renderInTable(
			{ rows, columns, getRowId, estimateSize: () => 40 },
			{ viewportHeight: 600, rowHeight: 40 }
		);

		await waitFor(() =>
			expect(container.querySelectorAll('tr[data-index]').length).toBeGreaterThan(0)
		);
		const firstIndexBefore = container.querySelector('tr[data-index]')?.getAttribute('data-index');
		expect(firstIndexBefore).toBe('0');

		container.scrollTop = 2000;
		await fireEvent.scroll(container);

		await waitFor(() => {
			const firstIndexAfter = container.querySelector('tr[data-index]')?.getAttribute('data-index');
			expect(firstIndexAfter).not.toBe('0');
			expect(Number(firstIndexAfter)).toBeGreaterThan(0);
		});
	});

	it('resolves a shift-click range against the full row list, not the rendered slice', async () => {
		const rows = makeRows(60);
		const selected = new Set<string>();
		let lastSelection: Set<string> = new Set();

		const { container } = renderInTable(
			{
				rows,
				columns,
				getRowId,
				estimateSize: () => 10,
				selectable: true,
				selected,
				onSelectionChange: (s: Set<string>) => {
					lastSelection = s;
				}
			},
			// 60 rows * 10px = 600px of real content; a 700px viewport comfortably fits every
			// row without relying on overscan.
			{ viewportHeight: 700, rowHeight: 10 }
		);

		await waitFor(() =>
			expect(container.querySelectorAll('tr[data-index]').length).toBeGreaterThan(30)
		);

		// Click row 5 (anchor), then shift-click row 30 - both rendered (small estimateSize keeps
		// the whole 60-row list inside the viewport + overscan window), but the range in between
		// includes rows that are individually un-clicked - the algorithm must still include them
		// by resolving indices against the full `rows` array VirtualBody was given, not against
		// whatever happened to be in the DOM.
		const checkboxFor = (index: number) =>
			container.querySelector(
				`tr[data-index="${index}"] input[type="checkbox"]`
			) as HTMLInputElement;

		await fireEvent.click(checkboxFor(5));
		await fireEvent.click(checkboxFor(30), { shiftKey: true });

		expect(lastSelection.size).toBe(26); // rows 5..30 inclusive
		expect(lastSelection.has('r5')).toBe(true);
		expect(lastSelection.has('r17')).toBe(true); // never individually clicked
		expect(lastSelection.has('r30')).toBe(true);
		expect(lastSelection.has('r4')).toBe(false);
		expect(lastSelection.has('r31')).toBe(false);
	});

	it("renders a column's render snippet inside a virtualized row (e.g. DeviceRow's actions menu)", async () => {
		const rows = makeRows(5);
		const actionsSnippet = createRawSnippet((row: () => unknown) => ({
			render: () => `<button class="actions-btn">Actions for ${(row() as Row).id}</button>`
		}));
		const cols: DataTableColumn<unknown>[] = [
			...columns,
			{ key: 'actions', header: 'Actions', render: actionsSnippet }
		];
		const { container } = renderInTable(
			{ rows, columns: cols, getRowId, estimateSize: () => 40 },
			{ viewportHeight: 600, rowHeight: 40 }
		);

		await waitFor(() => {
			const buttons = container.querySelectorAll('.actions-btn');
			expect(buttons.length).toBe(5);
			expect(buttons[0].textContent).toContain('Actions for r0');
		});
	});
});
