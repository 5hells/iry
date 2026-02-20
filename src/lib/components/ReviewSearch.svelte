<script lang="ts">
	import { onMount } from 'svelte';

	interface Album {
		source: string;
		id: string;
		title: string;
		artist: string;
		releaseDate: string;
		coverArt: string;
	}

	let searchQuery = $state('');
	let searchResults = $state<Album[]>([]);
	let loading = $state(false);
	let selectedAlbum = $state<Album | null>(null);

	let rating = $state(5);
	let reviewText = $state('');

	async function searchAlbums() {
		if (!searchQuery.trim()) return;

		loading = true;
		try {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(searchQuery)}&source=both&limit=20`
			);
			const data = await response.json();
			searchResults = data.results;
		} catch (error) {
			console.error('Search failed:', error);
		} finally {
			loading = false;
		}
	}

	async function createReview() {
		if (!selectedAlbum) return;

		const reviewData = {
			[selectedAlbum.source === 'spotify' ? 'spotifyId' : 'discogsId']: selectedAlbum.id,
			rating: rating,
			reviewText: reviewText.trim() || null
		};

		try {
			const response = await fetch('/api/reviews/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(reviewData)
			});

			if (response.ok) {
				const result = await response.json();
				alert('Review created successfully! You earned ' + result.pointsAwarded + ' points!');

				selectedAlbum = null;
				rating = 5;
				reviewText = '';
				searchQuery = '';
				searchResults = [];
			} else {
				const error = await response.json();
				alert('Error: ' + error.message);
			}
		} catch (error) {
			console.error('Review creation failed:', error);
			alert('Failed to create review');
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-8 p-6">
	<h1 class="text-4xl font-bold">Search & Review Albums</h1>

	<!-- Search Section -->
	<div class="space-y-4 card p-6">
		<h2 class="h3">Search Albums</h2>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				searchAlbums();
			}}
			class="flex gap-2"
		>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search for an album..."
				class="input flex-1"
			/>
			<button type="submit" class="btn-primary btn" disabled={loading}>
				{loading ? 'Searching...' : 'Search'}
			</button>
		</form>

		
		{#if searchResults.length > 0}
			<div class="space-y-4">
				<h3 class="h4">Results</h3>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each searchResults as album}
						<button
							onclick={() => (selectedAlbum = album)}
							class="card p-4 text-left transition hover:bg-primary-200 dark:hover:bg-primary-700"
							class:ring-2={selectedAlbum?.id === album.id}
							class:ring-primary-500={selectedAlbum?.id === album.id}
						>
							<div class="flex gap-4">
								{#if album.coverArt}
									<img
										src={album.coverArt}
										alt={album.title}
										class="h-20 w-20 rounded object-cover"
									/>
								{:else}
									<div
										class="flex h-20 w-20 items-center justify-center rounded bg-primary-300 dark:bg-primary-600"
									>
										<span class="text-xs text-primary-500">No image</span>
									</div>
								{/if}
								<div class="flex-1">
									<h4 class="font-semibold">{album.title}</h4>
									<p class="text-sm text-primary-600 dark:text-primary-400">{album.artist}</p>
									<p class="text-xs text-primary-500">{album.releaseDate} • {album.source}</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	
	{#if selectedAlbum}
		<div class="space-y-4 card p-6">
			<h2 class="h3">Review: {selectedAlbum.title}</h2>
			<p class="text-primary-600 dark:text-primary-400">by {selectedAlbum.artist}</p>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					createReview();
				}}
				class="space-y-4"
			>
				<label class="label">
					<span class="label-text">Rating (0-10)</span>
					<input type="range" min="0" max="10" step="0.5" bind:value={rating} class="range" />
					<div class="flex justify-between text-xs">
						<span>0</span>
						<span class="text-lg font-bold">{rating}</span>
						<span>10</span>
					</div>
				</label>

				<label class="label">
					<span class="label-text">Review (optional, 50+ chars for bonus points)</span>
					<textarea
						bind:value={reviewText}
						placeholder="Share your thoughts about this album..."
						rows="5"
						class="textarea"
					></textarea>
					<span class="text-xs text-primary-500">{reviewText.length} characters</span>
				</label>

				<div class="flex gap-2">
					<button type="submit" class="btn-primary btn"> Submit Review </button>
					<button type="button" onclick={() => (selectedAlbum = null)} class="btn-ghost btn">
						Cancel
					</button>
				</div>
			</form>

			<div class="alert alert-info">
				<p class="text-sm">
					<strong>Points:</strong> Basic review earns 10 points. Add 50+ characters for 15 points!
				</p>
			</div>
		</div>
	{/if}

	
	<div class="card bg-primary-100 p-6 dark:bg-primary-800">
		<h3 class="mb-3 h4">How it works</h3>
		<ol class="list-inside list-decimal space-y-2 text-sm">
			<li>Search for an album using the search box</li>
			<li>Click on an album to select it</li>
			<li>Rate the album (0-10 scale) and optionally write a review</li>
			<li>Submit your review to earn points and level up!</li>
			<li>Unlock perks like badges, banners, and titles as you progress</li>
		</ol>
	</div>
</div>

<style>
	.range {
		width: 100%;
	}
</style>
