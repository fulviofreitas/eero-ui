import { describe, it, expect } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import DetailHeader from './DetailHeader.svelte';

function textSnippet(markup: string) {
	return createRawSnippet(() => ({ render: () => markup }));
}

describe('DetailHeader', () => {
	it('renders a back link pointing at backHref', () => {
		render(DetailHeader, { props: { backHref: '/devices', title: 'MacBook Pro' } });
		const link = screen.getByRole('link', { name: /back/i });
		expect(link).toHaveAttribute('href', '/devices');
	});

	it('renders the title as an h1 and optional subtitle', () => {
		render(DetailHeader, {
			props: { backHref: '/devices', title: 'MacBook Pro', subtitle: 'AA:BB:CC:DD:EE:FF' }
		});
		expect(screen.getByRole('heading', { level: 1, name: 'MacBook Pro' })).toBeInTheDocument();
		expect(screen.getByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
	});

	it('renders a custom back label', () => {
		render(DetailHeader, {
			props: { backHref: '/devices', backLabel: 'Back to devices', title: 'MacBook Pro' }
		});
		expect(screen.getByRole('link', { name: 'Back to devices' })).toBeInTheDocument();
	});

	it('renders the status and actions snippets', () => {
		render(DetailHeader, {
			props: {
				backHref: '/devices',
				title: 'MacBook Pro',
				status: textSnippet('<span>Online</span>'),
				actions: textSnippet('<button>Rename</button>')
			}
		});
		expect(screen.getByText('Online')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
	});
});
