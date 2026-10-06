/**
 * Tests for RoamingEventsCard (eero-ui#431 WP4).
 *
 * Coverage:
 * - loading skeleton shown before the response resolves
 * - rows render device and node names from the fixture; a node with `eero_id: null`
 *   renders as plain text, a node with an id renders as a link to /eeros/{id}
 * - all three event-type badges render with a text label
 * - empty states (network and device mode wording)
 * - error state with a working retry
 * - changing the time range re-requests with the new range
 * - clicking a top roamer re-requests with device_id and shows "Showing X - Clear";
 *   Clear re-requests without it
 * - device mode hides the device column/summary and requests device_id
 * - truncated footnote
 * - resolution formatting (3.5 min / 30 s)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import RoamingEventsCard from './RoamingEventsCard.svelte';
import { roamingStore } from '$stores';
import { server } from '../../../../tests/mocks/server';
import { roamingFixture } from '../../../../tests/mocks/handlers';

describe('RoamingEventsCard', () => {
	beforeEach(() => {
		roamingStore.clear();
	});

	it('shows a loading skeleton before the response resolves', async () => {
		let resolveResponse: (() => void) | undefined;
		server.use(
			http.get('/api/metrics/roaming', async () => {
				await new Promise<void>((resolve) => {
					resolveResponse = resolve;
				});
				return HttpResponse.json(roamingFixture);
			})
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

		await waitFor(() => expect(resolveResponse).toBeDefined());
		resolveResponse?.();
		await waitFor(() =>
			expect(screen.getAllByText('Kitchen iPad', { selector: 'a' }).length).toBeGreaterThan(0)
		);
	});

	it('renders device and node names, with a plain-text node for a removed eero', async () => {
		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getAllByText('Kitchen iPad').length).toBeGreaterThan(0));

		// First event: Living Room (eero_id: e1, link) -> Office (eero_id: null, plain text).
		const officeMentions = screen.getAllByText('Office');
		expect(officeMentions.some((el) => el.closest('a') === null)).toBe(true);

		const livingRoomLinks = screen
			.getAllByText('Living Room')
			.map((el) => el.closest('a'))
			.filter((a): a is HTMLAnchorElement => a !== null);
		expect(livingRoomLinks.length).toBeGreaterThan(0);
		expect(livingRoomLinks[0]).toHaveAttribute('href', '/eeros/e1');

		// Device name links to the device detail page (the top-roamer chip also has this exact
		// text, so pick out the actual <a> rather than assuming index 0).
		const deviceLink = screen.getAllByText('Kitchen iPad').find((el) => el.tagName === 'A');
		expect(deviceLink).toHaveAttribute('href', '/devices/d1');
	});

	it('renders all three event-type badges with a text label', async () => {
		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getAllByText('Move').length).toBeGreaterThan(0));
		expect(screen.getByText('Disconnect')).toBeInTheDocument();
		expect(screen.getByText('Reconnect')).toBeInTheDocument();
	});

	it('shows the network-mode empty message when there are no events', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ ...roamingFixture, events: [], top_roamers: [], total_events: 0 })
			)
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('No roaming events in the last 24h.')).toBeInTheDocument()
		);
	});

	it('shows the device-mode empty message when there are no events', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ ...roamingFixture, events: [], top_roamers: [], total_events: 0 })
			)
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123', deviceId: 'd1' } });

		await waitFor(() =>
			expect(
				screen.getByText('This device did not change nodes in the last 24h.')
			).toBeInTheDocument()
		);
	});

	it('shows an error state with a working retry', async () => {
		server.use(
			http.get('/api/metrics/roaming', () => HttpResponse.json({ detail: 'boom' }, { status: 500 }))
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 5000 });

		server.use(http.get('/api/metrics/roaming', () => HttpResponse.json(roamingFixture)));
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => expect(screen.getAllByText('Kitchen iPad').length).toBeGreaterThan(0));
	});

	it('re-requests with the new range when the selector changes', async () => {
		const seenRanges: string[] = [];
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const range = new URL(request.url).searchParams.get('range') ?? '24h';
				seenRanges.push(range);
				return HttpResponse.json({ ...roamingFixture, range });
			})
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(seenRanges).toContain('24h'));

		await fireEvent.click(screen.getByRole('button', { name: '7d' }));

		await waitFor(() => expect(seenRanges).toContain('7d'));
	});

	it('filters to a top roamer on click and clears back to all devices', async () => {
		const seenDeviceIds: Array<string | null> = [];
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const deviceId = new URL(request.url).searchParams.get('device_id');
				seenDeviceIds.push(deviceId);
				if (deviceId) {
					return HttpResponse.json({
						...roamingFixture,
						events: roamingFixture.events.filter((e) => e.device_id === deviceId)
					});
				}
				return HttpResponse.json(roamingFixture);
			})
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });
		await waitFor(() => expect(screen.getByText('Most roaming devices')).toBeInTheDocument());

		await fireEvent.click(screen.getByRole('button', { name: /Kitchen iPad \(14\)/ }));

		await waitFor(() => expect(seenDeviceIds).toContain('d1'));
		await waitFor(() => expect(screen.getByText(/Showing Kitchen iPad/)).toBeInTheDocument());
		// "Laptop" still exists as a top-roamer chip (that strip is network-wide, not affected by
		// the filter) - assert there is no table row for it instead.
		expect(screen.queryByText('Laptop', { selector: 'a' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

		await waitFor(() => expect(seenDeviceIds).toContain(null));
		await waitFor(() =>
			expect(screen.getAllByText('Laptop', { selector: 'a' }).length).toBeGreaterThan(0)
		);
		expect(screen.queryByText(/Showing Kitchen iPad/)).not.toBeInTheDocument();
	});

	it('device mode hides the device column and summary, and requests device_id', async () => {
		const seenDeviceIds: Array<string | null> = [];
		server.use(
			http.get('/api/metrics/roaming', ({ request }) => {
				const deviceId = new URL(request.url).searchParams.get('device_id');
				seenDeviceIds.push(deviceId);
				return HttpResponse.json({
					...roamingFixture,
					events: roamingFixture.events.filter((e) => e.device_id === deviceId)
				});
			})
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123', deviceId: 'd2' } });

		await waitFor(() => expect(seenDeviceIds).toContain('d2'));
		await waitFor(() => expect(screen.getByText('Reconnect')).toBeInTheDocument());

		expect(screen.queryByText('Most roaming devices')).not.toBeInTheDocument();
		expect(screen.queryByRole('columnheader', { name: 'Device' })).not.toBeInTheDocument();
		// d2's own events (Laptop) still render, but there is no separate Device column.
		expect(screen.queryByText('Kitchen iPad')).not.toBeInTheDocument();
	});

	it('shows the truncated footnote when more events exist than are returned', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ ...roamingFixture, truncated: true, total_events: 20 })
			)
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() =>
			expect(screen.getByText('Showing the newest 5 of 20 events.')).toBeInTheDocument()
		);
	});

	it('formats a fractional-minute resolution', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ ...roamingFixture, resolution_seconds: 210 })
			)
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText(/~3\.5 min/)).toBeInTheDocument());
	});

	it('formats a sub-minute resolution in seconds', async () => {
		server.use(
			http.get('/api/metrics/roaming', () =>
				HttpResponse.json({ ...roamingFixture, resolution_seconds: 30 })
			)
		);

		render(RoamingEventsCard, { props: { networkId: 'network-123' } });

		await waitFor(() => expect(screen.getByText(/~30 s/)).toBeInTheDocument());
	});
});
