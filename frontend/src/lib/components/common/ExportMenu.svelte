<!--
  Export Menu Component
  
  Dropdown button for exporting list data in CSV, JSON, or YAML format.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { exportData, type ExportFormat } from '$lib/utils/export';

	export let data: object[] = [];
	export let filename = 'export';
	export let disabled = false;

	let open = false;

	const formats: { id: ExportFormat; label: string; icon: string }[] = [
		{ id: 'csv', label: 'CSV', icon: '📊' },
		{ id: 'json', label: 'JSON', icon: '{ }' },
		{ id: 'yaml', label: 'YAML', icon: '📄' }
	];

	function handleExport(format: ExportFormat) {
		if (data.length === 0) return;
		exportData(data, format, filename);
		open = false;
	}

	onMount(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as HTMLElement;
			if (!target.closest('.export-menu')) {
				open = false;
			}
		}

		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="export-menu">
	<button
		class="btn btn-secondary btn-sm"
		on:click={() => (open = !open)}
		disabled={disabled || data.length === 0}
		title={data.length === 0 ? 'No data to export' : 'Export data'}
	>
		⬇ Export
	</button>
	{#if open}
		<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
		<div class="export-dropdown" on:click|stopPropagation>
			<div class="export-dropdown-header">
				<span class="text-sm text-muted">Export {data.length} items as</span>
			</div>
			{#each formats as format}
				<button class="export-option" on:click={() => handleExport(format.id)}>
					<span class="export-icon">{format.icon}</span>
					<span>{format.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.export-menu {
		position: relative;
	}

	.export-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: var(--space-1);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 180px;
		z-index: 100;
	}

	.export-dropdown-header {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border-muted);
	}

	.export-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		text-align: left;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: background-color var(--transition-fast);
	}

	.export-option:hover {
		background-color: var(--color-bg-primary);
	}

	.export-option:first-of-type {
		border-radius: 0;
	}

	.export-option:last-of-type {
		border-radius: 0 0 var(--radius-md) var(--radius-md);
	}

	.export-icon {
		width: 24px;
		text-align: center;
		font-size: 0.875rem;
	}
</style>
