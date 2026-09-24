/**
 * Device-type icon resolution
 *
 * Shared by the device detail page and the topology DeviceNode, both of which used to keep an
 * independent emoji map (a `deviceType` -> emoji `Record`, and a `label`-substring inference
 * function respectively). Consolidated here as one `deviceType` -> `IconName` map plus one
 * label-inference fallback, so there is a single place to add a new category.
 */

import type { IconName } from '$lib/icons/paths';

const DEVICE_TYPE_ICONS: Record<string, IconName> = {
	// Mobile
	phone: 'phone',
	mobile: 'phone',
	smartphone: 'phone',
	iphone: 'phone',
	android: 'phone',
	tablet: 'tablet',
	ipad: 'tablet',
	// Computers
	computer: 'laptop',
	laptop: 'laptop',
	notebook: 'laptop',
	macbook: 'laptop',
	desktop: 'desktop',
	pc: 'desktop',
	mac: 'desktop',
	imac: 'desktop',
	workstation: 'desktop',
	// Entertainment
	tv: 'tv',
	television: 'tv',
	smart_tv: 'tv',
	streaming: 'tv',
	streaming_device: 'tv',
	media_player: 'tv',
	appletv: 'tv',
	firetv: 'tv',
	roku: 'tv',
	chromecast: 'tv',
	// Gaming
	gaming: 'game-controller',
	gaming_console: 'game-controller',
	game_console: 'game-controller',
	playstation: 'game-controller',
	xbox: 'game-controller',
	nintendo: 'game-controller',
	switch: 'game-controller',
	// Audio
	speaker: 'speaker',
	smart_speaker: 'speaker',
	homepod: 'speaker',
	echo: 'speaker',
	alexa: 'speaker',
	sonos: 'speaker',
	// Smart home
	smart_home: 'home',
	iot: 'home',
	hub: 'home',
	thermostat: 'thermostat',
	camera: 'camera',
	security_camera: 'camera',
	doorbell: 'doorbell',
	light: 'lightbulb',
	lighting: 'lightbulb',
	plug: 'plug',
	smart_plug: 'plug',
	outlet: 'plug',
	// Appliances
	air_purifier: 'wind',
	purifier: 'wind',
	fan: 'wind',
	vacuum: 'broom',
	robot_vacuum: 'broom',
	humidifier: 'droplet',
	dehumidifier: 'droplet',
	heater: 'flame',
	air_conditioner: 'snowflake',
	washer: 'washer',
	dryer: 'washer',
	dishwasher: 'dishwasher',
	refrigerator: 'fridge',
	fridge: 'fridge',
	oven: 'oven',
	microwave: 'microwave',
	coffee: 'coffee',
	appliance: 'plug',
	// Wearables
	wearable: 'watch',
	watch: 'watch',
	smartwatch: 'watch',
	apple_watch: 'watch',
	fitness: 'watch',
	// Network
	router: 'router',
	access_point: 'router',
	network: 'router',
	bridge: 'bridge',
	extender: 'router',
	// Office
	printer: 'printer',
	scanner: 'printer',
	// Storage
	nas: 'storage',
	storage: 'storage',
	server: 'server',
	// Other
	car: 'car',
	vehicle: 'car'
};

/** Resolve an icon for a known/unknown `device_type`, falling back on the connection type. */
export function getDeviceTypeIcon(
	deviceType: string | null | undefined,
	wireless: boolean
): IconName {
	const fallback: IconName = wireless ? 'phone' : 'desktop';
	if (!deviceType) return fallback;

	const type = deviceType.toLowerCase();
	if (DEVICE_TYPE_ICONS[type]) return DEVICE_TYPE_ICONS[type];

	for (const [key, icon] of Object.entries(DEVICE_TYPE_ICONS)) {
		if (type.includes(key) || key.includes(type)) return icon;
	}
	return fallback;
}

/** Best-effort icon inference from a free-text device label (topology nodes have no device_type). */
export function inferDeviceIconFromLabel(label: string): IconName {
	const name = label.toLowerCase();
	if (
		name.includes('iphone') ||
		name.includes('android') ||
		name.includes('pixel') ||
		name.includes('phone')
	) {
		return 'phone';
	}
	if (name.includes('ipad') || name.includes('tablet')) return 'tablet';
	if (name.includes('macbook') || name.includes('laptop') || name.includes('notebook'))
		return 'laptop';
	if (name.includes('desktop') || name.includes('imac') || name.includes('pc')) return 'desktop';
	if (
		name.includes('tv') ||
		name.includes('apple-tv') ||
		name.includes('roku') ||
		name.includes('chromecast')
	) {
		return 'tv';
	}
	if (name.includes('alexa') || name.includes('echo') || name.includes('homepod')) return 'speaker';
	if (name.includes('nest') || name.includes('thermostat')) return 'thermostat';
	if (name.includes('camera') || name.includes('ring') || name.includes('doorbell'))
		return 'camera';
	if (name.includes('printer')) return 'printer';
	if (name.includes('watch')) return 'watch';
	if (
		name.includes('playstation') ||
		name.includes('xbox') ||
		name.includes('nintendo') ||
		name.includes('switch')
	) {
		return 'game-controller';
	}
	return 'help-circle';
}
