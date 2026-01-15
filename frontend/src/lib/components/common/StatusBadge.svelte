<!--
  Status Badge Component
  
  Displays status with colored indicator.
-->
<script lang="ts">
	export let status: 'online' | 'offline' | 'connected' | 'disconnected' | 'blocked' | 'paused' | 'warning' | string;
	export let showDot: boolean = true;
	export let size: 'sm' | 'md' = 'md';

	$: statusClass = getStatusClass(status);
	$: label = getLabel(status);

	function getStatusClass(s: string): string {
		const normalized = s.toLowerCase();
		if (['online', 'connected', 'green'].includes(normalized)) return 'success';
		if (['offline', 'disconnected', 'red'].includes(normalized)) return 'neutral';
		if (['blocked', 'paused'].includes(normalized)) return 'danger';
		if (['warning', 'yellow'].includes(normalized)) return 'warning';
		return 'neutral';
	}

	function getLabel(s: string): string {
		const normalized = s.toLowerCase();
		if (normalized === 'green') return 'Online';
		if (normalized === 'red') return 'Offline';
		if (normalized === 'yellow') return 'Warning';
		return s.charAt(0).toUpperCase() + s.slice(1);
	}
</script>

<span class="badge badge-{statusClass} {size === 'sm' ? 'badge-sm' : ''}">
	{#if showDot}
		<span class="status-dot {statusClass}"></span>
	{/if}
	{label}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.125rem var(--space-2);
		font-size: 0.75rem;
		font-weight: 500;
		border-radius: var(--radius-sm);
	}

	.badge-sm {
		padding: 0 var(--space-1);
		font-size: 0.6875rem;
	}

	.badge-success {
		background-color: var(--color-success-bg);
		color: var(--color-success);
	}

	.badge-danger {
		background-color: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.badge-warning {
		background-color: var(--color-warning-bg);
		color: var(--color-warning);
	}

	.badge-neutral {
		background-color: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot.success {
		background-color: var(--color-success);
	}

	.status-dot.danger {
		background-color: var(--color-danger);
	}

	.status-dot.warning {
		background-color: var(--color-warning);
	}

	.status-dot.neutral {
		background-color: var(--color-text-muted);
	}
</style>
