<!--
  Command Palette

  ⌘K / Ctrl+K global search over devices, eeros, profiles and networks (WP9 § 6.2 Tier 3). Built
  on the Modal primitive (`size="lg"` - see Modal.svelte) rather than a bespoke overlay, so it
  inherits the shared backdrop/focus-trap/Escape/focus-restore behaviour for free.

  Data comes from the existing stores where they exist (devicesStore, networksStore) and directly
  from the API client for eeros/profiles, which have no dedicated store yet - fetched lazily, once,
  the first time the palette opens with an empty cache.

  Ranking is a simple case-insensitive prefix > substring score across each entity's searchable
  fields (name/hostname/ip/mac for devices, location/model/serial for eeros, name for profiles and
  networks), grouped by entity type and capped at 8 results per group. Recent selections (up to 5)
  are remembered in localStorage and shown when the query is empty.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import Modal from './Modal.svelte';
	import Icon from './Icon.svelte';
	import { devicesStore, networksStore } from '$stores';
	import { api } from '$api/client';
	import type { EeroSummary, ProfileSummary } from '$api/types';

	interface PaletteItem {
		id: string;
		group: 'Devices' | 'Eeros' | 'Profiles' | 'Networks';
		label: string;
		sublabel: string;
		href: string;
		fields: string[];
	}

	interface Props {
		open: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const RECENTS_KEY = 'commandPalette:recent';
	const MAX_RECENTS = 5;
	const MAX_PER_GROUP = 8;
	const GROUP_ORDER: PaletteItem['group'][] = ['Devices', 'Eeros', 'Profiles', 'Networks'];

	function loadRecents(): PaletteItem[] {
		if (typeof localStorage === 'undefined') return [];
		try {
			const stored = localStorage.getItem(RECENTS_KEY);
			if (!stored) return [];
			const parsed = JSON.parse(stored);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	let recents: PaletteItem[] = $state(loadRecents());

	function rememberRecent(item: PaletteItem) {
		recents = [item, ...recents.filter((r) => r.id !== item.id)].slice(0, MAX_RECENTS);
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
		} catch {
			// Storage can be unavailable (private mode quota, etc.) - recents just won't persist.
		}
	}

	let query = $state('');
	let activeIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let eeros: EeroSummary[] = $state([]);
	let profiles: ProfileSummary[] = $state([]);
	let loadingExtra = $state(false);

	async function ensureData() {
		if ($devicesStore.devices.length === 0) devicesStore.fetch();
		if ($networksStore.networks.length === 0) networksStore.fetch();
		if (eeros.length > 0 && profiles.length > 0) return;

		loadingExtra = true;
		try {
			const [eeroResult, profileResult] = await Promise.all([
				eeros.length === 0 ? api.eeros.list() : Promise.resolve(eeros),
				profiles.length === 0 ? api.profiles.list() : Promise.resolve(profiles)
			]);
			eeros = eeroResult;
			profiles = profileResult;
		} catch {
			// Best-effort - the palette still searches whatever loaded successfully.
		} finally {
			loadingExtra = false;
		}
	}

	$effect(() => {
		if (!open) return;
		query = '';
		activeIndex = 0;
		// `ensureData` reads devicesStore/networksStore and may call their `.fetch()`, which
		// notifies those stores and would otherwise make *this* effect depend on them too -
		// re-running (and re-fetching) every time either store updates. `untrack` limits this
		// effect's dependency to `open` alone, so it runs once per open transition.
		untrack(() => ensureData());
		queueMicrotask(() => inputEl?.focus());
	});

	const deviceItems = $derived.by<PaletteItem[]>(() =>
		$devicesStore.devices
			.filter((d) => d.id)
			.map((d) => ({
				id: `device:${d.id}`,
				group: 'Devices' as const,
				label: d.display_name || d.nickname || d.hostname || d.mac || 'Unknown device',
				sublabel: [d.ip, d.mac].filter(Boolean).join(' · '),
				href: `/devices/${d.id}`,
				fields: [d.display_name, d.nickname, d.hostname, d.ip, d.mac].filter(
					(v): v is string => !!v
				)
			}))
	);

	const eeroItems = $derived.by<PaletteItem[]>(() =>
		eeros
			.filter((e) => e.id)
			.map((e) => ({
				id: `eero:${e.id}`,
				group: 'Eeros' as const,
				label: e.location || e.model,
				sublabel: [e.model, e.serial].filter(Boolean).join(' · '),
				href: `/eeros/${e.id}`,
				fields: [e.location, e.model, e.serial].filter((v): v is string => !!v)
			}))
	);

	const profileItems = $derived.by<PaletteItem[]>(() =>
		profiles
			.filter((p) => p.id)
			.map((p) => ({
				id: `profile:${p.id}`,
				group: 'Profiles' as const,
				label: p.name,
				sublabel: `${p.device_count} device(s)`,
				href: `/profiles/${p.id}`,
				fields: [p.name].filter((v): v is string => !!v)
			}))
	);

	const networkItems = $derived.by<PaletteItem[]>(() =>
		$networksStore.networks.map((n) => ({
			id: `network:${n.id}`,
			group: 'Networks' as const,
			label: n.name,
			sublabel: n.status,
			href: `/network/${n.id}`,
			fields: [n.name]
		}))
	);

	const allItems = $derived([...deviceItems, ...eeroItems, ...profileItems, ...networkItems]);

	/** Case-insensitive prefix (2) > substring (1) > no match (-1). Best field wins. */
	function scoreItem(item: PaletteItem, q: string): number {
		let best = -1;
		for (const field of item.fields) {
			const lower = field.toLowerCase();
			if (lower.startsWith(q)) return 2;
			if (lower.includes(q)) best = 1;
		}
		return best;
	}

	interface PaletteGroup {
		label: PaletteItem['group'] | 'Recent';
		items: PaletteItem[];
	}

	const groups = $derived.by<PaletteGroup[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) {
			return recents.length > 0 ? [{ label: 'Recent', items: recents }] : [];
		}

		const scored = allItems
			.map((item) => ({ item, score: scoreItem(item, q) }))
			.filter((entry) => entry.score >= 0)
			.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));

		const byGroup = new SvelteMap<string, PaletteItem[]>();
		for (const { item } of scored) {
			const list = byGroup.get(item.group) ?? [];
			if (list.length < MAX_PER_GROUP) {
				list.push(item);
				byGroup.set(item.group, list);
			}
		}
		return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
			label: g,
			items: byGroup.get(g)!
		}));
	});

	const flatItems = $derived(groups.flatMap((g) => g.items));

	// Reset the highlighted row whenever the query itself changes (a fresh result set should
	// highlight its first row) - depends only on `query`, a plain $state string, so it can never
	// cascade into the store-driven effect above.
	$effect(() => {
		void query;
		activeIndex = 0;
	});

	function activate(item: PaletteItem) {
		rememberRecent(item);
		open = false;
		goto(item.href);
	}

	function close() {
		open = false;
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (flatItems.length === 0 && event.key !== 'Escape') return;
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				activeIndex = (activeIndex + 1) % flatItems.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = (activeIndex - 1 + flatItems.length) % flatItems.length;
				break;
			case 'Home':
				event.preventDefault();
				activeIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				activeIndex = flatItems.length - 1;
				break;
			case 'Enter':
				event.preventDefault();
				activate(flatItems[activeIndex]);
				break;
		}
	}
