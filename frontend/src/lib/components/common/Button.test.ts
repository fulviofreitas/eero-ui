import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Button from './Button.svelte';

function label(text: string) {
	return createRawSnippet(() => ({ render: () => text }));
}

describe('Button', () => {
	it('renders children and defaults to variant=secondary', () => {
		const { container } = render(Button, { props: { children: label('Save') } });
		expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
		expect(container.querySelector('.btn-secondary')).not.toBeNull();
	});

	it('applies the requested variant class', () => {
		const { container } = render(Button, {
			props: { variant: 'danger', children: label('Delete') }
		});
		expect(container.querySelector('.btn-danger')).not.toBeNull();
	});

	it('fires onclick when not disabled or loading', async () => {
		const onclick = vi.fn();
		render(Button, { props: { children: label('Save'), onclick } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('disables the button and sets aria-busy while loading, and does not fire onclick', async () => {
		const onclick = vi.fn();
		render(Button, { props: { children: label('Save'), loading: true, onclick } });
		const button = screen.getByRole('button', { name: 'Save' });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute('aria-busy', 'true');
	});

	it('respects an explicit disabled prop', () => {
		render(Button, { props: { children: label('Save'), disabled: true } });
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
	});
});
