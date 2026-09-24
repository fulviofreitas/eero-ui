<!--
  PowerSavingScheduleModal

  Create/edit form for a network's power-saving schedule
  (phase-6.0-revamp.md § 5, § 7 WP8, family 8). Shared between "Add
  Schedule" and each row's "Edit" action - `schedule` is `null` for create.

  Day codes and time format match the backend exactly
  (`_POWER_SAVING_SCHEDULE_DAYS`/`_SCHEDULE_TIME_RE`,
  backend/app/routes/networks.py:1815-1849): three-letter lowercase day
  codes, HH:MM 24-hour time.
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';
	import type { PowerSavingSchedule } from '$api/types';

	interface Props {
		open: boolean;
		schedule: PowerSavingSchedule | null;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (values: {
			name: string;
			days: string[];
			start_time: string;
			end_time: string;
			enabled: boolean;
		}) => void;
	}

	let { open, schedule, submitting, onClose, onSubmit }: Props = $props();

	const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
	const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

	let name = $state('');
	let days = $state<string[]>([]);
	let startTime = $state('01:00');
	let endTime = $state('06:00');
	let enabled = $state(true);

	// Reset the form to the schedule being edited (or blank, for create) every time the
	// modal opens - `open` is the only reactive trigger a caller needs to control.
	$effect(() => {
		if (open) {
			name = typeof schedule?.name === 'string' ? schedule.name : '';
			days = Array.isArray(schedule?.days) ? [...(schedule?.days as string[])] : [];
			startTime = typeof schedule?.start_time === 'string' ? schedule.start_time : '01:00';
			endTime = typeof schedule?.end_time === 'string' ? schedule.end_time : '06:00';
			enabled = typeof schedule?.enabled === 'boolean' ? schedule.enabled : true;
		}
	});

	function toggleDay(day: string) {
		days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit({ name: name.trim(), days, start_time: startTime, end_time: endTime, enabled });
	}

	let valid = $derived(
		name.trim().length > 0 && days.length > 0 && TIME_RE.test(startTime) && TIME_RE.test(endTime)
	);
</script>

<Modal
	{open}
	title={schedule ? 'Edit Power-Saving Schedule' : 'Add Power-Saving Schedule'}
	{onClose}
>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for="power-saving-schedule-name-input">Name</label>
		<input
			id="power-saving-schedule-name-input"
			class="modal-input"
			type="text"
			bind:value={name}
			disabled={submitting}
		/>

		<fieldset class="days-fieldset">
			<legend class="modal-label">Days</legend>
			<div class="days-grid">
				{#each ALL_DAYS as day (day)}
					<label class="day-checkbox">
						<input
							type="checkbox"
							checked={days.includes(day)}
							disabled={submitting}
							onchange={() => toggleDay(day)}
						/>
						{day}
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="time-row">
			<div>
				<label class="modal-label" for="power-saving-schedule-start-input">Start</label>
				<input
					id="power-saving-schedule-start-input"
					class="modal-input"
					type="time"
					bind:value={startTime}
					disabled={submitting}
				/>
			</div>
			<div>
				<label class="modal-label" for="power-saving-schedule-end-input">End</label>
				<input
					id="power-saving-schedule-end-input"
					class="modal-input"
					type="time"
					bind:value={endTime}
					disabled={submitting}
				/>
			</div>
		</div>

		<label class="enabled-checkbox">
			<input type="checkbox" bind:checked={enabled} disabled={submitting} />
			Enabled
		</label>

		<div class="modal-actions">
			<button type="button" class="btn btn-secondary" onclick={onClose} disabled={submitting}>
				Cancel
			</button>
			<button type="submit" class="btn btn-primary" disabled={submitting || !valid}>
				{#if submitting}
					<span class="loading-spinner"></span>
				{/if}
				Save
			</button>
		</div>
	</form>
</Modal>

<style>
	.modal-label {
		display: block;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.modal-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-primary);
		font-size: 0.9375rem;
		box-sizing: border-box;
		margin-bottom: var(--space-4);
	}

	.modal-input:focus {
		border-color: var(--color-accent);
	}

	.modal-input:focus-visible {
		box-shadow: var(--focus-ring);
	}

	.days-fieldset {
		border: none;
		padding: 0;
		margin: 0 0 var(--space-4);
	}

	.days-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.day-checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-sm);
		text-transform: capitalize;
	}

	.time-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.enabled-checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-2) 0 var(--space-4);
		font-size: var(--text-sm);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
