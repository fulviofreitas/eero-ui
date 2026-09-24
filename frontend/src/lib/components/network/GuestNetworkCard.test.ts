import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import GuestNetworkCard from './GuestNetworkCard.svelte';

describe('GuestNetworkCard', () => {
	it('shows Enabled and an Disable action when the guest network is on', () => {
		render(GuestNetworkCard, { props: { enabled: true, loading: false, onToggle: () => {} } });
		expect(screen.getByText('Enabled')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Disable Guest Network/ })).toBeInTheDocument();
	});

	it('shows Disabled and an Enable action when the guest network is off', () => {
		render(GuestNetworkCard, { props: { enabled: false, loading: false, onToggle: () => {} } });
		expect(screen.getByText('Disabled')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Enable Guest Network/ })).toBeInTheDocument();
	});

	it('calls onToggle when the action button is clicked', async () => {
		const onToggle = vi.fn();
		render(GuestNetworkCard, { props: { enabled: true, loading: false, onToggle } });
		await fireEvent.click(screen.getByRole('button', { name: /Disable Guest Network/ }));
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it('disables the button while a toggle is in flight', () => {
		render(GuestNetworkCard, { props: { enabled: true, loading: true, onToggle: () => {} } });
		expect(screen.getByRole('button', { name: /Disable Guest Network/ })).toBeDisabled();
	});
});
