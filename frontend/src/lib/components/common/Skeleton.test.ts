import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Skeleton from './Skeleton.svelte';

describe('Skeleton', () => {
	it('renders a status role for assistive tech', () => {
		const { getByRole } = render(Skeleton);
		expect(getByRole('status')).toBeInTheDocument();
	});

	it('renders `lines` shimmer bars for the text variant', () => {
		const { container } = render(Skeleton, { props: { variant: 'text', lines: 4 } });
		expect(container.querySelectorAll('.skeleton-line')).toHaveLength(4);
	});

	it('renders a single block for the card variant', () => {
		const { container } = render(Skeleton, { props: { variant: 'card', height: '200px' } });
		const card = container.querySelector<HTMLElement>('.skeleton-card');
		expect(card).not.toBeNull();
		expect(card?.style.height).toBe('200px');
	});

	it('renders rows x columns cells for the table-rows variant', () => {
		const { container } = render(Skeleton, {
			props: { variant: 'table-rows', rows: 3, columns: 5 }
		});
		expect(container.querySelectorAll('.skeleton-row')).toHaveLength(3);
		expect(container.querySelectorAll('.skeleton-cell')).toHaveLength(15);
	});

	it('uses the shimmer class that is disabled under prefers-reduced-motion in app.css', () => {
		const { container } = render(Skeleton, { props: { variant: 'card' } });
		expect(container.querySelector('.skeleton')).not.toBeNull();
	});
});
