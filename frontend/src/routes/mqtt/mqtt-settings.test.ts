import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import MQTTPage from './+page.svelte';

const settings = {
	enabled: false,
	broker_address: 'broker:1883',
	username: 'mqtt-user',
	password_set: true,
	home_assistant_discovery: true,
	discovery_prefix: 'homeassistant',
	connection_status: 'disabled',
	message: null
};

async function renderSettings() {
	server.use(http.get('/api/mqtt', () => HttpResponse.json(settings)));
	render(MQTTPage);
	await screen.findByLabelText('Broker address');
}

describe('MQTT settings', () => {
	it('shows six sensors, discovery enabled and a blank saved password', async () => {
		await renderSettings();
		expect(screen.getByLabelText('Home Assistant auto discovery')).toBeChecked();
		expect(screen.getByLabelText('Password')).toHaveValue('');
		expect(screen.getByLabelText('Broker address')).toHaveValue('broker:1883');
		for (const name of [
			'Wired clients',
			'Wireless clients',
			'Latest speed test download',
			'Latest speed test upload',
			'WAN download',
			'WAN upload'
		]) {
			expect(screen.getByText(name)).toBeInTheDocument();
		}
	});

	it('preserves a saved password when saving other settings', async () => {
		let body: Record<string, unknown> | undefined;
		server.use(
			http.put('/api/mqtt', async ({ request }) => {
				body = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({ ...settings, enabled: true, connection_status: 'connecting' });
			})
		);
		await renderSettings();
		await fireEvent.click(screen.getByLabelText('Enable MQTT'));
		await fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		await screen.findByText('Settings saved.');
		expect(body).toMatchObject({ enabled: true, password: null, home_assistant_discovery: true });
		expect(screen.getByText('Connecting…')).toBeInTheDocument();
	});

	it('sends a replacement password and clears the input after saving', async () => {
		let body: Record<string, unknown> | undefined;
		server.use(
			http.put('/api/mqtt', async ({ request }) => {
				body = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json(settings);
			})
		);
		await renderSettings();
		await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'new-secret' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		await screen.findByText('Settings saved.');
		expect(body?.password).toBe('new-secret');
		expect(screen.getByLabelText('Password')).toHaveValue('');
	});

	it('explicitly removes the saved password', async () => {
		let body: Record<string, unknown> | undefined;
		server.use(
			http.put('/api/mqtt', async ({ request }) => {
				body = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({ ...settings, password_set: false });
			})
		);
		await renderSettings();
		await fireEvent.click(screen.getByLabelText('Remove saved password'));
		await fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		await screen.findByText('Settings saved.');
		expect(body?.password).toBe('');
		expect(screen.queryByLabelText('Remove saved password')).not.toBeInTheDocument();
	});

	it('keeps edits and displays a save error', async () => {
		server.use(
			http.put('/api/mqtt', () =>
				HttpResponse.json({ detail: 'MQTT settings could not be saved.' }, { status: 503 })
			)
		);
		await renderSettings();
		await fireEvent.input(screen.getByLabelText('Broker address'), {
			target: { value: 'new-broker' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
		await screen.findByRole('alert');
		expect(screen.getByRole('alert')).toHaveTextContent('MQTT settings could not be saved.');
		expect(screen.getByLabelText('Broker address')).toHaveValue('new-broker');
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
		);
	});

	it('offers retry when settings cannot be loaded', async () => {
		server.use(
			http.get('/api/mqtt', () =>
				HttpResponse.json({ detail: 'Settings unavailable.' }, { status: 503 })
			)
		);
		render(MQTTPage);
		await screen.findByRole('button', { name: 'Retry' });
		expect(screen.queryByLabelText('Broker address')).not.toBeInTheDocument();
		server.use(http.get('/api/mqtt', () => HttpResponse.json(settings)));
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		await screen.findByLabelText('Broker address');
	});
});
