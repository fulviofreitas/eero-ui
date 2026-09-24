import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Tooltip from './Tooltip.svelte';

function trigger() {
	return createRawSnippet<[{ describedBy: string }]>((describedByGetter) => ({
		render: () => `<button aria-describedby="${describedByGetter().describedBy}">Info</button>`
	}));
}

describe('Tooltip', () => {
	it('does not render the tooltip text until hovered or focused', () => {
		render(Tooltip, { props: { text: 'Signal strength in dBm', children: trigger() } });
		expect(screen.queryByRole('tooltip')).toBeNull();
	});

	it('shows the tooltip on mouseenter and hides it on mouseleave', async () => {
		const { container } = render(Tooltip, {
			props: { text: 'Signal strength in dBm', children: trigger() }
		});
		const wrapper = container.querySelector('.tooltip-wrapper')!;

		await fireEvent.mouseEnter(wrapper);
		expect(screen.getByRole('tooltip')).toHaveTextContent('Signal strength in dBm');

		await fireEvent.mouseLeave(wrapper);
		expect(screen.queryByRole('tooltip')).toBeNull();
	});

	it('shows the tooltip on focus (keyboard users, not just hover)', async () => {
		const { container } = render(Tooltip, {
			props: { text: 'Signal strength in dBm', children: trigger() }
		});
		const wrapper = container.querySelector('.tooltip-wrapper')!;

		await fireEvent.focusIn(wrapper);
		expect(screen.getByRole('tooltip')).toBeInTheDocument();
	});

	it('wires the trigger to the tooltip via aria-describedby', async () => {
		const { container } = render(Tooltip, {
			props: { text: 'Signal strength in dBm', children: trigger() }
		});
		const wrapper = container.querySelector('.tooltip-wrapper')!;
		await fireEvent.mouseEnter(wrapper);

		const button = screen.getByRole('button', { name: 'Info' });
		const tooltip = screen.getByRole('tooltip');
		expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
	});
});
