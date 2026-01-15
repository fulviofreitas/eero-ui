<!--
  Devices Page
  
  Full device list with filtering, search, and actions.
-->
<script lang="ts">
	import DeviceList from '$components/device/DeviceList.svelte';
</script>

<svelte:head>
	<title>Devices | Eero Dashboard</title>
</svelte:head>

<div class="devices-page">
	<header class="page-header">
		<h1>Devices</h1>
		<p class="text-muted">Manage all devices connected to your network</p>
	</header>

	<DeviceList />
</div>

<style>
	.devices-page {
		max-width: none;
	}

	.page-header {
		margin-bottom: var(--space-6);
	}

	.page-header h1 {
		margin-bottom: var(--space-1);
	}
</style>
