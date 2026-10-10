/** Network topology data, client grouping, and deterministic layout. */
import { writable, derived } from 'svelte/store';
import type { Node, Edge } from '@xyflow/svelte';
import { api } from '$api/client';
import type { EeroSummary, DeviceSummary } from '$api/types';

export type NodeType = 'gateway' | 'eero' | 'device' | 'clientGroup';
export type EdgeQuality = 'excellent' | 'good' | 'fair' | 'poor';
export type LayoutType = 'hierarchy' | 'radial' | 'horizontal' | 'force';
export type NodeDetailLevel = 'minimal' | 'standard' | 'detailed';

export interface TopologyNodeData extends Record<string, unknown> {
	type: NodeType;
	id: string;
	label: string;
	status: 'online' | 'offline';
	meshQuality?: number;
	deviceCount?: number;
	model?: string;
	isGateway?: boolean;
	wired?: boolean;
	ipAddress?: string;
	firmwareVersion?: string;
	signal?: number;
	connectionType?: 'wired' | 'wireless';
	ip?: string;
	mac?: string;
	manufacturer?: string;
	isBlocked?: boolean;
	isPaused?: boolean;
	profileName?: string;
	eeroLabel?: string;
	detailLevel?: NodeDetailLevel;
	layoutType?: LayoutType;
}

export interface TopologyEdgeData extends Record<string, unknown> {
	quality: EdgeQuality;
	type: 'mesh' | 'client';
	connectionType?: 'wired' | 'wireless';
	/** Distance from the client's left handle to the shared branch above its group. */
	branchOffset?: number;
	previousRowOffset?: number;
	horizontal?: boolean;
}

export interface TopologyState {
	eeros: EeroSummary[];
	devices: DeviceSummary[];
	loading: boolean;
	error: string | null;
}

export interface LayoutOptions {
	showDevices: boolean;
	showOfflineDevices: boolean;
	layoutType: LayoutType;
	detailLevel: NodeDetailLevel;
}

const initialState: TopologyState = {
	eeros: [],
	devices: [],
	loading: false,
	error: null
};

const selectedNodeId = writable<string | null>(null);

export const layoutOptionsStore = writable<LayoutOptions>({
	showDevices: true,
	showOfflineDevices: false,
	layoutType: 'hierarchy',
	detailLevel: 'minimal'
});

function createTopologyStore() {
	const { subscribe, set, update } = writable<TopologyState>(initialState);
	let request = 0;
	return {
		subscribe,
		async loadTopology(): Promise<void> {
			const currentRequest = ++request;
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const [eeros, devices] = await Promise.all([
					api.eeros.list(true),
					api.devices.list({ refresh: true })
				]);
				if (currentRequest !== request) return;
				update((s) => ({ ...s, eeros, devices, loading: false }));
			} catch (error) {
				if (currentRequest !== request) return;
				update((s) => ({
					...s,
					loading: false,
					error: error instanceof Error ? error.message : 'Failed to load topology'
				}));
			}
		},
		selectNode(nodeId: string | null): void {
			selectedNodeId.set(nodeId);
		},
		clear(): void {
			request++;
			selectedNodeId.set(null);
			set(initialState);
		}
	};
}

export const topologyStore = createTopologyStore();

// Filter before laying out: hidden clients must not leave empty groups or large gaps.
export const filteredTopology = derived(
	[topologyStore, layoutOptionsStore],
	([$topology, $options]) => ({
		...transformToTopology(
			$topology.eeros,
			$options.showDevices
				? $topology.devices.filter((d) => $options.showOfflineDevices || d.connected)
				: [],
			$options.layoutType,
			$options.detailLevel
		),
		loading: $topology.loading,
		error: $topology.error
	})
);

export const selectedNode = derived(
	[selectedNodeId, filteredTopology],
	([$id, $graph]) => $graph.nodes.find((n) => n.id === $id) ?? null
);
export const isTopologyLoading = derived(topologyStore, ($store) => $store.loading);

// These dimensions match the node components. Each group has a dedicated left-hand
// connection gutter, so branches never pass through another client's card.
const ROUTER_WIDTH = 180;
const GROUP_WIDTH = 208;
const GROUP_GAP = 24;
const GROUP_HEADER = 64;
const ROW_GAP = 18;
const CLUSTER_GAP = 80;
export const CLIENT_HEIGHT: Record<NodeDetailLevel, number> = {
	minimal: 74,
	standard: 104,
	detailed: 132
};

interface ClientGroup {
	connectionType: 'wired' | 'wireless';
	devices: DeviceSummary[];
}
interface Cluster {
	eero?: EeroSummary;
	groups: ClientGroup[];
	width: number;
	height: number;
	x: number;
	y: number;
	groupY: number;
}

function deviceLabel(device: DeviceSummary): string {
	return (
		device.display_name || device.nickname || device.hostname || device.mac || 'Unknown Device'
	);
}

