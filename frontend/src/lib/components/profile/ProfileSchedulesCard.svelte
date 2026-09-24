<!--
  ProfileSchedulesCard

  A profile's scheduled pauses (phase-6.0-revamp.md § 7 WP7, family 1):
  list, create, edit, delete, bedtime quick-add, clear all.

  The list itself is a verified read, always shown. Every write is an
  unverified, non-settings write (plan § 5) - wrapped in `ExperimentalGate`
  so the controls are simply absent (with a muted operator note) when
  `EERO_DASHBOARD_EXPERIMENTAL_WRITES` is off, and every write goes through
  a `ConfirmDialog` stating it is not verified end-to-end. Pessimistic - no
  optimistic row insert/update/removal; the table only reflects the
  server's read-back.

  A plain `<table class="table">` is used here rather than the shared
  `DataTable` - the per-row Edit/Delete actions need a snippet bound from
  `<script>`, and a table-level `ExperimentalGate` around the whole actions
  column is simpler and reads better than gating each button individually.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { ProfileSchedule } from '$api/types';
	import { profileSchedulesStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import ProfileScheduleModal from './ProfileScheduleModal.svelte';

	interface Props {
		profileId: string;
	}

	let { profileId }: Props = $props();

	let scheduleState = $derived($profileSchedulesStore);

	let showFormModal = $state(false);
	let editingSchedule = $state<ProfileSchedule | null>(null);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	function scheduleLabel(schedule: ProfileSchedule): string {
		return schedule.name || 'Unnamed schedule';
	}

	function getRowId(row: ProfileSchedule, index: number): string {
		return row.id ?? `${scheduleLabel(row)}:${index}`;
	}

	function load() {
		profileSchedulesStore.fetch(profileId);
	}

	onMount(load);

	function openCreateModal() {
		editingSchedule = null;
		showFormModal = true;
	}

	function openEditModal(schedule: ProfileSchedule) {
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
		start: string;
		end: string;
		enabled: boolean;
	}) {
		try {
			if (editingSchedule?.id) {
				await profileSchedulesStore.update(profileId, editingSchedule.id, values);
				uiStore.success(`Schedule "${values.name}" updated`);
			} else {
				await profileSchedulesStore.create(profileId, values);
				uiStore.success(`Schedule "${values.name}" created`);
			}
			closeFormModal();
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to save schedule');
		}
	}

	function requestDelete(schedule: ProfileSchedule) {
		if (!schedule.id) return;
		const scheduleId = schedule.id;
		const label = scheduleLabel(schedule);
		uiStore.confirm({
			title: 'Delete Schedule',
			message: `Delete "${label}"?`,
			details: [NOT_VERIFIED_DETAIL, 'This scheduled pause will stop applying immediately.'],
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await profileSchedulesStore.remove(profileId, scheduleId);
					uiStore.success(`Schedule "${label}" deleted`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete schedule');
				}
			}
		});
	}

	function requestClearAll() {
		uiStore.confirm({
			title: 'Clear All Schedules',
			message: 'Delete every scheduled pause on this profile?',
			details: [
				NOT_VERIFIED_DETAIL,
				'Every scheduled pause on this profile will be removed, one deletion per pause.'
			],
			confirmText: 'Clear All',
			danger: true,
			onConfirm: async () => {
				try {
					await profileSchedulesStore.clearAll(profileId);
					uiStore.success('All schedules cleared');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to clear schedules');
				}
			}
		});
	}

	function requestBedtime() {
		uiStore.confirm({
			title: 'Add Bedtime Schedule',
			message: 'Add a nightly bedtime pause (22:00 – 07:00, every day)?',
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Add Bedtime',
			onConfirm: async () => {
				try {
					await profileSchedulesStore.createBedtime(profileId, {
						start_time: '22:00',
						end_time: '07:00'
					});
					uiStore.success('Bedtime schedule added');
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to add bedtime schedule');
				}
			}
		});
	}
</script>

<Card title="Schedules">
	{#snippet actions()}
		<ExperimentalGate>
			<button
				class="btn btn-secondary btn-sm"
				onclick={requestBedtime}
				disabled={scheduleState.applying}
			>
				Add Bedtime
			</button>
			<button
				class="btn btn-secondary btn-sm"
				onclick={requestClearAll}
				disabled={scheduleState.applying || scheduleState.schedules.length === 0}
			>
				Clear All
			</button>
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
		<EmptyState title="No schedules" description="This profile has no scheduled pauses." />
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
						<td>{schedule.days.join(', ') || '—'}</td>
						<td>{schedule.start && schedule.end ? `${schedule.start} – ${schedule.end}` : '—'}</td>
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

<ProfileScheduleModal
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
