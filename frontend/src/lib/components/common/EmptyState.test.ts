import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import EmptyState from './EmptyState.svelte';

describe('EmptyState', () => {
	it('renders the title', () => {
		render(EmptyState, { props: { title: 'No devices found' } });
		expect(screen.getByText('No devices found')).toBeInTheDocument();
	});

	it('renders an optional description', () => {
		render(EmptyState, {
			props: { title: 'No devices found', description: 'Try clearing your filters.' }
		});
		expect(screen.getByText('Try clearing your filters.')).toBeInTheDocument();
	});

	it('renders the action snippet', () => {
		const action = createRawSnippet(() => ({ render: () => '<button>Clear filters</button>' }));
		render(EmptyState, { props: { title: 'No devices found', action } });
		expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
	});

	it('renders an icon by default (inbox)', () => {
		const { container } = render(EmptyState, { props: { title: 'No devices found' } });
		expect(container.querySelector('use[href="#icon-inbox"]')).not.toBeNull();
	});
});
