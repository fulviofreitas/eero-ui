<!--
  Account Page

  phase-6.0-revamp.md § 7 WP7, family 9: the current account's profile and
  its write controls. Data fetching + layout only - all behaviour lives in
  AccountCard.svelte.
-->
<script lang="ts">
	import AccountCard from '$lib/components/account/AccountCard.svelte';
</script>

<svelte:head>
	<title>Account | Eero Dashboard</title>
</svelte:head>

<div class="account-page">
	<header class="page-header">
		<h1>Account</h1>
		<p class="text-muted">Manage your eero account profile</p>
	</header>

	<AccountCard />
</div>

<style>
	.account-page {
		padding: var(--space-6);
		max-width: 640px;
	}

	.page-header {
		margin-bottom: var(--space-6);
	}

	.page-header h1 {
		margin: 0;
	}
</style>
