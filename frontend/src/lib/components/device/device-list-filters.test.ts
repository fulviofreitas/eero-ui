/**
 * Tests for DeviceList's URL-encoded, debounced, persisted filters and "Reset filters" button
 * (WP9 § 6.2 Tier 3 "URL-encoded, debounced, persisted filters").
 *
 * `$app/stores`'s `page` and `$app/navigation`'s `goto` are mocked per-test, following the
 * pattern in eero-location-rename.test.ts, since the shared stubs in tests/mocks/app-stores.ts
 * and app-navigation.ts always resolve to a fixed URL / a no-op respectively.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { deviceFilters, defaultDeviceFilters } from '$stores';
import DeviceList from './DeviceList.svelte';
import { server } from '../../../../tests/mocks/server';

const gotoMock = vi.fn();

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => gotoMock(...args)
}));

let currentUrl = new URL('http://localhost/devices');

vi.mock('$app/stores', () => ({
	page: readable({
		get url() {
			return currentUrl;
		},
		params: {},
		route: { id: '/devices' },
		status: 200,
		error: null,
		data: {},
		form: null
	})
}));

function mockDevices() {
	server.use(
		http.get('/api/devices', () =>
			HttpResponse.json([
				{
					id: 'dev-1',
					url: null,
					mac: 'AA:BB:CC:DD:EE:01',
					ip: '192.168.1.100',
					nickname: 'iPhone',
					hostname: 'iphone',
					display_name: 'iPhone',
					manufacturer: 'Apple',
					model_name: null,
					device_type: 'phone',
					connected: true,
					wireless: true,
					blocked: false,
					paused: false,
					is_guest: false,
					connection_type: 'wireless',
					signal_strength: -50,
					frequency: '5GHz',
					connected_to_eero: 'Living Room',
					last_active: null,
					profile_id: null,
					profile_name: null
				}
			])
		)
	);
}

describe('DeviceList - URL-encoded filters', () => {
	beforeEach(() => {
		currentUrl = new URL('http://localhost/devices');
		gotoMock.mockClear();
		localStorage.clear();
		deviceFilters.set({ ...defaultDeviceFilters });
		mockDevices();
	});

	it('initializes filters from the URL query string when present', async () => {
		currentUrl = new URL('http://localhost/devices?q=iphone&status=connected&conn=wireless');

		render(DeviceList);

		await waitFor(() => {
			const input = screen.getByPlaceholderText(/search devices/i) as HTMLInputElement;
			expect(input.value).toBe('iphone');
		});
	});

	it('falls back to localStorage when the URL has no filter params', async () => {
		localStorage.setItem(
			'eero-ui:device-filters',
			JSON.stringify({ ...defaultDeviceFilters, search: 'stored-search' })
		);

		render(DeviceList);

		await waitFor(() => {
			const input = screen.getByPlaceholderText(/search devices/i) as HTMLInputElement;
			expect(input.value).toBe('stored-search');
		});
	});

	it('debounces the URL sync and localStorage persistence on search input', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			render(DeviceList);
			await vi.waitFor(() => expect(screen.getByPlaceholderText(/search devices/i)).toBeVisible());

			const input = screen.getByPlaceholderText(/search devices/i);
			await fireEvent.input(input, { target: { value: 'iphone' } });

			// Not yet - still within the 250ms debounce window.
			expect(gotoMock).not.toHaveBeenCalled();

			vi.advanceTimersByTime(250);

			expect(gotoMock).toHaveBeenCalledTimes(1);
			const [url, opts] = gotoMock.mock.calls[0];
			expect(String(url)).toContain('q=iphone');
			expect(opts).toEqual({ replaceState: true, keepFocus: true, noScroll: true });
			expect(localStorage.getItem('eero-ui:device-filters')).toContain('iphone');
		} finally {
			vi.useRealTimers();
		}
	});

	it('shows a "Reset filters" button once a filter is active, which clears the search', async () => {
		currentUrl = new URL('http://localhost/devices?q=iphone');
		render(DeviceList);

		const resetButton = await screen.findByRole('button', { name: /reset filters/i });
		await fireEvent.click(resetButton);

		await waitFor(() => {
			const input = screen.getByPlaceholderText(/search devices/i) as HTMLInputElement;
			expect(input.value).toBe('');
		});
	});
});
