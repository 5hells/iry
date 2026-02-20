<script lang="ts">
	import { onMount } from 'svelte';
	import { Heart, Plus, Share2, Lock, Globe, ListOrdered } from '@lucide/svelte';
	import CollectionCover from '$lib/components/CollectionCover.svelte';
	import type { PageData } from './$types';

	interface Collection {
		id: string;
		userId: string;
		title: string;
		description: string | null;
		isOrdered: boolean;
		isPublic: boolean;
		coverImageUrl: string | null;
		coverImageType: string | null;
		tracks: Array<{ id: string; track: { id: string; title: string; trackNumber: number } }>;
		user: { id: string; name: string; image: string | null };
		createdAt: number;
	}

	let { data }: { data: PageData } = $props();

	let collections = $state<Collection[]>([]);
	let loading = $state(true);
	let showCreateForm = $state(false);
	let newTitle = $state('');
	let newDescription = $state('');
	let newIsOrdered = $state(false);
	let newIsPublic = $state(true);
	let filterQuery = $state('');
	let sortBy = $state<'recent' | 'popular' | 'name'>('recent');

	onMount(async () => {
		try {
			const response = await fetch('/api/collections');
			if (response.ok) {
				const result = await response.json();
				collections = result.collections || [];
			}
		} catch (error) {
			console.error('Failed to load collections:', error);
		} finally {
			loading = false;
		}
	});

	function getFilteredCollections(): Collection[] {
		let filtered = collections;

		if (filterQuery.trim()) {
			const query = filterQuery.toLowerCase();
			filtered = filtered.filter(
				(c) =>
					c.title.toLowerCase().includes(query) ||
					c.description?.toLowerCase().includes(query) ||
					c.user.name.toLowerCase().includes(query)
			);
		}

		if (sortBy === 'name') {
			filtered.sort((a, b) => a.title.localeCompare(b.title));
		} else if (sortBy === 'popular') {
			filtered.sort((a, b) => b.tracks.length - a.tracks.length);
		}

		return filtered;
	}

	async function handleCreateCollection() {
		if (!newTitle.trim()) return;

		try {
			const response = await fetch('/api/collections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: newTitle.trim(),
					description: newDescription.trim() || null,
					isOrdered: newIsOrdered,
					isPublic: newIsPublic
				})
			});

			if (response.ok) {
				const collectionsResponse = await fetch('/api/collections');
				if (collectionsResponse.ok) {
					const result = await collectionsResponse.json();
					collections = result.collections || [];
				}
				newTitle = '';
				newDescription = '';
				newIsOrdered = false;
				newIsPublic = true;
				showCreateForm = false;
			}
		} catch (error) {
			console.error('Failed to create collection:', error);
		}
	}

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

<div class="mx-auto max-w-6xl p-4">
	<div class="mb-8">
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold lowercase">collections</h1>
			{#if data?.user}
				<button
					onclick={() => (showCreateForm = !showCreateForm)}
					class="flex items-center gap-2 rounded bg-primary-600 px-4 py-2 text-white lowercase transition hover:bg-primary-700"
				>
					<Plus size={18} />
					new collection
				</button>
			{/if}
		</div>

		{#if showCreateForm && data?.user}
			<div class="mb-6 card border-2 p-6" style="border-color: rgb(var(--color-primary-500))">
				<h2 class="mb-4 text-xl font-semibold lowercase">create new collection</h2>

				<div class="space-y-4">
					<div>
						<label class="mb-2 block text-sm font-medium lowercase">name</label>
						<input
							type="text"
							bind:value={newTitle}
							placeholder="my favorite songs..."
							class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2"
							maxlength="100"
						/>
					</div>

					<div>
						<label class="mb-2 block text-sm font-medium lowercase">description (optional)</label>
						<textarea
							bind:value={newDescription}
							placeholder="describe this collection..."
							class="w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2"
							rows="3"
							maxlength="500"
						></textarea>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<label class="flex cursor-pointer items-center gap-2">
							<input type="checkbox" bind:checked={newIsOrdered} class="h-4 w-4" />
							<span class="text-sm lowercase">ordered list</span>
						</label>
						<label class="flex cursor-pointer items-center gap-2">
							<input type="checkbox" bind:checked={newIsPublic} class="h-4 w-4" />
							<span class="text-sm lowercase">public</span>
						</label>
					</div>

					<div class="flex gap-2">
						<button
							onclick={handleCreateCollection}
							disabled={!newTitle.trim()}
							class="rounded bg-primary-600 px-4 py-2 text-white lowercase transition hover:bg-primary-700 disabled:opacity-50"
						>
							create
						</button>
						<button
							onclick={() => (showCreateForm = false)}
							class="rounded border border-[var(--border-color)] px-4 py-2 transition hover:bg-[var(--bg-secondary)]"
						>
							cancel
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Filters -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row">
		<input
			type="text"
			bind:value={filterQuery}
			placeholder="search collections..."
			class="flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2"
		/>
		<select
			bind:value={sortBy}
			class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-5 py-2 lowercase"
		>
			<option value="recent"> recent </option>
			<option value="name"> name </option>
			<option value="popular"> popular </option>
		</select>
	</div>

	
	{#if loading}
		<div class="py-12 text-center lowercase opacity-50">loading collections...</div>
	{:else if getFilteredCollections().length > 0}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each getFilteredCollections() as collection (collection.id)}
				<a
					href={`/collections/${collection.id}`}
					class="group overflow-hidden card p-4 transition hover:border-primary-500"
				>
					{#if collection.coverImageUrl}
						<div class="-mx-4 -mt-4 mb-3 h-40 overflow-hidden rounded-t-lg">
							<img
								src={collection.coverImageUrl}
								alt={collection.title}
								class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							/>
						</div>
					{/if}

					<div class="mb-3 flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-semibold lowercase">{collection.title}</h3>
							<p class="text-xs lowercase opacity-50">{formatTimeAgo(collection.createdAt)}</p>
						</div>
						<div class="flex gap-1">
							{#if collection.isOrdered}
								<ListOrdered size={14} class="opacity-60" title="ordered list" />
							{/if}
							{#if !collection.isPublic}
								<Lock size={14} class="opacity-60" />
							{:else}
								<Globe size={14} class="opacity-60" />
							{/if}
						</div>
					</div>

					{#if collection.description}
						<p class="mb-3 line-clamp-2 text-xs lowercase opacity-60">{collection.description}</p>
					{/if}

					<div class="mb-3">
						<p class="text-xs lowercase opacity-50">
							{collection.tracks.length} track{collection.tracks.length !== 1 ? 's' : ''}
						</p>
					</div>

					<div
						class="flex items-center gap-2 border-t border-primary-200 pt-2 dark:border-primary-700"
					>
						<div
							class="flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]"
						>
							{#if collection.user.image}
								<img
									src={collection.user.image}
									alt={collection.user.name}
									class="h-full w-full object-cover"
								/>
							{:else}
								<span class="text-xs font-bold">{collection.user.name[0].toUpperCase()}</span>
							{/if}
						</div>
						<span class="truncate text-xs font-medium lowercase">{collection.user.name}</span>
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<div class="py-12 text-center lowercase opacity-50">
			{filterQuery ? 'no collections found' : 'no collections yet'}
		</div>
	{/if}
</div>

<style>
	.card {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 0.5rem;
		color: var(--text-primary);
	}
</style>
