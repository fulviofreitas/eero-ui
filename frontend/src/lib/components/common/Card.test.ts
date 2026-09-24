import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import Card from './Card.svelte';

function snippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

describe('Card', () => {
	it('renders children', () => {
		render(Card, { props: { children: snippet('<p>Body content</p>') } });
		expect(screen.getByText('Body content')).toBeInTheDocument();
	});

	it('renders an optional title', () => {
		render(Card, { props: { title: 'Network', children: snippet('<p>x</p>') } });
		expect(screen.getByRole('heading', { name: 'Network' })).toBeInTheDocument();
	});

	it('omits the header entirely when no title or actions are given', () => {
		const { container } = render(Card, { props: { children: snippet('<p>x</p>') } });
		expect(container.querySelector('.card-header')).toBeNull();
	});

	it('applies the requested padding variant class', () => {
		const { container } = render(Card, {
			props: { padding: 'lg', children: snippet('<p>x</p>') }
		});
		expect(container.querySelector('.card-padding-lg')).not.toBeNull();
	});
});
