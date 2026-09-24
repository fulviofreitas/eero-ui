<!--
  Error boundary (WP5 A14)

  SvelteKit's default unstyled "500"/"404" text page, wrapped in the same ErrorState component
  used for inline data-fetch failures elsewhere, so a routing/load error looks like the rest of
  the app instead of a bare browser-default page.
-->
<script lang="ts">
	import { page } from '$app/stores';
	import ErrorState from '$components/common/ErrorState.svelte';

	let message = $derived($page.error?.message || 'Something went wrong.');
</script>

<svelte:head>
	<title>Error | Eero Dashboard</title>
</svelte:head>

<div class="error-page">
	<ErrorState message="{$page.status}: {message}" />
</div>

<style>
	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
	}
</style>
