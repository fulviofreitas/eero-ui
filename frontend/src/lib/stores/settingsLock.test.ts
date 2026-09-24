/**
 * Tests for the shared per-network settings-class write lock (plan § 5).
 *
 * Coverage: acquire/release, release-on-throw, re-entrancy on the same
 * network throws rather than queuing, different networks are independent,
 * and `resetSettingsLock()` clears held locks for test isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { withSettingsLock, resetSettingsLock } from './settingsLock';

describe('settingsLock', () => {
	beforeEach(() => {
		resetSettingsLock();
	});

	it('acquires and releases the lock around a successful call', async () => {
		const result = await withSettingsLock('network-1', async () => 'ok');

		expect(result).toBe('ok');
		// Released - a follow-up write on the same network succeeds immediately.
		await expect(withSettingsLock('network-1', async () => 'ok again')).resolves.toBe('ok again');
	});

	it('releases the lock even when the wrapped function throws', async () => {
		await expect(
			withSettingsLock('network-1', async () => {
				throw new Error('write failed');
			})
		).rejects.toThrow('write failed');

		// Released despite the throw - a follow-up write on the same network succeeds.
		await expect(withSettingsLock('network-1', async () => 'ok')).resolves.toBe('ok');
	});

	it('rejects re-entrant calls for the same network while one is in flight', async () => {
		let resolveFirst: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		const first = withSettingsLock('network-1', async () => {
			await gate;
			return 'first';
		});

		// Second call for the SAME network must be rejected immediately, not
		// queued behind the first - "never two settings writes in one Save".
		await expect(withSettingsLock('network-1', async () => 'second')).rejects.toThrow(
			/already being applied/i
		);

		resolveFirst!();
		await expect(first).resolves.toBe('first');
	});

	it('treats different networks independently', async () => {
		let resolveFirst: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		const first = withSettingsLock('network-1', async () => {
			await gate;
			return 'first';
		});

		// A different network is not blocked by network-1's in-flight write.
		await expect(withSettingsLock('network-2', async () => 'second')).resolves.toBe('second');

		resolveFirst!();
		await expect(first).resolves.toBe('first');
	});

	it('resetSettingsLock() clears held locks for test isolation', async () => {
		let resolveFirst: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			resolveFirst = resolve;
		});

		// Deliberately leak a held lock (as if a previous test forgot to await it).
		const dangling = withSettingsLock('network-1', async () => {
			await gate;
			return 'first';
		});

		resetSettingsLock();

		// The lock state was reset, so a new call for the same network is
		// accepted even though `dangling` never resolved.
		await expect(withSettingsLock('network-1', async () => 'ok')).resolves.toBe('ok');

		resolveFirst!();
		await dangling;
	});
});
