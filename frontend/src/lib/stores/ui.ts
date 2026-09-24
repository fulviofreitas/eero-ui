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

interface ConfirmDialog {
	title: string;
	message: string;
	/** Optional bullet points rendered under the message (e.g. multiple distinct warnings). */
	details?: string[];
	confirmText?: string;
	cancelText?: string;
	danger?: boolean;
	onConfirm: () => void | Promise<void>;
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

	return {
		subscribe,

		/**
		 * Show a toast notification
		 */
		toast(type: Toast['type'], message: string, duration = 5000): string {
			const id = `toast-${++toastIdCounter}`;

			update((s) => ({
				...s,
				toasts: [...s.toasts, { id, type, message, duration }]
			}));

			// Auto-remove after duration
			if (duration > 0) {
				setTimeout(() => {
					this.removeToast(id);
				}, duration);
			}

			return id;
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
