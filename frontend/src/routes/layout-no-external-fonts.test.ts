/**
 * Tests that the root layout never requests fonts from an external CDN (see
 * .claude/tasks/phase-6.0-revamp.md § 6.2 Tier 4 — self-host Inter and JetBrains Mono).
 *
 * Fonts are self-hosted via @font-face in app.css (frontend/static/fonts/*.woff2); the
 * `<svelte:head>` Google Fonts `<link>`s were removed. A render-blocking external font request
 * regressing back in would hurt first paint, so this asserts no such `<link>` exists.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/mocks/server';
import { authStore, networksStore } from '$stores';
import Layout from './+layout.svelte';

describe('root layout - no external font requests', () => {
	beforeEach(async () => {
		authStore.logout().catch(() => {});
		networksStore.clear();
		vi.clearAllMocks();
	});

	it('never renders a link to fonts.googleapis.com or fonts.gstatic.com', async () => {
		server.use(
			http.get('/api/auth/status', () =>
				HttpResponse.json({
					authenticated: true,
					preferred_network_id: null,
					user_email: 'operator@example.com',
					user_name: 'Operator',
					user_phone: null,
					user_role: 'owner',
					account_id: 'acct-1',
					premium_status: null
				})
			),
			http.get('/api/networks', () => HttpResponse.json([])),
			http.get('/api/health', () => HttpResponse.json({ status: 'ok' }))
		);

		render(Layout);

		await waitFor(() => expect(document.querySelector('.app-layout')).toBeInTheDocument());

		const fontLinks = Array.from(document.querySelectorAll('link')).filter((link) => {
			const href = link.getAttribute('href') ?? '';
			return href.includes('fonts.googleapis.com') || href.includes('fonts.gstatic.com');
		});

		expect(fontLinks).toHaveLength(0);
	});
});
