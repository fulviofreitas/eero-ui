import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TimeRangeSelector from './TimeRangeSelector.svelte';

const options: { value: string; label: string }[] = [
	{ value: '24h', label: '24h' },
	{ value: '7d', label: '7d' },
	{ value: '30d', label: '30d' }
];

describe('TimeRangeSelector', () => {
	it('renders one button per option', () => {
		render(TimeRangeSelector, { props: { options, value: '24h', onChange: vi.fn() } });
		expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
	});

	it('marks the active option with aria-pressed', () => {
		render(TimeRangeSelector, { props: { options, value: '7d', onChange: vi.fn() } });
		expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: '24h' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('calls onChange with the clicked option value', async () => {
		const onChange = vi.fn();
		render(TimeRangeSelector, { props: { options, value: '24h', onChange } });
		await fireEvent.click(screen.getByRole('button', { name: '30d' }));
		expect(onChange).toHaveBeenCalledWith('30d');
	});

	it('exposes the group via role=group with a label', () => {
		render(TimeRangeSelector, {
			props: { options, value: '24h', onChange: vi.fn(), label: 'Speedtest range' }
		});
		expect(screen.getByRole('group', { name: 'Speedtest range' })).toBeInTheDocument();
	});
});
