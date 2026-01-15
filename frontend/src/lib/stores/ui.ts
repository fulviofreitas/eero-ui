/**
 * UI Store
 * 
 * Manages UI state: toasts, modals, loading states.
 */

import { writable, derived } from 'svelte/store';

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
}

// ============================================
// Store
// ============================================

const initialState: UIState = {
	toasts: [],
	confirmDialog: null,
	sidebarOpen: true,
	globalLoading: false
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
			
			update(s => ({
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
			update(s => ({
				...s,
				toasts: s.toasts.filter(t => t.id !== id)
			}));
		},

		/**
		 * Show confirmation dialog
		 */
		confirm(options: ConfirmDialog): void {
			update(s => ({
				...s,
				confirmDialog: options
			}));
		},

		/**
		 * Close confirmation dialog
		 */
		closeConfirm(): void {
			update(s => ({
				...s,
				confirmDialog: null
			}));
		},

		/**
		 * Toggle sidebar
		 */
		toggleSidebar(): void {
			update(s => ({
				...s,
				sidebarOpen: !s.sidebarOpen
			}));
		},

		/**
		 * Set global loading state
		 */
		setGlobalLoading(loading: boolean): void {
			update(s => ({
				...s,
				globalLoading: loading
			}));
		}
	};
}

export const uiStore = createUIStore();

// Derived stores
export const toasts = derived(uiStore, $ui => $ui.toasts);
export const confirmDialog = derived(uiStore, $ui => $ui.confirmDialog);
export const sidebarOpen = derived(uiStore, $ui => $ui.sidebarOpen);
export const globalLoading = derived(uiStore, $ui => $ui.globalLoading);
