<!--
  Icon

  The single icon component that replaces emoji-as-iconography across the app. Renders a
  `<use>` reference into the sprite injected once by `IconSprite.svelte` (mounted in the root
  layout). Uses `currentColor`, so any status colour token (`.text-success`, `.text-danger`, …)
  set via `color` on an ancestor applies to the icon automatically.

  Accessibility contract:
  - Decorative (default): `aria-hidden="true"`, no role — the icon adds nothing a screen reader
    user needs, because the adjacent text already says it (e.g. a nav label, a button caption).
  - Meaningful (`label` provided): `role="img"` and `aria-label={label}` — use this only when the
    icon is the ONLY conveyor of information (e.g. an icon-only button with no visible text).
-->
<script lang="ts">
	import type { IconName } from '$lib/icons/paths';

	interface Props {
		name: IconName;
		size?: number;
		/** Provide only when the icon carries meaning with no adjacent text label. */
		label?: string | undefined;
	}

	let { name, size = 16, label = undefined }: Props = $props();
</script>

{#if label}
	<svg class="icon" width={size} height={size} role="img" aria-label={label} focusable="false">
		<use href="#icon-{name}" />
	</svg>
{:else}
	<svg class="icon" width={size} height={size} aria-hidden="true" focusable="false">
		<use href="#icon-{name}" />
	</svg>
{/if}

<style>
	.icon {
		display: inline-block;
		vertical-align: middle;
		flex-shrink: 0;
		color: inherit;
	}
</style>
