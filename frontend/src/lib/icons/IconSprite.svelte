<!--
  Icon sprite

  Emits one hidden <symbol> per entry in ICON_PATHS, mounted once near the root of the app
  (see routes/+layout.svelte). Icon.svelte references a symbol by id via <use href="#icon-{name}">.
  Keeping the symbols in one injected sprite (rather than repeating the <svg> markup at every call
  site) is what makes ~190 emoji-as-icon call sites collapse into one small component plus this.
-->
<script lang="ts">
	import { ICON_PATHS } from './paths';
</script>

<svg aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden">
	{#each Object.entries(ICON_PATHS) as [name, d] (name)}
		<symbol id="icon-{name}" viewBox="0 0 24 24">
			<path
				{d}
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</symbol>
	{/each}
</svg>
