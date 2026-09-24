import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import InfoRow from './InfoRow.svelte';

describe('InfoRow', () => {
	it('renders the label and value', () => {
		render(InfoRow, { props: { label: 'IP Address', value: '10.0.0.5' } });
		expect(screen.getByText('IP Address')).toBeInTheDocument();
		expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
	});

	it('applies the mono class when requested', () => {
		const { container } = render(InfoRow, {
			props: { label: 'MAC', value: 'AA:BB:CC:DD:EE:FF', mono: true }
		});
		expect(container.querySelector('.info-value.mono')).not.toBeNull();
	});

	it('renders no copy button by default', () => {
		render(InfoRow, { props: { label: 'IP Address', value: '10.0.0.5' } });
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('copies the value to the clipboard when copyable', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });

		render(InfoRow, { props: { label: 'MAC', value: 'AA:BB:CC:DD:EE:FF', copyable: true } });
		const button = screen.getByRole('button', { name: /copy mac/i });
		await fireEvent.click(button);

		expect(writeText).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF');
	});
});
