import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info' | 'warning';
	duration?: number;
}

export interface Modal {
	id: string;
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void | Promise<void>;
	isDangerous?: boolean;
}

function createToastStore() {
	const { subscribe, set, update } = writable<Toast[]>([]);

	return {
		subscribe,
		add: (
			message: string,
			type: 'success' | 'error' | 'info' | 'warning' = 'info',
			duration = 3000
		) => {
			const id = `toast-${Date.now()}-${Math.random()}`;
			const newToast: Toast = { id, message, type, duration };

			update((toasts) => [...toasts, newToast]);

			setTimeout(() => {
				update((toasts) => toasts.filter((t) => t.id !== id));
			}, duration);
		},
		remove: (id: string) => {
			update((toasts) => toasts.filter((t) => t.id !== id));
		},
		clear: () => {
			set([]);
		}
	};
}

function createModalStore() {
	const { subscribe, set, update } = writable<Modal[]>([]);

	return {
		subscribe,
		open: (modal: Omit<Modal, 'id'>) => {
			const id = `modal-${Date.now()}-${Math.random()}`;
			const newModal: Modal = { ...modal, id };

			update((modals) => [...modals, newModal]);

			return id;
		},
		close: (id: string) => {
			update((modals) => modals.filter((m) => m.id !== id));
		},
		closeAll: () => {
			set([]);
		},
		confirm: (options: Omit<Modal, 'id' | 'isDangerous'>) => {
			return new Promise<void>((resolve, reject) => {
				const id = `modal-${Date.now()}-${Math.random()}`;
				const newModal: Modal = {
					...options,
					id,
					isDangerous: false,
					onConfirm: () => {
						options.onConfirm?.();
						resolve();
						update((modals) => modals.filter((m) => m.id !== id));
					},
					onCancel: () => {
						options.onCancel?.();
						reject();
						update((modals) => modals.filter((m) => m.id !== id));
					}
				};

				update((modals) => [...modals, newModal]);
			});
		},
		confirmDanger: (options: Omit<Modal, 'id' | 'isDangerous'>) => {
			return new Promise<void>((resolve, reject) => {
				const id = `modal-${Date.now()}-${Math.random()}`;
				const newModal: Modal = {
					...options,
					id,
					isDangerous: true,
					onConfirm: () => {
						options.onConfirm?.();
						resolve();
						update((modals) => modals.filter((m) => m.id !== id));
					},
					onCancel: () => {
						options.onCancel?.();
						reject();
						update((modals) => modals.filter((m) => m.id !== id));
					}
				};

				update((modals) => [...modals, newModal]);
			});
		}
	};
}

export const toasts = createToastStore();
export const modals = createModalStore();

export function addToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
	toasts.add(message, type);
}
