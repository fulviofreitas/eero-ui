import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Tabs from './Tabs.svelte';

const tabs = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'devices', label: 'Devices' },
	{ id: 'settings', label: 'Settings', disabled: true }
];

describe('Tabs', () => {
	it('renders a tablist with aria-selected on the active tab', () => {
		render(Tabs, { props: { tabs, value: 'overview', onChange: vi.fn() } });
		expect(screen.getByRole('tablist')).toBeInTheDocument();
		expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab', { name: 'Devices' })).toHaveAttribute('aria-selected', 'false');
	});

	it('uses roving tabindex: only the active tab is in the tab order', () => {
		render(Tabs, { props: { tabs, value: 'overview', onChange: vi.fn() } });
		expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
		expect(screen.getByRole('tab', { name: 'Devices' })).toHaveAttribute('tabindex', '-1');
	});

	it('calls onChange when a tab is clicked', async () => {
		const onChange = vi.fn();
		render(Tabs, { props: { tabs, value: 'overview', onChange } });
		await fireEvent.click(screen.getByRole('tab', { name: 'Devices' }));
		expect(onChange).toHaveBeenCalledWith('devices');
	});

	it('ArrowRight moves selection to the next enabled tab, skipping disabled ones', async () => {
		const onChange = vi.fn();
		render(Tabs, { props: { tabs, value: 'devices', onChange } });
		await fireEvent.keyDown(screen.getByRole('tab', { name: 'Devices' }), { key: 'ArrowRight' });
		// Settings is disabled, so it should wrap to Overview
		expect(onChange).toHaveBeenCalledWith('overview');
	});

	it('Home selects the first enabled tab', async () => {
		const onChange = vi.fn();
		render(Tabs, { props: { tabs, value: 'devices', onChange } });
		await fireEvent.keyDown(screen.getByRole('tab', { name: 'Devices' }), { key: 'Home' });
		expect(onChange).toHaveBeenCalledWith('overview');
	});

	it('disables the disabled tab', () => {
		render(Tabs, { props: { tabs, value: 'overview', onChange: vi.fn() } });
		expect(screen.getByRole('tab', { name: 'Settings' })).toBeDisabled();
	});
});
