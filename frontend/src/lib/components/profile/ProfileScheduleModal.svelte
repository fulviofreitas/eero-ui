<!--
  ProfileScheduleModal

  Create/edit form for a profile's scheduled pause (phase-6.0-revamp.md § 7
  WP7, family 1). Shared between "Add Schedule" and each row's "Edit" action
  - `schedule` is `null` for create.
-->
<script lang="ts">
	import Modal from '$components/common/Modal.svelte';
	import type { ProfileSchedule } from '$api/types';

	interface Props {
		open: boolean;
		schedule: ProfileSchedule | null;
		submitting: boolean;
		onClose: () => void;
		onSubmit: (values: {
			name: string;
			days: string[];
			start: string;
			end: string;
			enabled: boolean;
		}) => void;
	}

	let { open, schedule, submitting, onClose, onSubmit }: Props = $props();

	const ALL_DAYS = [
		'monday',
		'tuesday',
		'wednesday',
		'thursday',
		'friday',
		'saturday',
		'sunday'
	] as const;

	let name = $state('');
	let days = $state<string[]>([]);
	let start = $state('20:00');
	let end = $state('07:00');
	let enabled = $state(true);

	// Reset the form to the schedule being edited (or blank, for create) every time the
	// modal opens - `open` is the only reactive trigger a caller needs to control.
	$effect(() => {
		if (open) {
			name = schedule?.name ?? '';
			days = schedule?.days ? [...schedule.days] : [];
			start = schedule?.start ?? '20:00';
			end = schedule?.end ?? '07:00';
			enabled = schedule?.enabled ?? true;
		}
	});

	function toggleDay(day: string) {
		days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit({ name: name.trim(), days, start, end, enabled });
	}

	let valid = $derived(name.trim().length > 0 && days.length > 0 && !!start && !!end);
</script>

<Modal {open} title={schedule ? 'Edit Schedule' : 'Add Schedule'} {onClose}>
	<form onsubmit={handleSubmit}>
		<label class="modal-label" for="schedule-name-input">Name</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			id="schedule-name-input"
			class="modal-input"
			type="text"
			bind:value={name}
			disabled={submitting}
			autofocus
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
						{day.slice(0, 3)}
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="time-row">
			<div>
				<label class="modal-label" for="schedule-start-input">Start</label>
				<input
					id="schedule-start-input"
					class="modal-input"
					type="time"
					bind:value={start}
					disabled={submitting}
				/>
			</div>
			<div>
				<label class="modal-label" for="schedule-end-input">End</label>
				<input
					id="schedule-end-input"
					class="modal-input"
					type="time"
					bind:value={end}
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
