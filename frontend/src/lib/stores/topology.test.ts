/**
 * Hierarchy layout must not stack nodes on top of each other.
 *
 * Regression: leaf eeros were spaced a fixed 280px apart while each one's device grid is up to
 * four 140px columns wide, and the gateway's own clients were drawn 180px below the gateway -
 * i.e. on the leaf-eero row - so eeros disappeared behind devices.
 */

import { describe, it, expect } from 'vitest';
import type { DeviceSummary, EeroSummary } from '$api/types';
import { transformToTopology } from './topology';

const NODE_W = 130;
const NODE_H = 60;

function eero(id: string, location: string, isGateway = false): EeroSummary {
	return {
		id,
		location,
		model: 'eero Pro 6',
		is_gateway: isGateway,
		status: 'green',
		mesh_quality_bars: 5,
		connected_clients_count: 0,
		wired: isGateway,
		ip_address: null,
		firmware_version: null
	} as unknown as EeroSummary;
}

let nextMac = 0;

function device(n: number, eeroLocation: string): DeviceSummary {
	const mac = (nextMac++).toString(16).padStart(4, '0');
	return {
		id: `dev-${eeroLocation}-${n}`,
		mac: `02:00:00:00:${mac.slice(0, 2)}:${mac.slice(2)}`,
		display_name: `Device ${n}`,
		connected: true,
		connected_to_eero: eeroLocation,
		wireless: true
	} as unknown as DeviceSummary;
}

describe('transformToTopology - hierarchy layout', () => {
	it('places every node without overlap, gateway clients below the eero row', () => {
		nextMac = 0;
		const eeros = [
			eero('1', 'Living Room', true),
			eero('2', 'Office'),
			eero('3', 'Upstairs Hall'),
			eero('4', 'Garage')
		];
		const devices = [
			...Array.from({ length: 6 }, (_, i) => device(i, 'Living Room')),
			...Array.from({ length: 7 }, (_, i) => device(i, 'Office')),
			...Array.from({ length: 4 }, (_, i) => device(i, 'Upstairs Hall')),
			device(0, 'Garage')
		];

		const { nodes } = transformToTopology(eeros, devices, 'hierarchy');
		const byId = new Map(nodes.map((n) => [n.id, n]));
		const absolute = nodes.map((n) => {
			const parent = n.parentId ? byId.get(n.parentId) : undefined;
			return {
				id: n.id,
				x: n.position.x + (parent?.position.x ?? 0),
				y: n.position.y + (parent?.position.y ?? 0)
			};
		});

		expect(nodes.filter((n) => n.type === 'device')).toHaveLength(devices.length);

		for (let i = 0; i < absolute.length; i++) {
			for (let j = i + 1; j < absolute.length; j++) {
				const a = absolute[i];
				const b = absolute[j];
				const overlap = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
				expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
			}
		}

		const eeroRowY = byId.get('eero-2')!.position.y;
		const gatewayNode = byId.get('eero-1')!;
		const gatewayDevices = nodes.filter((n) => n.parentId === gatewayNode.id);
		expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
		expect(gatewayDevices).toHaveLength(6);
		for (const d of gatewayDevices) {
			expect(d.position.y + gatewayNode.position.y).toBeGreaterThan(eeroRowY + NODE_H);
		}
	});

	it('sizes and renders devices in the same column when a leaf shares the gateway model', () => {
		nextMac = 0;
		// Leaf listed before the gateway, devices matched by the shared model name only.
		const eeros = [
			{ ...eero('2', 'Office'), model: 'eero 7' },
			{ ...eero('1', 'Living Room', true), model: 'eero 7' },
			eero('3', 'Garage'),
			eero('4', 'Attic')
		] as EeroSummary[];
		const devices = [
			...Array.from({ length: 3 }, (_, i) => device(i, 'eero 7')),
			...Array.from({ length: 3 }, (_, i) => device(i, 'Garage'))
		];

		const { nodes } = transformToTopology(eeros, devices, 'hierarchy');
		const byId = new Map(nodes.map((n) => [n.id, n]));
		const absolute = nodes.map((n) => {
			const parent = n.parentId ? byId.get(n.parentId) : undefined;
			return {
				id: n.id,
				x: n.position.x + (parent?.position.x ?? 0),
				y: n.position.y + (parent?.position.y ?? 0)
			};
		});
		for (let i = 0; i < absolute.length; i++) {
			for (let j = i + 1; j < absolute.length; j++) {
				const [a, b] = [absolute[i], absolute[j]];
				const overlap = Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H;
				expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
			}
		}
	});
});
