<!--
  PremiumGate

  Wraps a premium-only card (insights, data-usage breakdowns, premium DNS
  policies, ...). Renders `children` only once entitlements have loaded AND
  the network is premium; otherwise renders a compact upsell notice — never
  hides the card silently (plan § 7 WP6, .claude/rules/svelte-dashboard.md
  "show don't tell"). While entitlements are still loading, renders nothing
  rather than a flash of the upsell notice for a subscriber whose call is
  simply slow.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { entitlementsStore, isPremium } from '$lib/stores/entitlements';

	interface Props {
		/** Shown in the upsell notice, e.g. "Network insights". */
		feature: string;
		children: Snippet;
	}

	let { feature, children }: Props = $props();

	let loading = $derived($entitlementsStore.loading);
	let known = $derived($entitlementsStore.entitlements !== null);
	let premium = $derived($isPremium === true);
</script>

{#if premium}
	{@render children()}
{:else if known && !loading}
	<div class="premium-gate" role="note">
		<span class="premium-gate-icon"><Icon name="lock" size={20} /></span>
		<div>
			<p class="premium-gate-title">{feature} requires eero Plus/Secure</p>
			<p class="premium-gate-description text-muted">
				Upgrade the network's subscription to unlock this card.
			</p>
		</div>
	</div>
{/if}

<style>
	.premium-gate {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
	}

	.premium-gate-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.premium-gate-title {
		margin: 0 0 var(--space-1);
		font-weight: 500;
	}

	.premium-gate-description {
		margin: 0;
		font-size: var(--text-sm);
	}
</style>
