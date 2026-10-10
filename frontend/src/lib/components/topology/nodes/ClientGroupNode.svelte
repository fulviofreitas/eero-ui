<script lang="ts">
	import type { TopologyNodeData } from '#lib/stores/topology.js';
	import Icon from '$components/common/Icon.svelte';
	let { data }: { data: TopologyNodeData } = $props();
</script>

<div class="client-group" class:wired={data.connectionType === 'wired'}>
	<div class="group-heading">
		<Icon name={data.connectionType === 'wired' ? 'ethernet' : 'wifi'} size={14} />
		<strong>{data.label}</strong>
		<span class="count">{data.deviceCount}</span>
	</div>
	<div class="group-parent" title={data.eeroLabel}>{data.eeroLabel}</div>
</div>

<style>
	.client-group {
		--group-color: var(--color-accent);
		width: 100%;
		height: 100%;
		border: 1px solid color-mix(in srgb, var(--group-color) 40%, var(--color-border));
		border-radius: 12px;
		background: color-mix(in srgb, var(--group-color) 10%, var(--color-bg-primary));
		padding: 12px 12px 12px 32px;
		pointer-events: none;
	}

	.client-group.wired {
		--group-color: var(--color-success);
	}

	.group-heading {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-text-primary);
		font-size: 11px;
		white-space: nowrap;
	}

	.count {
		margin-left: auto;
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
	}

	.group-parent {
		margin-top: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
