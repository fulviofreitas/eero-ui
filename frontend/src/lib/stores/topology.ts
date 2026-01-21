/**
 * Topology Store
 *
 * Manages network topology data (nodes and edges) for visualization.
 */

import { writable, derived } from 'svelte/store';
import type { Node, Edge } from '@xyflow/svelte';
import { api } from '$api/client';
import type { EeroSummary, DeviceSummary } from '$api/types';

// ============================================
// Types
// ============================================

export type NodeType = 'gateway' | 'eero' | 'device';
export type EdgeQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface TopologyNodeData extends Record<string, unknown> {
	type: NodeType;
	id: string;
	label: string;
	status: 'online' | 'offline';
	// Eero-specific
	meshQuality?: number;
	deviceCount?: number;
	model?: string;
	isGateway?: boolean;
	wired?: boolean;
	ipAddress?: string;
	firmwareVersion?: string;
	// Device-specific
	signal?: number;
	connectionType?: 'wired' | 'wireless';
	ip?: string;
	mac?: string;
	manufacturer?: string;
	isBlocked?: boolean;
	isPaused?: boolean;
	profileName?: string;
}

export interface TopologyEdgeData extends Record<string, unknown> {
	quality: EdgeQuality;
	type: 'mesh' | 'client';
}

export interface TopologyState {
	nodes: Node<TopologyNodeData>[];
	edges: Edge<TopologyEdgeData>[];
	loading: boolean;
	error: string | null;
	selectedNodeId: string | null;
}

export interface LayoutOptions {
	showDevices: boolean;
	showOfflineDevices: boolean;
	groupByEero: boolean;
}

// ============================================
// Layout Constants
// ============================================

const LAYOUT = {
	gatewayY: 50,
	eeroY: 220,
	deviceY: 420,
	eeroSpacingX: 280,
	deviceSpacingX: 140,
	deviceSpacingY: 80,
	startX: 100
};

// ============================================
// Stores
// ============================================

const initialState: TopologyState = {
	nodes: [],
	edges: [],
	loading: false,
	error: null,
	selectedNodeId: null
};

const initialLayoutOptions: LayoutOptions = {
	showDevices: true,
	showOfflineDevices: false,
	groupByEero: true
};

function createTopologyStore() {
	const { subscribe, set, update } = writable<TopologyState>(initialState);

	return {
		subscribe,

		/**
		 * Load topology data from API
		 */
		async loadTopology(): Promise<void> {
			update((s) => ({ ...s, loading: true, error: null }));

			try {
				// Fetch eeros and devices in parallel
				const [eeros, devices] = await Promise.all([
					api.eeros.list(true),
					api.devices.list({ refresh: true })
				]);

				const { nodes, edges } = transformToTopology(eeros, devices);

				update((s) => ({
					...s,
					nodes,
					edges,
					loading: false
				}));
			} catch (error) {
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load topology'
				}));
			}
		},

		/**
		 * Update node position (for drag-and-drop)
		 */
		updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
			update((s) => ({
				...s,
				nodes: s.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node))
			}));
		},

		/**
		 * Select a node for the details panel
		 */
		selectNode(nodeId: string | null): void {
			update((s) => ({ ...s, selectedNodeId: nodeId }));
		},

		/**
		 * Clear the store
		 */
		clear(): void {
			set(initialState);
		}
	};
}

export const topologyStore = createTopologyStore();
export const layoutOptionsStore = writable<LayoutOptions>(initialLayoutOptions);

// Derived: selected node data
export const selectedNode = derived(
	topologyStore,
	($store) => $store.nodes.find((n) => n.id === $store.selectedNodeId) ?? null
);

