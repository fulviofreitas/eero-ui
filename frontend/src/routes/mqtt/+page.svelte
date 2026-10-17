<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$api/client';
	import type { MQTTStatus } from '$api/types';
	import Button from '$components/common/Button.svelte';
	import Card from '$components/common/Card.svelte';

	let status: MQTTStatus | null = $state(null);
	let enabled = $state(false);
	let brokerAddress = $state('');
	let username = $state('');
	let password = $state('');
	let clearPassword = $state(false);
	let discovery = $state(true);
	let discoveryPrefix = $state('homeassistant');
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let saved = $state(false);
	let active = true;
	let polling = false;
	let revision = 0;

	const statusLabels = {
		disabled: 'Disabled',
		connecting: 'Connecting…',
		connected: 'Connected',
		error: 'Connection error'
	};

	/** Load the saved form values and ignore responses after this page is unmounted. */
	async function load() {
		loading = true;
		error = '';
		try {
			const result = await api.mqtt.get();
			if (!active) return;
			status = result;
			enabled = result.enabled;
			brokerAddress = result.broker_address;
			username = result.username;
			discovery = result.home_assistant_discovery;
			discoveryPrefix = result.discovery_prefix;
		} catch (cause) {
			if (active) error = cause instanceof Error ? cause.message : 'Could not load MQTT settings.';
		} finally {
			if (active) loading = false;
		}
	}

	/** Poll connection state without replacing edits or overwriting a newer save. */
	async function refreshStatus() {
		if (polling || saving || !status?.enabled) return;
		polling = true;
		const requestRevision = revision;
		try {
			const result = await api.mqtt.get();
			if (active && !saving && requestRevision === revision) status = result;
		} catch {
			// Keep form edits and the last status while a request is unavailable.
		} finally {
			polling = false;
		}
	}

	/** Save broker edits, preserve or clear the password, and discard stale responses. */
	async function save(event: SubmitEvent) {
		event.preventDefault();
		revision += 1;
		saving = true;
		error = '';
		saved = false;
		try {
			const result = await api.mqtt.update({
				enabled,
				broker_address: brokerAddress.trim(),
				username,
				password: clearPassword ? '' : password || null,
				home_assistant_discovery: discovery,
				discovery_prefix: discoveryPrefix.trim()
			});
			if (!active) return;
			status = result;
			brokerAddress = result.broker_address;
			discoveryPrefix = result.discovery_prefix;
			password = '';
			clearPassword = false;
			saved = true;
		} catch (cause) {
			if (active) error = cause instanceof Error ? cause.message : 'Could not save MQTT settings.';
		} finally {
			if (active) saving = false;
		}
	}

	onMount(() => {
		active = true;
		void load();
		const timer = setInterval(() => void refreshStatus(), 5000);
		return () => {
			active = false;
			clearInterval(timer);
			password = '';
		};
	});
</script>

<svelte:head>
	<title>MQTT | Eero Dashboard</title>
</svelte:head>

