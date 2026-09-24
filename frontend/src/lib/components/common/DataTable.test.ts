import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import DataTable, { type DataTableColumn } from './DataTable.svelte';

interface Row {
	id: string;
	name: string;
	ip: string;
}

const rows: Row[] = [
	{ id: '1', name: 'Bravo', ip: '10.0.0.2' },
	{ id: '2', name: 'Alpha', ip: '10.0.0.1' }
];

// `render()` from @testing-library/svelte can't thread a concrete type argument through to a
// component declared with `generics="T"`, so it infers `T = unknown` for the rendered instance.
// Typing the fixtures against `unknown` (with a cast at the one point each callback narrows
// back to `Row`) keeps the test honest about that rather than silencing it with `any`.
const columns: DataTableColumn<unknown>[] = [
	{
		key: 'name',
		header: 'Name',
		sortable: true,
		required: true,
		accessor: (r) => (r as Row).name
	},
	{ key: 'ip', header: 'IP', sortable: true, accessor: (r) => (r as Row).ip },
	{ key: 'status', header: 'Status', sortable: false }
];

const getRowId = (r: unknown) => (r as Row).id;

function bodyRowNames() {
	return within(screen.getByRole('table'))
		.getAllByRole('row')
		.slice(1) // skip header row
		.map((row) => row.querySelector('td')?.textContent);
}

