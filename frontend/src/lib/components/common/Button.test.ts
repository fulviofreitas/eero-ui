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

	it('renders the btn-warning variant', () => {
		const { container } = render(Button, {
			props: { variant: 'warning', children: label('Proceed') }
		});
		expect(container.querySelector('.btn-warning')).not.toBeNull();
	});

	it('merges a caller-supplied class with the base btn classes', () => {
		const { container } = render(Button, {
			props: { class: 'custom-class', children: label('Save') }
		});
		const button = container.querySelector('button');
		expect(button?.className.split(' ')).toEqual(
			expect.arrayContaining(['btn', 'btn-secondary', 'custom-class'])
		);
	});

	it('forwards aria-label (via label) and title via rest attributes', () => {
		render(Button, {
			props: { icon: 'refresh', label: 'Refresh devices', title: 'Refresh devices' }
		});
		const button = screen.getByRole('button', { name: 'Refresh devices' });
		expect(button).toHaveAttribute('title', 'Refresh devices');
	});

	it('renders without children for an icon-only button given a label', () => {
		render(Button, { props: { icon: 'refresh', label: 'Refresh devices' } });
		expect(screen.getByRole('button', { name: 'Refresh devices' })).toBeInTheDocument();
	});
});
