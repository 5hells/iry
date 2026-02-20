<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		Edit2,
		Trash2,
		Plus,
		X,
		ChevronUp,
		ChevronDown,
		ListOrdered,
		Link2,
		Globe,
		Lock,
		ImagePlus
	} from '@lucide/svelte';
	import CoverSelector from '$lib/components/CoverSelector.svelte';
	import CollectionCover from '$lib/components/CollectionCover.svelte';
	import type { PageData } from './$types';

	interface Track {
		id: string;
		spotifyTrackId?: string;
		spotifyAlbumId?: string;
		title: string;
		trackNumber: number;
		durationMs: number;
		albumTitle?: string;
		albumArtist?: string;
		albumCoverArt?: string;
	}

	interface CollectionData {
		id: string;
		userId: string;
		title: string;
		description: string | null;
		isOrdered: boolean;
		isPublic: boolean;
		coverImageUrl: string | null;
		coverImageType: string | null;
		tracks: Array<{
			id: string;
			track: Track;
			position: number;
			description: string | null;
		}>;
		user: { id: string; name: string; image: string | null };
	}

	let { data }: { data: PageData } = $props();

	let collection = $state<CollectionData | null>(null);
	let loading = $state(true);
	let isEditing = $state(false);
	let editTitle = $state('');
	let editDescription = $state('');
	let editIsPublic = $state(true);
	let showAddTrack = $state(false);
	let trackSearchQuery = $state('');
	let trackSearchResults = $state<Track[]>([]);
	let searchingTracks = $state(false);
	let selectedTrackId = $state<string>('');
	let trackDescription = $state('');
	let showCoverSelector = $state(false);

	const collectionId = $derived(data.collectionId);
	const isOwner = () => data?.user?.id === collection?.userId;

	function isUuid(value: string): boolean {
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
	}

	onMount(async () => {
		try {
			const response = await fetch(`/api/collections/${collectionId}`);
			if (response.ok) {
				const data = await response.json();
				collection = data;
				if (collection) {
					editTitle = collection.title;
					editDescription = collection.description || '';
					editIsPublic = collection.isPublic;
				}
			}
		} catch (error) {
			console.error('Failed to load collection:', error);
		} finally {
			loading = false;
		}
	});

	async function handleUpdate() {
		if (!editTitle.trim()) return;

		try {
			const response = await fetch(`/api/collections/${collectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: editTitle.trim(),
					description: editDescription.trim() || null,
					isPublic: editIsPublic
				})
			});

			if (response.ok && collection) {
				collection.title = editTitle;
				collection.description = editDescription || null;
				collection.isPublic = editIsPublic;
				isEditing = false;
			}
		} catch (error) {
			console.error('Failed to update collection:', error);
		}
	}

	async function handleDelete() {
		if (!confirm('delete this collection? this cannot be undone.')) return;

		try {
			const response = await fetch(`/api/collections/${collectionId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await goto('/collections');
			}
		} catch (error) {
			console.error('Failed to delete collection:', error);
		}
	}

	function handleCoverSelected(coverUrl: string, coverType: string) {
		if (collection) {
			collection.coverImageUrl = coverUrl;
			collection.coverImageType = coverType;
		}
	}

	async function handleRemoveTrack(trackId: string) {
		try {
			const response = await fetch(`/api/collections/${collectionId}/tracks`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ trackId })
			});

			if (response.ok && collection) {
				collection.tracks = collection.tracks.filter((t) => t.track.id !== trackId);
			}
		} catch (error) {
			console.error('Failed to remove track:', error);
		}
	}

	async function searchTracks() {
		if (!trackSearchQuery.trim()) {
			trackSearchResults = [];
			return;
		}

		searchingTracks = true;
		try {
			const response = await fetch(`/api/search/tracks?q=${encodeURIComponent(trackSearchQuery)}`);
			if (response.ok) {
				const data = await response.json();
				trackSearchResults = data.tracks || [];
			}
		} catch (error) {
			console.error('Failed to search tracks:', error);
		} finally {
			searchingTracks = false;
		}
	}

	async function addTrackToCollection(track: Track) {
		try {
			const payload: Record<string, any> = {
				description: trackDescription.trim() || null
			};

			if (track.id && isUuid(track.id)) {
				payload.trackId = track.id;
			}

			if (track.spotifyTrackId) {
				payload.spotifyTrackId = track.spotifyTrackId;
			} else if (track.id && !isUuid(track.id)) {
				payload.spotifyTrackId = track.id;
			}

			if (track.spotifyAlbumId) {
				payload.spotifyAlbumId = track.spotifyAlbumId;
			}

			const response = await fetch(`/api/collections/${collectionId}/tracks`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (response.ok) {
				const collResp = await fetch(`/api/collections/${collectionId}`);
				if (collResp.ok) {
					collection = await collResp.json();
				}
				trackSearchQuery = '';
				trackSearchResults = [];
				trackDescription = '';
				selectedTrackId = '';
			}
		} catch (error) {
			console.error('Failed to add track:', error);
		}
	}

	async function moveTrack(trackId: string, direction: 'up' | 'down') {
		if (!collection) return;

		const currentIndex = collection.tracks.findIndex((t) => t.track.id === trackId);
		if (currentIndex === -1) return;

		const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
		if (newIndex < 0 || newIndex >= collection.tracks.length) return;

		const temp = collection.tracks[currentIndex];
		collection.tracks[currentIndex] = collection.tracks[newIndex];
		collection.tracks[newIndex] = temp;

		collection.tracks = collection.tracks.map((item, idx) => ({
			...item,
			position: idx + 1
		}));

		try {
			await fetch(`/api/collections/${collectionId}/tracks/reorder`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					trackPositions: collection.tracks.map((t) => ({
						trackId: t.track.id,
						position: t.position
					}))
				})
			});
		} catch (error) {
			console.error('Failed to reorder tracks:', error);
		}
	}

	function formatDuration(ms: number): string {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	let searchTimeout: any;
	$effect(() => {
		if (trackSearchQuery) {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(searchTracks, 300);
		} else {
			trackSearchResults = [];
		}
	});
</script>

<div class="mx-auto max-w-4xl p-4">
	{#if loading}
		<div class="py-12 text-center lowercase opacity-50">loading collection...</div>
	{:else if collection}
		
		{#if collection.coverImageUrl}
			<div class="mb-6 flex justify-center">
				<CollectionCover
					imageUrl={collection.coverImageUrl}
					imageType={collection.coverImageType}
					alt={collection.title}
					size="lg"
				/>
			</div>
		{/if}

		<!-- Header -->
		<div class="mb-8">
			<div class="mb-6 flex items-start justify-between gap-4">
				<div class="flex-1">
					{#if isEditing && isOwner()}
						<input
							type="text"
							bind:value={editTitle}
							class="mb-2 w-full rounded bg-[var(--bg-secondary)] p-2 text-3xl font-bold lowercase"
							maxlength="100"
						/>
						<textarea
							bind:value={editDescription}
							class="w-full resize-none rounded bg-[var(--bg-secondary)] p-2 lowercase"
							rows="2"
							maxlength="500"
						></textarea>
					{:else}
						<h1 class="text-3xl font-bold lowercase">{collection.title}</h1>
						{#if collection.description}
							<p class="mt-2 text-sm lowercase opacity-60">{collection.description}</p>
						{/if}
					{/if}
				</div>

				{#if isOwner()}
					<div class="flex gap-2">
						{#if isEditing}
							<button
								onclick={handleUpdate}
								class="rounded bg-primary-600 px-4 py-2 text-white lowercase transition hover:bg-primary-700"
							>
								save
							</button>
							<button
								onclick={() => (isEditing = false)}
								class="rounded border border-[var(--border-color)] px-4 py-2 lowercase transition"
							>
								cancel
							</button>
						{:else}
							<button
								onclick={() => (isEditing = true)}
								class="flex items-center gap-2 rounded border border-[var(--border-color)] px-4 py-2 lowercase transition hover:bg-[var(--bg-secondary)]"
							>
								<Edit2 size={18} />
								edit
							</button>
							{#if collection.tracks.length > 0}
								<button
									onclick={() => (showCoverSelector = true)}
									class="flex items-center gap-2 rounded border border-[var(--border-color)] px-4 py-2 lowercase transition hover:bg-[var(--bg-secondary)]"
								>
									<ImagePlus size={18} />
									cover
								</button>
							{/if}
							<button
								onclick={handleDelete}
								class="flex items-center gap-2 rounded border border-error-500 px-4 py-2 text-error-500 lowercase transition hover:bg-error-500/10"
							>
								<Trash2 size={18} />
								delete
							</button>
						{/if}
					</div>
				{/if}
			</div>

			
			<div class="mb-4 flex items-center gap-4 text-sm lowercase opacity-60">
				<p>{collection.tracks.length} track{collection.tracks.length !== 1 ? 's' : ''}</p>
				<p class="flex items-center gap-1">
					{#if collection.isOrdered}
						<ListOrdered size={14} />
						ordered
					{:else}
						<Link2 size={14} />
						unordered
					{/if}
				</p>
				<p class="flex items-center gap-1">
					{#if collection.isPublic}
						<Globe size={14} />
						public
					{:else}
						<Lock size={14} />
						private
					{/if}
				</p>
			</div>

			
			<div class="flex items-center gap-2 text-sm">
				<div
					class="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]"
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
				<a href={`/user/${collection.user.id}`} class="font-medium lowercase hover:underline">
					{collection.user.name}
				</a>
			</div>
		</div>

		
		<div class="card p-6">
			{#if isOwner()}
				<div class="mb-6 flex gap-2">
					<button
						onclick={() => (showAddTrack = !showAddTrack)}
						class="flex items-center gap-2 rounded bg-primary-600 px-4 py-2 text-white lowercase transition hover:bg-primary-700"
					>
						<Plus size={18} />
						{showAddTrack ? 'cancel' : 'add track'}
					</button>
				</div>
			{/if}

			{#if showAddTrack && isOwner()}
				<div class="mb-6 space-y-4 rounded border border-[var(--border-color)] p-4">
					<div>
						<input
							type="text"
							bind:value={trackSearchQuery}
							placeholder="search for tracks..."
							class="w-full rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2"
						/>
					</div>

					{#if searchingTracks}
						<div class="py-4 text-center lowercase opacity-50">searching...</div>
					{:else if trackSearchResults.length > 0}
						<div class="max-h-96 space-y-2 overflow-y-auto">
							{#each trackSearchResults as track (track.id)}
								<div
									class="rounded border border-[var(--border-color)] p-3 transition hover:border-primary-500"
								>
									<div class="flex items-start gap-3">
										{#if track.albumCoverArt}
											<img
												src={track.albumCoverArt}
												alt={track.albumTitle}
												class="h-12 w-12 rounded"
											/>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{track.title}</p>
											<p class="truncate text-xs opacity-60">
												{track.albumArtist} - {track.albumTitle}
											</p>
											{#if track.durationMs}
												<p class="text-xs opacity-50">{formatDuration(track.durationMs)}</p>
											{/if}
										</div>
										<button
											onclick={() => {
												selectedTrackId = track.id;
											}}
											class="hover:bg-opacity-80 rounded bg-[var(--bg-secondary)] px-3 py-1 text-sm text-white lowercase transition"
										>
											select
										</button>
									</div>

									{#if selectedTrackId === track.id}
										<div class="mt-3 border-t border-[var(--border-color)] pt-3">
											<label class="mb-2 block text-sm lowercase"
												>why add this track? (optional)</label
											>
											<textarea
												bind:value={trackDescription}
												placeholder="describe why this track belongs in the collection..."
												class="w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-base)] px-3 py-2"
												rows="2"
												maxlength="500"
											></textarea>
											<div class="mt-2 flex gap-2">
												<button
													onclick={() => addTrackToCollection(track)}
													class="rounded bg-primary-600 px-4 py-2 text-white lowercase transition hover:bg-primary-700"
												>
													add to collection
												</button>
												<button
													onclick={() => {
														selectedTrackId = '';
														trackDescription = '';
													}}
													class="rounded border border-[var(--border-color)] px-4 py-2 lowercase transition"
												>
													cancel
												</button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else if trackSearchQuery && !searchingTracks}
						<div class="py-4 text-center lowercase opacity-50">no tracks found</div>
					{/if}
				</div>
			{/if}

			{#if collection.tracks.length > 0}
				<div class="space-y-2">
					{#each collection.tracks as item, index (item.track.id)}
						<div
							class="flex items-center gap-3 rounded border border-[var(--border-color)] p-3 transition hover:border-primary-500"
						>
							{#if isOwner() && collection.isOrdered}
								<div class="flex flex-col gap-1">
									<button
										onclick={() => moveTrack(item.track.id, 'up')}
										disabled={index === 0}
										class="rounded p-1 transition hover:bg-[var(--bg-secondary)] disabled:opacity-30"
										title="move up"
									>
										<ChevronUp size={16} />
									</button>
									<button
										onclick={() => moveTrack(item.track.id, 'down')}
										disabled={index === collection.tracks.length - 1}
										class="rounded p-1 transition hover:bg-[var(--bg-secondary)] disabled:opacity-30"
										title="move down"
									>
										<ChevronDown size={16} />
									</button>
								</div>
							{/if}

							<div class="min-w-0 flex-1">
								{#if collection.isOrdered}
									<span class="mr-2 text-xs opacity-50">#{item.position}</span>
								{/if}
								<p class="truncate font-medium lowercase">{item.track.title}</p>
								{#if item.description}
									<p class="mt-1 text-xs italic opacity-70">{item.description}</p>
								{/if}
								<p class="text-xs lowercase opacity-50">{formatDuration(item.track.durationMs)}</p>
							</div>

							{#if isOwner()}
								<button
									onclick={() => handleRemoveTrack(item.track.id)}
									class="text-error-500 transition hover:text-error-700"
									title="remove track"
								>
									<X size={18} />
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="py-8 text-center text-sm lowercase opacity-50">no tracks yet</p>
			{/if}
		</div>
	{:else}
		<div class="py-12 text-center lowercase opacity-50">collection not found</div>
	{/if}

	
	{#if collection && isOwner()}
		<CoverSelector
			collectionId={collection.id}
			currentCoverUrl={collection.coverImageUrl}
			currentCoverType={collection.coverImageType}
			onCoverSelected={handleCoverSelected}
			isOpen={showCoverSelector}
			onClose={() => (showCoverSelector = false)}
		/>
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
