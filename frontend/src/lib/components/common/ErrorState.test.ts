import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ErrorState from './ErrorState.svelte';

describe('ErrorState', () => {
	it('renders the message with role=alert', () => {
		render(ErrorState, { props: { message: 'Failed to load devices' } });
		expect(screen.getByRole('alert')).toHaveTextContent('Failed to load devices');
	});

	it('renders no retry button when onRetry is not given', () => {
		render(ErrorState, { props: { message: 'Failed to load devices' } });
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('calls onRetry when the retry button is clicked', async () => {
		const onRetry = vi.fn();
		render(ErrorState, { props: { message: 'Failed to load devices', onRetry } });
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledOnce();
	});
});
