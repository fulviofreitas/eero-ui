/**
 * Tests for NotificationsCard (phase-6.0-revamp.md § 7 WP6, deliverable 13).
 *
 * Coverage:
 * - loads and renders settings (disabled), unread flag and history on mount
 * - a 5xx renders ErrorState with a working retry
 * - "Load older" pages using the last history entry's timestamp as cursor
 * - gate-off keeps the checkbox and "Mark All Read" disabled/absent
 * - gate-on: toggling a setting goes through ConfirmDialog naming
 *   "not verified end-to-end" before any PUT fires
 * - a successful toggle re-fetches and renders the read-back
 * - a store-level `changed:false` renders an informational message, not a
 *   success toast (the checkbox always flips its rendered value, so this can
 *   only come from a race - stubbed at the store level, not the PUT handler)
 * - a failed toggle surfaces an error toast, leaving the stale value in place
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import NotificationsCard from './NotificationsCard.svelte';
import { notificationsStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
import { server } from '../../../../tests/mocks/server';

function mockEntitlements(experimentalWrites: boolean) {
	server.use(
		http.get('/api/networks/:networkId/entitlements', () =>
			HttpResponse.json({
				features: [],
				upsell_features: [],
				is_premium: null,
				premium_status: null,
				capabilities: [],
				experimental_writes: experimentalWrites
			})
		)
	);
}

describe('NotificationsCard', () => {
	beforeEach(() => {
		notificationsStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders settings (disabled), unread flag and history on mount', async () => {
		render(NotificationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());
		expect(screen.getByText('Unread notifications')).toBeInTheDocument();
		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		expect(checkbox.disabled).toBe(true);
		expect(checkbox.checked).toBe(true);
		expect(screen.getByText('New device connected')).toBeInTheDocument();
	});

	it('renders ErrorState with a working retry on a 5xx', async () => {
		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(NotificationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(
			http.get('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ settings: {}, has_unread: false })
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getByText('All caught up')).toBeInTheDocument());
	});

	it('"Load older" pages using the last history entry timestamp as cursor', async () => {
		let seenTimestamp: string | null = null;
		server.use(
			http.get('/api/networks/:networkId/notifications/history', ({ request }) => {
				const cursor = new URL(request.url).searchParams.get('timestamp');
				if (!cursor) {
					return HttpResponse.json({
						history: [
							{ timestamp: '2026-01-02T00:00:00Z', message: 'newer' },
							{ timestamp: '2026-01-01T00:00:00Z', message: 'older' }
						]
					});
				}
				seenTimestamp = cursor;
				return HttpResponse.json({
					history: [{ timestamp: '2025-12-31T00:00:00Z', message: 'oldest' }]
				});
			})
		);

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('newer')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: /load older/i }));

		await waitFor(() => expect(screen.getByText('oldest')).toBeInTheDocument());
		expect(seenTimestamp).toBe('2026-01-01T00:00:00Z');
	});

	it('keeps the checkbox disabled and hides "Mark All Read" when the gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(NotificationsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());

		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		expect(checkbox.disabled).toBe(true);
		expect(screen.queryByRole('button', { name: 'Mark All Read' })).not.toBeInTheDocument();
		expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
	});

	it('gate-on: toggling a setting goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());

		let putCalls = 0;
		server.use(
			http.put('/api/networks/:networkId/notifications', () => {
				putCalls++;
				return HttpResponse.json({ settings: { device_connected: false }, has_unread: true });
			})
		);

		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		expect(checkbox.disabled).toBe(false);
		await fireEvent.click(checkbox);

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it('a successful toggle confirmation re-fetches and renders the read-back', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ settings: { device_connected: false }, has_unread: true })
			)
		);

		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		await fireEvent.click(checkbox);
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(checkbox.checked).toBe(false));
	});

	it('shows an informational message, not a success toast, when the store reports changed:false', async () => {
		// The checkbox always flips its own current value, so a `changed:false`
		// response can only come from a race (another tab wrote the setting
		// between load and this attempt) - simulated here by stubbing the
		// store method directly rather than the PUT handler, since the
		// component always requests the flipped (i.e. genuinely different)
		// value from what it last rendered.
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());

		const updateSpy = vi.spyOn(notificationsStore, 'updateSettings').mockResolvedValue(false);

		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		await fireEvent.click(checkbox);
		const dialog = get(confirmDialog);
		const infoSpy = vi.spyOn(uiStore, 'info');
		const successSpy = vi.spyOn(uiStore, 'success');

		await dialog!.onConfirm();

		expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/no changes to apply/i));
		expect(successSpy).not.toHaveBeenCalled();

		infoSpy.mockRestore();
		successSpy.mockRestore();
		updateSpy.mockRestore();
	});

	it('surfaces a failed toggle as an error toast, leaving the stale value in place', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(NotificationsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('device_connected')).toBeInTheDocument());

		server.use(
			http.put('/api/networks/:networkId/notifications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		const checkbox = screen.getByLabelText('device_connected') as HTMLInputElement;
		await fireEvent.click(checkbox);
		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
		// The revision-keyed `{#each}` block (notifications.ts) replaces the `<input>` node on
		// every attempt to force a fresh `checked` sync, so re-query rather than reuse the
		// pre-click element reference.
		expect((screen.getByLabelText('device_connected') as HTMLInputElement).checked).toBe(true);
	});
});
