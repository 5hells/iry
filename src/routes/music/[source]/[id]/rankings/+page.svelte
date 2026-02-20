<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	interface TrackRanking {
		trackId: string;
		trackTitle: string;
		trackNumber: number;
		avgRating: number;
		ratingCount: number;
		position: number;
	}

	interface AlbumInfo {
		id: string;
		title: string;
		artist: string;
		artistUrl?: string | null;
		coverArtUrl: string | null;
	}

	let { data }: { data: PageData } = $props();

	let rankings = $state<TrackRanking[]>([]);
	let album = $state<AlbumInfo | null>(null);
	let loading = $state(true);
	let sortBy = $state<'rating' | 'position'>('rating');

	const source = $derived(data.source);
	const albumId = $derived(data.albumId);

	onMount(async () => {
		try {
			const albumResponse = await fetch(`/api/albums/${source}/${albumId}`);
			if (albumResponse.ok) {
				const albumData = await albumResponse.json();
				album = albumData.album;
			}

			const rankingsResponse = await fetch(`/api/rankings/${albumId}`);
			if (rankingsResponse.ok) {
				const rankingsData = await rankingsResponse.json();
				rankings = rankingsData.rankings || [];
			}
		} catch (error) {
			console.error('Failed to load rankings:', error);
		} finally {
			loading = false;
		}
	});

	function getRankedTracks(): TrackRanking[] {
		if (sortBy === 'rating') {
			return [...rankings].sort((a, b) => b.avgRating - a.avgRating);
		}
		return rankings.sort((a, b) => a.position - b.position);
	}

	function getRatingColor(rating: number): string {
		if (rating >= 8) return '#10b981'; 
		if (rating >= 6) return '#3b82f6'; 
		if (rating >= 4) return '#f59e0b'; 
		return '#ef4444'; 
	}
</script>

<div class="mx-auto max-w-4xl p-4">
	{#if loading}
		<div class="py-12 text-center lowercase opacity-50">loading rankings...</div>
	{:else if album}
		
		<div class="mb-8 flex gap-6">
			{#if album.coverArtUrl}
				<img
					src={album.coverArtUrl}
					alt={album.title}
					class="h-32 w-32 flex-shrink-0 rounded-lg object-cover"
				/>
			{:else}
				<div
					class="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)] opacity-50"
				>
					-
				</div>
			{/if}

			<div class="flex-1">
				<p class="text-sm lowercase opacity-60">track rankings</p>
				<h1 class="mb-1 text-3xl font-bold lowercase">{album.title}</h1>
				<p class="mb-4 text-lg lowercase opacity-75">
					{#if album.artistUrl}
						<a href={album.artistUrl} class="underline">{album.artist}</a>
					{:else}
						{album.artist}
					{/if}
				</p>
				<p class="text-sm lowercase opacity-60">{rankings.length} tracks ranked</p>
			</div>
		</div>

		
		<div class="mb-6 flex gap-2">
			<button
				onclick={() => (sortBy = 'rating')}
				class="rounded px-4 py-2 text-sm font-medium transition"
				class:bg-primary-600={sortBy === 'rating'}
				class:text-white={sortBy === 'rating'}
				class:border={sortBy !== 'rating'}
				class:border-surface-300={sortBy !== 'rating'}
				class:dark:border-surface-700={sortBy !== 'rating'}
				class:hover:bg-surface-100={sortBy !== 'rating'}
				class:dark:hover:bg-surface-800={sortBy !== 'rating'}
			>
				by rating
			</button>
			<button
				onclick={() => (sortBy = 'position')}
				class="rounded px-4 py-2 text-sm font-medium transition"
				class:bg-primary-600={sortBy === 'position'}
				class:text-white={sortBy === 'position'}
				class:border={sortBy !== 'position'}
				class:border-surface-300={sortBy !== 'position'}
				class:dark:border-surface-700={sortBy !== 'position'}
				class:hover:bg-surface-100={sortBy !== 'position'}
				class:dark:hover:bg-surface-800={sortBy !== 'position'}
			>
				by track order
			</button>
		</div>

		
		{#if rankings.length > 0}
			<div class="space-y-2">
				{#each getRankedTracks() as track, idx (track.trackId)}
					<div class="flex items-center gap-4 card p-4">
						<div class="w-12 flex-shrink-0 text-center text-2xl font-bold">
							{#if sortBy === 'rating'}
								#{idx + 1}
							{:else}
								{track.position ?? track.trackNumber}
							{/if}
						</div>

						<div class="min-w-0 flex-1">
							<h3 class="truncate font-semibold lowercase">{track.trackTitle}</h3>
							<p class="text-xs lowercase opacity-50">
								{track.ratingCount} rating{track.ratingCount !== 1 ? 's' : ''}
							</p>
						</div>

						<div class="flex flex-shrink-0 items-center gap-3">
							<div class="text-right">
								<div class="text-2xl font-bold" style={`color: ${getRatingColor(track.avgRating)}`}>
									{track.avgRating.toFixed(1)}
								</div>
								<p class="text-xs opacity-50">/10</p>
							</div>

							<div class="h-2 w-16 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
								<div
									class="h-full transition-all"
									style={`width: ${(track.avgRating / 10) * 100}%; background-color: ${getRatingColor(track.avgRating)}`}
								></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="py-8 text-center text-sm lowercase opacity-50">no rankings yet</p>
		{/if}
	{:else}
		<div class="py-12 text-center lowercase opacity-50">album not found</div>
	{/if}
</div>

<style>
	.card {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 0.5rem;
		color: var(--text-primary);
		transition: border-color 0.2s;
	}

	.card:hover {
		border-color: rgb(var(--color-primary-500));
	}
</style>