/** Prefer identity/location; a shared model name cannot identify a particular eero. */
function connectedEero(device: DeviceSummary, eeros: EeroSummary[]): EeroSummary | undefined {
	const name = device.connected_to_eero?.trim().toLowerCase();
	if (!name) return;
	const byId = eeros.find((e) => e.id.toLowerCase() === name);
	if (byId) return byId;
	const byLocation = eeros.filter((e) => e.location?.trim().toLowerCase() === name);
	if (byLocation.length === 1) return byLocation[0];
	const byModel = eeros.filter((e) => e.model.toLowerCase() === name);
	if (byLocation.length === 0 && byModel.length === 1) return byModel[0];
}

function getMeshQuality(bars: number | null | undefined): EdgeQuality {
	if (bars === null || bars === undefined) return 'fair';
	if (bars >= 4) return 'excellent';
	if (bars >= 3) return 'good';
	if (bars >= 2) return 'fair';
	return 'poor';
}

function getQualityColor(quality: EdgeQuality): string {
	return `var(--color-${{ excellent: 'success', good: 'accent', fair: 'warning', poor: 'danger' }[quality]})`;
}

export function transformToTopology(
	eeros: EeroSummary[],
	devices: DeviceSummary[],
	layoutType: LayoutType = 'hierarchy',
	detailLevel: NodeDetailLevel = 'minimal'
): { nodes: Node<TopologyNodeData>[]; edges: Edge<TopologyEdgeData>[] } {
	const nodes: Node<TopologyNodeData>[] = [];
	const edges: Edge<TopologyEdgeData>[] = [];
	const gateway = eeros.find((e) => e.is_gateway);
	const orderedEeros = [...eeros].sort(
		(a, b) =>
			Number(b.is_gateway) - Number(a.is_gateway) ||
			(a.location || a.model).localeCompare(b.location || b.model) ||
			a.id.localeCompare(b.id)
	);
	const byEero = new Map<string | undefined, DeviceSummary[]>();
	for (const device of devices) {
		const id = connectedEero(device, orderedEeros)?.id;
		byEero.set(id, [...(byEero.get(id) ?? []), device]);
	}
	const clientHeight = CLIENT_HEIGHT[detailLevel];
	const groupHeight = (count: number) =>
		GROUP_HEADER + count * (clientHeight + ROW_GAP) - ROW_GAP + 16;
	const clusters: Cluster[] = [...orderedEeros, ...(byEero.has(undefined) ? [undefined] : [])].map(
		(eero) => {
			const clients = byEero.get(eero?.id) ?? [];
			const groups: ClientGroup[] = (['wired', 'wireless'] as const).flatMap((connectionType) => {
				const groupDevices = clients
					.filter((d) => (d.wireless ? 'wireless' : 'wired') === connectionType)
					.sort(
						(a, b) =>
							Number(b.connected) - Number(a.connected) ||
							deviceLabel(a).localeCompare(deviceLabel(b))
					);
				return groupDevices.length ? [{ connectionType, devices: groupDevices }] : [];
			});
			return {
				eero,
				groups,
				width: Math.max(ROUTER_WIDTH, groups.length * (GROUP_WIDTH + GROUP_GAP) - GROUP_GAP),
				height: 200 + Math.max(0, ...groups.map((g) => groupHeight(g.devices.length))),
				x: 0,
				y: 0,
				groupY: 200
			};
		}
	);
	const gatewayCluster = clusters.find((c) => c.eero === gateway && gateway !== undefined);
	const leaves = clusters.filter((c) => c !== gatewayCluster);

	if (layoutType === 'hierarchy' || layoutType === 'horizontal') {
		const eeroY = detailLevel === 'minimal' ? 160 : 220;
		const clientsY = detailLevel === 'minimal' ? 280 : 420;
		// Reserve a dedicated gateway-client column/row between leaf branches.
		const columns = [...leaves];
		if (gatewayCluster?.groups.length)
			columns.splice(Math.ceil(leaves.length / 2), 0, gatewayCluster);
		let cursor = 0;
		for (const cluster of columns) {
			if (layoutType === 'horizontal') {
				cluster.x = cluster === gatewayCluster ? 0 : 300;
				cluster.y = cursor;
				cluster.groupY = 0;
				cursor += Math.max(160, cluster.height - 200) + CLUSTER_GAP;
			} else {
				cluster.x = cursor + (cluster.width - ROUTER_WIDTH) / 2;
				cluster.y = cluster === gatewayCluster ? 0 : eeroY;
				cluster.groupY = clientsY - cluster.y;
				cursor += cluster.width + CLUSTER_GAP;
			}
		}
		if (gatewayCluster && !gatewayCluster.groups.length) {
			gatewayCluster.x =
				layoutType === 'horizontal' ? 0 : Math.max(0, (cursor - CLUSTER_GAP - ROUTER_WIDTH) / 2);
			gatewayCluster.y =
				layoutType === 'horizontal' ? Math.max(0, (cursor - CLUSTER_GAP) / 2 - 40) : 0;
		}
	} else {
		// Size the ring from whole client clusters, rather than just router cards.
		const diameter =
			Math.max(200, ...clusters.map((c) => Math.hypot(c.width, c.height))) + CLUSTER_GAP;
		const radius = Math.max(
			diameter,
			diameter / (2 * Math.sin(Math.PI / Math.max(leaves.length, 2)))
		);
		leaves.forEach((cluster, index) => {
			const angle =
				(index * 2 * Math.PI) / leaves.length - Math.PI / 2 + (layoutType === 'force' ? 0.2 : 0);
			const distance = radius + (layoutType === 'force' ? (index % 2) * 60 : 0);
			cluster.x = Math.cos(angle) * distance;
			cluster.y = Math.sin(angle) * distance;
		});
	}

	for (const cluster of clusters) {
		const { eero, groups } = cluster;
		const eeroId = eero ? `eero-${eero.id}` : undefined;
		const eeroLabel = eero ? eero.location || eero.model || 'Eero' : 'Unassigned clients';
		if (eero && eeroId) {
			nodes.push({
				id: eeroId,
				type: eero.is_gateway ? 'gateway' : 'eero',
				position: { x: cluster.x, y: cluster.y },
				zIndex: 0,
				data: {
					type: eero.is_gateway ? 'gateway' : 'eero',
					id: eero.id,
					label: eeroLabel,
					status: eero.status === 'green' ? 'online' : 'offline',
					meshQuality: eero.is_gateway ? 5 : (eero.mesh_quality_bars ?? 0),
					deviceCount: eero.connected_clients_count,
					model: eero.model,
					isGateway: eero.is_gateway,
					wired: eero.wired,
					ipAddress: eero.ip_address || undefined,
					firmwareVersion: eero.firmware_version || undefined,
					detailLevel,
					layoutType
				}
			});
			if (gateway && eero !== gateway) {
				const quality = getMeshQuality(eero.mesh_quality_bars);
				edges.push({
					id: `mesh-${gateway.id}-${eero.id}`,
					source: `eero-${gateway.id}`,
					target: eeroId,
					type: 'smoothstep',
					zIndex: 0,
					style: `stroke: ${getQualityColor(quality)}; stroke-width: 2px;`,
					data: { quality, type: 'mesh' }
				});
			}
		}
		groups.forEach((group, groupIndex) => {
			const groupX =
				layoutType === 'horizontal'
					? (cluster === gatewayCluster ? 560 : 260) + groupIndex * (GROUP_WIDTH + GROUP_GAP)
					: (ROUTER_WIDTH - cluster.width) / 2 + groupIndex * (GROUP_WIDTH + GROUP_GAP);
			const origin = eero ? { x: 0, y: 0 } : { x: cluster.x, y: cluster.y };
			const groupId = `clients-${eero?.id ?? 'unassigned'}-${group.connectionType}`;
			nodes.push({
				id: groupId,
				type: 'clientGroup',
				parentId: eeroId,
				position: { x: origin.x + groupX, y: origin.y + cluster.groupY },
				width: GROUP_WIDTH,
				height: groupHeight(group.devices.length),
				zIndex: -1,
				selectable: false,
				draggable: false,
				focusable: false,
				data: {
					type: 'clientGroup',
					id: groupId,
					label: group.connectionType === 'wired' ? 'Wired clients' : 'Wireless clients',
					status: 'online',
					connectionType: group.connectionType,
					eeroLabel,
					deviceCount: group.devices.length
				}
			});
			group.devices.forEach((device, index) => {
				const deviceId = device.mac || device.id || `${groupId}-${index}`;
				nodes.push({
					id: `device-${deviceId}`,
					type: 'device',
					parentId: eeroId,
					position: {
						x: origin.x + groupX + 32,
						y: origin.y + cluster.groupY + GROUP_HEADER + index * (clientHeight + ROW_GAP)
					},
					draggable: false,
					zIndex: 2,
					data: {
						type: 'device',
						id: deviceId,
						label: deviceLabel(device),
						status: device.connected ? 'online' : 'offline',
						signal: device.signal_strength ?? undefined,
						connectionType: group.connectionType,
						eeroLabel: eero ? eeroLabel : 'Unknown eero',
						ip: device.ip || undefined,
						mac: device.mac || undefined,
						manufacturer: device.manufacturer || undefined,
						isBlocked: device.blocked,
						isPaused: device.paused,
						profileName: device.profile_name || undefined,
						detailLevel,
						layoutType
					}
				});
				if (!eeroId) return;
				const color = group.connectionType === 'wired' ? 'success' : 'accent';
				edges.push({
					id: `client-${eero!.id}-${deviceId}`,
					source: eeroId,
					target: `device-${deviceId}`,
					type: 'client',
					zIndex: 1,
					style: `stroke: var(--color-${device.connected ? color : 'text-muted'}); stroke-width: 1.5px;${group.connectionType === 'wireless' || !device.connected ? ' stroke-dasharray: 5 4;' : ''}`,
					data: {
						quality: 'good',
						type: 'client',
						connectionType: group.connectionType,
						branchOffset: GROUP_HEADER + index * (clientHeight + ROW_GAP) + clientHeight / 2 + 24,
						previousRowOffset: index > 0 ? clientHeight + ROW_GAP : undefined,
						horizontal: layoutType === 'horizontal'
					}
				});
			});
		});
	}
	return { nodes, edges };
}
