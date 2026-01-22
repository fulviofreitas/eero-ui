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
	connectionType?: 'wired' | 'wireless';
}

export interface TopologyState {
	nodes: Node<TopologyNodeData>[];
	edges: Edge<TopologyEdgeData>[];
	loading: boolean;
	error: string | null;
	selectedNodeId: string | null;
}

export type LayoutType = 'hierarchy' | 'radial' | 'horizontal' | 'force';

export type NodeDetailLevel = 'minimal' | 'standard' | 'detailed';

export interface LayoutOptions {
	showDevices: boolean;
	showOfflineDevices: boolean;
	groupByEero: boolean;
	layoutType: LayoutType;
	detailLevel: NodeDetailLevel;
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
	groupByEero: true,
	layoutType: 'hierarchy',
	detailLevel: 'minimal'
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

				// Get current layout type
				let currentLayoutType: LayoutType = 'hierarchy';
				layoutOptionsStore.subscribe((opts) => {
					currentLayoutType = opts.layoutType;
				})();

				const { nodes, edges } = transformToTopology(eeros, devices, currentLayoutType);

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

// ============================================
// Layout Position Calculations
// ============================================

interface LayoutPositions {
	gateway: { x: number; y: number } | null;
	eeros: Map<string, { x: number; y: number }>;
	devices: Map<string, { x: number; y: number }>;
}

function calculateLayoutPositions(
	gateway: EeroSummary | undefined,
	leafEeros: EeroSummary[],
	devices: DeviceSummary[],
	layoutType: LayoutType
): LayoutPositions {
	switch (layoutType) {
		case 'radial':
			return calculateRadialLayout(gateway, leafEeros, devices);
		case 'horizontal':
			return calculateHorizontalLayout(gateway, leafEeros, devices);
		case 'force':
			return calculateForceLayout(gateway, leafEeros, devices);
		case 'hierarchy':
		default:
			return calculateHierarchyLayout(gateway, leafEeros, devices);
	}
}

function calculateHierarchyLayout(
	gateway: EeroSummary | undefined,
	leafEeros: EeroSummary[],
	_devices: DeviceSummary[]
): LayoutPositions {
	const positions: LayoutPositions = {
		gateway: null,
		eeros: new Map(),
		devices: new Map()
	};

	const totalWidth = Math.max(leafEeros.length, 1) * LAYOUT.eeroSpacingX;
	const gatewayX = LAYOUT.startX + totalWidth / 2;

	if (gateway) {
		positions.gateway = { x: gatewayX, y: LAYOUT.gatewayY };
	}

	leafEeros.forEach((eero, index) => {
		positions.eeros.set(eero.id, {
			x: LAYOUT.startX + index * LAYOUT.eeroSpacingX,
			y: LAYOUT.eeroY
		});
	});

	return positions;
}

function calculateRadialLayout(
	gateway: EeroSummary | undefined,
	leafEeros: EeroSummary[],
	_devices: DeviceSummary[]
): LayoutPositions {
	const positions: LayoutPositions = {
		gateway: null,
		eeros: new Map(),
		devices: new Map()
	};

	const centerX = 400;
	const centerY = 300;
	const eeroRadius = 200;

	if (gateway) {
		positions.gateway = { x: centerX, y: centerY };
	}

	const eeroAngleStep = (2 * Math.PI) / Math.max(leafEeros.length, 1);
	leafEeros.forEach((eero, index) => {
		const angle = index * eeroAngleStep - Math.PI / 2;
		positions.eeros.set(eero.id, {
			x: centerX + Math.cos(angle) * eeroRadius,
			y: centerY + Math.sin(angle) * eeroRadius
		});
	});

	return positions;
}

function calculateHorizontalLayout(
	gateway: EeroSummary | undefined,
	leafEeros: EeroSummary[],
	_devices: DeviceSummary[]
): LayoutPositions {
	const positions: LayoutPositions = {
		gateway: null,
		eeros: new Map(),
		devices: new Map()
	};

	const startX = 50;
	const eeroX = 300;
	const eeroSpacingY = 120;
	const totalHeight = Math.max(leafEeros.length, 1) * eeroSpacingY;
	const centerY = totalHeight / 2;

	if (gateway) {
		positions.gateway = { x: startX, y: centerY };
	}

	leafEeros.forEach((eero, index) => {
		positions.eeros.set(eero.id, {
			x: eeroX,
			y: index * eeroSpacingY + 50
		});
	});

	return positions;
}

function calculateForceLayout(
	gateway: EeroSummary | undefined,
	leafEeros: EeroSummary[],
	_devices: DeviceSummary[]
): LayoutPositions {
	const positions: LayoutPositions = {
		gateway: null,
		eeros: new Map(),
		devices: new Map()
	};

	// Simple force-directed simulation starting positions
	const centerX = 400;
	const centerY = 250;
	const spread = 180;

	if (gateway) {
		positions.gateway = { x: centerX, y: centerY };
	}

	// Distribute eeros in a rough organic pattern
	leafEeros.forEach((eero, index) => {
		const angle = (index / leafEeros.length) * 2 * Math.PI + Math.random() * 0.3;
		const radius = spread + Math.random() * 60;
		positions.eeros.set(eero.id, {
			x: centerX + Math.cos(angle) * radius,
			y: centerY + Math.sin(angle) * radius
		});
	});

	return positions;
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
	devices: DeviceSummary[],
	layoutType: LayoutType = 'hierarchy'
): { nodes: Node<TopologyNodeData>[]; edges: Edge<TopologyEdgeData>[] } {
	const nodes: Node<TopologyNodeData>[] = [];
	const edges: Edge<TopologyEdgeData>[] = [];

	// Find gateway eero
	const gateway = eeros.find((e) => e.is_gateway);
	const leafEeros = eeros.filter((e) => !e.is_gateway);

	// Calculate positions based on layout type
	const positions = calculateLayoutPositions(gateway, leafEeros, devices, layoutType);

	// Add gateway node
	if (gateway && positions.gateway) {
		nodes.push({
			id: `eero-${gateway.id}`,
			type: 'gateway',
			position: positions.gateway,
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
	leafEeros.forEach((eero) => {
		const eeroPos = positions.eeros.get(eero.id) || { x: 200, y: 200 };

		nodes.push({
			id: `eero-${eero.id}`,
			type: 'eero',
			position: eeroPos,
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
			// Calculate position RELATIVE to parent eero (not absolute)
			// When using parentId, position is an offset from the parent node
			const devicesPerRow = 4;
			const row = Math.floor(index / devicesPerRow);
			const col = index % devicesPerRow;

			let relX: number;
			let relY: number;

			if (layoutType === 'radial') {
				// Devices fan out from their eero in a semicircle below
				const angleSpread = Math.PI * 0.8; // 144 degrees spread
				const startAngle = Math.PI / 2 - angleSpread / 2; // Start from bottom-left
				const angleStep = allDevices.length > 1 ? angleSpread / (allDevices.length - 1) : 0;
				const angle = startAngle + index * angleStep;
				const radius = 100 + row * 50;
				relX = Math.cos(angle) * radius;
				relY = Math.sin(angle) * radius + 40; // Offset below the eero
			} else if (layoutType === 'horizontal') {
				// Devices to the right of their eero
				relX = 180 + col * 90;
				relY = (index - allDevices.length / 2) * 45;
			} else if (layoutType === 'force') {
				// Devices around their eero in a circle
				const angle = (index / allDevices.length) * 2 * Math.PI;
				const radius = 90 + row * 45;
				relX = Math.cos(angle) * radius;
				relY = Math.sin(angle) * radius + 30;
			} else {
				// Default hierarchy layout - devices below eero in a grid
				const offsetX =
					(col - (Math.min(allDevices.length, devicesPerRow) - 1) / 2) * LAYOUT.deviceSpacingX;
				relX = offsetX;
				relY = 180 + row * LAYOUT.deviceSpacingY; // Offset below parent
			}

			const deviceId = device.mac || device.id || `device-${index}`;

			nodes.push({
				id: `device-${deviceId}`,
				type: 'device',
				parentId: `eero-${eeroId}`, // Link to parent eero - devices move with parent
				position: { x: relX, y: relY }, // Position is now RELATIVE to parent
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
			// Wired: solid green line, Wireless: dotted blue line
			const isWired = !device.wireless;
			const edgeStyle = device.connected
				? isWired
					? 'stroke: #22c55e; stroke-width: 2px;' // Wired: solid green
					: 'stroke: #3b82f6; stroke-width: 1.5px; stroke-dasharray: 6 3;' // Wireless: dotted blue
				: 'stroke: #6b7280; stroke-width: 1px; stroke-dasharray: 4 2;'; // Offline: gray dashed

			edges.push({
				id: `client-${eeroId}-${deviceId}`,
				source: `eero-${eeroId}`,
				target: `device-${deviceId}`,
				type: 'straight',
				style: edgeStyle,
				data: {
					quality: 'good',
					type: 'client',
					connectionType: isWired ? 'wired' : 'wireless'
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
