<!--
  Export Menu Component

  Dropdown button for exporting list data in CSV, JSON, or YAML format. Built on the shared
  Dropdown primitive (keyboard nav, roving tabindex, Escape/outside-click) instead of the
  hand-rolled open-state div this used to be.
-->
<script lang="ts">
	import { exportData, type ExportFormat } from '$lib/utils/export';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons/paths';
	import Dropdown, { type DropdownItem } from './Dropdown.svelte';

	interface Props {
		data?: object[];
		filename?: string;
		disabled?: boolean;
	}

	let { data = [], filename = 'export', disabled = false }: Props = $props();

	const formats: { id: ExportFormat; label: string; icon: IconName }[] = [
		{ id: 'csv', label: 'CSV', icon: 'bar-chart' },
		{ id: 'json', label: 'JSON', icon: 'file-text' },
		{ id: 'yaml', label: 'YAML', icon: 'file-text' }
	];

	function handleExport(format: ExportFormat) {
		if (data.length === 0) return;
		exportData(data, format, filename);
	}

	let items: DropdownItem[] = $derived(
		formats.map((format) => ({
			id: format.id,
			label: format.label,
			icon: format.icon,
			onSelect: () => handleExport(format.id)
		}))
	);
</script>

<Dropdown
	label="Export"
	{items}
	disabled={disabled || data.length === 0}
	triggerClass="btn btn-secondary btn-sm dropdown-trigger"
>
	{#snippet trigger()}
		<Icon name="download" size={14} /> Export
	{/snippet}
</Dropdown>
