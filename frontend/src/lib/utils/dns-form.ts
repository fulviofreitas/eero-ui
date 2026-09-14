/**
 * DNS settings form helpers.
 *
 * The DNS settings form intentionally simplifies the API contract (which
 * allows independent ipv4/ipv6 modes) down to a single ISP-vs-custom
 * toggle, mirroring the eero mobile app. These helpers translate between
 * the form shape and the API's `DnsSettings`/`DnsUpdateRequest` shapes, and
 * implement the dirty-check that gates the Save button.
 */

import type { DnsFieldName, DnsSettings, DnsUpdateRequest } from '$api/types';
import { isValidAddress, serversEqual, type IpFamily } from './ip-address';

export interface DnsFormState {
	mode: 'automatic' | 'custom';
	ipv4Primary: string;
	ipv4Secondary: string;
	ipv6Primary: string;
	ipv6Secondary: string;
}

export function formFromSettings(settings: DnsSettings): DnsFormState {
	const mode: 'automatic' | 'custom' =
		settings.ipv4.mode === 'custom' || settings.ipv6.mode === 'custom' ? 'custom' : 'automatic';

	return {
		mode,
		ipv4Primary: settings.ipv4.servers[0] ?? '',
		ipv4Secondary: settings.ipv4.servers[1] ?? '',
		ipv6Primary: settings.ipv6.servers[0] ?? '',
		ipv6Secondary: settings.ipv6.servers[1] ?? ''
	};
}

/**
 * True if the form differs from the loaded settings in a way that would
 * change the PUT payload. Comparison is address-aware (see ip-address.ts)
 * so a purely textual re-formatting of an unchanged IPv6 address is never
 * reported as dirty.
 *
 * Caching is intentionally NOT part of this check - it is applied through
 * its own, independently-confirmed control. See `buildCachingUpdateRequest`
 * below for why.
 */
export function isFormDirty(settings: DnsSettings, form: DnsFormState): boolean {
	const loaded = formFromSettings(settings);

	if (loaded.mode !== form.mode) return true;
	if (form.mode === 'automatic') return false;

	const ipv4Dirty = !serversEqual(
		[loaded.ipv4Primary, loaded.ipv4Secondary],
		[form.ipv4Primary, form.ipv4Secondary],
		'ipv4'
	);
	const ipv6Dirty = !serversEqual(
		[loaded.ipv6Primary, loaded.ipv6Secondary],
		[form.ipv6Primary, form.ipv6Secondary],
		'ipv6'
	);

	return ipv4Dirty || ipv6Dirty;
}

export type DnsFormErrors = Partial<Record<DnsFieldName, string>>;

function validateField(value: string, family: IpFamily, label: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	if (!isValidAddress(trimmed, family)) return `Enter a valid ${label} address`;
	return undefined;
}

export function validateForm(form: DnsFormState): DnsFormErrors {
	if (form.mode === 'automatic') return {};

	return {
		ipv4Primary: validateField(form.ipv4Primary, 'ipv4', 'IPv4'),
		ipv4Secondary: validateField(form.ipv4Secondary, 'ipv4', 'IPv4'),
		ipv6Primary: validateField(form.ipv6Primary, 'ipv6', 'IPv6'),
		ipv6Secondary: validateField(form.ipv6Secondary, 'ipv6', 'IPv6')
	};
}

export function formIsValid(form: DnsFormState): boolean {
	const errors = validateForm(form);
	return !Object.values(errors).some(Boolean);
}

/**
 * Build the PUT payload for the servers form.
 *
 * DELIBERATELY never includes a `caching` key. See `buildCachingUpdateRequest`
 * below for why.
 */
export function buildUpdateRequest(form: DnsFormState): DnsUpdateRequest {
	if (form.mode === 'automatic') {
		return {
			ipv4: { mode: 'automatic', servers: [] },
			ipv6: { mode: 'automatic', servers: [] }
		};
	}

	const ipv4Servers = [form.ipv4Primary, form.ipv4Secondary]
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	const ipv6Servers = [form.ipv6Primary, form.ipv6Secondary]
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	return {
		ipv4: { mode: 'custom', servers: ipv4Servers },
		ipv6: { mode: 'custom', servers: ipv6Servers }
	};
}

/**
 * Build the PUT payload for the standalone DNS caching toggle.
 *
 * SPLIT FROM THE SERVERS FORM ON PURPOSE (fulviofreitas/eero-api#127): the
 * eero-api SDK has no whole-state DNS write, so the backend dispatches one
 * PUT per changed aspect - servers (ipv4/ipv6 combined into one PUT) and
 * caching (always its own PUT). Every PUT to this resource reboots the
 * entire mesh. Bundling a caching change into the same submit as a servers
 * change could therefore queue up to 3 back-to-back reboots; eero-api's own
 * docs warn that a burst of writes like that can leave a network
 * unreachable until it's factory-reset from the app. Sending caching alone,
 * behind its own confirmation, caps any one submit at a single PUT/reboot.
 * Once eero-api#127 ships a real `set_dns_settings()` (one PUT for
 * everything), this split - and the sibling DnsCachingCard component -
 * should be reverted back into a single form/request.
 */
export function buildCachingUpdateRequest(caching: boolean): DnsUpdateRequest {
	return { caching };
}

export function applyProvider(
	form: DnsFormState,
	provider: { ipv4: string[]; ipv6: string[] }
): DnsFormState {
	return {
		...form,
		mode: 'custom',
		ipv4Primary: provider.ipv4[0] ?? '',
		ipv4Secondary: provider.ipv4[1] ?? '',
		ipv6Primary: provider.ipv6[0] ?? '',
		ipv6Secondary: provider.ipv6[1] ?? ''
	};
}
