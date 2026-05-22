/**
 * Tests for the devices store.
 *
 * Tests cover:
 * - assignToProfile: optimistic update, success, rollback on failure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { devicesStore } from './devices';
import { server } from '../../../tests/mocks/server';
import { http, HttpResponse } from 'msw';

// Seed data helpers
const makeDevice = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  url: null,
  mac: `AA:BB:CC:DD:EE:${id}`,
  ip: '192.168.1.1',
  nickname: `Device ${id}`,
  hostname: null,
  display_name: `Device ${id}`,
  manufacturer: null,
  model_name: null,
  device_type: null,
  connected: true,
  wireless: true,
  blocked: false,
  paused: false,
  is_guest: false,
  connection_type: 'wireless' as const,
  signal_strength: null,
  frequency: null,
  connected_to_eero: null,
  last_active: null,
  profile_id: null,
  profile_name: null,
  ...overrides,
});

describe('devicesStore', () => {
  beforeEach(() => {
    devicesStore.clear();
  });

  describe('assignToProfile', () => {
    it('optimistically updates profile_id and profile_name on targeted devices', async () => {
      // Seed the store with two devices
      server.use(
        http.get('/api/devices', () => {
          return HttpResponse.json([makeDevice('dev-1'), makeDevice('dev-2')]);
        })
      );
      await devicesStore.fetch();

      // Kick off assignment (don't await yet) so we can inspect mid-flight
      // We'll just await and verify the post-success state here
      const result = await devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids');

      expect(result).toBe(true);

      const state = get(devicesStore);
      const dev1 = state.devices.find((d) => d.id === 'dev-1');
      const dev2 = state.devices.find((d) => d.id === 'dev-2');

      expect(dev1?.profile_id).toBe('profile-1');
      expect(dev1?.profile_name).toBe('Kids');
      // Unaffected device stays the same
      expect(dev2?.profile_id).toBeNull();
    });

    it('updates multiple devices in a single call', async () => {
      server.use(
        http.get('/api/devices', () => {
          return HttpResponse.json([makeDevice('dev-1'), makeDevice('dev-2'), makeDevice('dev-3')]);
        })
      );
      await devicesStore.fetch();

      await devicesStore.assignToProfile(['dev-1', 'dev-2'], 'profile-2', 'Guests');

      const state = get(devicesStore);
      const dev1 = state.devices.find((d) => d.id === 'dev-1');
      const dev2 = state.devices.find((d) => d.id === 'dev-2');
      const dev3 = state.devices.find((d) => d.id === 'dev-3');

      expect(dev1?.profile_name).toBe('Guests');
      expect(dev2?.profile_name).toBe('Guests');
      expect(dev3?.profile_name).toBeNull();
    });

    it('rolls back on API failure and re-throws', async () => {
      server.use(
        http.get('/api/devices', () => {
          return HttpResponse.json([makeDevice('dev-1', { profile_id: null, profile_name: null })]);
        }),
        http.post('/api/profiles/:profileId/assign-devices', () => {
          return HttpResponse.json({ detail: 'Internal server error' }, { status: 500 });
        })
      );
      await devicesStore.fetch();

      await expect(
        devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids')
      ).rejects.toThrow();

      // Profile should be rolled back to null
      const state = get(devicesStore);
      const dev1 = state.devices.find((d) => d.id === 'dev-1');
      expect(dev1?.profile_id).toBeNull();
      expect(dev1?.profile_name).toBeNull();
    });

    it('rolls back on success=false response and re-throws', async () => {
      server.use(
        http.get('/api/devices', () => {
          return HttpResponse.json([makeDevice('dev-1')]);
        }),
        http.post('/api/profiles/:profileId/assign-devices', () => {
          return HttpResponse.json({
            success: false,
            profile_id: 'profile-1',
            assigned_count: 0,
            message: 'Profile not found',
          });
        })
      );
      await devicesStore.fetch();

      await expect(
        devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids')
      ).rejects.toThrow('Profile not found');

      const state = get(devicesStore);
      const dev1 = state.devices.find((d) => d.id === 'dev-1');
      expect(dev1?.profile_id).toBeNull();
    });

    it('returns true on success', async () => {
      server.use(
        http.get('/api/devices', () => {
          return HttpResponse.json([makeDevice('dev-1')]);
        })
      );
      await devicesStore.fetch();

      const result = await devicesStore.assignToProfile(['dev-1'], 'profile-1', 'Kids');
      expect(result).toBe(true);
    });
  });
});
