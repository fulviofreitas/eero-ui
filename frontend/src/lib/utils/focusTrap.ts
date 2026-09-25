/**
 * Svelte action: traps Tab/Shift+Tab focus within `node` and moves focus inside it as soon as it
 * mounts (first focusable descendant, else `node` itself - callers must give `node` a
 * `tabindex="-1"` for that fallback to be focusable).
 *
 * Used by Modal.svelte and ConfirmDialog.svelte (WP5 A11Y fix A5) instead of duplicating this
 * logic in both components.
 *
 * Deliberately does NOT restore focus to the opener on destroy: both callers unmount this node
 * only after their close `transition:` outro finishes, which is exactly backwards for restoring
 * focus promptly on close (and unreliable in jsdom, which has no real Web Animations timing).
 * Each caller instead restores focus itself, keyed off its own `open`/dialog-store state
 * (see ConfirmDialog.svelte / Modal.svelte), independent of the outro's completion.
 */
export function trapFocus(node: HTMLElement) {
	function focusableElements(): HTMLElement[] {
		return Array.from(
			node.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
	}

	const first = focusableElements()[0];
	(first ?? node).focus();

	function handleKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = focusableElements();
		if (focusable.length === 0) {
			event.preventDefault();
			node.focus();
			return;
		}
		const firstEl = focusable[0];
		const lastEl = focusable[focusable.length - 1];

		if (event.shiftKey && document.activeElement === firstEl) {
			event.preventDefault();
			lastEl.focus();
		} else if (!event.shiftKey && document.activeElement === lastEl) {
			event.preventDefault();
			firstEl.focus();
		}
	}

	node.addEventListener('keydown', handleKeydown);

	return {
		destroy() {
			node.removeEventListener('keydown', handleKeydown);
		}
	};
}
