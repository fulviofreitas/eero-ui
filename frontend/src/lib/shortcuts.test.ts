import { describe, it, expect } from 'vitest';
import { isCommandPaletteShortcut, isShortcutsHelpKey, isTypingTarget } from './shortcuts';

function keydown(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
	return new KeyboardEvent('keydown', init);
}

describe('isCommandPaletteShortcut', () => {
	it('matches Ctrl+K', () => {
		expect(isCommandPaletteShortcut(keydown({ key: 'k', ctrlKey: true }))).toBe(true);
	});

	it('matches Cmd+K (metaKey)', () => {
		expect(isCommandPaletteShortcut(keydown({ key: 'K', metaKey: true }))).toBe(true);
	});

	it('does not match a bare K', () => {
		expect(isCommandPaletteShortcut(keydown({ key: 'k' }))).toBe(false);
	});
});

describe('isShortcutsHelpKey', () => {
	it('matches a bare "?"', () => {
		expect(isShortcutsHelpKey(keydown({ key: '?' }))).toBe(true);
	});

	it('does not match "?" with a modifier held', () => {
		expect(isShortcutsHelpKey(keydown({ key: '?', ctrlKey: true }))).toBe(false);
		expect(isShortcutsHelpKey(keydown({ key: '?', metaKey: true }))).toBe(false);
		expect(isShortcutsHelpKey(keydown({ key: '?', altKey: true }))).toBe(false);
	});
});

describe('isTypingTarget', () => {
	it('is true for input, textarea and contenteditable elements', () => {
		expect(isTypingTarget(document.createElement('input'))).toBe(true);
		expect(isTypingTarget(document.createElement('textarea'))).toBe(true);

		const editable = document.createElement('div');
		editable.contentEditable = 'true';
		expect(isTypingTarget(editable)).toBe(true);
	});

	it('is false for a plain element or null', () => {
		expect(isTypingTarget(document.createElement('div'))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});