<div class="mqtt-page">
	<header class="page-header">
		<h1>MQTT</h1>
		<p class="text-muted">Connect your eero network to Home Assistant.</p>
	</header>

	{#if error}
		<p class="form-error" role="alert">{error}</p>
	{/if}
	{#if loading}
		<p role="status">Loading MQTT settings…</p>
	{:else if !status}
		<Button onclick={() => void load()}>Retry</Button>
	{:else}
		<Card title="Broker connection">
			<div class="connection-status" role="status">
				<span
					class="status-dot"
					class:connected={status.connection_status === 'connected'}
					class:failed={status.connection_status === 'error'}
				></span>
				<span>{statusLabels[status.connection_status]}</span>
			</div>
			{#if status.message}
				<p class="text-muted">{status.message}</p>
			{/if}
			<form onsubmit={save} onchange={() => (saved = false)}>
				<fieldset disabled={saving}>
					<label class="toggle-row">
						<span>Enable MQTT</span>
						<input type="checkbox" role="switch" bind:checked={enabled} />
					</label>
					<div class="field">
						<label for="mqtt-broker">Broker address</label>
						<input
							id="mqtt-broker"
							class="input"
							bind:value={brokerAddress}
							required={enabled}
							maxlength="512"
							placeholder="192.168.1.10:1883"
							autocomplete="off"
							aria-describedby="broker-help"
						/>
						<p id="broker-help" class="text-muted">
							Hostname or IP address, with an optional port. Use mqtts:// for TLS.
						</p>
					</div>
					<div class="credentials">
						<div class="field">
							<label for="mqtt-username">Username</label>
							<input
								id="mqtt-username"
								class="input"
								bind:value={username}
								maxlength="256"
								autocomplete="username"
								placeholder="Optional"
							/>
						</div>
						<div class="field">
							<label for="mqtt-password">Password</label>
							<input
								id="mqtt-password"
								class="input"
								type="password"
								bind:value={password}
								disabled={clearPassword}
								autocomplete="new-password"
								maxlength="4096"
								placeholder={status.password_set
									? 'Leave blank to keep saved password'
									: 'Optional'}
								aria-describedby="password-help"
							/>
						</div>
					</div>
					<p id="password-help" class="text-muted">
						The saved password stays on the server and is never returned to your browser.
					</p>
					{#if status.password_set}
						<label class="clear-password"
							><input type="checkbox" bind:checked={clearPassword} /> Remove saved password</label
						>
					{/if}
					<label class="toggle-row discovery-toggle">
						<span>Home Assistant auto discovery</span>
						<input type="checkbox" role="switch" bind:checked={discovery} />
					</label>
					<p class="text-muted">
						Use the same broker in Home Assistant’s MQTT integration. Sensors appear automatically
						after the next collection.
					</p>
					{#if discovery}
						<div class="field">
							<label for="mqtt-discovery-prefix">Discovery prefix</label>
							<input
								id="mqtt-discovery-prefix"
								class="input"
								bind:value={discoveryPrefix}
								required
								maxlength="128"
								placeholder="homeassistant"
								autocomplete="off"
							/>
						</div>
					{/if}
				</fieldset>
				<div class="actions">
					<Button type="submit" variant="primary" loading={saving}>Save settings</Button>
					{#if saved}<span class="text-muted" role="status">Settings saved.</span>{/if}
				</div>
			</form>
		</Card>

		<Card title="Home Assistant sensors">
			<p class="text-muted">
				Six sensors for each eero network, updated with the dashboard’s background collection.
			</p>
			<ul class="sensor-list">
				<li><span>Wired clients</span><span class="text-muted">Connected devices</span></li>
				<li><span>Wireless clients</span><span class="text-muted">Connected devices</span></li>
				<li><span>Latest speed test download</span><span class="text-muted">Mbps</span></li>
				<li><span>Latest speed test upload</span><span class="text-muted">Mbps</span></li>
				<li><span>WAN download</span><span class="text-muted">Mbps</span></li>
				<li><span>WAN upload</span><span class="text-muted">Mbps</span></li>
			</ul>
			<p class="text-muted">
				Speed sensors use the latest recorded test. No new speed tests are started.
			</p>
			<p class="text-muted">
				WAN sensors show total Internet traffic across connected devices, excluding local LAN
				transfers. A short live report is requested during background collection, at most once a
				minute. Readings take about 12 seconds to arrive and expire after 90 seconds. Bridge mode
				and incomplete readings remain unknown.
			</p>
		</Card>
	{/if}
</div>

<style>
	.mqtt-page {
		padding: var(--space-6);
		max-width: 760px;
		display: grid;
		gap: var(--space-6);
	}
	.page-header h1 {
		margin: 0;
	}
	.page-header p {
		margin-bottom: 0;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.connection-status,
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.connection-status {
		margin-bottom: var(--space-4);
	}
	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-text-muted);
	}
	.status-dot.connected {
		background: var(--color-success);
	}
	.status-dot.failed {
		background: var(--color-danger);
	}
	.toggle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}
	.discovery-toggle {
		margin-top: var(--space-6);
	}
	.field {
		display: grid;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.field p {
		margin: 0;
	}
	.credentials {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}
	.credentials .field {
		margin-bottom: 0;
	}
	.clear-password {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.actions {
		margin-top: var(--space-5);
	}
	.form-error {
		color: var(--color-danger);
		margin: 0;
	}
	.sensor-list {
		list-style: none;
		padding: 0;
		margin: var(--space-4) 0;
	}
	.sensor-list li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border-muted);
	}
	@media (max-width: 600px) {
		.mqtt-page {
			padding: var(--space-4);
		}
		.credentials {
			grid-template-columns: 1fr;
		}
		.sensor-list li {
			flex-wrap: wrap;
		}
	}
</style>