// Derived: filtered nodes based on layout options
export const filteredTopology = derived(
	[topologyStore, layoutOptionsStore],
	([$topology, $options]) => {
		let nodes = [...$topology.nodes];
		let edges = [...$topology.edges];

		// Filter out devices if not showing
		if (!$options.showDevices) {
			const deviceIds = new Set(nodes.filter((n) => n.data.type === 'device').map((n) => n.id));
			nodes = nodes.filter((n) => n.data.type !== 'device');
			edges = edges.filter((e) => !deviceIds.has(e.target));
		}

		// Filter out offline devices if not showing
		if (!$options.showOfflineDevices) {
			const offlineDeviceIds = new Set(
				nodes
					.filter((n) => n.data.type === 'device' && n.data.status === 'offline')
					.map((n) => n.id)
			);
			nodes = nodes.filter((n) => n.data.type !== 'device' || n.data.status !== 'offline');
			edges = edges.filter((e) => !offlineDeviceIds.has(e.target));
		}

		return { nodes, edges, loading: $topology.loading, error: $topology.error };
	}
);

// Derived: loading state
export const isTopologyLoading = derived(topologyStore, ($store) => $store.loading);

// ============================================
// Transform Functions
// ============================================

function getMeshQuality(bars: number | null | undefined): EdgeQuality {
	if (bars === null || bars === undefined) return 'fair';
	if (bars >= 4) return 'excellent';
	if (bars >= 3) return 'good';
	if (bars >= 2) return 'fair';
	return 'poor';
}

function groupDevicesByEero(
	devices: DeviceSummary[],
	eeros: EeroSummary[]
): Record<string, DeviceSummary[]> {
	const groups: Record<string, DeviceSummary[]> = {};

	// Initialize groups for each eero
	eeros.forEach((eero) => {
		groups[eero.id] = [];
	});

	// Add default group for ungrouped devices
	groups['unknown'] = [];

	// Group devices by connected eero
	devices.forEach((device) => {
		// Find which eero this device is connected to
		const connectedEero = eeros.find(
			(e) => e.location === device.connected_to_eero || e.model === device.connected_to_eero
		);

		if (connectedEero) {
			groups[connectedEero.id].push(device);
		} else if (device.connected_to_eero) {
			// Try to match by name if we couldn't find by id
			const matchedEero = eeros.find(
				(e) =>
					(e.location && e.location.toLowerCase() === device.connected_to_eero?.toLowerCase()) ||
					(e.model && e.model.toLowerCase() === device.connected_to_eero?.toLowerCase())
			);
			if (matchedEero) {
				groups[matchedEero.id].push(device);
			} else {
				groups['unknown'].push(device);
			}
		} else {
			groups['unknown'].push(device);
		}
	});

	return groups;
}

