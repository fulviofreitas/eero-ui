<!--
  PremiumGate

  Wraps a premium-only card (insights, data-usage breakdowns, premium DNS
  policies, ...). Renders `children` only once entitlements have loaded AND
  the network is premium; otherwise renders a compact upsell notice — never
  hides the card silently (plan § 7 WP6, .claude/rules/svelte-dashboard.md
  "show don't tell"). While entitlements are still loading, renders nothing
  rather than a flash of the upsell notice for a subscriber whose call is
  simply slow.

  Bug-fix follow-up (maintainer feedback, 6.0.0):
  - The upsell notice was a two-line title+description block with padding
    that read as an empty card body on cards with little else around it -
    now a single compact line (icon + one sentence), with an optional
    "detected: <tier>" muted sub-line when the backend's `premium_tier`/
    `premium_signals` best-effort detail is available.
  - `is_premium: null` ("unknown" - the backend's own detection was
    inconclusive, not "not premium") no longer renders the upsell at all:
    it renders `children` with a muted "subscription status unknown" note,
    since blocking a possibly-premium network's card behind an upsell it
    doesn't need is worse than showing the card with a caveat.
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
	let entitlements = $derived($entitlementsStore.entitlements);
	let known = $derived(entitlements !== null);
	let premium = $derived($isPremium === true);
	/** The backend's own detection was inconclusive - distinct from "confirmed not premium". */
	let unknown = $derived(known && entitlements?.is_premium === null);
	let detectedTier = $derived(entitlements?.premium_tier ?? null);
</script>

{#if premium || unknown}
	{@render children()}
	{#if unknown}
		<p class="premium-gate-unknown text-muted text-sm" role="note">
			Subscription status unknown{detectedTier ? ` (detected: ${detectedTier})` : ''}.
		</p>
	{/if}
{:else if known && !loading}
	<div class="premium-gate" role="note">
		<Icon name="lock" size={14} />
		<span>{feature} requires eero Plus/Secure to unlock this card.</span>
		{#if detectedTier}
			<span class="premium-gate-detected text-muted">detected: {detectedTier}</span>
		{/if}
	</div>
{/if}

<style>
	.premium-gate {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		flex-wrap: wrap;
	}

	.premium-gate-detected {
		margin-left: auto;
		font-size: var(--text-xs);
	}

	.premium-gate-unknown {
		margin: var(--space-2) 0 0;
	}
</style>
