/**
 * UI Store
 *
 * Manages UI state: toasts, modals, loading states, theme.
 */

import { writable, derived } from 'svelte/store';
import { resolveInitialTheme, hasStoredThemePreference, THEME_STORAGE_KEY } from '$lib/theme';
import type { Theme } from '$lib/theme';

// ============================================
// Types
// ============================================

interface Toast {
	id: string;
	type: 'success' | 'error' | 'info' | 'warning';
	message: string;
	duration?: number;
}

/** Toasts visible at once (WP9 § 6.2 Tier 3) - the oldest is evicted once a 6th arrives. */
const MAX_TOASTS = 5;

interface ConfirmDialog {
	title: string;
	message: string;
	/** Optional bullet points rendered under the message (e.g. multiple distinct warnings). */
	details?: string[];
	confirmText?: string;
	cancelText?: string;
	danger?: boolean;
	onConfirm: () => void | Promise<void>;
	/**
	 * S3: called when the dialog is dismissed without confirming (Cancel button, Escape, or
	 * clicking the backdrop) - lets callers clear sensitive local state (e.g. a generated
	 * password sitting in a form field) on every exit path, not only on confirm.
	 */
	onCancel?: () => void;
}

interface UIState {
	toasts: Toast[];
	confirmDialog: ConfirmDialog | null;
	sidebarOpen: boolean;
	globalLoading: boolean;
	theme: Theme;
}

// ============================================
// Store
// ============================================

// Get initial theme from localStorage, falling back to the OS preference (see lib/theme.ts).
function getInitialTheme(): Theme {
	if (typeof window === 'undefined') return 'dark';
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
	return resolveInitialTheme(stored, prefersDark);
}

// Persist sidebar state; first-time visitors default open on desktop, closed on mobile
function getInitialSidebarOpen(): boolean {
	if (typeof window !== 'undefined') {
		const saved = localStorage.getItem('eero-ui-sidebar-open');
		if (saved !== null) return saved === 'true';
		return window.innerWidth > 768;
	}
	return true;
}

const initialState: UIState = {
	toasts: [],
	confirmDialog: null,
	sidebarOpen: true,
	globalLoading: false,
	theme: 'dark' // Will be updated on mount
};

