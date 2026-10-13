<script lang="ts">
	import { BaseEdge, type EdgeProps } from '@xyflow/svelte';
	import type { TopologyEdgeData } from '#lib/stores/topology.js';
	let { id, sourceX, sourceY, targetX, targetY, data, style }: EdgeProps = $props();
	let branch = $derived(data as TopologyEdgeData | undefined);
	let railX = $derived(targetX - 18);
	let branchY = $derived(targetY - (branch?.branchOffset ?? 0));
	let path = $derived(
		branch?.previousRowOffset
			? `M ${railX} ${targetY - branch.previousRowOffset} V ${targetY} H ${targetX}`
			: branch?.horizontal
				? `M ${sourceX} ${sourceY} H ${sourceX + 24} V ${branchY} H ${railX} V ${targetY} H ${targetX}`
				: `M ${sourceX} ${sourceY} V ${branchY} H ${railX} V ${targetY} H ${targetX}`
	);
</script>

<BaseEdge {id} {path} {style} />
