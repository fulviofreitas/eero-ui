<!--
  ForwardsReservationsCard

  Network Advanced tab card (phase-6.0-revamp.md § 7 WP7, family 8): the
  network's configured port forwards and DHCP reservations (`GET/POST/PUT/
  DELETE /networks/{id}/forwards[/{id}]` and `/reservations[/{id}]`).

  The list reads are verified reads, always shown. Every write
  (create/update/delete, either resource) is an unverified, non-settings
  write (plan § 5) - wrapped in `ExperimentalGate` so the controls are simply
  absent when `EERO_DASHBOARD_EXPERIMENTAL_WRITES` is off, and every write
  goes through a `ConfirmDialog` stating it is not verified end-to-end.
  Pessimistic - no optimistic row insert/update/removal; the tables only
  reflect the server's read-back.

  Deleting a reservation can optionally also delete its forwards
  (`delete_forwards` query param) - a per-row checkbox next to the Delete
  button controls this, read at click time.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { ForwardSummary, ReservationSummary } from '$api/types';
	import { forwardsReservationsStore, uiStore } from '$stores';
	import Card from '$components/common/Card.svelte';
	import EmptyState from '$components/common/EmptyState.svelte';
	import ErrorState from '$components/common/ErrorState.svelte';
	import Skeleton from '$components/common/Skeleton.svelte';
	import ExperimentalGate from '$components/common/ExperimentalGate.svelte';
	import ForwardModal from './ForwardModal.svelte';
	import ReservationModal from './ReservationModal.svelte';

	interface Props {
		networkId: string;
	}

	let { networkId }: Props = $props();

	let cardState = $derived($forwardsReservationsStore);

	const NOT_VERIFIED_DETAIL = 'This action is not verified end-to-end against the eero cloud.';

	let showForwardModal = $state(false);
	let editingForward = $state<ForwardSummary | null>(null);
	let showReservationModal = $state(false);
	let editingReservation = $state<ReservationSummary | null>(null);
	let deleteForwardsChecked = $state<Record<string, boolean>>({});

	function forwardLabel(forward: ForwardSummary): string {
		return forward.description || `${forward.client_port ?? '?'} → ${forward.gateway_port ?? '?'}`;
	}

	function reservationLabel(reservation: ReservationSummary): string {
		return reservation.description || reservation.ip || reservation.mac || 'Reservation';
	}

	function getForwardRowId(row: ForwardSummary, index: number): string {
		return row.id ?? `${forwardLabel(row)}:${index}`;
	}

	function getReservationRowId(row: ReservationSummary, index: number): string {
		return row.id ?? `${reservationLabel(row)}:${index}`;
	}

	function load() {
		forwardsReservationsStore.fetch(networkId);
	}

	onMount(load);

	function openCreateForwardModal() {
		editingForward = null;
		showForwardModal = true;
	}

	function openEditForwardModal(forward: ForwardSummary) {
		editingForward = forward;
		showForwardModal = true;
	}

	function closeForwardModal() {
		showForwardModal = false;
		editingForward = null;
	}

	async function handleForwardSubmit(values: {
		clientPort: number;
		gatewayPort: number;
		ip: string;
		protocol: 'tcp' | 'udp' | 'both';
		description: string;
		enabled: boolean;
	}) {
		try {
			const body = {
				client_port: values.clientPort,
				gateway_port: values.gatewayPort,
				ip: values.ip,
				protocol: values.protocol,
				description: values.description || undefined,
				enabled: values.enabled
			};
			if (editingForward?.id) {
				await forwardsReservationsStore.updateForward(networkId, editingForward.id, body);
				uiStore.success('Forward updated');
			} else {
				await forwardsReservationsStore.createForward(networkId, body);
				uiStore.success('Forward created');
			}
			closeForwardModal();
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to save forward');
		}
	}

	function requestDeleteForward(forward: ForwardSummary) {
		if (!forward.id) return;
		const forwardId = forward.id;
		const label = forwardLabel(forward);
		uiStore.confirm({
			title: 'Delete Forward',
			message: `Delete "${label}"?`,
			details: [NOT_VERIFIED_DETAIL],
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await forwardsReservationsStore.deleteForward(networkId, forwardId);
					uiStore.success(`Forward "${label}" deleted`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete forward');
				}
			}
		});
	}

	function openCreateReservationModal() {
		editingReservation = null;
		showReservationModal = true;
	}

	function openEditReservationModal(reservation: ReservationSummary) {
		editingReservation = reservation;
		showReservationModal = true;
	}

	function closeReservationModal() {
		showReservationModal = false;
		editingReservation = null;
	}

	async function handleReservationSubmit(values: {
		ip: string;
		mac: string;
		description: string;
		publicStaticIp: string;
	}) {
		try {
			const body = {
				ip: values.ip,
				mac: values.mac,
				description: values.description || undefined,
				public_static_ip: values.publicStaticIp || undefined
			};
			if (editingReservation?.id) {
				await forwardsReservationsStore.updateReservation(networkId, editingReservation.id, body);
				uiStore.success('Reservation updated');
			} else {
				await forwardsReservationsStore.createReservation(networkId, body);
				uiStore.success('Reservation created');
			}
			closeReservationModal();
		} catch (err) {
			uiStore.error(err instanceof Error ? err.message : 'Failed to save reservation');
		}
	}

	function requestDeleteReservation(reservation: ReservationSummary) {
		if (!reservation.id) return;
		const reservationId = reservation.id;
		const label = reservationLabel(reservation);
		const alsoDeleteForwards = Boolean(deleteForwardsChecked[reservationId]);
		uiStore.confirm({
			title: 'Delete Reservation',
			message: `Delete "${label}"?`,
			details: [
				NOT_VERIFIED_DETAIL,
				...(alsoDeleteForwards ? ['This reservation’s forwards will also be deleted.'] : [])
			],
			confirmText: 'Delete',
			danger: true,
			onConfirm: async () => {
				try {
					await forwardsReservationsStore.deleteReservation(
						networkId,
						reservationId,
						alsoDeleteForwards
					);
					uiStore.success(`Reservation "${label}" deleted`);
				} catch (err) {
					uiStore.error(err instanceof Error ? err.message : 'Failed to delete reservation');
				}
			}
		});
	}
</script>

<Card title="Forwards & Reservations">
	{#if cardState.loading && cardState.forwards.length === 0 && cardState.reservations.length === 0}
		<Skeleton variant="table-rows" rows={3} columns={5} />
	{:else if cardState.error}
		<ErrorState message={cardState.error} onRetry={load} />
	{:else}
		<section class="fr-section">
			<div class="fr-header">
				<h4>Port Forwards</h4>
				<ExperimentalGate>
					<button
						class="btn btn-primary btn-sm"
						onclick={openCreateForwardModal}
						disabled={cardState.applying}
					>
						Add Forward
					</button>
				</ExperimentalGate>
			</div>

			{#if cardState.forwards.length === 0}
				<EmptyState
					title="No port forwards"
					description="This network has no configured forwards."
				/>
			{:else}
				<table class="table">
					<thead>
						<tr>
							<th>Description</th>
							<th>Client Port</th>
							<th>Gateway Port</th>
							<th>IP</th>
							<th>Protocol</th>
							<th>Enabled</th>
							<th class="actions-header">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each cardState.forwards as forward, index (getForwardRowId(forward, index))}
							<tr>
								<td>{forward.description ?? '—'}</td>
								<td>{forward.client_port ?? '—'}</td>
								<td>{forward.gateway_port ?? '—'}</td>
								<td>{forward.ip ?? '—'}</td>
								<td>{forward.protocol ?? '—'}</td>
								<td>{forward.enabled ? 'Yes' : 'No'}</td>
								<td>
									<ExperimentalGate>
										<div class="row-actions">
											<button
												class="btn btn-secondary btn-sm"
												onclick={() => openEditForwardModal(forward)}
												disabled={cardState.applying}
											>
												Edit
											</button>
											<button
												class="btn btn-danger btn-sm"
												onclick={() => requestDeleteForward(forward)}
												disabled={cardState.applying}
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
		</section>

		<section class="fr-section">
			<div class="fr-header">
				<h4>DHCP Reservations</h4>
				<ExperimentalGate>
					<button
						class="btn btn-primary btn-sm"
						onclick={openCreateReservationModal}
						disabled={cardState.applying}
					>
						Add Reservation
					</button>
				</ExperimentalGate>
			</div>

			{#if cardState.reservations.length === 0}
				<EmptyState
					title="No DHCP reservations"
					description="This network has no configured reservations."
				/>
			{:else}
				<table class="table">
					<thead>
						<tr>
							<th>Description</th>
							<th>IP</th>
							<th>MAC</th>
							<th>Public Static IP</th>
							<th class="actions-header">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each cardState.reservations as reservation, index (getReservationRowId(reservation, index))}
							<tr>
								<td>{reservation.description ?? '—'}</td>
								<td>{reservation.ip ?? '—'}</td>
								<td>{reservation.mac ?? '—'}</td>
								<td>{reservation.public_static_ip ?? '—'}</td>
								<td>
									<ExperimentalGate>
										<div class="row-actions">
											<label class="delete-forwards-checkbox">
												<input
													type="checkbox"
													checked={Boolean(deleteForwardsChecked[reservation.id ?? ''])}
													disabled={cardState.applying}
													onchange={(e) =>
														(deleteForwardsChecked = {
															...deleteForwardsChecked,
															[reservation.id ?? '']: (e.currentTarget as HTMLInputElement).checked
														})}
												/>
												Also delete forwards
											</label>
											<button
												class="btn btn-secondary btn-sm"
												onclick={() => openEditReservationModal(reservation)}
												disabled={cardState.applying}
											>
												Edit
											</button>
											<button
												class="btn btn-danger btn-sm"
												onclick={() => requestDeleteReservation(reservation)}
												disabled={cardState.applying}
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
		</section>
	{/if}
</Card>

<ForwardModal
	open={showForwardModal}
	forward={editingForward}
	submitting={cardState.applying}
	onClose={closeForwardModal}
	onSubmit={handleForwardSubmit}
/>

<ReservationModal
	open={showReservationModal}
	reservation={editingReservation}
	submitting={cardState.applying}
	onClose={closeReservationModal}
	onSubmit={handleReservationSubmit}
/>

<style>
	.fr-section {
		margin-bottom: var(--space-6);
	}

	.fr-section:last-child {
		margin-bottom: 0;
	}

	.fr-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-2);
	}

	.fr-header h4 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.actions-header {
		text-align: right;
	}

	.row-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.delete-forwards-checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}
</style>
