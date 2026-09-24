import { describe, it, expect, beforeEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import ExperimentalGate from './ExperimentalGate.svelte';
import { entitlementsStore } from '$lib/stores/entitlements';
import { server } from '../../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const children = createRawSnippet(() => ({ render: () => '<button>Set SQM</button>' }));

describe('ExperimentalGate', () => {
	beforeEach(() => {
		entitlementsStore.clear();
	});

	it('renders children when experimental_writes is true', async () => {
		server.use(
			http.get('/api/networks/:networkId/entitlements', () =>
				HttpResponse.json({
					features: [],
					upsell_features: [],
					is_premium: null,
					premium_status: null,
					capabilities: [],
					experimental_writes: true
				})
			)
		);
		await entitlementsStore.fetch('network-123');

		render(ExperimentalGate, { props: { children } });

		expect(screen.getByRole('button', { name: 'Set SQM' })).toBeInTheDocument();
	});

	it('renders a muted disabled-by-operator note naming the env var when false', async () => {
		server.use(
			http.get('/api/networks/:networkId/entitlements', () =>
				HttpResponse.json({
					features: [],
					upsell_features: [],
					is_premium: null,
					premium_status: null,
					capabilities: [],
					experimental_writes: false
				})
			)
		);
		await entitlementsStore.fetch('network-123');

		render(ExperimentalGate, { props: { children } });

		expect(screen.queryByRole('button', { name: 'Set SQM' })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toHaveTextContent('EERO_DASHBOARD_EXPERIMENTAL_WRITES');
	});

	it('defaults to disabled (fail closed) before entitlements load', () => {
		render(ExperimentalGate, { props: { children } });

		expect(screen.queryByRole('button', { name: 'Set SQM' })).not.toBeInTheDocument();
		expect(screen.getByRole('note')).toBeInTheDocument();
	});
});
