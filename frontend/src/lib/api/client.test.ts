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
});
