<!--
  DeviceProfileSelector

  Device detail "Profile" card, with the profile-picker dropdown. Extracted from
  routes/devices/[id]/+page.svelte (WP5 decomposition). Now built on the shared Dropdown
  primitive (arrow-key navigable, closes on Escape/outside-click) rather than a hand-rolled
  menu that only closed on outside-click (the `a11y_click_events_have_key_events` /
  `a11y_no_static_element_interactions` warnings this removes).
-->
<script lang="ts">
	import type { ProfileSummary } from '$api/types';
	import Icon from '$components/common/Icon.svelte';
	import Dropdown, { type DropdownItem } from '$components/common/Dropdown.svelte';

	interface Props {
		profileName: string | null;
		profileId: string | null;
		profiles: ProfileSummary[];
		loadingProfiles: boolean;
		changingProfile: boolean;
		onSelect: (profileId: string | null, profileName: string) => void;
	}

	let { profileName, profileId, profiles, loadingProfiles, changingProfile, onSelect }: Props =
		$props();

	let items = $derived<DropdownItem[]>([
		{
			id: '__none__',
			label: profileId ? 'No Profile' : '✓ No Profile',
			onSelect: () => onSelect(null, 'No Profile')
		},
		...profiles
			.filter((profile) => profile.id !== null)
			.map((profile) => ({
				id: profile.id as string,
				label: profileId === profile.id ? `✓ ${profile.name}` : profile.name,
				onSelect: () => onSelect(profile.id, profile.name)
			}))
	]);
</script>

<section class="profile-section card">
	<div class="profile-header">
		<h2><Icon name="folder" size={18} /> Profile</h2>
		<Dropdown
			label={changingProfile ? 'Updating…' : profileName || 'No Profile'}
			{items}
			disabled={changingProfile || loadingProfiles}
			align="right"
		/>
	</div>
	{#if profileId}
		<p class="profile-link">
			<a href="/profiles/{profileId}">View profile details →</a>
		</p>
	{/if}
</section>

<style>
	.profile-section {
		margin-bottom: var(--space-6);
		padding: var(--space-4);
	}

	.profile-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.profile-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.profile-link {
		margin-top: var(--space-3);
		margin-bottom: 0;
		font-size: 0.875rem;
	}
</style>
