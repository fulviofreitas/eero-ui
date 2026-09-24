/**
 * Tests for Icon.svelte.
 *
 * Coverage:
 * - Renders a <use> pointing at the requested symbol.
 * - Decorative by default: aria-hidden, no role.
 * - Meaningful when `label` is supplied: role="img" + aria-label, no aria-hidden.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Icon from './Icon.svelte';

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
});
