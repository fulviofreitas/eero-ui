/**
 * Tests for SettingRow - label -> current value -> inline control, exactly
 * once per setting (Security & WAN consistency pass, 2026-10-07).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import SettingRow from './SettingRow.svelte';

describe('SettingRow', () => {
	it('renders the label and a plain string value', () => {
		render(SettingRow, { props: { label: 'UPnP', value: 'Enabled' } });

		expect(screen.getByText('UPnP')).toBeInTheDocument();
		expect(screen.getByText('Enabled')).toBeInTheDocument();
	});

	it('renders a dash for an undefined/null/empty value', () => {
		render(SettingRow, { props: { label: 'Lease time' } });

		expect(screen.getByText('—')).toBeInTheDocument();
	});

	it('renders a value snippet', () => {
		const value = createRawSnippet(() => ({ render: () => `<span class="badge">WPA3</span>` }));
		render(SettingRow, { props: { label: 'WPA3 (2.4 GHz)', value } });

		expect(screen.getByText('WPA3')).toBeInTheDocument();
	});

	it('renders a control snippet when not readonly', () => {
		const control = createRawSnippet(() => ({ render: () => `<button>Toggle</button>` }));
		render(SettingRow, { props: { label: 'SQM', value: 'Enabled', control } });

		expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
	});

	it('hides the control and shows a Read-only tag when readonly', () => {
		const control = createRawSnippet(() => ({ render: () => `<button>Toggle</button>` }));
		render(SettingRow, {
			props: { label: 'WPA3 (6 GHz)', value: 'WPA2', control, readonly: true }
		});

		expect(screen.queryByRole('button', { name: 'Toggle' })).not.toBeInTheDocument();
		expect(screen.getByText('Read-only')).toBeInTheDocument();
	});

	it('renders an optional hint under the label', () => {
		render(SettingRow, {
			props: { label: 'IP address prefix', value: '10.0.0.0/8', hint: 'Derived from subnet IP' }
		});

		expect(screen.getByText('Derived from subnet IP')).toBeInTheDocument();
	});
});
