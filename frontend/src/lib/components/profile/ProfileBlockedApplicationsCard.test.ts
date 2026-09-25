/**
 * Tests for ProfileBlockedApplicationsCard (phase-6.0-revamp.md § 7 WP7,
 * family 10).
 *
 * Coverage:
 * - loads and renders blocked applications on mount
 * - a 402 renders the premium upsell note, not an error
 * - gate-off hides the add/remove controls
 * - gate-on: blocking an application goes through ConfirmDialog naming
 *   "not verified end-to-end" before any PUT fires
 * - a successful block confirmation reflects the read-back list
 * - a failed block surfaces an error toast
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import ProfileBlockedApplicationsCard from './ProfileBlockedApplicationsCard.svelte';
import { blockedApplicationsStore, entitlementsStore, uiStore, confirmDialog } from '$stores';
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

describe('ProfileBlockedApplicationsCard', () => {
	beforeEach(() => {
		blockedApplicationsStore.clear();
		entitlementsStore.clear();
		uiStore.closeConfirm();
	});

	it('loads and renders blocked applications on mount', async () => {
		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });

		await waitFor(() => expect(screen.getByText('com.example.app')).toBeInTheDocument());
	});

	it('renders the premium upsell note — not an error — on a 402', async () => {
		server.use(
			http.get('/api/profiles/:profileId/blocked-applications', () =>
				HttpResponse.json({ detail: 'Premium required' }, { status: 402 })
			)
		);

		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });

		await waitFor(() =>
			expect(screen.getByText('Blocked applications requires eero Plus/Secure')).toBeInTheDocument()
		);
	});

	it('hides the add/remove controls when the experimental-writes gate is off', async () => {
		mockEntitlements(false);
		await entitlementsStore.fetch('network-123');

		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });

		await waitFor(() => expect(screen.getByText('com.example.app')).toBeInTheDocument());
		expect(screen.queryByPlaceholderText('Application identifier')).not.toBeInTheDocument();
	});

	it('gate-on: blocking an application goes through ConfirmDialog naming "not verified end-to-end"', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('com.example.app')).toBeInTheDocument());

		let putCalls = 0;
		server.use(
			http.put('/api/profiles/:profileId/blocked-applications', async ({ request }) => {
				putCalls++;
				const body = (await request.json()) as { applications: string[] };
				return HttpResponse.json({ applications: body.applications });
			})
		);

		const input = screen.getByPlaceholderText('Application identifier');
		await fireEvent.input(input, { target: { value: 'com.new.app' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Block' }));

		const dialog = get(confirmDialog);
		expect(dialog).not.toBeNull();
		expect(dialog!.details).toContain(
			'This action is not verified end-to-end against the eero cloud.'
		);
		expect(putCalls).toBe(0);
	});

	it("a successful block confirmation reflects the response's read-back list", async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('com.example.app')).toBeInTheDocument());

		const input = screen.getByPlaceholderText('Application identifier');
		await fireEvent.input(input, { target: { value: 'com.new.app' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Block' }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(screen.getByText('com.new.app')).toBeInTheDocument());
	});

	it('surfaces a failed block as an error toast', async () => {
		mockEntitlements(true);
		await entitlementsStore.fetch('network-123');

		render(ProfileBlockedApplicationsCard, { props: { profileId: 'profile-1' } });
		await waitFor(() => expect(screen.getByText('com.example.app')).toBeInTheDocument());

		server.use(
			http.put('/api/profiles/:profileId/blocked-applications', () =>
				HttpResponse.json({ detail: 'boom' }, { status: 500 })
			)
		);

		const input = screen.getByPlaceholderText('Application identifier');
		await fireEvent.input(input, { target: { value: 'com.new.app' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Block' }));

		const dialog = get(confirmDialog);
		await dialog!.onConfirm();

		await waitFor(() => expect(get(uiStore).toasts.some((t) => t.type === 'error')).toBe(true));
	});
});
