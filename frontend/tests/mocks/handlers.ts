/**
 * MSW request handlers for API mocking.
 *
 * These handlers define default API responses for tests.
 * Individual tests can override handlers using server.use().
 */

import { http, HttpResponse } from 'msw';

export const handlers = [
	// ============================================
	// Auth endpoints
	// ============================================
	http.get('/api/auth/status', () => {
		return HttpResponse.json({
			authenticated: false,
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
				device_count: 15,
				eero_count: 3
			}
		]);
	}),

	http.get('/api/networks/:networkId', ({ params }) => {
		return HttpResponse.json({
			id: params.networkId,
			name: 'Home Network',
			status: 'online',
			speed: { up: 100, down: 500 }
		});
	}),

	// ============================================
	// Device endpoints
	// ============================================
	http.get('/api/devices', () => {
		return HttpResponse.json([
			{
				id: 'dev-1',
				nickname: 'iPhone',
				connected: true,
				blocked: false,
				ip_address: '192.168.1.100'
			},
			{
				id: 'dev-2',
				nickname: 'Laptop',
				connected: true,
				blocked: false,
				ip_address: '192.168.1.101'
			},
			{
				id: 'dev-3',
				nickname: 'Smart TV',
				connected: false,
				blocked: false,
				ip_address: '192.168.1.102'
			}
		]);
	}),

	http.get('/api/devices/:deviceId', ({ params }) => {
		return HttpResponse.json({
			id: params.deviceId,
			nickname: 'Test Device',
			connected: true,
			blocked: false,
			ip_address: '192.168.1.100',
			mac_address: 'AA:BB:CC:DD:EE:FF'
		});
	}),

	http.post('/api/devices/:deviceId/block', ({ params }) => {
		return HttpResponse.json({
			success: true,
			device_id: params.deviceId,
			action: 'block'
		});
	}),

	http.post('/api/devices/:deviceId/unblock', ({ params }) => {
		return HttpResponse.json({
			success: true,
			device_id: params.deviceId,
			action: 'unblock'
		});
	}),

	// ============================================
	// Eero endpoints
	// ============================================
	http.get('/api/eeros', () => {
		return HttpResponse.json([
			{
				id: 'eero-1',
				name: 'Living Room',
				is_gateway: true,
				status: 'online',
				model: 'eero Pro 6E'
			},
			{
				id: 'eero-2',
				name: 'Bedroom',
				is_gateway: false,
				status: 'online',
				model: 'eero 6+'
			}
		]);
	}),

	http.post('/api/eeros/:eeroId/reboot', ({ params }) => {
		return HttpResponse.json({
			success: true,
			eero_id: params.eeroId,
			action: 'reboot'
		});
	}),

	// ============================================
	// Profile endpoints
	// ============================================
	http.get('/api/profiles', () => {
		return HttpResponse.json([
			{
				id: 'profile-1',
				name: 'Kids',
				paused: false,
				device_count: 3
			},
			{
				id: 'profile-2',
				name: 'Guests',
				paused: true,
				device_count: 0
			}
		]);
	}),

	http.post('/api/profiles/:profileId/pause', ({ params }) => {
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			action: 'pause'
		});
	}),

	http.post('/api/profiles/:profileId/unpause', ({ params }) => {
		return HttpResponse.json({
			success: true,
			profile_id: params.profileId,
			action: 'unpause'
		});
	}),

	// ============================================
	// Health endpoint
	// ============================================
	http.get('/api/health', () => {
		return HttpResponse.json({
			status: 'healthy',
			version: '1.0.0'
		});
	})
];
