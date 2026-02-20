<script lang="ts">
	import { modals } from '$lib/stores/notifications';
	import { X } from '@lucide/svelte';

	let modalList = $state<any[]>([]);

	const unsubscribe = modals.subscribe((m) => {
		modalList = m;
		console.log('Modal list updated:', m);
	});

	$effect(() => {
		return () => {
			unsubscribe();
		};
	});

	let processingId: string | null = $state(null);

	async function handleConfirm(modal: any) {
		console.log('handleConfirm called for modal:', modal.id, modal.onConfirm);
		processingId = modal.id;
		try {
			if (modal.onConfirm) {
				console.log('Executing onConfirm');
				await modal.onConfirm();
			} else {
				console.warn('No onConfirm callback for modal:', modal.id);
			}
		} finally {
			console.log('Closing modal:', modal.id);
			modals.close(modal.id);
			processingId = null;
		}
	}

	async function handleCancel(modal: any) {
		processingId = modal.id;
		try {
			if (modal.onCancel) {
				await modal.onCancel();
			}
		} finally {
			modals.close(modal.id);
			processingId = null;
		}
	}

	function closeModal(id: string) {
		console.log('closeModal:', id);
		modals.close(id);
	}
</script>

{#if modalList.length > 0}
	
	<div
		class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				closeModal(modalList[0].id);
			}
		}}
	></div>

	
	{#each modalList as modal (modal.id)}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				class="relative w-full max-w-md rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl"
			>
				
				<div class="flex items-center justify-between border-b border-[var(--border-color)] p-6">
					<h2 class="text-lg font-semibold text-[var(--text-primary)]">{modal.title}</h2>
					<button
						onclick={() => closeModal(modal.id)}
						class="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
						type="button"
					>
						<X size={20} />
					</button>
				</div>

				
				<div class="p-6">
					<p class="text-[var(--text-primary)]">{modal.message}</p>
				</div>

				
				<div class="flex gap-3 border-t border-[var(--border-color)] p-6">
					<button
						onclick={() => handleCancel(modal)}
						disabled={processingId === modal.id}
						class="flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-4 py-2 font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
						type="button"
					>
						{modal.cancelText || 'Cancel'}
					</button>
					<button
						onclick={() => handleConfirm(modal)}
						disabled={processingId === modal.id}
						class="flex-1 rounded px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
						class:bg-red-600={modal.isDangerous}
						class:hover:bg-red-700={modal.isDangerous}
						class:bg-blue-600={!modal.isDangerous}
						class:hover:bg-blue-700={!modal.isDangerous}
						type="button"
					>
						{modal.confirmText || 'Confirm'}
					</button>
				</div>
			</div>
		</div>
	{/each}
{/if}
