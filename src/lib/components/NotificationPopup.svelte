<script lang="ts">
	import { Bell } from '@lucide/svelte';
	export let open = false;
	let unreadCount = 0;
</script>

<button
	onclick={() => (open = !open)}
	class="relative rounded-lg p-2 transition-colors hover:bg-[var(--bg-secondary)]"
	aria-label="Notifications"
>
	<Bell size={20} class="text-[var(--text-primary)]" />
	{#if unreadCount > 0}
		<span
			class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
		>
			{unreadCount > 9 ? '9+' : unreadCount}
		</span>
	{/if}
</button>

{#if open}
	<div
		class="fixed right-4 bottom-full z-50 mb-2 w-56 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 shadow-2xl"
	>
		<p class="text-sm font-semibold lowercase">notifications</p>
		<div class="mt-3 space-y-2">
			<p class="text-xs opacity-60">no notifications yet</p>
		</div>
	</div>
{/if}
