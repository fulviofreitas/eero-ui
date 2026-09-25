import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Dropdown, { type DropdownItem } from './Dropdown.svelte';

function items(overrides: Partial<DropdownItem>[] = []): DropdownItem[] {
	const base: DropdownItem[] = [
		{ id: 'csv', label: 'CSV', onSelect: vi.fn() },
		{ id: 'json', label: 'JSON', onSelect: vi.fn() },
		{ id: 'yaml', label: 'YAML', onSelect: vi.fn() }
	];
	overrides.forEach((o, i) => Object.assign(base[i], o));
	return base;
}

describe('Dropdown', () => {
	it('renders a closed menu button with aria-haspopup and aria-expanded=false', () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		const trigger = screen.getByRole('button', { name: /export/i });
		expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('opens the menu on click and focuses the first item', async () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));

		expect(screen.getByRole('menu')).toBeInTheDocument();
		await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus());
	});

	it('ArrowDown moves focus to the next menu item', async () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus());

		await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'CSV' }), { key: 'ArrowDown' });
		expect(screen.getByRole('menuitem', { name: 'JSON' })).toHaveFocus();
	});

	it('End jumps to the last item, Home jumps back to the first', async () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus());

		await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'CSV' }), { key: 'End' });
		expect(screen.getByRole('menuitem', { name: 'YAML' })).toHaveFocus();

		await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'YAML' }), { key: 'Home' });
		expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus();
	});

	it('Escape closes the menu and returns focus to the trigger', async () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		const trigger = screen.getByRole('button', { name: /export/i });
		await fireEvent.click(trigger);
		await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus());

		await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'CSV' }), { key: 'Escape' });
		expect(screen.queryByRole('menu')).toBeNull();
		expect(trigger).toHaveFocus();
	});

	it('calls onSelect and closes the menu when an item is activated', async () => {
		const onSelect = vi.fn();
		render(Dropdown, { props: { label: 'Export', items: items([{ onSelect }]) } });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));

		expect(onSelect).toHaveBeenCalledOnce();
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('closes the menu on outside click', async () => {
		render(Dropdown, { props: { label: 'Export', items: items() } });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		expect(screen.getByRole('menu')).toBeInTheDocument();

		await fireEvent.click(document.body);
		expect(screen.queryByRole('menu')).toBeNull();
	});

	it('skips disabled items when navigating with ArrowDown', async () => {
		render(Dropdown, {
			props: { label: 'Export', items: items([{}, { disabled: true }]) }
		});
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		await waitFor(() => expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus());

		await fireEvent.keyDown(screen.getByRole('menuitem', { name: 'CSV' }), { key: 'ArrowDown' });
		expect(screen.getByRole('menuitem', { name: 'YAML' })).toHaveFocus();
	});
});
