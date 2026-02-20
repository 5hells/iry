<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell } from '@lucide/svelte';
	import { toasts } from '$lib/stores/notifications';

	type NotificationItem = {
		id: string;
		type: string;
		title: string;
		message: string;
		linkUrl?: string | null;
		imageUrl?: string | null;
		isRead: boolean;
		createdAt: number;
		fromUser?: {
			id: string;
			name: string;
			image: string | null;
		} | null;
	};

	let notifications = $state<NotificationItem[]>([]);
	let loading = $state(true);

	onMount(async () => {
		await loadNotifications();
	});

	async function loadNotifications() {
		loading = true;
		try {
			const response = await fetch('/api/notifications');
			if (response.ok) {
				const data = await response.json();
				notifications = data.notifications || [];
			}
		} catch (error) {
			console.error('Failed to load notifications:', error);
		} finally {
			loading = false;
		}
	}

	async function markAllRead() {
		try {
			const response = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markAll: true })
			});

			if (response.ok) {
				notifications = notifications.map((n) => ({ ...n, isRead: true }));
				toasts.add('Notifications marked as read', 'success');
			} else {
				toasts.add('Failed to update notifications', 'error');
			}
		} catch (error) {
			console.error('Failed to mark notifications:', error);
			toasts.add('Failed to update notifications', 'error');
		}
	}

	function formatTimeAgo(timestamp: number) {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

<div class="mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="flex items-center gap-2 h1">
			<Bell size={28} />
			notifications
		</h1>
		<button
			onclick={markAllRead}
			class="variant-filled-primary btn"
			disabled={notifications.length === 0}
		>
			mark all read
		</button>
	</div>

	{#if loading}
		<p class="opacity-50">Loading...</p>
	{:else if notifications.length === 0}
		<div class="card p-6 text-center opacity-60">No notifications yet.</div>
	{:else}
		<div class="space-y-3">
			{#each notifications as notif (notif.id)}
				<a
					href={notif.linkUrl || '#'}
					class="block card border p-4 transition hover:border-[var(--border-color)]"
					class:opacity-70={notif.isRead}
				>
					<div class="flex items-start gap-3">
						{#if notif.fromUser?.image}
							<img
								src={notif.fromUser.image}
								alt={notif.fromUser?.name ?? ''}
								class="h-10 w-10 rounded-full object-cover"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
							>
								<span class="text-sm font-semibold">
									{notif.fromUser?.name?.[0]?.toUpperCase() || 'N'}
								</span>
							</div>
						{/if}
						<div class="flex-1">
							<div class="flex items-center justify-between">
								<h3 class="font-semibold">{notif.title}</h3>
								<span class="text-xs opacity-50">{formatTimeAgo(notif.createdAt)}</span>
							</div>
							<p class="text-sm opacity-80">{notif.message}</p>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