function createUIStore() {
	const { subscribe, update } = writable<UIState>(initialState);

	let toastIdCounter = 0;

	// Per-toast auto-dismiss bookkeeping, kept out of the (serializable) store state itself.
	// `remainingMs` is only meaningful while paused (timer === null); while running it's derived
	// from `startedAt` at pause time instead of drifting via repeated setTimeout math.
	const toastTimers = new Map<
		string,
		{ timer: ReturnType<typeof setTimeout> | null; remainingMs: number; startedAt: number }
	>();

	return {
		subscribe,

		/**
		 * Show a toast notification. Stacks up to MAX_TOASTS - the oldest is evicted (and its
		 * timer cleared) once a new one would exceed that.
		 */
		toast(type: Toast['type'], message: string, duration = 5000): string {
			const id = `toast-${++toastIdCounter}`;

			update((s) => {
				const toasts = [...s.toasts, { id, type, message, duration }];
				if (toasts.length > MAX_TOASTS) {
					const evicted = toasts.shift();
					if (evicted) {
						clearTimeout(toastTimers.get(evicted.id)?.timer ?? undefined);
						toastTimers.delete(evicted.id);
					}
				}
				return { ...s, toasts };
			});

			// Auto-remove after duration
			if (duration > 0) {
				toastTimers.set(id, {
					timer: setTimeout(() => this.removeToast(id), duration),
					remainingMs: duration,
					startedAt: Date.now()
				});
			}

			return id;
		},

		/**
		 * Pause a toast's auto-dismiss timer (hover/focus - WP9 § 6.2 Tier 3). No-op for a toast
		 * with no timer (duration <= 0, or already dismissed).
		 */
		pauseToast(id: string): void {
			const entry = toastTimers.get(id);
			if (!entry || entry.timer === null) return;
			clearTimeout(entry.timer);
			entry.remainingMs = Math.max(0, entry.remainingMs - (Date.now() - entry.startedAt));
			entry.timer = null;
		},

		/** Resume a paused toast's auto-dismiss timer with whatever time it had left. */
		resumeToast(id: string): void {
			const entry = toastTimers.get(id);
			if (!entry || entry.timer !== null) return;
			entry.startedAt = Date.now();
			entry.timer = setTimeout(() => this.removeToast(id), entry.remainingMs);
		},

		/**
		 * Show success toast
		 */
		success(message: string, duration?: number): string {
			return this.toast('success', message, duration);
		},

		/**
		 * Show error toast
		 */
		error(message: string, duration?: number): string {
			return this.toast('error', message, duration);
		},

		/**
		 * Show info toast
		 */
		info(message: string, duration?: number): string {
			return this.toast('info', message, duration);
		},

		/**
		 * Show warning toast
		 */
		warning(message: string, duration?: number): string {
			return this.toast('warning', message, duration);
		},

		/**
		 * Remove a toast
		 */
		removeToast(id: string): void {
			const entry = toastTimers.get(id);
			if (entry?.timer !== null && entry?.timer !== undefined) clearTimeout(entry.timer);
			toastTimers.delete(id);
			update((s) => ({
				...s,
				toasts: s.toasts.filter((t) => t.id !== id)
			}));
		},

		/**
		 * Show confirmation dialog
		 */
		confirm(options: ConfirmDialog): void {
			update((s) => ({
				...s,
				confirmDialog: options
			}));
		},

		/**
		 * Close confirmation dialog
		 */
		closeConfirm(): void {
			update((s) => ({
				...s,
				confirmDialog: null
			}));
		},

		/**
		 * Initialize sidebar state from localStorage (call on mount)
		 */
		initSidebar(): void {
			const sidebarOpen = getInitialSidebarOpen();
			update((s) => ({ ...s, sidebarOpen }));
		},

		/**
		 * Toggle sidebar and persist preference
		 */
		toggleSidebar(): void {
			update((s) => {
				const sidebarOpen = !s.sidebarOpen;
				if (typeof window !== 'undefined') {
					localStorage.setItem('eero-ui-sidebar-open', String(sidebarOpen));
				}
				return { ...s, sidebarOpen };
			});
		},

		/**
		 * Close sidebar
		 */
		closeSidebar(): void {
			update((s) => ({ ...s, sidebarOpen: false }));
		},

		/**
		 * Set global loading state
		 */
		setGlobalLoading(loading: boolean): void {
			update((s) => ({
				...s,
				globalLoading: loading
			}));
		},

		/**
		 * Initialize theme from localStorage (call on mount). While no explicit preference is
		 * stored, keep following the OS `prefers-color-scheme` setting live.
		 */
		initTheme(): void {
			const theme = getInitialTheme();
			update((s) => ({ ...s, theme }));
			this.applyTheme(theme, { persist: false });

			if (typeof window !== 'undefined' && window.matchMedia) {
				const media = window.matchMedia('(prefers-color-scheme: dark)');
				const handleChange = (e: MediaQueryListEvent) => {
					const stored = localStorage.getItem(THEME_STORAGE_KEY);
					if (hasStoredThemePreference(stored)) return; // explicit choice wins
					const next: Theme = e.matches ? 'dark' : 'light';
					update((s) => ({ ...s, theme: next }));
					this.applyTheme(next, { persist: false });
				};
				media.addEventListener('change', handleChange);
			}
		},

		/**
		 * Toggle between light and dark theme
		 */
		toggleTheme(): void {
			update((s) => {
				const newTheme: Theme = s.theme === 'dark' ? 'light' : 'dark';
				this.applyTheme(newTheme);
				return { ...s, theme: newTheme };
			});
		},

		/**
		 * Set specific theme
		 */
		setTheme(theme: Theme): void {
			update((s) => ({ ...s, theme }));
			this.applyTheme(theme);
		},

		/**
		 * Apply theme to document, and persist it as an explicit user preference unless told
		 * otherwise (OS-driven updates while unset must NOT be written back as a stored choice).
		 */
		applyTheme(theme: Theme, { persist = true }: { persist?: boolean } = {}): void {
			if (typeof window !== 'undefined') {
				document.documentElement.setAttribute('data-theme', theme);
				if (persist) {
					localStorage.setItem(THEME_STORAGE_KEY, theme);
				}
			}
		}
	};
}

export const uiStore = createUIStore();

// Derived stores
export const toasts = derived(uiStore, ($ui) => $ui.toasts);
export const confirmDialog = derived(uiStore, ($ui) => $ui.confirmDialog);
export const sidebarOpen = derived(uiStore, ($ui) => $ui.sidebarOpen);
export const globalLoading = derived(uiStore, ($ui) => $ui.globalLoading);
export const theme = derived(uiStore, ($ui) => $ui.theme);
