/**
 * Tests for EventsTable (bug-fix follow-up, 2026-09-25): renders event records as a proper
 * table with row separators instead of GenericRecordList's flat card-per-record layout, formats
 * the located time column compactly, and collapses unrecognised fields into a `<details>`
 * disclosure rendered via NestedValue rather than JSON.stringify.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EventsTable from './EventsTable.svelte';

describe('EventsTable', () => {
	it('renders time, type and message columns located from the record shape', () => {
		render(EventsTable, {
			props: {
				id: 'test',
				events: [
					{
						timestamp: '2026-09-25T11:45:38.000Z',
						type: 'device_connected',
						message: 'iPhone joined the network'
					}
				]
			}
		});

		expect(screen.getByText('device_connected')).toBeInTheDocument();
		expect(screen.getByText('iPhone joined the network')).toBeInTheDocument();
		// Compact, one-line date+time - never the clipped full toLocaleString() form.
		expect(screen.queryByText(/\d{1,2}\/\d{1,2}\/\d{4},/)).not.toBeInTheDocument();
	});

	it('collapses unrecognised fields into a details disclosure, never raw JSON', () => {
		render(EventsTable, {
			props: {
				id: 'test',
				events: [
					{
						timestamp: '2026-09-25T11:45:38.000Z',
						type: 'device_connected',
						extra_field: 'unexpected',
						nested: { foo: 'bar' }
					}
				]
			}
		});

		expect(screen.getAllByText('Details').length).toBeGreaterThan(0);
		expect(screen.getByText('unexpected')).toBeInTheDocument();
		expect(screen.queryByText(/"extra_field":"unexpected"/)).not.toBeInTheDocument();
	});

	it('renders the empty state when there are no events', () => {
		render(EventsTable, {
			props: { id: 'test', events: [], emptyTitle: 'No events' }
		});

		expect(screen.getByText('No events')).toBeInTheDocument();
	});

	it('shows a plain dash in Details when every field is recognised (no disclosure)', () => {
		const { container } = render(EventsTable, {
			props: {
				id: 'test',
				events: [{ timestamp: '2026-09-25T11:45:38.000Z', type: 'x', message: 'y' }]
			}
		});

		expect(container.querySelector('details')).toBeNull();
	});
});
