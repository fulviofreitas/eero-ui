/**
 * Tests for the DNS settings form helpers - dirty-checking in particular,
 * since a false "dirty" here would trigger an unnecessary mesh reboot.
 */

import { describe, it, expect } from 'vitest';
import type { DnsSettings } from '$api/types';
import {
	buildCachingUpdateRequest,
	buildUpdateRequest,
	formFromSettings,
	formIsValid,
	isFormDirty,
	validateForm,
	type DnsFormState
} from './dns-form';

function makeSettings(overrides: Partial<DnsSettings> = {}): DnsSettings {
	return {
		ipv4: { mode: 'automatic', servers: [] },
		ipv6: { mode: 'automatic', servers: [] },
		caching: true,
		parent_ips: ['203.0.113.1'],
		providers: [],
		...overrides
	};
}

describe('formFromSettings', () => {
	it('maps custom mode when either family is custom', () => {
		const settings = makeSettings({
			ipv4: { mode: 'custom', servers: ['1.1.1.1'] },
			ipv6: { mode: 'automatic', servers: [] }
		});
		expect(formFromSettings(settings).mode).toBe('custom');
	});

	it('maps automatic mode when both families are automatic', () => {
		expect(formFromSettings(makeSettings()).mode).toBe('automatic');
	});
});

describe('isFormDirty', () => {
	it('is NOT dirty when the form differs only in IPv6 text formatting (headline case)', () => {
		const settings = makeSettings({
			ipv4: { mode: 'custom', servers: ['1.1.1.1', '1.0.0.1'] },
			ipv6: {
				mode: 'custom',
				servers: [
					'2606:4700:4700:0000:0000:0000:0000:1111',
					'2606:4700:4700:0000:0000:0000:0000:1001'
				]
			}
		});
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '1.0.0.1',
			ipv6Primary: '2606:4700:4700::1111', // compressed form of the same address
			ipv6Secondary: '2606:4700:4700::1001'
		};

		expect(isFormDirty(settings, form)).toBe(false);
	});

	it('is dirty when reordering primary/secondary', () => {
		const settings = makeSettings({
			ipv4: { mode: 'custom', servers: ['1.1.1.1', '1.0.0.1'] }
		});
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.0.0.1',
			ipv4Secondary: '1.1.1.1',
			ipv6Primary: '',
			ipv6Secondary: ''
		};

		expect(isFormDirty(settings, form)).toBe(true);
	});

	it('is dirty when the mode changes', () => {
		const settings = makeSettings();
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};

		expect(isFormDirty(settings, form)).toBe(true);
	});

	it('is NOT dirty when only caching differs - caching has its own control now', () => {
		const settings = makeSettings({ caching: true });
		const form: DnsFormState = {
			mode: 'automatic',
			ipv4Primary: '',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};

		expect(isFormDirty(settings, form)).toBe(false);
	});

	it('is not dirty for an unchanged automatic-mode form', () => {
		const settings = makeSettings();
		const form = formFromSettings(settings);
		expect(isFormDirty(settings, form)).toBe(false);
	});
});

describe('validateForm / formIsValid', () => {
	it('has no errors in automatic mode regardless of stale field values', () => {
		const form: DnsFormState = {
			mode: 'automatic',
			ipv4Primary: 'garbage',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		expect(formIsValid(form)).toBe(true);
	});

	it('flags an invalid IPv4 literal in custom mode', () => {
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: 'not-an-ip',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		const errors = validateForm(form);
		expect(errors.ipv4Primary).toBeTruthy();
		expect(formIsValid(form)).toBe(false);
	});

	it('allows blank secondary fields', () => {
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		expect(formIsValid(form)).toBe(true);
	});

	it('validates a fully valid custom form', () => {
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '1.0.0.1',
			ipv6Primary: '2606:4700:4700::1111',
			ipv6Secondary: '2606:4700:4700::1001'
		};
		expect(formIsValid(form)).toBe(true);
	});
});

describe('buildUpdateRequest', () => {
	it('sends automatic mode with empty server lists', () => {
		const form: DnsFormState = {
			mode: 'automatic',
			ipv4Primary: 'leftover',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		expect(buildUpdateRequest(form)).toEqual({
			ipv4: { mode: 'automatic', servers: [] },
			ipv6: { mode: 'automatic', servers: [] }
		});
	});

	it('omits blank secondary servers', () => {
		const form: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		const request = buildUpdateRequest(form);
		expect(request.ipv4?.servers).toEqual(['1.1.1.1']);
		expect(request.ipv6?.servers).toEqual([]);
	});

	it('never includes a caching key, in either mode', () => {
		const automaticForm: DnsFormState = {
			mode: 'automatic',
			ipv4Primary: '',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};
		const customForm: DnsFormState = {
			mode: 'custom',
			ipv4Primary: '1.1.1.1',
			ipv4Secondary: '',
			ipv6Primary: '',
			ipv6Secondary: ''
		};

		expect(buildUpdateRequest(automaticForm)).not.toHaveProperty('caching');
		expect(buildUpdateRequest(customForm)).not.toHaveProperty('caching');
	});
});

describe('buildCachingUpdateRequest', () => {
	it('sends caching alone, with no family keys', () => {
		expect(buildCachingUpdateRequest(true)).toEqual({ caching: true });
		expect(buildCachingUpdateRequest(false)).toEqual({ caching: false });
	});

	it('never includes ipv4/ipv6 keys', () => {
		const request = buildCachingUpdateRequest(true);
		expect(request).not.toHaveProperty('ipv4');
		expect(request).not.toHaveProperty('ipv6');
	});
});
