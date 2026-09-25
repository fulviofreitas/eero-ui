import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ShortcutsHelp from './ShortcutsHelp.svelte';
import { shortcuts } from '$lib/shortcuts';

describe('ShortcutsHelp', () => {
	it('renders nothing when closed', () => {
		render(ShortcutsHelp, { props: { open: false } });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('lists every shortcut from the shared shortcuts table when open', () => {
		render(ShortcutsHelp, { props: { open: true } });
		expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
		for (const shortcut of shortcuts) {
			expect(screen.getByText(shortcut.description)).toBeInTheDocument();
		}
	});
});
