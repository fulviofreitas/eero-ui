/**
 * Tests for ProfileContentFilterCard (phase-6.0-revamp.md § 7 WP7, family 10).
 *
 * Coverage:
 * - gate-off hides the form
 * - gate-on: submitting goes through ConfirmDialog naming "not verified
 *   end-to-end" before any POST fires
 * - a successful block-for-profiles confirmation shows a success toast
 * - a `success: false` response surfaces an error rather than a success toast
 * - a failed submission surfaces an error toast
 * - an invalid domain is rejected client-side before any confirm dialog opens
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import ProfileContentFilterCard from './ProfileContentFilterCard.svelte';
import {
	contentFilterStore,
	entitlementsStore,
	networksStore,
	uiStore,
	confirmDialog
} from '$stores';
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

describe('ProfileContentFilterCard', () => {
	beforeEach(async () => {
		contentFilterStore.clear();
		entitlementsStore.clear();
		networksStore.clear();
		uiStore.closeConfirm();

		server.use(
			http.get('/api/networks', () =>
				HttpResponse.json([
					{
						id: 'network-123',
						name: 'Test Network',
						status: 'connected',
						is_gateway: true
					}
				])
			),
			http.get('/api/profiles', () =>
				HttpResponse.json([
					{ id: 'profile-1', name: 'Kids', paused: false },
					{ id: 'profile-2', name: 'Guests', paused: false }
				])
			)
		);
		await networksStore.fetch();
	});

	it('hides the form when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });

		await waitFor(() => expect(screen.queryByLabelText('Domain')).not.toBeInTheDocument());
	});

	it('gate-on: submitting goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByLabelText('Domain')).toBeInTheDocument());

		let postCalls = 0;
		server.use(
			http.post('/api/networks/:networkId/content-filter/block-for-profiles', () => {
				postCalls++;
				return HttpResponse.json({ success: true });
			})
		);

		await fireEvent.input(screen.getByLabelText('Domain'), {
			target: { value: 'new.example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Block for Selected Profiles/ }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(postCalls).toBe(0);
	});

	it('a successful confirmation shows a success toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByLabelText('Domain')).toBeInTheDocument());

		await fireEvent.input(screen.getByLabelText('Domain'), {
			target: { value: 'new.example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Block for Selected Profiles/ }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'success')).toBe(true));
	});

	it('surfaces success:false as an error rather than a success toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		server.use(
			http.post('/api/networks/:networkId/content-filter/block-for-profiles', () =>
				HttpResponse.json({ success: false })
			)
		);

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByLabelText('Domain')).toBeInTheDocument());

		await fireEvent.input(screen.getByLabelText('Domain'), {
			target: { value: 'new.example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Block for Selected Profiles/ }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('surfaces a failed submission as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		server.use(
			http.post('/api/networks/:networkId/content-filter/block-for-profiles', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByLabelText('Domain')).toBeInTheDocument());

		await fireEvent.input(screen.getByLabelText('Domain'), {
			target: { value: 'new.example.com' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Block for Selected Profiles/ }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});

	it('rejects an invalid domain client-side before any confirm dialog opens', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileContentFilterCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByLabelText('Domain')).toBeInTheDocument());

		await fireEvent.input(screen.getByLabelText('Domain'), {
			target: { value: 'https://example.com/path' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Block for Selected Profiles/ }));

		expect(get(confirmDialog)).toBeNull();
		expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true);
	});
});
