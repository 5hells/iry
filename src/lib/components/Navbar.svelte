<script lang="ts">
	import { Music, LogOut, Moon, Sun, House, MessageCircle, Settings, Book } from '@lucide/svelte';
	import { links } from '$lib/routes';
	import { darkMode, toggleDarkMode, initializeDarkMode } from '$lib/stores';
	import { onMount } from 'svelte';

	interface Notification {
		id: string;
		message: string;
		type?: string;
		linkUrl?: string;
		isRead?: boolean;
	}

	let notifOpen = $state(false);
	let notifications = $state<Notification[]>([]);
	let loadingNotifications = $state(false);
	let notificationsLoaded = $state(false);

	let { data, children } = $props();

	if (!data) {
		data = { user: null };
	}
	if (!data.user) {
		data.user = null;
	}

	async function loadNotifications() {
		if (loadingNotifications || notificationsLoaded) return;
		loadingNotifications = true;
		try {
			const response = await fetch('/api/notifications?unreadOnly=true&limit=10');
			if (response.ok) {
				const data = await response.json();
				notifications = (data.notifications || []).map((n: any) => ({
					id: n.id,
					message: n.message || `${n.fromUser?.name || 'Someone'} ${n.type}`,
					type: n.type,
					isRead: n.isRead
				}));
				notificationsLoaded = true;
			}
		} catch (error) {
			console.error('Failed to load notifications:', error);
		} finally {
			loadingNotifications = false;
		}
	}

	$effect(() => {
		if (notifOpen && !notificationsLoaded) {
			loadNotifications();
		}
	});

	let isDarkMode = $state(false);

	onMount(() => {
		const initialized = initializeDarkMode();
		isDarkMode = initialized;

		
		const unsubscribe = darkMode.subscribe(value => {
			isDarkMode = value;
		});

		return unsubscribe;
	});

	function handleToggleDarkMode() {
		toggleDarkMode();
	}

	$effect(() => {
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	const isGuest = $derived(!!data?.user?.isGuest);
	const visibleLinks = $derived(links.filter((link: any) => !link.requiresAuth || !isGuest));

	function isActive(href: string): boolean {
		if (typeof window === 'undefined') return false;
		return window.location.pathname === href;
	}
</script>

<div class="app-layout flex min-h-screen flex-col lg:flex-row">
	
	<aside
		class="sidebar fixed inset-x-0 inset-y-0 top-0 bottom-0 left-0 z-20 hidden w-64 flex-shrink-0 flex-col overflow-y-auto border-r lg:flex"
	>
		<div class="flex h-full flex-col py-4">
			
			<div class="mb-8 px-4">
				<a
					href="/"
					target="_self"
					class="group flex items-center gap-3 transition hover:opacity-80"
				>
					<div
						class="flex h-12 w-12 items-center justify-center rounded bg-[var(--bg-secondary)] transition group-hover:bg-[var(--bg-secondary)]"
					>
						<Music class="h-7 w-7 text-white" />
					</div>
					<span class="text-xl font-bold text-[var(--text-primary)] lowercase">iry</span>
				</a>
			</div>

			
			<nav class="flex-1 space-y-2 px-3">
				{#each visibleLinks as link}
					{@const active = isActive(link.href)}
					<a
						href={link.href}
						target="_self"
						class="nav-link flex items-center gap-4 rounded px-4 py-3 lowercase transition"
						class:active
					>
						<span class="h-6 w-6 flex-shrink-0">
							{#if link.id === 'home'}
								<House class="h-6 w-6" />
							{:else if link.id === 'music'}
								<Music class="h-6 w-6" />
							{:else if link.id === 'collections'}
								<Book class="h-6 w-6" />
							{:else if link.id === 'messages'}
								<MessageCircle class="h-6 w-6" />
							{:else if link.id === 'settings'}
								<Settings class="h-6 w-6" />
							{/if}
						</span>
						<span class="text-lg font-semibold">{link.label}</span>
					</a>
				{/each}
			</nav>

			
			<div class="mt-auto space-y-2 px-3">
				{#if data?.user}
					{#if !data.user.isGuest && data.user.id && data.user.name}
						<div
							class="profile-card flex items-center gap-3 rounded border px-4 py-3 transition hover:border-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/10"
						>
							<a
								href={`/user/${data.user.id}`}
								data-sveltekit-reload
								class="flex min-w-0 flex-1 items-center gap-3"
							>
								<div
									class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-[var(--bg-secondary)] font-bold text-white"
								>
									{#if data.user.image}
										<img
											src={data.user.image}
											alt={data.user.name}
											class="h-full w-full object-cover"
										/>
									{:else}
										{(data.user.name || 'U')[0].toUpperCase()}
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate font-semibold">{data.user.name || 'User'}</p>
								</div>
							</a>

							{#if notifOpen}
								<div
									class="scale-pop-in absolute bottom-20 left-0 z-50 w-full rounded border bg-[var(--bg-secondary)] p-3 shadow"
								>
									<p class="text-sm font-semibold lowercase">notifications</p>
									{#if loadingNotifications}
										<p class="mt-2 text-sm italic opacity-50">loading...</p>
									{:else if notifications.length > 0}
										<ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
											{#each notifications as notif}
												<li
													class="border-b px-1 py-2 text-sm transition last:border-0 hover:opacity-80"
													onclick={() => window.open(notif.linkUrl || '#', '_blank')}
												>
													{notif.message}
												</li>
											{/each}
										</ul>
									{:else}
										<p class="mt-2 text-sm italic opacity-50">no new notifications</p>
									{/if}
								</div>
							{/if}
							<div class="relative flex items-center gap-2">
								<button
									onclick={() => (notifOpen = !notifOpen)}
									class="relative rounded p-2 transition hover:bg-[var(--bg-secondary)]"
									aria-label="Notifications"
								>
									
									<svg
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path
											d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118.6 14.6V11a6 6 0 10-12 0v3.6c0 .538-.214 1.055-.595 1.495L4 17h5"
										/>
									</svg>
								</button>
								<a
									href="/auth/logout"
									class="flex items-center gap-1 text-xs lowercase transition hover:text-[var(--text-primary)]"
								>
									<LogOut class="h-3 w-3" />
									logout
								</a>
							</div>
						</div>
					{:else}
						<a
							href="/auth/login"
							class="flex w-full items-center justify-center gap-3 rounded bg-[var(--bg-secondary)] px-4 py-3 font-bold text-white lowercase transition hover:bg-[var(--bg-secondary)]"
						>
							login
						</a>
					{/if}
				{/if}
			</div>
		</div>
	</aside>

	
	<main class="flex min-w-0 flex-1 flex-col pb-16 lg:ml-64 lg:pb-0">
		<div class="flex-1">
			{@render children()}
		</div>

		
		<nav
			class="fixed inset-x-0 right-0 bottom-0 left-0 z-20 border-t border-[var(--border-color)] bg-[var(--bg-base)] px-2 py-2 lg:hidden"
		>
			<div class="flex gap-1 px-2 py-2">
				{#each visibleLinks as link}
					{@const active = isActive(link.href)}
					<a
						href={link.href}
						target="_self"
						class="flex flex-1 items-center justify-center rounded px-2 py-3 transition"
						class:bg-[var(--bg-secondary)]={active}
						class:dark:bg-[var(--bg-secondary)]={active}
						class:text-[var(--text-primary)]={active}
						class:dark:text-[var(--text-primary)]={active}
						title={link.label}
					>
						{#if link.id === 'home'}
							<House class="h-6 w-6" />
						{:else if link.id === 'music'}
							<Music class="h-6 w-6" />
						{:else if link.id === 'collections'}
							<Book class="h-6 w-6" />
						{:else if link.id === 'messages'}
							<MessageCircle class="h-6 w-6" />
						{:else if link.id === 'settings'}
							<Settings class="h-6 w-6" />
						{/if}
					</a>
				{/each}
				{#if data?.user}
					{#if data.user.isGuest}
						<a
							href="/auth/login"
							class="flex flex-1 items-center justify-center rounded px-2 py-3 transition hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--bg-secondary)]"
							title="Login"
						>
							<span class="text-lg">→</span>
						</a>
					{:else if data.user.id && data.user.name}
						<a
							href={`/user/${data.user.id}`}
							data-sveltekit-reload
							class="flex flex-1 items-center justify-center rounded px-2 py-3 transition"
							title="Profile"
						>
							<div
								class="flex h-6 w-6 items-center justify-center overflow-hidden rounded bg-[var(--bg-secondary)] text-xs font-bold text-white"
							>
								{#if data.user.image}
									<img
										src={data.user.image}
										alt={data.user.name}
										class="h-full w-full object-cover"
									/>
								{:else}
									{(data.user.name || 'U')[0].toUpperCase()}
								{/if}
							</div>
						</a>
					{/if}
				{/if}
			</div>
		</nav>
	</main>
</div>

<style>
	.scale-pop-in {
		animation: scale-pop-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
	}

	@keyframes scale-pop-in {
		0% {
			opacity: 0;
			transform: scale(0);
		}
		100% {
			opacity: 1;
			transform: scale(0.9);
		}
	}

	.sidebar {
		background-color: var(--bg-secondary);
		border-color: var(--border-color);
		color: var(--text-primary);
	}

	.profile-card {
		user-select: none;
		border-color: var(--border-color);
		color: var(--text-primary);
		background-color: var(--bg-secondary);
	}

	.profile-card:hover {
		border-color: rgb(var(--color-primary-500));
		background-color: var(--bg-tertiary);
	}
</style>
