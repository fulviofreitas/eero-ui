/**
 * Tests for Icon.svelte.
 *
 * Coverage:
 * - Renders a <use> pointing at the requested symbol.
 * - Decorative by default: aria-hidden, no role.
 * - Meaningful when `label` is supplied: role="img" + aria-label, no aria-hidden.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Icon from './Icon.svelte';
import IconSprite from '$lib/icons/IconSprite.svelte';
import { ICON_PATHS } from '$lib/icons/paths';

describe('Icon', () => {
	it('renders a <use> referencing the requested symbol', () => {
		const { container } = render(Icon, { props: { name: 'check' } });
		const use = container.querySelector('use');
		expect(use).not.toBeNull();
		expect(use?.getAttribute('href')).toBe('#icon-check');
	});

	it('is decorative by default: aria-hidden, no role', () => {
		const { container } = render(Icon, { props: { name: 'wifi' } });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.hasAttribute('role')).toBe(false);
		expect(svg?.hasAttribute('aria-label')).toBe(false);
	});

	it('is meaningful when a label is provided: role=img + aria-label, no aria-hidden', () => {
		const { container } = render(Icon, { props: { name: 'x', label: 'Block device' } });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('role')).toBe('img');
		expect(svg?.getAttribute('aria-label')).toBe('Block device');
		expect(svg?.hasAttribute('aria-hidden')).toBe(false);
	});

	it('sizes the svg from the size prop, defaulting to 16', () => {
		const { container } = render(Icon, { props: { name: 'check' } });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('16');
		expect(svg?.getAttribute('height')).toBe('16');
	});

	it('respects an explicit size', () => {
		const { container } = render(Icon, { props: { name: 'check', size: 24 } });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
	});

	describe('sidebar icons (bug-fix follow-up: "network" and "eeros" read as odd shapes)', () => {
		afterEach(() => {
			document.documentElement.removeAttribute('data-theme');
		});

		it.each(['network', 'eeros'] as const)(
			'has no zero-length arc segments in its path data (%s)',
			(name) => {
				// A zero-length arc ("a<rx> <ry> <rot> <large> <sweep> 0 0") renders as an
				// invisible point - exactly the defect in the previous "network" glyph.
				expect(ICON_PATHS[name]).not.toMatch(/a[\d.\s-]+\s0\s0(?=[A-Za-z]|$)/);
			}
		);

		it.each(['network', 'eeros'] as const)(
			'renders at 20px in the sidebar in both themes (%s)',
			(name) => {
				for (const theme of ['dark', 'light']) {
					document.documentElement.setAttribute('data-theme', theme);
					const { container, unmount } = render(IconSprite);
					const { container: iconContainer, unmount: unmountIcon } = render(Icon, {
						props: { name, size: 20 }
					});

					const svg = iconContainer.querySelector('svg');
					expect(svg?.getAttribute('width')).toBe('20');
					expect(svg?.getAttribute('height')).toBe('20');

					const use = iconContainer.querySelector('use');
					expect(use?.getAttribute('href')).toBe(`#icon-${name}`);

					const symbol = container.querySelector(`#icon-${name}`);
					expect(symbol).not.toBeNull();
					expect(symbol?.querySelector('path')?.getAttribute('d')).toBe(ICON_PATHS[name]);

					unmountIcon();
					unmount();
				}
			}
		);
	});
});
