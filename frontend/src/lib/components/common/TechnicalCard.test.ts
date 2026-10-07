import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TechnicalCard from './TechnicalCard.svelte';

describe('TechnicalCard', () => {
	it('renders every id row with its label and value', () => {
		render(TechnicalCard, {
			props: {
				ids: [
					{ label: 'Device ID', value: 'device-123' },
					{ label: 'Network ID', value: 'network-456' }
				]
			}
		});

		expect(screen.getByText('Device ID')).toBeInTheDocument();
		expect(screen.getByText('device-123')).toBeInTheDocument();
		expect(screen.getByText('Network ID')).toBeInTheDocument();
		expect(screen.getByText('network-456')).toBeInTheDocument();
	});

	it('renders a dash for missing id values', () => {
		render(TechnicalCard, {
			props: {
				ids: [{ label: 'Device ID', value: null }]
			}
		});

		expect(screen.getByText('Device ID')).toBeInTheDocument();
		expect(screen.getByText('—')).toBeInTheDocument();
	});

	it('renders the API URL row when apiUrl is provided', () => {
		render(TechnicalCard, {
			props: {
				ids: [{ label: 'Device ID', value: 'device-123' }],
				apiUrl: '/2.2/devices/device-123'
			}
		});

		expect(screen.getByText('API URL')).toBeInTheDocument();
		expect(screen.getByText('/2.2/devices/device-123')).toBeInTheDocument();
	});

	it('omits the API URL row when apiUrl is not provided', () => {
		render(TechnicalCard, {
			props: {
				ids: [{ label: 'Device ID', value: 'device-123' }]
			}
		});

		expect(screen.queryByText('API URL')).toBeNull();
	});

	it('renders the Technical heading', () => {
		render(TechnicalCard, { props: { ids: [] } });
		expect(screen.getByText('Technical')).toBeInTheDocument();
	});
});