function transformToTopology(
	eeros: EeroSummary[],
	devices: DeviceSummary[]
): { nodes: Node<TopologyNodeData>[]; edges: Edge<TopologyEdgeData>[] } {
	const nodes: Node<TopologyNodeData>[] = [];
	const edges: Edge<TopologyEdgeData>[] = [];

	// Find gateway eero
	const gateway = eeros.find((e) => e.is_gateway);
	const leafEeros = eeros.filter((e) => !e.is_gateway);

	// Calculate center position for gateway
	const totalWidth = Math.max(leafEeros.length, 1) * LAYOUT.eeroSpacingX;
	const gatewayX = LAYOUT.startX + totalWidth / 2;

	// Add gateway node
	if (gateway) {
		nodes.push({
			id: `eero-${gateway.id}`,
			type: 'gateway',
			position: { x: gatewayX, y: LAYOUT.gatewayY },
			data: {
				type: 'gateway',
				id: gateway.id,
				label: gateway.location || gateway.model || 'Gateway',
				status: gateway.status === 'green' ? 'online' : 'offline',
				meshQuality: 5, // Gateway always has full signal
				deviceCount: gateway.connected_clients_count,
				model: gateway.model,
				isGateway: true,
				wired: gateway.wired,
				ipAddress: gateway.ip_address || undefined,
				firmwareVersion: gateway.firmware_version || undefined
			}
		});
	}

	// Add leaf eero nodes
	leafEeros.forEach((eero, index) => {
		const x = LAYOUT.startX + index * LAYOUT.eeroSpacingX;
		const y = LAYOUT.eeroY;

		nodes.push({
			id: `eero-${eero.id}`,
			type: 'eero',
			position: { x, y },
			data: {
				type: 'eero',
				id: eero.id,
				label: eero.location || eero.model || 'Eero',
				status: eero.status === 'green' ? 'online' : 'offline',
				meshQuality: eero.mesh_quality_bars || 0,
				deviceCount: eero.connected_clients_count,
				model: eero.model,
				isGateway: false,
				wired: eero.wired,
				ipAddress: eero.ip_address || undefined,
				firmwareVersion: eero.firmware_version || undefined
			}
		});

		// Create mesh edge from gateway to leaf eero
		if (gateway) {
			edges.push({
				id: `mesh-${gateway.id}-${eero.id}`,
				source: `eero-${gateway.id}`,
				target: `eero-${eero.id}`,
				type: 'smoothstep',
				animated: eero.mesh_quality_bars !== null && eero.mesh_quality_bars < 2,
				style: `stroke: ${getQualityColor(getMeshQuality(eero.mesh_quality_bars))}; stroke-width: 2px;`,
				data: {
					quality: getMeshQuality(eero.mesh_quality_bars),
					type: 'mesh'
				}
			});
		}
	});

	// Group devices by their connected eero
	const devicesByEero = groupDevicesByEero(devices, eeros);

	// Add device nodes and edges
	Object.entries(devicesByEero).forEach(([eeroId, eeroDevices]) => {
		if (eeroDevices.length === 0) return;

		const eeroNode = nodes.find((n) => n.id === `eero-${eeroId}`);
		if (!eeroNode) return;

		const connectedDevices = eeroDevices.filter((d) => d.connected);
		const disconnectedDevices = eeroDevices.filter((d) => !d.connected);
		const allDevices = [...connectedDevices, ...disconnectedDevices];

		allDevices.forEach((device, index) => {
			// Calculate position relative to parent eero
			const devicesPerRow = 4;
			const row = Math.floor(index / devicesPerRow);
			const col = index % devicesPerRow;
			const offsetX =
				(col - (Math.min(allDevices.length, devicesPerRow) - 1) / 2) * LAYOUT.deviceSpacingX;

			const x = eeroNode.position.x + offsetX;
			const y = LAYOUT.deviceY + row * LAYOUT.deviceSpacingY;

			const deviceId = device.mac || device.id || `device-${index}`;

			nodes.push({
				id: `device-${deviceId}`,
				type: 'device',
				position: { x, y },
				data: {
					type: 'device',
					id: deviceId,
					label:
						device.display_name ||
						device.nickname ||
						device.hostname ||
						device.mac ||
						'Unknown Device',
					status: device.connected ? 'online' : 'offline',
					signal: device.signal_strength || undefined,
					connectionType: device.wireless ? 'wireless' : 'wired',
					ip: device.ip || undefined,
					mac: device.mac || undefined,
					manufacturer: device.manufacturer || undefined,
					isBlocked: device.blocked,
					isPaused: device.paused,
					profileName: device.profile_name || undefined
				}
			});

			// Create edge from eero to device
			edges.push({
				id: `client-${eeroId}-${deviceId}`,
				source: `eero-${eeroId}`,
				target: `device-${deviceId}`,
				type: 'straight',
				style: device.connected
					? 'stroke: #3b82f6; stroke-width: 1px;'
					: 'stroke: #6b7280; stroke-width: 1px; stroke-dasharray: 4 2;',
				data: {
					quality: 'good',
					type: 'client'
				}
			});
		});
	});

	return { nodes, edges };
}

function getQualityColor(quality: EdgeQuality): string {
	switch (quality) {
		case 'excellent':
			return '#22c55e';
		case 'good':
			return '#3b82f6';
		case 'fair':
			return '#f59e0b';
		case 'poor':
			return '#ef4444';
		default:
			return '#6b7280';
	}
}
