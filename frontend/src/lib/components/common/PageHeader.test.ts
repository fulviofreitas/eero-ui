import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import PageHeader from './PageHeader.svelte';

function buttonSnippet(label: string) {
	return createRawSnippet(() => ({
		render: () => `<button>${label}</button>`
	}));
}

describe('PageHeader', () => {
	it('renders the title as an h1', () => {
		render(PageHeader, { props: { title: 'Devices' } });
		expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
	});

	it('renders an optional description', () => {
		render(PageHeader, { props: { title: 'Devices', description: 'All connected clients' } });
		expect(screen.getByText('All connected clients')).toBeInTheDocument();
	});

	it('omits the description paragraph when none is given', () => {
		const { container } = render(PageHeader, { props: { title: 'Devices' } });
		expect(container.querySelector('.text-muted')).toBeNull();
	});

	it('renders the actions snippet', () => {
		render(PageHeader, { props: { title: 'Devices', actions: buttonSnippet('Refresh') } });
		expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
	});
});