describe('DataTable', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('renders one column header per column, with a real <button> inside sortable headers', () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		expect(screen.getByRole('columnheader', { name: /^Name/ })).toBeInTheDocument();
		expect(
			within(screen.getByRole('columnheader', { name: /^Name/ })).getByRole('button')
		).toBeInTheDocument();
		// Non-sortable column renders plain text, no button
		const statusHeader = screen.getByRole('columnheader', { name: 'Status' });
		expect(within(statusHeader).queryByRole('button')).toBeNull();
	});

	it('renders rows in the given order when unsorted, with aria-sort=none on sortable columns', () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute(
			'aria-sort',
			'none'
		);
		expect(bodyRowNames()).toEqual(['Bravo', 'Alpha']);
	});

	it('cycles aria-sort none -> ascending -> descending -> none on repeated activation', async () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		const nameHeader = () => screen.getByRole('columnheader', { name: /^Name/ });
		const sortButton = () => within(nameHeader()).getByRole('button');

		// A native <button> activates on both click and Enter/Space in a real browser without any
		// extra keydown wiring in DataTable; jsdom does not synthesize that click from keydown, so
		// `click` is what's exercised here — the same activation path Enter/Space triggers natively.
		await fireEvent.click(sortButton());
		expect(nameHeader()).toHaveAttribute('aria-sort', 'ascending');
		expect(bodyRowNames()).toEqual(['Alpha', 'Bravo']);

		await fireEvent.click(sortButton());
		expect(nameHeader()).toHaveAttribute('aria-sort', 'descending');
		expect(bodyRowNames()).toEqual(['Bravo', 'Alpha']);

		await fireEvent.click(sortButton());
		expect(nameHeader()).toHaveAttribute('aria-sort', 'none');
		expect(bodyRowNames()).toEqual(['Bravo', 'Alpha']);
	});

	it('switching sort column resets the previous column to ascending, not descending', async () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		await fireEvent.click(
			within(screen.getByRole('columnheader', { name: /^Name/ })).getByRole('button')
		);
		await fireEvent.click(
			within(screen.getByRole('columnheader', { name: /^IP/ })).getByRole('button')
		);

		expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute(
			'aria-sort',
			'none'
		);
		expect(screen.getByRole('columnheader', { name: /^IP/ })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);
	});

	it('supports a fully controlled sort via sortBy/sortDirection/onSort', async () => {
		const onSort = vi.fn();
		render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows,
				getRowId,
				sortBy: 'name',
				sortDirection: 'ascending',
				onSort
			}
		});
		expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);

		await fireEvent.click(
			within(screen.getByRole('columnheader', { name: /^Name/ })).getByRole('button')
		);
		expect(onSort).toHaveBeenCalledWith('name', 'descending');
		// Controlled: the prop hasn't changed, so the header still reflects the old state.
		expect(screen.getByRole('columnheader', { name: /^Name/ })).toHaveAttribute(
			'aria-sort',
			'ascending'
		);
	});

	it('shows a loading skeleton when loading and no rows are available yet', () => {
		render(DataTable, {
			props: { id: 'test', columns, rows: [], loading: true, getRowId }
		});
		expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
		expect(screen.queryByRole('table')).toBeNull();
	});

	it('shows an empty state when not loading and there are no rows', () => {
		render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows: [],
				getRowId,
				emptyTitle: 'No devices found'
			}
		});
		expect(screen.getByText('No devices found')).toBeInTheDocument();
		expect(screen.queryByRole('table')).toBeNull();
	});

	it('toggles optional column visibility and persists the choice to localStorage', async () => {
		render(DataTable, { props: { id: 'persist-test', columns, rows, getRowId } });

		expect(screen.getByRole('columnheader', { name: /^IP/ })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /columns/i }));
		await fireEvent.click(screen.getByLabelText('IP'));

		expect(screen.queryByRole('columnheader', { name: /^IP/ })).toBeNull();
		expect(JSON.parse(localStorage.getItem('datatable:persist-test:columns')!)).toMatchObject({
			ip: false
		});
	});

	it('cannot hide a required column', async () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		await fireEvent.click(screen.getByRole('button', { name: /columns/i }));
		expect(screen.getByLabelText('Name')).toBeDisabled();
	});

	it('restores column visibility from localStorage on mount', () => {
		localStorage.setItem('datatable:restore-test:columns', JSON.stringify({ ip: false }));
		render(DataTable, { props: { id: 'restore-test', columns, rows, getRowId } });
		expect(screen.queryByRole('columnheader', { name: /^IP/ })).toBeNull();
	});

	it('supports row selection with a select-all checkbox', async () => {
		const onSelectionChange = vi.fn();
		render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows,
				getRowId,
				selectable: true,
				onSelectionChange
			}
		});
		await fireEvent.click(screen.getByLabelText('Select all rows'));
		expect(onSelectionChange).toHaveBeenCalledWith(new Set(['1', '2']));
	});

	it('supports shift-click range selection', async () => {
		const threeRows: Row[] = [
			{ id: '1', name: 'A', ip: '10.0.0.1' },
			{ id: '2', name: 'B', ip: '10.0.0.2' },
			{ id: '3', name: 'C', ip: '10.0.0.3' }
		];
		const onSelectionChange = vi.fn();
		render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows: threeRows,
				getRowId,
				selectable: true,
				onSelectionChange
			}
		});
		await fireEvent.click(screen.getByLabelText('Select row 1'));
		await fireEvent.click(screen.getByLabelText('Select row 3'), { shiftKey: true });

		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>;
		expect([...lastCall].sort()).toEqual(['1', '2', '3']);
	});

	it('resolves shift-click range from current sortedRows, not a stale positional index, when rows change between clicks', async () => {
		const fourRows: Row[] = [
			{ id: '1', name: 'A', ip: '10.0.0.1' },
			{ id: '2', name: 'B', ip: '10.0.0.2' },
			{ id: '3', name: 'C', ip: '10.0.0.3' },
			{ id: '4', name: 'D', ip: '10.0.0.4' }
		];
		const onSelectionChange = vi.fn();
		const { rerender } = render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows: fourRows,
				getRowId,
				selectable: true,
				onSelectionChange
			}
		});

		// Click row id=1 while it's at index 0.
		await fireEvent.click(screen.getByLabelText('Select row 1'));

		// Filter out row id=2, so row id=1 is still at index 0 but row id=4 is now at index 2
		// (was index 3). A stale index-based range would resolve against the old positions.
		const filteredRows = fourRows.filter((r) => r.id !== '2');
		await rerender({
			id: 'test',
			columns,
			rows: filteredRows,
			getRowId,
			selectable: true,
			onSelectionChange
		});

		await fireEvent.click(screen.getByLabelText('Select row 4'), { shiftKey: true });

		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>;
		// Range should cover only the currently visible rows between id=1 and id=4: 1, 3, 4.
		// Row id=2 must never appear since it was filtered out before the shift-click.
		expect([...lastCall].sort()).toEqual(['1', '3', '4']);
	});

	it('resets the shift-click anchor when the last-clicked row is no longer present', async () => {
		const threeRows: Row[] = [
			{ id: '1', name: 'A', ip: '10.0.0.1' },
			{ id: '2', name: 'B', ip: '10.0.0.2' },
			{ id: '3', name: 'C', ip: '10.0.0.3' }
		];
		const onSelectionChange = vi.fn();
		const { rerender } = render(DataTable, {
			props: {
				id: 'test',
				columns,
				rows: threeRows,
				getRowId,
				selectable: true,
				onSelectionChange
			}
		});

		await fireEvent.click(screen.getByLabelText('Select row 1'));

		// Row id=1 (the anchor) is removed entirely.
		const withoutAnchor = threeRows.filter((r) => r.id !== '1');
		await rerender({
			id: 'test',
			columns,
			rows: withoutAnchor,
			getRowId,
			selectable: true,
			onSelectionChange
		});

		await fireEvent.click(screen.getByLabelText('Select row 3'), { shiftKey: true });

		const lastCall = onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>;
		// No valid anchor (row 1 was removed): shift-click degrades to a plain toggle of the
		// clicked row, leaving the pre-existing selection (row 1) untouched.
		expect([...lastCall].sort()).toEqual(['1', '3']);
	});

	it('applies rowClass to each row and re-evaluates it on rerender', async () => {
		const rowClass = vi.fn((r: unknown) => ((r as Row).name === 'Bravo' ? 'is-bravo' : undefined));
		const { rerender } = render(DataTable, {
			props: { id: 'test', columns, rows, getRowId, rowClass }
		});

		const bravoRow = screen.getByText('Bravo').closest('tr');
		const alphaRow = screen.getByText('Alpha').closest('tr');
		expect(bravoRow).toHaveClass('is-bravo');
		expect(alphaRow).not.toHaveClass('is-bravo');

		await rerender({ id: 'test', columns, rows, getRowId, rowClass: () => 'always' });
		expect(screen.getByText('Bravo').closest('tr')).toHaveClass('always');
		expect(screen.getByText('Alpha').closest('tr')).toHaveClass('always');
	});

	it('reports the resolved visible-column set via onVisibleColumnsChange, including on mount', async () => {
		const onVisibleColumnsChange = vi.fn();
		render(DataTable, {
			props: { id: 'visible-test', columns, rows, getRowId, onVisibleColumnsChange }
		});

		expect(onVisibleColumnsChange).toHaveBeenCalledWith(new Set(['name', 'ip', 'status']));

		onVisibleColumnsChange.mockClear();
		await fireEvent.click(screen.getByRole('button', { name: /columns/i }));
		await fireEvent.click(screen.getByLabelText('IP'));

		expect(onVisibleColumnsChange).toHaveBeenCalledWith(new Set(['name', 'status']));
	});

	it('activates onRowClick on click and on Enter/Space, and marks the row role=button', async () => {
		const onRowClick = vi.fn();
		render(DataTable, { props: { id: 'test', columns, rows, getRowId, onRowClick } });

		const bravoRow = screen.getByText('Bravo').closest('tr')!;
		expect(bravoRow).toHaveAttribute('role', 'button');
		expect(bravoRow).toHaveAttribute('tabindex', '0');

		await fireEvent.click(bravoRow);
		expect(onRowClick).toHaveBeenCalledWith(rows[0]);

		await fireEvent.keyDown(bravoRow, { key: 'Enter' });
		expect(onRowClick).toHaveBeenCalledTimes(2);

		await fireEvent.keyDown(bravoRow, { key: 'a' });
		expect(onRowClick).toHaveBeenCalledTimes(2);
	});

	it('rows have no role/tabindex when onRowClick is not supplied', () => {
		render(DataTable, { props: { id: 'test', columns, rows, getRowId } });
		const bravoRow = screen.getByText('Bravo').closest('tr')!;
		expect(bravoRow).not.toHaveAttribute('role');
		expect(bravoRow).not.toHaveAttribute('tabindex');
	});
});
