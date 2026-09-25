/**
 * Icon path data
 *
 * Single source of truth for the icon set that replaces emoji-as-iconography across the app
 * (see .claude/tasks/phase-6.0-revamp.md § 6.2 Tier 1). Every icon is a hand-authored 24x24
 * stroke outline (`stroke="currentColor"`, `fill="none"`), so status colour tokens apply via
 * `color`. No icon library is used or added as a dependency.
 *
 * `IconSprite.svelte` reads this map to emit one `<symbol>` per entry; `Icon.svelte` references
 * a symbol by name via `<use>`. Keep names kebab-case and stable — they are a public contract
 * between the two components (and are covered by Icon.test.ts).
 */

export const ICON_PATHS: Record<string, string> = {
	// Navigation
	dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
	network: 'M12 2v6M5 20h14M7 20v-4a5 5 0 0 1 10 0v4M12 8a3 3 0 1 0 0 0z',
	devices: 'M4 5h16v11H4zM2 19h20M9 19v-3M15 19v-3',
	eeros: 'M12 3a9 9 0 0 1 9 9M12 7a5 5 0 0 1 5 5M12 11a1 1 0 0 1 1 1M12 12v9',
	profiles:
		'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M17 11a3 3 0 1 0-1.2-5.75M21 21v-1a4.5 4.5 0 0 0-3-4.24',
	topology:
		'M4 6h4v4H4zM16 6h4v4h-4zM10 16h4v4h-4zM6 10v3a3 3 0 0 0 3 3h1M18 10v3a3 3 0 0 1-3 3h-1',

	// Generic status / actions
	check: 'M5 12l5 5L20 7',
	x: 'M6 6l12 12M18 6L6 18',
	'alert-triangle': 'M12 3l9 17H3zM12 10v4M12 17.5v.01',
	refresh: 'M4 4v6h6M20 20v-6h-6M4.5 15A8 8 0 0 0 19 8.5M19.5 9A8 8 0 0 0 5 15.5',
	edit: 'M4 20h4L20 8l-4-4L4 16zM13 5l4 4',
	trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
	folder: 'M3 7h6l2 2h10v10H3z',
	menu: 'M3 6h18M3 12h18M3 18h18',
	settings:
		'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7 4.24l.06.06A1.7 1.7 0 0 0 8.93 4.6 1.7 1.7 0 0 0 10 3.06V3a2 2 0 1 1 4 0v.09c0 .69.4 1.28 1 1.55.63.27 1.36.15 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.27.63.86 1 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
	'checkbox-on': 'M4 4h16v16H4zM8 12l3 3 6-6',
	'chevron-down': 'M6 9l6 6 6-6',
	'chevron-up': 'M6 15l6-6 6 6',
	download: 'M12 3v13M7 11l5 5 5-5M4 21h16',
	'file-text': 'M6 3h9l3 3v15H6zM15 3v3h3M9 12h6M9 16h6',
	close: 'M6 6l12 12M18 6L6 18',
	sun: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
	moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',

	// Connectivity
	wifi: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10.5 10.5 0 0 1 13 0M9 16a6 6 0 0 1 6 0M12 20v.01',
	ethernet: 'M9 3v5M15 3v5M6 8h12v5l-2 3H8l-2-3zM10 16v5M14 16v5',
	globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18',
	bridge: 'M3 17V9l9-5 9 5v8M3 17h18M7 17v-6M12 17v-8M17 17v-6',
	router: 'M4 15h16v6H4zM8 21v-3M16 21v-3M6 15V9a6 6 0 0 1 12 0v6M12 9v.01',

	// Device categories
	phone: 'M7 2h10v20H7zM12 19h.01',
	tablet: 'M5 2h14v20H5zM12 19h.01',
	laptop: 'M4 5h16v10H4zM2 19h20l-2-4H4z',
	desktop: 'M4 4h16v11H4zM9 19h6M12 15v4',
	tv: 'M4 4h16v12H4zM9 20h6M8 4l4 4 4-4',
	'game-controller':
		'M7 8h10l2 9a2 2 0 0 1-3.6 1.4L14 16h-4l-1.4 2.4A2 2 0 0 1 5 17zM9 11v2M8 12h2M15.5 11h.01M17.5 13h.01',
	speaker: 'M6 2h12v20H6zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 6h.01',
	home: 'M4 11l8-7 8 7M6 10v10h12V10',
	thermostat: 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0zM12 17v.01',
	camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
	doorbell: 'M8 2h8v14H8zM12 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 16v6',
	lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2V16h6v-1.8A6 6 0 0 0 12 3z',
	plug: 'M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0zM12 17v5',
	wind: 'M3 8h10a2.5 2.5 0 1 0-2-4M3 12h13a2.5 2.5 0 1 1-2 4M3 16h8',
	broom: 'M18 3L6 15M6 15l-3 6 6-3M13 8l3 3M14 5l3 3',
	droplet: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
	flame: 'M12 3s5 5 5 9a5 5 0 1 1-10 0c0-1.2.6-2.3 1.2-3.2C9 10 9.5 11 9.5 11S9 6 12 3z',
	snowflake:
		'M12 2v20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1M12 6l-2 2M12 6l2 2M12 18l-2-2M12 18l2-2M6.5 8.8l2.6.7M6.5 8.8l-.7 2.6M17.5 15.2l-2.6-.7M17.5 15.2l.7-2.6M6.5 15.2l.7-2.6M6.5 15.2l2.6-.7M17.5 8.8l-.7 2.6M17.5 8.8l-2.6.7',
	washer: 'M4 4h16v16H4zM8 4v2M14 4v2M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
	dishwasher: 'M4 4h16v16H4zM4 8h16M8 4v4',
	fridge: 'M6 2h12v20H6zM6 10h12M9 5v3M9 13v3',
	oven: 'M4 4h16v16H4zM4 9h16M9 6h.01M12 6h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
	microwave: 'M3 6h18v12H3zM14 9h4v6h-4zM6 15h.01',
	coffee: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h1a3 3 0 0 1 0 6h-1M8 2v2M11 2v2M14 2v2',
	watch: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM9 8V4h6v4M9 16v4h6v-4M12 10v2l1.5 1.5',
	printer: 'M6 8V3h12v5M5 8h14v6H5zM7 14v6h10v-6M8 11h.01',
	storage: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01',
	server: 'M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01M17 7h.01M17 17h.01',
	car: 'M5 16l1.5-5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.35L19 16M3 16h18v3H3zM7 19v-3M17 19v-3M6 12h12',
	'help-circle':
		'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7v.5M12 17v.01',

	// Misc UI used in topology / device list toolbars
	ruler: 'M4 16l6-12 10 5-6 12zM7 11l2 1M9.5 6l2 1M12 15l2 1',
	'bar-chart': 'M4 20V10M10 20V4M16 20v-7M4 20h16',
	target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
	clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l4 2',
	person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
	'more-vertical': 'M12 6v.01M12 12v.01M12 18v.01',
	lock: 'M6 11h12v9H6zM9 11V7a3 3 0 1 1 6 0v4',
	'arrow-up': 'M12 19V5M6 11l6-6 6 6',
	'arrow-left': 'M19 12H5M12 19l-7-7 7-7',
	inbox: 'M3 12h4l2 4h6l2-4h4M5 5h14l2 7v7H3v-7z',
	copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
	search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
	// A9 (WP9 a11y fix): replaces bare ▶/⏸ glyphs inside button labels.
	play: 'M6 4l14 8-14 8z',
	pause: 'M6 4h4v16H6zM14 4h4v16h-4z'
} as const;

export type IconName = keyof typeof ICON_PATHS;
