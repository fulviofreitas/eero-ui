/**
 * Tests for the networks store's settings-class and speed-test writes
 * (plan § 5, § 8.2; REVIEWER follow-up on WP1):
 * - runSpeedTest: starts the test using the server's `started_at` as the
 *   poll baseline (never `Date.now()`), polls speed-test history until a
 *   matching result appears, is reentrant per network id (a second call for
 *   the same network supersedes the first without the old run's loop
 *   clobbering state), is cancellable via `AbortSignal`, and surfaces a 409
 *   ("already running") without ever polling
 * - renameNetwork: settings-class write - skips the API call entirely when
 *   the name is unchanged, and never overlaps with another settings-class
 *   write on the same network (the shared `settingsLock`)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { networksStore, speedTestFor } from './networks';
import { withSettingsLock, resetSettingsLock } from './settingsLock';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

const network123 = {
	id: 'network-123',
	name: 'Home Network',
	status: 'online' as const,
	guest_network_enabled: false,
	public_ip: null,
	isp_name: null
};

describe('networksStore', () => {
	beforeEach(async () => {
		networksStore.clear();
		resetSettingsLock();
		server.use(http.get('/api/networks', () => HttpResponse.json([network123])));
		await networksStore.fetch();
	});

	describe('fetch (issue #401 - stored selection must be re-sent as preferred)', () => {
		it('re-sends a stored, still-valid selection via POST set-preferred on every fetch', async () => {
			// Simulate a container restart: localStorage already holds a valid
			// selection from a previous session, but the backend's in-memory
			// preferred network is empty - the store must re-assert it, not
			// only send it on the fallback (first-network) path.
			networksStore.clear();
			localStorage.setItem('eero_selected_network', 'network-123');

			const setPreferredCalls: string[] = [];
			server.use(
				http.get('/api/networks', () => HttpResponse.json([network123])),
				http.post('/api/networks/:networkId/set-preferred', ({ params }) => {
					setPreferredCalls.push(params.networkId as string);
					return HttpResponse.json({ success: true });
				})
			);

			await networksStore.fetch();

			expect(setPreferredCalls).toEqual(['network-123']);
			expect(get(networksStore).selectedNetworkId).toBe('network-123');
		});

		it('still selects and sends the first network when no valid selection is stored (fallback path)', async () => {
			networksStore.clear();
			// No localStorage entry, and network-123 is the only available network.

			const setPreferredCalls: string[] = [];
			server.use(
				http.get('/api/networks', () => HttpResponse.json([network123])),
				http.post('/api/networks/:networkId/set-preferred', ({ params }) => {
					setPreferredCalls.push(params.networkId as string);
					return HttpResponse.json({ success: true });
				})
			);

			await networksStore.fetch();

			expect(setPreferredCalls).toEqual(['network-123']);
			expect(get(networksStore).selectedNetworkId).toBe('network-123');
		});

		it('does not commit networks/selectedNetworkId to the store until set-preferred resolves (Codacy PR #413)', async () => {
			networksStore.clear();
			localStorage.setItem('eero_selected_network', 'network-123');

			let resolveSetPreferred: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolveSetPreferred = resolve;
			});

			server.use(
				http.get('/api/networks', () => HttpResponse.json([network123])),
				http.post('/api/networks/:networkId/set-preferred', async () => {
					await gate;
					return HttpResponse.json({ success: true });
				})
			);

			const fetchPromise = networksStore.fetch();

			// The list request has resolved by the time the awaited
			// `setPreferred` call is gating, but the store must still reflect
			// the pre-fetch (empty) state.
			await vi.waitFor(() => expect(get(networksStore).loading).toBe(true));
			expect(get(networksStore).networks).toEqual([]);
			expect(get(networksStore).selectedNetworkId).toBeNull();

			resolveSetPreferred!();
			await fetchPromise;

			expect(get(networksStore).networks).toEqual([network123]);
			expect(get(networksStore).selectedNetworkId).toBe('network-123');
		});

		it('does not throw and still resolves fetch when set-preferred fails', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			server.use(
				http.get('/api/networks', () => HttpResponse.json([network123])),
				http.post('/api/networks/:networkId/set-preferred', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				)
			);

			await expect(networksStore.fetch()).resolves.toBeUndefined();

			expect(get(networksStore).selectedNetworkId).toBe('network-123');
			expect(get(networksStore).error).toBeNull();
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});
	});

	describe('runSpeedTest', () => {
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('polls until a result at/after the server-provided started_at appears, then stops', async () => {
			// Server clock is deliberately offset from Date.now() - if the
			// store compared against the browser's clock instead of
			// `started_at`, this "fresh" result would be misread as stale.
			const serverStartedAt = new Date(Date.now() - 30_000).toISOString();
			let historyCalls = 0;

			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json({ status: 'started', started_at: serverStartedAt }, { status: 202 })
				),
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCalls++;
					if (historyCalls < 3) {
						// Stale (pre-test) entry - must be rejected.
						return HttpResponse.json([
							{
								download_mbps: 100,
								upload_mbps: 10,
								latency_ms: 20,
								timestamp: new Date(Date.parse(serverStartedAt) - 60_000).toISOString()
							}
						]);
					}
					return HttpResponse.json([
						{
							download_mbps: 480.2,
							upload_mbps: 95.6,
							latency_ms: 12,
							timestamp: new Date(Date.parse(serverStartedAt) + 1000).toISOString()
						}
					]);
				})
			);

			const resultPromise = networksStore.runSpeedTest('network-123');
			const progress = speedTestFor('network-123');

			expect(get(progress).running).toBe(true);

			// Poll interval is 5s; three polls needed before a fresh result appears.
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(5000);

			const result = await resultPromise;

			expect(result.download_mbps).toBe(480.2);
			expect(get(progress).running).toBe(false);
			expect(get(progress).result?.download_mbps).toBe(480.2);
			expect(historyCalls).toBe(3);
		});

		it('times out after 90s if no fresh result ever appears', async () => {
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json(
						{ status: 'started', started_at: new Date().toISOString() },
						{ status: 202 }
					)
				),
				http.get('/api/networks/:networkId/speedtests', () =>
					// Always stale.
					HttpResponse.json([
						{
							download_mbps: 100,
							upload_mbps: 10,
							latency_ms: 20,
							timestamp: new Date(Date.now() - 3_600_000).toISOString()
						}
					])
				)
			);

			const progress = speedTestFor('network-123');
			const assertion = expect(networksStore.runSpeedTest('network-123')).rejects.toThrow(
				/timed out/i
			);

			await vi.advanceTimersByTimeAsync(95_000);
			await assertion;

			expect(get(progress).running).toBe(false);
			expect(get(progress).error).toMatch(/timed out/i);
		});

		it('surfaces a failure to start the test without ever polling', async () => {
			let historyCalls = 0;
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json({ detail: 'boom' }, { status: 500 })
				),
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCalls++;
					return HttpResponse.json([]);
				})
			);

			const progress = speedTestFor('network-123');
			await expect(networksStore.runSpeedTest('network-123')).rejects.toThrow();

			expect(historyCalls).toBe(0);
			expect(get(progress).running).toBe(false);
		});

		it('surfaces a 409 (already running) as a typed error without ever polling', async () => {
			let historyCalls = 0;
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json(
						{
							detail: 'A speed test is already running on this network.',
							type: 'speedtest_in_progress'
						},
						{ status: 409 }
					)
				),
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCalls++;
					return HttpResponse.json([]);
				})
			);

			let caught: unknown;
			try {
				await networksStore.runSpeedTest('network-123');
			} catch (error) {
				caught = error;
			}

			expect(caught).toMatchObject({ status: 409, type: 'speedtest_in_progress' });
			expect(historyCalls).toBe(0);
			expect(get(speedTestFor('network-123')).running).toBe(false);
		});

		it('surfaces a 429 (rate limited) without ever polling', async () => {
			let historyCalls = 0;
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json({}, { status: 429 })
				),
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCalls++;
					return HttpResponse.json([]);
				})
			);

			await expect(networksStore.runSpeedTest('network-123')).rejects.toThrow(/rate limit/i);
			expect(historyCalls).toBe(0);
		});

		it('is cancellable via AbortSignal and stops polling immediately', async () => {
			let historyCalls = 0;
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json(
						{ status: 'started', started_at: new Date().toISOString() },
						{ status: 202 }
					)
				),
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCalls++;
					// Always stale, so the only way this settles is cancellation.
					return HttpResponse.json([
						{
							download_mbps: 1,
							upload_mbps: 1,
							latency_ms: 1,
							timestamp: new Date(Date.now() - 3_600_000).toISOString()
						}
					]);
				})
			);

			const controller = new AbortController();
			const progress = speedTestFor('network-123');
			const assertion = expect(
				networksStore.runSpeedTest('network-123', { signal: controller.signal })
			).rejects.toMatchObject({ name: 'AbortError' });

			// First poll tick happens after 5s; cancel mid-wait on the second tick.
			await vi.advanceTimersByTimeAsync(5000);
			expect(historyCalls).toBe(1);
			controller.abort();

			await assertion;

			expect(get(progress).running).toBe(false);
			const callsAtCancel = historyCalls;

			// Advancing time further must not resume polling.
			await vi.advanceTimersByTimeAsync(30_000);
			expect(historyCalls).toBe(callsAtCancel);
		});

		it('a second run for the same network supersedes the first without clobbering its state', async () => {
			let historyCallsA = 0;
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json(
						{ status: 'started', started_at: new Date().toISOString() },
						{ status: 202 }
					)
				)
			);

			// First run: always stale, so it would poll forever if not superseded.
			server.use(
				http.get('/api/networks/:networkId/speedtests', () => {
					historyCallsA++;
					return HttpResponse.json([
						{
							download_mbps: 1,
							upload_mbps: 1,
							latency_ms: 1,
							timestamp: new Date(Date.now() - 3_600_000).toISOString()
						}
					]);
				})
			);

			const firstRun = networksStore.runSpeedTest('network-123');
			const firstRunAssertion = expect(firstRun).rejects.toMatchObject({
				message: expect.stringMatching(/superseded/i)
			});

			await vi.advanceTimersByTimeAsync(5000);
			expect(historyCallsA).toBeGreaterThan(0);

			// Second run for the SAME network - fresh result immediately.
			server.use(
				http.get('/api/networks/:networkId/speedtests', () =>
					HttpResponse.json([
						{
							download_mbps: 480.2,
							upload_mbps: 95.6,
							latency_ms: 12,
							timestamp: new Date().toISOString()
						}
					])
				)
			);

			const secondRun = networksStore.runSpeedTest('network-123');
			await vi.advanceTimersByTimeAsync(5000);

			const secondResult = await secondRun;
			await firstRunAssertion;

			expect(secondResult.download_mbps).toBe(480.2);
			// The superseded first run must not have overwritten the second
			// run's success with its own (stale) state on its next tick.
			const finalState = get(speedTestFor('network-123'));
			expect(finalState.running).toBe(false);
			expect(finalState.result?.download_mbps).toBe(480.2);
		});

		it('tracks two different networks independently', async () => {
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json(
						{ status: 'started', started_at: new Date().toISOString() },
						{ status: 202 }
					)
				),
				http.get('/api/networks/network-123/speedtests', () =>
					HttpResponse.json([
						{
							download_mbps: 100,
							upload_mbps: 10,
							latency_ms: 5,
							timestamp: new Date().toISOString()
						}
					])
				),
				http.get('/api/networks/network-999/speedtests', () =>
					HttpResponse.json([
						{
							download_mbps: 200,
							upload_mbps: 20,
							latency_ms: 5,
							timestamp: new Date().toISOString()
						}
					])
				)
			);

			const runA = networksStore.runSpeedTest('network-123');
			const runB = networksStore.runSpeedTest('network-999');

			await vi.advanceTimersByTimeAsync(5000);

			const [resultA, resultB] = await Promise.all([runA, runB]);

			expect(resultA.download_mbps).toBe(100);
			expect(resultB.download_mbps).toBe(200);
			expect(get(speedTestFor('network-123')).result?.download_mbps).toBe(100);
			expect(get(speedTestFor('network-999')).result?.download_mbps).toBe(200);
		});
	});

	describe('renameNetwork (settings-class, § 5)', () => {
		it('skips the write entirely when the name is unchanged', async () => {
			let putCalls = 0;
			server.use(
				http.put('/api/networks/:networkId/name', () => {
					putCalls++;
					return HttpResponse.json({
						success: true,
						changed: true,
						network_id: 'network-123',
						name: 'Home Network'
					});
				})
			);

			const result = await networksStore.renameNetwork('network-123', 'Home Network');

			expect(result.changed).toBe(false);
			expect(putCalls).toBe(0);
		});

		it('writes and updates the store when the name actually changes', async () => {
			server.use(
				http.put('/api/networks/:networkId/name', async ({ request }) => {
					const body = (await request.json()) as { name: string };
					return HttpResponse.json({
						success: true,
						changed: true,
						network_id: 'network-123',
						name: body.name
					});
				})
			);

			const result = await networksStore.renameNetwork('network-123', 'New Name');

			expect(result.changed).toBe(true);
			expect(result.name).toBe('New Name');
			expect(get(networksStore).networks.find((n) => n.id === 'network-123')?.name).toBe(
				'New Name'
			);
		});

		it('never overlaps with another settings-class write on the same network', async () => {
			let resolvePut: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolvePut = resolve;
			});

			server.use(
				http.put('/api/networks/:networkId/name', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						changed: true,
						network_id: 'network-123',
						name: 'New Name'
					});
				})
			);

			const firstRename = networksStore.renameNetwork('network-123', 'New Name');

			// A second settings-class write for the SAME network - e.g. a
			// concurrent DNS save - must be rejected by the shared lock while
			// the rename is in flight, not queued behind it.
			await expect(withSettingsLock('network-123', async () => 'should not run')).rejects.toThrow(
				/already being applied/i
			);

			resolvePut!();
			const result = await firstRename;
			expect(result.changed).toBe(true);

			// Lock released - a subsequent settings write on the same network succeeds.
			await expect(withSettingsLock('network-123', async () => 'ok')).resolves.toBe('ok');
		});

		it('does not block a settings-class write on a different network', async () => {
			let resolvePut: (() => void) | null = null;
			const gate = new Promise<void>((resolve) => {
				resolvePut = resolve;
			});
			server.use(
				http.put('/api/networks/:networkId/name', async () => {
					await gate;
					return HttpResponse.json({
						success: true,
						changed: true,
						network_id: 'network-123',
						name: 'New Name'
					});
				})
			);

			const firstRename = networksStore.renameNetwork('network-123', 'New Name');

			await expect(withSettingsLock('network-999', async () => 'ok')).resolves.toBe('ok');

			resolvePut!();
			await firstRename;
		});
	});
});
