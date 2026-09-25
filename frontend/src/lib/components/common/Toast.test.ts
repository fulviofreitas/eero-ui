/**
 * Tests for Toast.svelte's stacking/eviction, pause-on-hover and a11y roles (WP9 § 6.2 Tier 3
 * "toast stacking with pause-on-hover").
 *
 * Assertions after a dismissal check the store's own `toasts` list (`get(toasts)`) rather than
 * the DOM - Toast.svelte's outro is a `transition:fly`, whose completion timing in jsdom is not
 * something this suite needs to depend on; the store update is what removeToast/pauseToast/
 * resumeToast are actually responsible for.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Toast from './Toast.svelte';
import { uiStore, toasts } from '$lib/stores/ui';

function drainToasts() {
	get(toasts).forEach((t) => uiStore.removeToast(t.id));
}

describe('Toast', () => {
	beforeEach(() => {
		drainToasts();
	});

	it('caps visible toasts at 5, evicting the oldest first', () => {
		for (let i = 0; i < 6; i++) uiStore.info(`toast-${i}`, 5000);

		const ids = get(toasts).map((t) => t.message);
		expect(ids).toHaveLength(5);
		expect(ids).not.toContain('toast-0');
		expect(ids).toContain('toast-5');
	});

	it('uses role="alert" for error toasts and role="status" otherwise', () => {
		uiStore.error('bad thing', 0);
		uiStore.success('good thing', 0);
		const { container } = render(Toast);

		expect(container.querySelector('.toast.error')?.getAttribute('role')).toBe('alert');
		expect(container.querySelector('.toast.success')?.getAttribute('role')).toBe('status');
	});

	it('dismisses via the close button', async () => {
		uiStore.info('dismiss me', 0);
		const { getByRole } = render(Toast);

		await fireEvent.click(getByRole('button', { name: /dismiss/i }));

		expect(get(toasts)).toHaveLength(0);
	});

	describe('auto-dismiss timer', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('auto-dismisses after its duration', async () => {
			uiStore.success('bye', 1000);
			expect(get(toasts)).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(1000);

			expect(get(toasts)).toHaveLength(0);
		});

		it('pauses the auto-dismiss timer on hover and resumes on leave', async () => {
			uiStore.success('hover me', 1000);
			const { container } = render(Toast);
			const toastEl = container.querySelector('.toast') as HTMLElement;

			await fireEvent.mouseEnter(toastEl);
			await vi.advanceTimersByTimeAsync(2000); // would have dismissed long ago if not paused
			expect(get(toasts)).toHaveLength(1);

			await fireEvent.mouseLeave(toastEl);
			await vi.advanceTimersByTimeAsync(1000);
			expect(get(toasts)).toHaveLength(0);
		});

		it('pauses on focus and resumes on blur (keyboard users)', async () => {
			uiStore.info('focus me', 1000);
			const { container } = render(Toast);
			const toastEl = container.querySelector('.toast') as HTMLElement;

			await fireEvent.focusIn(toastEl);
			await vi.advanceTimersByTimeAsync(2000);
			expect(get(toasts)).toHaveLength(1);

			await fireEvent.focusOut(toastEl);
			await vi.advanceTimersByTimeAsync(1000);
			expect(get(toasts)).toHaveLength(0);
		});
	});
});
