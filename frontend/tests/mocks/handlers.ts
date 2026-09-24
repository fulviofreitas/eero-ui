/**
 * MSW request handlers for API mocking.
 *
 * These handlers define default API responses for tests, rebuilt from the
 * backend's actual models (`backend/app/routes/*.py`, `transformers.py`) per
 * plan § 8.2 - the previous version drifted (`ip` vs `ip_address`, `name`
 * vs `location`, a `NetworkDetail` that was not one, a health payload
 * missing both version fields). Individual tests can still override any
 * handler using `server.use()`.
 */

import { http, HttpResponse } from 'msw';

export const handlers = [
	// ============================================
	// Auth endpoints
	// ============================================
	http.get('/api/auth/status', () => {
		return HttpResponse.json({
			authenticated: false,
			reason: 'none',
			preferred_network_id: null,
			user_email: null,
			user_name: null,
			user_phone: null,
			user_role: null,
			account_id: null,
			premium_status: null
		});
	}),

	http.post('/api/auth/login', async ({ request }) => {
		const body = (await request.json()) as { identifier: string };

		// Simulate failure for specific test email
		if (body.identifier === 'invalid@test.com') {
			return HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 });
		}

		return HttpResponse.json({
			success: true,
			message: 'Verification code sent. Check your email or phone.'
		});
	}),

	http.post('/api/auth/verify', async ({ request }) => {
		const body = (await request.json()) as { code: string };

		// Simulate failure for specific test code
		if (body.code === 'invalid') {
			return HttpResponse.json({ detail: 'Invalid verification code' }, { status: 401 });
		}

		return HttpResponse.json({
			success: true,
			message: 'Login successful!',
			preferred_network_id: 'network-123'
		});
	}),

	http.post('/api/auth/logout', () => {
		return HttpResponse.json({
			success: true,
			message: 'Logged out successfully.'
		});
	}),

	// ============================================
	// Network endpoints
	// ============================================
	http.get('/api/networks', () => {
		return HttpResponse.json([
			{
				id: 'network-123',
				name: 'Home Network',
				status: 'online',
				guest_network_enabled: false,
				public_ip: '203.0.113.1',
				isp_name: 'Example ISP'
			}
		]);
	}),

	http.get('/api/networks/:networkId', ({ params }) => {
		return HttpResponse.json({
			id: params.networkId,
			name: 'Home Network',
			status: 'online',
			guest_network_enabled: false,
			public_ip: '203.0.113.1',
			isp_name: 'Example ISP',
			device_count: 15,
			eero_count: 3,
			speed_test: null,
			health: null,
			settings: null,
			owner: null,
			display_name: null,
			network_customer_type: null,
			premium_status: null,
			created_at: null,
			gateway: null,
			wan_type: null,
			gateway_ip: null,
			connection_mode: null,
			backup_internet_enabled: false,
			power_saving: false,
			sqm: false,
			upnp: false,
			thread: false,
			band_steering: false,
			wpa3: false,
			ipv6_upstream: false,
			ipv6: null,
			dns: null,
			premium_dns: null,
			geo_ip: null,
			updates: null,
			dhcp: null,
			ddns: null,
			homekit: null,
			ip_settings: null,
			premium_details: null,
			amazon_account_linked: false,
			alexa_skill: false,
			last_reboot: null
		});
	}),

	http.post('/api/networks/:networkId/set-preferred', ({ params }) => {
		return HttpResponse.json({ success: true, preferred_network_id: params.networkId });
	}),

	// Starts a speed test - result is fetched separately via `speedtests` (decision 4).
	// `started_at` is the server's clock; the store MUST use it, not the browser's.
	http.post('/api/networks/:networkId/speedtest', () => {
		return HttpResponse.json(
			{ status: 'started', started_at: new Date().toISOString() },
			{ status: 202 }
		);
	}),

	http.get('/api/networks/:networkId/speedtests', () => {
		return HttpResponse.json([
			{
				download_mbps: 480.2,
				upload_mbps: 95.6,
				latency_ms: 12,
				timestamp: new Date().toISOString()
			}
		]);
	}),

	http.put('/api/networks/:networkId/guest-network', () => {
		return HttpResponse.json({ success: true, guest_network_enabled: true });
	}),

	http.put('/api/networks/:networkId/name', async ({ params, request }) => {
		const body = (await request.json()) as { name: string };
		return HttpResponse.json({
			success: true,
			changed: true,
			network_id: params.networkId,
			name: body.name
		});
	}),

	http.get('/api/networks/:networkId/dns', () => {
		return HttpResponse.json({
			ipv4: { mode: 'automatic', servers: [] },
			ipv6: { mode: 'automatic', servers: [] },
			caching: true,
			parent_ips: ['203.0.113.1'],
			providers: [
				{
					name: 'Cloudflare',
					ipv4: ['1.1.1.1', '1.0.0.1'],
					ipv6: ['2606:4700:4700::1111', '2606:4700:4700::1001']
				}
			]
		});
	}),

	http.put('/api/networks/:networkId/dns', async ({ request }) => {
		const body = (await request.json()) as {
			ipv4?: { mode: string; servers: string[] };
			ipv6?: { mode: string; servers: string[] };
			caching?: boolean;
		};
		return HttpResponse.json({
			success: true,
			changed: true,
			dns: {
				ipv4: body.ipv4 ?? { mode: 'automatic', servers: [] },
				ipv6: body.ipv6 ?? { mode: 'automatic', servers: [] },
				caching: body.caching ?? true,
				parent_ips: ['203.0.113.1'],
				providers: []
			}
		});
	}),

	http.get('/api/networks/:networkId/entitlements', () => {
		return HttpResponse.json({
			features: [],
			upsell_features: [],
			is_premium: false,
			premium_status: { active: false, eero_plus: null, premium_dns: null },
			capabilities: [],
			experimental_writes: false
		});
	}),

	// ============================================
	// Device endpoints
	// ============================================
	http.get('/api/devices', () => {
		return HttpResponse.json([
			{
				id: 'dev-1',
				url: null,
				mac: 'AA:BB:CC:DD:EE:01',
				ip: '192.168.1.100',
				nickname: 'iPhone',
				hostname: 'iphone',
				display_name: 'iPhone',
				manufacturer: 'Apple',
				model_name: null,
				device_type: 'phone',
				connected: true,
				wireless: true,
				blocked: false,
				paused: false,
				is_guest: false,
				connection_type: 'wireless',
				signal_strength: -50,
				frequency: '5GHz',
				connected_to_eero: 'Living Room',
				last_active: null,
				profile_id: null,
				profile_name: null
			},
			{
				id: 'dev-2',
				url: null,
				mac: 'AA:BB:CC:DD:EE:02',
				ip: '192.168.1.101',
				nickname: 'Laptop',
				hostname: 'laptop',
				display_name: 'Laptop',
				manufacturer: null,
				model_name: null,
				device_type: 'computer',
				connected: true,
				wireless: false,
				blocked: false,
				paused: false,
				is_guest: false,
				connection_type: 'wired',
				signal_strength: null,
				frequency: null,
				connected_to_eero: 'Living Room',
				last_active: null,
				profile_id: null,
				profile_name: null
			},
			{
				id: 'dev-3',
				url: null,
				mac: 'AA:BB:CC:DD:EE:03',
				ip: '192.168.1.102',
				nickname: 'Smart TV',
				hostname: 'smart-tv',
				display_name: 'Smart TV',
				manufacturer: null,
				model_name: null,
				device_type: 'tv',
				connected: false,
				wireless: true,
				blocked: false,
				paused: false,
				is_guest: false,
				connection_type: 'wireless',
				signal_strength: null,
				frequency: null,
				connected_to_eero: null,
				last_active: null,
				profile_id: null,
				profile_name: null
			}
		]);
	}),

	http.get('/api/devices/:deviceId', ({ params }) => {
		return HttpResponse.json({
			id: params.deviceId,
			url: null,
			mac: 'AA:BB:CC:DD:EE:FF',
			ip: '192.168.1.100',
			ips: ['192.168.1.100'],
			ipv4: '192.168.1.100',
			nickname: 'Test Device',
			hostname: 'test-device',
			display_name: 'Test Device',
			manufacturer: null,
			model_name: null,
			device_type: null,
			connected: true,
			wireless: true,
			connection_type: 'wireless',
			blocked: false,
			paused: false,
			is_guest: false,
			is_private: false,
			signal_strength: -50,
			signal_bars: 4,
			frequency: '5GHz',
			frequency_mhz: 5180,
			channel: 36,
			ssid: null,
			rx_bitrate: null,
			tx_bitrate: null,
			connected_to_eero: 'Living Room',
			connected_to_eero_id: 'eero-1',
			connected_to_eero_model: 'eero Pro 6E',
			profile_id: null,
			profile_name: null,
			last_active: null,
			first_active: null,
			network_id: 'network-123',
			subnet_kind: null,
			auth: null
		});
	}),

	http.post('/api/devices/:deviceId/block', () => {
		return HttpResponse.json({
			success: true,
			device_id: 'dev-1',
			action: 'block',
			message: null
		});
	}),

	http.post('/api/devices/:deviceId/unblock', ({ params }) => {
		return HttpResponse.json({
			success: true,
			device_id: params.deviceId,
			action: 'unblock',
			message: null
		});
	}),

	http.put('/api/devices/:deviceId/nickname', ({ params }) => {
		return HttpResponse.json({
			success: true,
			device_id: params.deviceId,
			action: 'nickname',
			message: null
		});
	}),

	// ============================================
	// Eero endpoints
	// ============================================
	http.get('/api/eeros', () => {
		return HttpResponse.json([
			{
				id: 'eero-1',
				url: '/eeros/eero-1',
				serial: 'SERIAL1',
				mac_address: 'AA:BB:CC:00:00:01',
				model: 'eero Pro 6E',
				status: 'green',
				location: 'Living Room',
				is_gateway: true,
				is_primary: true,
				connected_clients_count: 8,
				firmware_version: '7.0.0',
				ip_address: '192.168.1.1',
				mesh_quality_bars: 4,
				led_on: true,
				wired: true
			},
			{
				id: 'eero-2',
				url: '/eeros/eero-2',
				serial: 'SERIAL2',
				mac_address: 'AA:BB:CC:00:00:02',
				model: 'eero 6+',
				status: 'green',
				location: 'Bedroom',
				is_gateway: false,
				is_primary: false,
				connected_clients_count: 3,
				firmware_version: '7.0.0',
				ip_address: '192.168.1.2',
				mesh_quality_bars: 3,
				led_on: true,
				wired: false
			}
		]);
	}),

	http.get('/api/eeros/:eeroId', ({ params }) => {
		return HttpResponse.json({
			id: params.eeroId,
			url: `/eeros/${params.eeroId}`,
			serial: 'SERIAL1',
			mac_address: 'AA:BB:CC:00:00:01',
			model: 'eero Pro 6E',
			model_number: null,
			status: 'green',
			state: 'ONLINE',
			location: 'Living Room',
			is_gateway: true,
			is_primary: true,
			wired: true,
			connection_type: 'wired',
			mesh_quality_bars: 4,
			ip_address: '192.168.1.1',
			using_wan: true,
			connected_clients_count: 8,
			connected_wired_clients_count: 2,
			connected_wireless_clients_count: 6,
			firmware_version: '7.0.0',
			os_version: null,
			led_on: true,
			led_brightness: 100,
			uptime: null,
			cpu_usage: null,
			memory_usage: null,
			temperature: null,
			heartbeat_ok: true,
			update_available: false,
			provides_wifi: true,
			auto_provisioned: null,
			retrograde_capable: null,
			last_heartbeat: null,
			last_reboot: null,
			joined: null,
			network_name: 'Home Network',
			network_url: '/networks/network-123',
			bands: null,
			wifi_bssids: null,
			bssids_with_bands: null,
			ethernet_addresses: null,
			ethernet_ports: null,
			ipv6_addresses: null,
			organization_name: null,
			organization_id: null,
			power_source: null,
			power_saving_active: null
		});
	}),

	http.post('/api/eeros/:eeroId/reboot', ({ params }) => {
		return HttpResponse.json({
			success: true,
			eero_id: params.eeroId,
			action: 'reboot',
			message: null
		});
	}),

	http.post('/api/eeros/:eeroId/led', ({ params }) => {
		return HttpResponse.json({
			success: true,
			eero_id: params.eeroId,
			action: 'led',
			message: null
		});
	}),

	// EeroLedBrightnessAction extends EeroAction with a read-back `led_brightness`
	// (backend/app/routes/eeros.py:482-519) - the write re-reads the value from
	// the SDK after setting it, rather than trusting the caller's request.
	http.put('/api/eeros/:eeroId/led/brightness', ({ params }) => {
		return HttpResponse.json({
			success: true,
			eero_id: params.eeroId,
			action: 'led_brightness',
			message: 'LED brightness set to 80%.',
			led_brightness: 80
		});
	}),

	// ============================================
	// Profile endpoints
	// ============================================
	http.get('/api/profiles', () => {
		return HttpResponse.json([
			{
				id: 'profile-1',
				url: '/profiles/profile-1',
				name: 'Kids',
				paused: false,
				device_count: 3,
				device_ids: ['dev-1', 'dev-2', 'dev-3'],
				devices: []
			},
			{
				id: 'profile-2',
				url: '/profiles/profile-2',
				name: 'Guests',
				paused: true,
				device_count: 0,
				device_ids: [],
				devices: []
			}
		]);
	}),

	http.get('/api/profiles/:profileId', ({ params }) => {
		return HttpResponse.json({
			id: params.profileId,
			url: `/profiles/${params.profileId}`,
			name: 'Kids',
			paused: false,
			device_count: 0,
			device_ids: [],
			devices: []
		});
	}),

	http.post('/api/profiles', async ({ request }) => {
		const body = (await request.json()) as { name: string };
		return HttpResponse.json({
			id: 'profile-new',
			url: '/profiles/profile-new',
			name: body.name,
			paused: false,
			device_count: 0,
			device_ids: [],
			devices: []
		});
	}),

	http.patch('/api/profiles/:profileId', async ({ params, request }) => {
		const body = (await request.json()) as { name: string };
		return HttpResponse.json({
			id: params.profileId,
			url: `/profiles/${params.profileId}`,
			name: body.name,
			paused: false,
			device_count: 0,
			device_ids: [],
			devices: []
		});
	}),

	http.delete('/api/profiles/:profileId', ({ params }) => {
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			action: 'delete',
			message: null
		});
	}),

	http.post('/api/profiles/:profileId/pause', ({ params }) => {
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			action: 'pause',
			message: null
		});
	}),

	http.post('/api/profiles/:profileId/unpause', ({ params }) => {
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			action: 'unpause',
			message: null
		});
	}),

	http.post('/api/profiles/:profileId/assign-devices', async ({ params, request }) => {
		const body = (await request.json()) as { device_ids: string[] };
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			assigned_count: body.device_ids.length,
			message: null
		});
	}),

	// ============================================
	// Health endpoint
	// ============================================
	http.get('/api/health', () => {
		return HttpResponse.json({
			status: 'healthy',
			version: '6.0.0',
			eero_client_version: '8.0.3',
			experimental_writes: false
		});
	})
];
