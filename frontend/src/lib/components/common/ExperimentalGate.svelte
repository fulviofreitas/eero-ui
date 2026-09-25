<!--
  ExperimentalGate

  Wraps an unverified or settings-class write control (plan § 5 write-safety
  policy). Renders `children` only when the operator has set
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES=true` (surfaced via the entitlements
  call, decision 6a); otherwise a muted note naming the env var, so the
  control is visibly present-but-disabled rather than silently missing.

  Bug-fix follow-up (maintainer screenshot, 2026-09-25): a card with several
  gated controls in one section (e.g. SecurityWanCard's Power & Thread
  section) rendered the same note once per gated control - two copies
  stacked in one section. `silent` suppresses the note entirely (children
  still hidden when the gate is off) so a card can render ONE summary note
  itself when any of its gated controls is hidden.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { experimentalWrites } from '$lib/stores/entitlements';

	interface Props {
		children: Snippet;
		/** Hide children when the gate is off, but render no note - the caller renders its own. */
		silent?: boolean;
	}

	let { children, silent = false }: Props = $props();
</script>

{#if $experimentalWrites}
	{@render children()}
{:else if !silent}
	<div class="experimental-gate" role="note">
		<span class="experimental-gate-icon"><Icon name="lock" size={16} /></span>
		<span class="text-muted"
			>Disabled by operator — set <code>EERO_DASHBOARD_EXPERIMENTAL_WRITES=true</code> to enable.</span
		>
	</div>
{/if}

<style>
	.experimental-gate {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		background-color: var(--color-bg-secondary);
		font-size: var(--text-sm);
	}

	.experimental-gate-icon {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.experimental-gate code {
		font-family: var(--font-mono, monospace);
		font-size: var(--text-xs, 0.75em);
	}
</style>
