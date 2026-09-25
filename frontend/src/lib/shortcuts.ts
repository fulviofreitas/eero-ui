/**
 * Keyboard shortcut table (WP9 § 6.2 Tier 3 "command palette and shortcut layer").
 *
 * Single source of truth so the global keydown handler (+layout.svelte) and the ShortcutsHelp
 * dialog never drift - each shortcut is described once here and both consumers read from this
 * table instead of hardcoding key combos/labels independently.
 */

export interface Shortcut {
	/** Stable id, also used as the React/Svelte-style keyed list identity in ShortcutsHelp. */
	id: string;
	/** Human-readable key combo, platform-neutral - "Mod" reads as "⌘" on the help dialog. */
	keys: string[];
	description: string;
}

export const shortcuts: Shortcut[] = [
	{ id: 'command-palette', keys: ['Mod', 'K'], description: 'Open the command palette' },
	{ id: 'shortcuts-help', keys: ['?'], description: 'Show keyboard shortcuts' },
	{ id: 'close', keys: ['Esc'], description: 'Close the open dialog or menu' }
];

/**
 * True when `event.target` is an editable surface (input/textarea/contenteditable) - shortcuts
 * other than the exact modifier combo they're bound to must not fire while the user is typing,
 * or every plain "?" keystroke in a search box would pop the shortcuts dialog.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
	// jsdom doesn't compute `isContentEditable` (it requires full layout), but it does reflect
	// the `contentEditable` IDL attribute as a plain string - check both so this works in real
	// browsers (isContentEditable) and in the test environment (contentEditable === 'true').
	return target.isContentEditable === true || target.contentEditable === 'true';
}

/** True for the ⌘K / Ctrl+K combo - Mod resolves to metaKey on Mac, ctrlKey elsewhere. */
export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
	return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
}

/** True for the bare "?" key (Shift+/ on most layouts) used to open the shortcuts help dialog. */
export function isShortcutsHelpKey(event: KeyboardEvent): boolean {
	return event.key === '?' && !event.metaKey && !event.ctrlKey && !event.altKey;
}
