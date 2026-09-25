import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Page from './+page.svelte';

async function renderListView() {
	render(Page);
	await waitFor(() => expect(screen.getByText('Living Room')).toBeInTheDocument());
	await fireEvent.click(screen.getByTitle('List view'));
	await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
}

describe('Eeros list column visibility toggle', () => {
	it('column toggle actually opens and hides a column', async () => {
		await renderListView();
		expect(screen.getByRole('columnheader', { name: /^Model/ })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /columns/i }));
		expect(screen.queryByLabelText('Model')).not.toBeNull();
		await fireEvent.click(screen.getByLabelText('Model'));
		expect(screen.queryByRole('columnheader', { name: /^Model/ })).toBeNull();
	});
});
