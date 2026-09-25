/**
 * Tests for the API client (plan § 8.2):
 * - `normalizeDetail`/error handling parses the backend's `{detail, type?}`
 *   error body, including `premium_required` (402), `feature_unavailable`
 *   (409), and the 429 rate-limit message.
 * - Every write (POST/PUT/PATCH/DELETE) honours `retries: 0` - no automatic
 *   retry - even when a 5xx is returned, while reads keep retrying.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/mocks/server';
import { api, ApiClientError } from './client';

describe('api client', () => {
	describe('error normalization', () => {
		it('surfaces a plain string detail as-is', async () => {
			server.use(
				http.get('/api/networks', () => HttpResponse.json({ detail: 'boom' }, { status: 500 }))
			);

			await expect(api.networks.list()).rejects.toMatchObject({
				detail: 'boom',
				status: 500
			});
		});

		it('marks a 402 response as premium_required', async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json({ detail: 'Requires eero Plus' }, { status: 402 })
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				expect(error).toBeInstanceOf(ApiClientError);
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(402);
				expect(apiError.type).toBe('premium_required');
				expect(apiError.detail).toBe('Requires eero Plus');
			}
		});

		it('falls back to generic premium copy when 402 has no detail', async () => {
			server.use(http.get('/api/networks', () => HttpResponse.json({}, { status: 402 })));

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.type).toBe('premium_required');
				expect(apiError.detail).toMatch(/eero plus/i);
			}
		});

		it('marks a 409 with type feature_unavailable accordingly', async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json(
						{ detail: 'Not available on this network right now.', type: 'feature_unavailable' },
						{ status: 409 }
					)
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(409);
				expect(apiError.type).toBe('feature_unavailable');
			}
		});

		it('surfaces a friendly message on 429 rate limiting', async () => {
			server.use(http.get('/api/networks', () => HttpResponse.json({}, { status: 429 })));

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(429);
				expect(apiError.detail).toMatch(/rate limit/i);
			}
		});

		it('includes reason on a 401 and dispatches auth:unauthorized with it', async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json({ detail: 'Session expired.', reason: 'expired' }, { status: 401 })
				)
			);

			const seen: Array<{ reason?: string }> = [];
			const listener = (event: Event) => {
				seen.push((event as CustomEvent<{ reason?: string }>).detail ?? {});
			};
			window.addEventListener('auth:unauthorized', listener);

			try {
				await expect(api.networks.list()).rejects.toMatchObject({
					status: 401,
					reason: 'expired'
				});
				expect(seen).toEqual([{ reason: 'expired' }]);
			} finally {
				window.removeEventListener('auth:unauthorized', listener);
			}
		});

		it('passes an experimental_disabled type through unchanged (403, decision 6a)', async () => {
			// No route wires `require_experimental_writes` yet (WP7/WP8 decide
			// per route - backend/app/deps.py:78-91), but `parseError`'s
			// generic `type: data.type` passthrough already covers whatever
			// type string a future route sends. This locks that contract so a
			// later route doesn't need a corresponding client.ts change.
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json(
						{
							detail:
								'This write is disabled. Set EERO_DASHBOARD_EXPERIMENTAL_WRITES=true to enable it.',
							type: 'experimental_disabled'
						},
						{ status: 403 }
					)
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(403);
				expect(apiError.type).toBe('experimental_disabled');
			}
		});

		it('never surfaces error_code on a feature_unavailable 409 (server-log-only field)', async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json(
						{
							detail: 'This feature is not available on this network right now.',
							type: 'feature_unavailable',
							error_code: 'INTERNAL_ONLY_CODE_123'
						},
						{ status: 409 }
					)
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.type).toBe('feature_unavailable');
				expect(JSON.stringify(apiError)).not.toContain('INTERNAL_ONLY_CODE_123');
				expect('error_code' in apiError).toBe(false);
			}
		});

		it("joins FastAPI's own request-validation array shape into one message and keeps the field", async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json(
						{
							detail: [{ loc: ['body', 'ipv4', 'servers'], msg: 'field required', type: 'missing' }]
						},
						{ status: 422 }
					)
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(422);
				expect(apiError.field).toBe('servers');
				expect(apiError.detail).toBe('field required');
			}
		});

		it('joins multiple FastAPI validation errors into one semicolon-separated message', async () => {
			server.use(
				http.get('/api/networks', () =>
					HttpResponse.json(
						{
							detail: [
								{ loc: ['body', 'name'], msg: 'field required', type: 'missing' },
								{ loc: ['body', 'age'], msg: 'value is not a valid integer', type: 'int_parsing' }
							]
						},
						{ status: 422 }
					)
				)
			);

			try {
				await api.networks.list();
				expect.unreachable('expected api.networks.list() to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.detail).toBe('field required; value is not a valid integer');
			}
		});

		it('parses the DNS route {field, message} shape and keeps the field name', async () => {
			server.use(
				http.put('/api/networks/:networkId/dns', () =>
					HttpResponse.json(
						{ detail: { field: 'ipv4', message: 'invalid address' } },
						{ status: 422 }
					)
				)
			);

			try {
				await api.networks.setDns('network-123', { ipv4: { mode: 'custom', servers: ['bad'] } });
				expect.unreachable('expected setDns to reject');
			} catch (error) {
				const apiError = error as ApiClientError;
				expect(apiError.status).toBe(422);
				expect(apiError.field).toBe('ipv4');
				expect(apiError.detail).toBe('invalid address');
			}
		});
	});

	describe('retries: 0 on writes', () => {
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('does not retry a POST that fails with a 5xx', async () => {
			let calls = 0;
			server.use(
				http.post('/api/networks/:networkId/set-preferred', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);

			await expect(api.networks.setPreferred('network-123')).rejects.toThrow();
			expect(calls).toBe(1);
		});

		it('does not retry a PUT that fails with a 5xx', async () => {
			let calls = 0;
			server.use(
				http.put('/api/networks/:networkId/name', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 503 });
				})
			);

			await expect(api.networks.setName('network-123', 'New Name')).rejects.toThrow();
			expect(calls).toBe(1);
		});

		it('does not retry a DELETE that fails with a 5xx', async () => {
			let calls = 0;
			server.use(
				http.delete('/api/profiles/:profileId', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);

			await expect(api.profiles.delete('profile-1')).rejects.toThrow();
			expect(calls).toBe(1);
		});

		// Exhaustive per plan § 8.2 ("no retry on writes ... for every write
		// method in client.ts") - the three tests above cover the shape of the
		// assertion for POST/PUT/DELETE individually; this table covers every
		// remaining write method by name so a newly-added write starts
		// uncovered rather than silently inheriting a false sense of coverage.
		const writeMethods: Array<{
			name: string;
			verb: 'post' | 'put' | 'patch' | 'delete';
			path: string;
			call: () => Promise<unknown>;
		}> = [
			{
				name: 'auth.login',
				verb: 'post',
				path: '/api/auth/login',
				call: () => api.auth.login('x')
			},
			{
				name: 'auth.verify',
				verb: 'post',
				path: '/api/auth/verify',
				call: () => api.auth.verify('123456')
			},
			{
				name: 'auth.logout',
				verb: 'post',
				path: '/api/auth/logout',
				call: () => api.auth.logout()
			},
			{
				name: 'networks.speedTest',
				verb: 'post',
				path: '/api/networks/:networkId/speedtest',
				call: () => api.networks.speedTest('network-123')
			},
			{
				name: 'networks.toggleGuestNetwork',
				verb: 'put',
				path: '/api/networks/:networkId/guest-network',
				call: () => api.networks.toggleGuestNetwork('network-123', true)
			},
			{
				name: 'networks.setDns',
				verb: 'put',
				path: '/api/networks/:networkId/dns',
				call: () => api.networks.setDns('network-123', { ipv4: { mode: 'automatic', servers: [] } })
			},
			{
				name: 'devices.block',
				verb: 'post',
				path: '/api/devices/:deviceId/block',
				call: () => api.devices.block('dev-1')
			},
			{
				name: 'devices.unblock',
				verb: 'post',
				path: '/api/devices/:deviceId/unblock',
				call: () => api.devices.unblock('dev-1')
			},
			{
				name: 'devices.setNickname',
				verb: 'put',
				path: '/api/devices/:deviceId/nickname',
				call: () => api.devices.setNickname('dev-1', 'New Name')
			},
			{
				name: 'eeros.reboot',
				verb: 'post',
				path: '/api/eeros/:eeroId/reboot',
				call: () => api.eeros.reboot('eero-1')
			},
			{
				name: 'eeros.setLed',
				verb: 'post',
				path: '/api/eeros/:eeroId/led',
				call: () => api.eeros.setLed('eero-1', true)
			},
			{
				name: 'eeros.setLedBrightness',
				verb: 'put',
				path: '/api/eeros/:eeroId/led/brightness',
				call: () => api.eeros.setLedBrightness('eero-1', 80)
			},
			{
				name: 'profiles.pause',
				verb: 'post',
				path: '/api/profiles/:profileId/pause',
				call: () => api.profiles.pause('profile-1')
			},
			{
				name: 'profiles.unpause',
				verb: 'post',
				path: '/api/profiles/:profileId/unpause',
				call: () => api.profiles.unpause('profile-1')
			},
			{
				name: 'profiles.create',
				verb: 'post',
				path: '/api/profiles',
				call: () => api.profiles.create('New Profile')
			},
			{
				name: 'profiles.rename',
				verb: 'patch',
				path: '/api/profiles/:profileId',
				call: () => api.profiles.rename('profile-1', 'Renamed')
			},
			{
				name: 'profiles.assignDevices',
				verb: 'post',
				path: '/api/profiles/:profileId/assign-devices',
				call: () => api.profiles.assignDevices('profile-1', ['dev-1'])
			}
		];

		it.each(writeMethods)('does not retry $name on a 5xx', async ({ verb, path, call }) => {
			let calls = 0;
			server.use(
				http[verb](path, () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);

			await expect(call()).rejects.toThrow();
			expect(calls).toBe(1);
		});

		it('still retries a GET that fails with a 5xx', async () => {
			let calls = 0;
			server.use(
				http.get('/api/networks', () => {
					calls++;
					return HttpResponse.json({ detail: 'boom' }, { status: 500 });
				})
			);

			// Attach the rejection expectation before advancing fake timers, so
			// the retry backoff's rejection is never briefly "unhandled".
			const assertion = expect(api.networks.list()).rejects.toThrow();
			// Two retries at 1s and 2s backoff (Math.pow(2, attempt) * 1000).
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);
			await assertion;
			expect(calls).toBe(3);
		});
	});

	// Coordinator directive (WP5): the backend now rejects every write under /api without this
	// header (403, type "csrf") - asserted on both a GET and a write so a future change to the
	// default-headers block can't silently scope it to one verb.
	describe('X-Requested-With header', () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('is sent on a GET', async () => {
			server.use(http.get('/api/networks', () => HttpResponse.json([])));
			const fetchSpy = vi.spyOn(global, 'fetch');

			await api.networks.list();

			expect(fetchSpy).toHaveBeenCalled();
			const [, init] = fetchSpy.mock.calls[0];
			const headers = new Headers(init?.headers);
			expect(headers.get('X-Requested-With')).toBe('eero-ui');
		});

		it('is sent on a write', async () => {
			server.use(
				http.post('/api/networks/:networkId/set-preferred', () =>
					HttpResponse.json({ success: true })
				)
			);
			const fetchSpy = vi.spyOn(global, 'fetch');

			await api.networks.setPreferred('network-123');

			expect(fetchSpy).toHaveBeenCalled();
			const [, init] = fetchSpy.mock.calls[0];
			const headers = new Headers(init?.headers);
			expect(headers.get('X-Requested-With')).toBe('eero-ui');
		});
	});
});
