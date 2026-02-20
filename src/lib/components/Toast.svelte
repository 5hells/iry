<script lang="ts">
	import { toasts } from '$lib/stores/notifications';
	import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from '@lucide/svelte';

	let toastList = $state<any[]>([]);

	const unsubscribe = toasts.subscribe((t) => {
		toastList = t;
	});

	$effect(() => {
		return () => {
			unsubscribe();
		};
	});
</script>

{#if toastList.length > 0}
	<div class="fixed right-4 bottom-4 z-50 max-w-sm space-y-2">
		{#each toastList as toast (toast.id)}
			<div
				class="animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg duration-200 toast-{toast.type}"
			>
				<div class="flex-shrink-0 pt-0.5">
					{#if toast.type === 'success'}
						<CheckCircle size={20} class="text-green-500" />
					{:else if toast.type === 'error'}
						<AlertCircle size={20} class="text-red-500" />
					{:else if toast.type === 'warning'}
						<AlertTriangle size={20} class="text-yellow-500" />
					{:else}
						<Info size={20} class="text-blue-500" />
					{/if}
				</div>
				<div class="flex-1">
					<p class="font-medium">{toast.message}</p>
				</div>
				<button
					onclick={() => toasts.remove(toast.id)}
					class="flex-shrink-0 opacity-60 transition hover:opacity-100"
					type="button"
				>
					<X size={16} />
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	:global(.toast-success) {
		border-color: rgb(187 247 208);
		background-color: rgb(240 253 244);
		color: rgb(22 101 52);
	}

	:global(.dark .toast-success) {
		border-color: rgb(20 83 45);
		background-color: rgb(20 83 45 / 0.2);
		color: rgb(187 247 208);
	}

	:global(.toast-error) {
		border-color: rgb(254 226 226);
		background-color: rgb(254 242 242);
		color: rgb(127 29 29);
	}

	:global(.dark .toast-error) {
		border-color: rgb(127 29 29);
		background-color: rgb(127 29 29 / 0.2);
		color: rgb(254 226 226);
	}

	:global(.toast-info) {
		border-color: rgb(219 234 254);
		background-color: rgb(240 249 255);
		color: rgb(30 58 138);
	}

	:global(.dark .toast-info) {
		border-color: rgb(30 58 138);
		background-color: rgb(30 58 138 / 0.2);
		color: rgb(219 234 254);
	}

	:global(.toast-warning) {
		border-color: rgb(253 230 138);
		background-color: rgb(254 252 232);
		color: rgb(113 63 18);
	}

	:global(.dark .toast-warning) {
		border-color: rgb(113 63 18);
		background-color: rgb(113 63 18 / 0.2);
		color: rgb(253 230 138);
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.animate-in.slide-in-from-bottom-2) {
		animation: slideIn 200ms ease-out forwards;
	}
</style>
