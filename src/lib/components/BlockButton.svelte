<script lang="ts">
	import { Ban } from '@lucide/svelte';
	import { toasts } from '$lib/stores/notifications';

	interface Props {
		userId: string;
		userName?: string;
		isBlocked: boolean;
		onBlockChange?: (isBlocked: boolean) => void;
		size?: 'sm' | 'md' | 'lg';
		variant?: 'button' | 'icon';
	}

	let {
		userId,
		userName = 'User',
		isBlocked = false,
		onBlockChange,
		size = 'md',
		variant = 'button'
	}: Props = $props();

	let loading = $state(false);

	async function toggleBlock() {
		if (loading) return;

		loading = true;
		try {
			const response = await fetch('/api/user/block', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId,
					action: isBlocked ? 'unblock' : 'block'
				})
			});

			if (response.ok) {
				const data = await response.json();
				isBlocked = data.blocked;
				onBlockChange?.(isBlocked);

				toasts.add(isBlocked ? `Blocked ${userName}` : `Unblocked ${userName}`, "success");
			} else {
				const error = await response.json();
				toasts.add(error.message || 'Failed to update block status', 'error');
			}
		} catch (error) {
			console.error('Error toggling block status:', error);
            toasts.add('An error occurred while updating block status', 'error');
		} finally {
			loading = false;
		}
	}

	const sizeClasses = {
		sm: 'text-xs px-2 py-1',
		md: 'text-sm px-3 py-2',
		lg: 'text-base px-4 py-2'
	};

	const iconSizes = {
		sm: 16,
		md: 18,
		lg: 20
	};
</script>

{#if variant === 'icon'}
	<button
		onclick={toggleBlock}
		disabled={loading}
		title={isBlocked ? 'Unblock user' : 'Block user'}
		class="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
	>
		<Ban
			size={iconSizes[size]}
			class={isBlocked ? 'text-red-500' : ''}
			fill={isBlocked ? 'currentColor' : 'none'}
		/>
	</button>
{:else}
	<button
		onclick={toggleBlock}
		disabled={loading}
		class={`rounded transition disabled:cursor-not-allowed disabled:opacity-50 ${ isBlocked
			? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
			: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
		} ${sizeClasses[size]}`}
	>
		<span class="flex items-center gap-2">
			<Ban size={iconSizes[size]} />
			{loading ? 'Loading...' : isBlocked ? 'Unblock' : 'Block'}
		</span>
	</button>
{/if}
