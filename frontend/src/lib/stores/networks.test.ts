/**
 * Tests for the networks store's settings-class and speed-test writes
 * (plan § 5, § 8.2):
 * - runSpeedTest: starts the test, polls speed-test history until a result
 *   newer than the start time appears, and exposes progress via
 *   `speedTestState`
 * - renameNetwork: settings-class write - skips the API call entirely when
 *   the name is unchanged, and never overlaps with another settings-class
 *   write on the same network (the shared `settingsLock`)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { networksStore, speedTestState } from './networks';
import { withSettingsLock } from './settingsLock';
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
		server.use(http.get('/api/networks', () => HttpResponse.json([network123])));
		await networksStore.fetch();
	});

	describe('runSpeedTest', () => {
		beforeEach(() => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('polls until a result newer than the start time appears, then stops', async () => {
			const startedAt = Date.now();
			let historyCalls = 0;

			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json({ status: 'started' }, { status: 202 })
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
								timestamp: new Date(startedAt - 60_000).toISOString()
							}
						]);
					}
					return HttpResponse.json([
						{
							download_mbps: 480.2,
							upload_mbps: 95.6,
							latency_ms: 12,
							timestamp: new Date().toISOString()
						}
					]);
				})
			);

			const resultPromise = networksStore.runSpeedTest('network-123');

			expect(get(speedTestState).running).toBe(true);

			// Poll interval is 5s; three polls needed before a fresh result appears.
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(5000);

			const result = await resultPromise;

			expect(result.download_mbps).toBe(480.2);
			expect(get(speedTestState).running).toBe(false);
			expect(get(speedTestState).result?.download_mbps).toBe(480.2);
			expect(historyCalls).toBe(3);
		});

		it('times out after 90s if no fresh result ever appears', async () => {
			server.use(
				http.post('/api/networks/:networkId/speedtest', () =>
					HttpResponse.json({ status: 'started' }, { status: 202 })
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

			const assertion = expect(networksStore.runSpeedTest('network-123')).rejects.toThrow(
				/timed out/i
			);

			await vi.advanceTimersByTimeAsync(95_000);
			await assertion;

			expect(get(speedTestState).running).toBe(false);
			expect(get(speedTestState).error).toMatch(/timed out/i);
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

			await expect(networksStore.runSpeedTest('network-123')).rejects.toThrow();

			expect(historyCalls).toBe(0);
			expect(get(speedTestState).running).toBe(false);
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
