<!--
  PowerSavingSchedulesCard

  A network's power-saving schedules (phase-6.0-revamp.md § 5, § 7 WP8,
  family 8): list, create, edit, delete. Sibling card next to
  SecurityWanCard - NOT settings-class (own sub-resource, no documented
  reboot behaviour), unlike the power-saving enable/schedule_enabled toggle
  itself (`PowerSavingControls.svelte`, attached to the `powerThreadControls`
  seam under `withSettingsLock`).

  The list itself is a verified read, always shown. Every write is an
  unverified, non-settings write (plan § 5) - wrapped in `ExperimentalGate`
  so the controls are simply absent when `EERO_DASHBOARD_EXPERIMENTAL_WRITES`
  is off, and every write goes through a `ConfirmDialog` stating it is not
  verified end-to-end. Pessimistic - no optimistic row insert/update/removal;
  the table only reflects the server's read-back. Mirrors
  `ProfileSchedulesCard.svelte`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { PowerSavingSchedule } from '$api/types';
	import { powerSavingSchedulesStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import PowerSavingScheduleModal from './PowerSavingScheduleModal.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let scheduleState = $derived($powerSavingSchedulesStore);

	let showFormModal = $state(false);
	let editingSchedule = $state<PowerSavingSchedule | null>(null);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function scheduleLabel(schedule: PowerSavingSchedule): string {
		return typeof schedule.name === 'string' && schedule.name ? schedule.name : 'Unnamed schedule';
	}

	function scheduleDays(schedule: PowerSavingSchedule): string {
		return Array.isArray(schedule.days) ? schedule.days.join(', ') : '—';
	}

	function scheduleTime(schedule: PowerSavingSchedule): string {
		return schedule.start_time && schedule.end_time
			? `${schedule.start_time} – ${schedule.end_time}`
			: '—';
	}

	function getRowId(row: PowerSavingSchedule, index: number): string {
		return typeof row.id === 'string' ? row.id : `${scheduleLabel(row)}:${index}`;
	}

	function load() {
		powerSavingSchedulesStore.fetch(networkId);
	}

	onMount(load);

	function openCreateModal() {
		editingSchedule = null;
		showFormModal = true;
	}

	function openEditModal(schedule: PowerSavingSchedule) {
		editingSchedule = schedule;
		showFormModal = true;
	}

	function closeFormModal() {
		showFormModal = false;
		editingSchedule = null;
	}

	async function handleFormSubmit(values: {
		name: string;
		days: string[];
		start_time: string;
		end_time: string;
		enabled: boolean;
	}) {
		try {
			if (typeof editingSchedule?.id === 'string') {
				await powerSavingSchedulesStore.update(networkId, editingSchedule.id, values);
				uiStore.success(`Schedule "${values.name}" updated`);
			} else {
				await powerSavingSchedulesStore.create(networkId, values);
				uiStore.success(`Schedule "${values.name}" created`);
			}
			closeFormModal();
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to save schedule');
		}
	}

	function requestDelete(schedule: PowerSavingSchedule) {
		if (typeof schedule.id !== 'string') return;
		const scheduleId = schedule.id;
		const label = scheduleLabel(schedule);
		uiStore.confirm({
			title: 'Delete Power-Saving Schedule',
			message: `Delete "${label}"?`,
			details: [NOT_VERIFIED_DETAIL, 'This power-saving schedule will stop applying immediately.'],
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await powerSavingSchedulesStore.remove(networkId, scheduleId);
					uiStore.success(`Schedule "${label}" deleted`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete schedule');
				}
			}
		});
	}
</script>

<Card title="Power-Saving Schedules">
	{#snippet actions()}
		<ExperimentalGate>
			<button
				class="btn btn-primary btn-sm"
				onclick={openCreateModal}
				disabled={scheduleState.applying}
			>
				Add Schedule
			</button>
		</ExperimentalGate>
	{/snippet}

	{#if scheduleState.loading && scheduleState.schedules.length === 0}
		<Skeleton variant="table-rows" rows={2} columns={5} />
	{:else if scheduleState.error}
		<ErrorState message={scheduleState.error} onRetry={load} />
	{:else if scheduleState.schedules.length === 0}
		<EmptyState title="No schedules" description="This network has no power-saving schedules." />
	{:else}
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Days</th>
					<th>Time</th>
					<th>Enabled</th>
					<th class="actions-header">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each scheduleState.schedules as schedule, index (getRowId(schedule, index))}
					<tr>
						<td>{scheduleLabel(schedule)}</td>
						<td>{scheduleDays(schedule)}</td>
						<td>{scheduleTime(schedule)}</td>
						<td>{schedule.enabled ? 'Yes' : 'No'}</td>
						<td>
							<ExperimentalGate>
								<div class="row-actions">
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => openEditModal(schedule)}
										disabled={scheduleState.applying}
									>
										Edit
									</button>
									<button
										class="btn btn-danger btn-sm"
										onclick={() => requestDelete(schedule)}
										disabled={scheduleState.applying}
									>
										Delete
									</button>
								</div>
							</ExperimentalGate>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</Card>

<PowerSavingScheduleModal
	open={showFormModal}
	schedule={editingSchedule}
	submitting={scheduleState.applying}
	onClose={closeFormModal}
	onSubmit={handleFormSubmit}
/>

<style>
	.actions-header {
		text-align: right;
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
