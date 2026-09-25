import { describe, it, expect, beforeEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import PremiumGate from './PremiumGate.svelte';
import { entitlementsStore } from '$lib/stores/entitlements';
import { server } from '../../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const children = createRawSnippet(() => ({ render: () => '<p>Insights content</p>' }));

describe('PremiumGate', () => {
	beforeEach(() => {
		entitlementsStore.clear();
	});

	it('renders children when the network is premium', async () => {
		server.use(
			http.get('/api/networks/:networkId/entitlements', () =>
				HttpResponse.json({
					features: [],
					upsell_features: [],
					is_premium: true,
					premium_status: null,
					capabilities: [],
					experimental_writes: false
				})
			)
		);
		await entitlementsStore.fetch('network-123');

		render(PremiumGate, { props: { feature: 'Insights', children } });

		expect(screen.getByText('Insights content')).toBeInTheDocument();
	});

	it('renders an upsell notice — never hides silently — when not premium', async () => {
		server.use(
			http.get('/api/networks/:networkId/entitlements', () =>
				HttpResponse.json({
					features: [],
					upsell_features: [],
					is_premium: false,
					premium_status: null,
					capabilities: [],
					experimental_writes: false
				})
			)
		);
		await entitlementsStore.fetch('network-123');

		render(PremiumGate, { props: { feature: 'Insights', children } });

		expect(screen.queryByText('Insights content')).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('Insights requires eero Plus/Secure');
	});

	it('renders neither children nor the upsell while entitlements are unknown', () => {
		render(PremiumGate, { props: { feature: 'Insights', children } });

		expect(screen.queryByText('Insights content')).not.toBeInTheDocument();
		expect(screen.queryByRole('note')).not.toBeInTheDocument();
	});
});