</script>

<Modal {open} title="Search" onClose={close} size="lg">
	<div class="command-palette">
		<div class="cp-input-wrapper">
			<Icon name="search" size={16} />
			<input
				bind:this={inputEl}
				bind:value={query}
				type="text"
				role="combobox"
				aria-expanded={flatItems.length > 0}
				aria-controls="cp-listbox"
				aria-autocomplete="list"
				aria-activedescendant={flatItems[activeIndex] ? flatItems[activeIndex].id : undefined}
				placeholder="Search devices, eeros, profiles, networks…"
				class="input cp-input"
				onkeydown={handleInputKeydown}
			/>
		</div>

		<div id="cp-listbox" role="listbox" aria-label="Search results" class="cp-results">
			{#if flatItems.length === 0}
				<p class="cp-empty text-muted">
					{#if loadingExtra}
						Loading…
					{:else if query.trim()}
						No matches.
					{:else}
						Type to search devices, eeros, profiles and networks.
					{/if}
				</p>
			{:else}
				{#each groups as group (group.label)}
					<div class="cp-group">
						<div class="cp-group-heading">{group.label}</div>
						{#each group.items as item (item.id)}
							{@const index = flatItems.indexOf(item)}
							<div
								id={item.id}
								role="option"
								aria-selected={index === activeIndex}
								class="cp-option"
								class:active={index === activeIndex}
								onmouseenter={() => (activeIndex = index)}
								onclick={() => activate(item)}
							>
								<span class="cp-option-label">{item.label}</span>
								{#if item.sublabel}
									<span class="cp-option-sublabel text-muted text-xs">{item.sublabel}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>
</Modal>

<style>
	.command-palette {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-height: 0;
	}

	.cp-input-wrapper {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
	}

	.cp-input {
		flex: 1;
		border: none;
		background: none;
		padding: var(--space-2) 0;
	}

	.cp-input:focus {
		outline: none;
		box-shadow: none;
	}

	.cp-results {
		max-height: 360px;
		overflow-y: auto;
	}

	.cp-empty {
		padding: var(--space-4) var(--space-2);
		text-align: center;
	}

	.cp-group + .cp-group {
		margin-top: var(--space-2);
	}

	.cp-group-heading {
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.cp-option {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.cp-option.active,
	.cp-option:hover {
		background-color: var(--color-bg-tertiary);
	}

	.cp-option-label {
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.cp-option-sublabel {
		flex-shrink: 0;
	}
</style>
