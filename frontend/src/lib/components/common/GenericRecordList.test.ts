import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import GenericRecordList from './GenericRecordList.svelte';

describe('GenericRecordList', () => {
	it('shows an empty state when there are no records', () => {
		render(GenericRecordList, {
			props: { records: [], emptyTitle: 'No data', emptyDescription: 'Nothing here' }
		});
		expect(screen.getByText('No data')).toBeInTheDocument();
		expect(screen.getByText('Nothing here')).toBeInTheDocument();
	});

	it('renders a heading and InfoRow per scalar field for each record', () => {
		render(GenericRecordList, {
			props: {
				records: [{ mac: 'AA:BB:CC:DD:EE:01', rssi: -50, connected: true }],
				recordLabel: (_r: unknown, i: number) => `Connection ${i + 1}`
			}
		});
		expect(screen.getByText('Connection 1')).toBeInTheDocument();
		expect(screen.getByText('mac')).toBeInTheDocument();
		expect(screen.getByText('AA:BB:CC:DD:EE:01')).toBeInTheDocument();
		expect(screen.getByText('rssi')).toBeInTheDocument();
		expect(screen.getByText('-50')).toBeInTheDocument();
		expect(screen.getByText('connected')).toBeInTheDocument();
		expect(screen.getByText('Yes')).toBeInTheDocument();
	});

	it('summarises array and object values rather than expanding them', () => {
		render(GenericRecordList, {
			props: {
				records: [{ tags: ['a', 'b', 'c'], meta: { x: 1, y: 2 } }]
			}
		});
		expect(screen.getByText('3 items')).toBeInTheDocument();
		expect(screen.getByText('{2 fields}')).toBeInTheDocument();
	});

	it('renders a section per record, in order', () => {
		render(GenericRecordList, {
			props: {
				records: [{ id: 'first' }, { id: 'second' }]
			}
		});
		expect(screen.getByText('Entry 1')).toBeInTheDocument();
		expect(screen.getByText('Entry 2')).toBeInTheDocument();
	});
});
