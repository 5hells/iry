<script lang="ts">
	import { onMount } from 'svelte';
	import { Search } from '@lucide/svelte';
	import { levenshteinDistance, normalizeString } from '$lib/utils/levenshtein';

	interface Album {
		source: string;
		id: string;
		title: string;
		artist: string;
		releaseDate: string;
		coverArt: string;
		artistUrl?: string | null;
		totalTracks?: number;
		genres?: string[];
		externalUrl?: string;
	}

	let searchQuery = $state('');
	let results = $state<any[]>([]);
	let loading = $state(false);
	let searched = $state(false);

	const searchCache: Map<string, Promise<any[]> | any[]> = new Map();
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const DEBOUNCE_MS = 350;

	function resultSortLabel(item: any): string {
		if (item.kind === 'artist') return item.name || '';
		return `${item.artist || ''} ${item.title || ''}`.trim();
	}

	async function fetchSearch(query: string) {
		const key = query.trim();
		if (!key) return [];

		const cached = searchCache.get(key);
		if (cached) {
			if (typeof (cached as any).then === 'function') {
				return await (cached as Promise<Album[]>);
			}
			return cached as Album[];
		}

		const promise = (async () => {
			const [albumResp, artistResp] = await Promise.all([
				fetch(`/api/search?q=${encodeURIComponent(key)}&limit=30`),
				fetch(`/api/search/artists?q=${encodeURIComponent(key)}&limit=6`)
			]);

			let albums: any[] = [];
			let artists: any[] = [];

			if (albumResp.ok) {
				const data = await albumResp.json();
				albums = data.results || [];
			}

			if (artistResp.ok) {
				const data = await artistResp.json();
				artists = (data.results || []).map((a: any) => ({ ...a, kind: 'artist' }));
			}

			const albumItems = albums.map((a: any) => ({ ...a, kind: 'album' }));
			const combined = [...artists, ...albumItems];
			const normalizedQuery = normalizeString(key);

			const sorted = combined
				.map((item, index) => {
					const label = resultSortLabel(item);
					const normalizedLabel = normalizeString(label);
					const isExact = normalizedLabel === normalizedQuery;
					const contains = normalizedLabel.includes(normalizedQuery);
					const distance = levenshteinDistance(normalizedQuery, normalizedLabel);
					return { item, index, isExact, contains, distance };
				})
				.sort((a, b) => {
					if (a.isExact !== b.isExact) return a.isExact ? -1 : 1;
					if (a.contains !== b.contains) return a.contains ? -1 : 1;
					if (a.distance !== b.distance) return a.distance - b.distance;
					return a.index - b.index;
				})
				.map((entry) => entry.item);

			searchCache.set(key, sorted);
			return sorted;
		})();

		searchCache.set(key, promise);
		return await promise;
	}

	async function handleSearch(immediate = false) {
		const q = searchQuery.trim();
		if (!q) return;

		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		loading = true;
		searched = true;

		try {
			results = await fetchSearch(q);
		} catch (error) {
			console.error('Search failed:', error);
			results = [];
		} finally {
			loading = false;
		}
	}

	function scheduleSearch() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			handleSearch();
		}, DEBOUNCE_MS);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearch(true);
		}
	}
</script>

<div class="music-container mx-auto max-w-6xl p-4">
	
	<div class="page-header mb-8">
		<h1 class="h1 lowercase">music</h1>
		<p class="text-primary-600 lowercase dark:text-primary-400">search albums to review</p>
	</div>

	
	<div class="search-section mb-8 card p-6">
		<div class="space-y-4">
			<div class="flex gap-2">
				<div class="search-input-wrapper relative flex-1">
					<Search class="absolute top-1/2 left-3 -translate-y-1/2 transform opacity-50" size={20} />
					<input
						type="text"
						bind:value={searchQuery}
						oninput={scheduleSearch}
						onkeydown={handleKeydown}
						placeholder="search albums, artists..."
						class="input w-full pl-10"
					/>
				</div>
				<button
					onclick={() => handleSearch(true)}
					disabled={loading || !searchQuery.trim()}
					class="variant-filled-primary btn lowercase"
				>
					{loading ? 'Searching...' : 'Search'}
				</button>
			</div>
		</div>
	</div>

	
	{#if searched}
		{#if loading}
			<div class="flex items-center justify-center py-12">
				<p class="lowercase opacity-50">searching...</p>
			</div>
		{:else if results.length > 0}
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each results as item (item.id)}
					{#if item.kind === 'artist'}
						<a href={item.artistUrl} class="overflow-hidden card">
							<div class="album-cover relative aspect-square bg-primary-300 dark:bg-primary-700">
								{#if item.imageUrl}
									<img src={item.imageUrl} alt={item.name} class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center text-primary-500">no image</div>
								{/if}
							</div>
							<div class="p-4">
								<h3 class="mb-1 truncate font-semibold lowercase">{item.name}</h3>
								<p class="mb-2 truncate text-sm lowercase opacity-75">{item.genres?.slice(0,2).join(', ')}</p>
								<div class="flex items-center justify-between text-xs">
									<span class="lowercase opacity-50">{item.source}</span>
									<span class="variant-soft-primary badge lowercase">artist</span>
								</div>
							</div>
						</a>
					{:else}
						<a href={`/music/${item.source}/${item.id}`} class="overflow-hidden card">
							<div class="album-cover relative aspect-square bg-primary-300 dark:bg-primary-700">
								{#if item.coverArt}
									<img src={item.coverArt} alt={item.title} class="h-full w-full object-cover" />
								{:else}
									<div class="flex h-full w-full items-center justify-center text-primary-500">no art</div>
								{/if}
							</div>
							<div class="p-4">
								<h3 class="mb-1 truncate font-semibold lowercase">{item.title}</h3>
								<p class="mb-2 truncate text-sm lowercase opacity-75">{item.artist}</p>
								<div class="flex items-center justify-between text-xs">
									<span class="lowercase opacity-50">{item.releaseDate}</span>
									<span class="variant-soft-primary badge lowercase">{item.source}</span>
								</div>
								{#if item.genres && item.genres.length > 0}
									<div class="mt-2 flex flex-wrap gap-1">
										{#each item.genres.slice(0, 3) as genre}
											<span class="variant-soft-secondary badge text-xs lowercase">{genre}</span>
										{/each}
									</div>
								{/if}
							</div>
						</a>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="py-12 text-center">
				<p class="lowercase opacity-50">no results found. try a different search query.</p>
			</div>
		{/if}
	{:else}
		<div class="py-12 text-center">
			<p class="lowercase opacity-50">start by searching for an album, artist, or genre</p>
		</div>
	{/if}
</div>

<style>
	.search-input-wrapper {
		position: relative;
	}

	.album-cover {
		width: 100%;
		aspect-ratio: 1 / 1;
	}
</style>
