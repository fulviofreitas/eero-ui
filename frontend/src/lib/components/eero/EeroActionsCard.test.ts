import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import EeroActionsCard from './EeroActionsCard.svelte';
import { entitlementsStore } from '$stores/entitlements';
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

describe('EeroActionsCard', () => {
	beforeEach(() => {
		entitlementsStore.clear();
	});

	it('shows "Turn LED Off" when the LED is on', () => {
		render(EeroActionsCard, {
			props: { ledOn: true, loading: false, onToggleLed: () => {}, onReboot: () => {} }
		});
		expect(screen.getByRole('button', { name: /Turn LED Off/ })).toBeInTheDocument();
	});

	it('shows "Turn LED On" when the LED is off', () => {
		render(EeroActionsCard, {
			props: { ledOn: false, loading: false, onToggleLed: () => {}, onReboot: () => {} }
		});
		expect(screen.getByRole('button', { name: /Turn LED On/ })).toBeInTheDocument();
	});

	it('calls onToggleLed and onReboot on click', async () => {
		const onToggleLed = vi.fn();
		const onReboot = vi.fn();
		render(EeroActionsCard, { props: { ledOn: true, loading: false, onToggleLed, onReboot } });
		await fireEvent.click(screen.getByRole('button', { name: /Turn LED Off/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Reboot Eero/ }));
		expect(onToggleLed).toHaveBeenCalledOnce();
		expect(onReboot).toHaveBeenCalledOnce();
	});

	it('disables both buttons while an action is in flight', () => {
		render(EeroActionsCard, {
			props: { ledOn: true, loading: true, onToggleLed: () => {}, onReboot: () => {} }
		});
		expect(screen.getByRole('button', { name: /Turn LED Off/ })).toBeDisabled();
		expect(screen.getByRole('button', { name: /Reboot Eero/ })).toBeDisabled();
	});

	describe('LED brightness slider (plan § 7 WP6, deliverable 3)', () => {
		it('is not rendered when onSetLedBrightness is not supplied', () => {
			render(EeroActionsCard, {
				props: { ledOn: true, loading: false, onToggleLed: () => {}, onReboot: () => {} }
			});
			expect(screen.queryByLabelText(/LED Brightness/)).not.toBeInTheDocument();
		});

		it('renders the current brightness and calls onSetLedBrightness on input', async () => {
			const onSetLedBrightness = vi.fn();
			render(EeroActionsCard, {
				props: {
					ledOn: true,
					ledBrightness: 40,
					loading: false,
					onToggleLed: () => {},
					onReboot: () => {},
					onSetLedBrightness
				}
			});

			const slider = screen.getByRole('slider') as HTMLInputElement;
			expect(slider.value).toBe('40');
			expect(screen.getByText('40%')).toBeInTheDocument();

			await fireEvent.input(slider, { target: { value: '75' } });

			expect(onSetLedBrightness).toHaveBeenCalledWith(75);
		});

		it('disables the slider while loading or while the LED is off', () => {
			render(EeroActionsCard, {
				props: {
					ledOn: false,
					ledBrightness: 40,
					loading: false,
					onToggleLed: () => {},
					onReboot: () => {},
					onSetLedBrightness: () => {}
				}
			});
			expect(screen.getByRole('slider')).toBeDisabled();
		});
	});

	describe('location rename (phase-6.0-revamp.md § 7 WP7 follow-up (c))', () => {
		it('is not rendered when onSetLocation is not supplied', () => {
			render(EeroActionsCard, {
				props: { ledOn: true, loading: false, onToggleLed: () => {}, onReboot: () => {} }
			});
			expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
		});

		it('hides the rename control when the experimental-writes gate is off', async () => {
			mockEntitlements(false);
			await entitlementsStore.fetch('network-123');

			render(EeroActionsCard, {
				props: {
					ledOn: true,
					loading: false,
					location: 'Living Room',
					onToggleLed: () => {},
					onReboot: () => {},
					onSetLocation: () => {}
				}
			});

			expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
			expect(screen.getByRole('note')).toBeInTheDocument();
		});

		it('shows the rename control and calls onSetLocation with the trimmed value', async () => {
			mockEntitlements(true);
			await entitlementsStore.fetch('network-123');
			const onSetLocation = vi.fn();

			render(EeroActionsCard, {
				props: {
					ledOn: true,
					loading: false,
					location: 'Living Room',
					onToggleLed: () => {},
					onReboot: () => {},
					onSetLocation
				}
			});

			const input = screen.getByLabelText('Location') as HTMLInputElement;
			expect(input.value).toBe('Living Room');

			await fireEvent.input(input, { target: { value: '  Kitchen  ' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

			expect(onSetLocation).toHaveBeenCalledWith('Kitchen');
		});

		it('disables the Rename button when the input is empty', async () => {
			mockEntitlements(true);
			await entitlementsStore.fetch('network-123');

			render(EeroActionsCard, {
				props: {
					ledOn: true,
					loading: false,
					location: '',
					onToggleLed: () => {},
					onReboot: () => {},
					onSetLocation: () => {}
				}
			});

			expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
		});
	});
});
