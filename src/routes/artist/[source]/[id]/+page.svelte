<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const { artist, releases } = data;
	const reviews = (data as any).reviews || [];

	let genres: string[] = [];
	if (artist.genres && Array.isArray(artist.genres)) {
		genres = artist.genres;
	}

	const albums = releases.filter((r: any) => r.type === 'Album' || r.type === 'album');
	const singles = releases.filter((r: any) => r.type === 'Single' || r.type === 'single');
	const eps = releases.filter((r: any) => r.type === 'EP' || r.type === 'ep');
	const others = releases.filter(
		(r: any) => !['Album', 'album', 'Single', 'single', 'EP', 'ep'].includes(r.type)
	);

	function getReleaseLink(release: any) {
		const source =
			release.source ||
			release.release_source ||
			(release.musicbrainzId ? 'musicbrainz' : release.discogsId ? 'discogs' : release.spotifyId ? 'spotify' : 'db');
		const id = release.musicbrainzId || release.discogsId || release.spotifyId || release.id;
		if (!id) return '/music';
		return `/music/${source}/${id}`;
	}

	function getArtistRouteSource() {
		return artist.source || (artist.musicbrainzId ? 'musicbrainz' : artist.discogsId ? 'discogs' : artist.spotifyId ? 'spotify' : 'db');
	}

	function getArtistRouteId() {
		return artist.musicbrainzId || artist.discogsId || artist.spotifyId || artist.id;
	}
</script>

<svelte:head>
	<title>{artist.name} - Artist</title>
</svelte:head>

<div class="container mx-auto p-4 max-w-6xl">
	
	<div class="card p-6 mb-6">
		<div class="flex gap-6 items-start">
			{#if artist.imageUrl}
				<img
					src={artist.imageUrl}
					alt={artist.name}
					class="w-48 h-48 rounded-lg object-cover"
				/>
			{:else}
				<div class="w-48 h-48 rounded-lg bg-gray-700 flex items-center justify-center">
					<span class="text-4xl text-gray-400">🎤</span>
				</div>
			{/if}

			<div class="flex-1">
				<div class="flex items-center gap-4">
					<h1 class="text-4xl font-bold mb-2">{artist.name}</h1>
					{#if getArtistRouteId()}
						<a
							href={`/artist/${getArtistRouteSource()}/${getArtistRouteId()}/review`}
							class="btn btn-primary btn-sm lowercase"
						>
							write review
						</a>
					{/if}
				</div>

				{#if genres.length > 0}
					<div class="flex flex-wrap gap-2 mb-4">
						{#each genres as genre}
							<span class="badge variant-filled-primary">{genre}</span>
						{/each}
					</div>
				{/if}

				<div class="flex gap-4 text-sm text-gray-400">
					{#if artist.musicbrainzUrl}
						<a
							href={artist.musicbrainzUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-primary-500"
						>
							MusicBrainz
						</a>
					{/if}
					{#if artist.spotifyUri}
						<a
							href={artist.spotifyUri}
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-primary-500"
						>
							Spotify
						</a>
					{/if}
					{#if artist.discogsUrl}
						<a
							href={artist.discogsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-primary-500"
						>
							Discogs
						</a>
					{/if}
				</div>
			</div>
		</div>
	</div>

	
	<div class="space-y-6">
		{#if reviews.length > 0}
			<div>
				<h2 class="text-2xl font-bold mb-4">Reviews</h2>
				<div class="space-y-3">
					{#each reviews as review}
						<div class="card p-4">
							<div class="flex items-center justify-between mb-2 text-sm opacity-75">
								{#if review.user?.id}
									<a href={`/user/${review.user.id}`} class="hover:underline">{review.user?.name || 'Anonymous'}</a>
								{:else}
									<span>{review.user?.name || 'Anonymous'}</span>
								{/if}
								<span>{review.rating}/10</span>
							</div>
							{#if review.reviewText}
								<p class="whitespace-pre-wrap text-sm">{review.reviewText}</p>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if albums.length > 0}
			<div>
				<h2 class="text-2xl font-bold mb-4">Albums</h2>
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{#each albums as release}
						<a href={getReleaseLink(release)} class="card p-4 hover:variant-filled-primary transition-all">
							{#if release.coverArt}
								<img
									src={release.coverArt}
									alt={release.title}
									class="w-full aspect-square object-cover rounded-lg mb-2"
								/>
							{:else}
								<div class="w-full aspect-square bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
									<span class="text-2xl text-gray-400">💿</span>
								</div>
							{/if}
							<h3 class="font-semibold truncate" title={release.title}>{release.title}</h3>
							{#if release.releaseDate}
								<p class="text-sm text-gray-400">{release.releaseDate.split('-')[0]}</p>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if singles.length > 0}
			<div>
				<h2 class="text-2xl font-bold mb-4">Singles</h2>
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{#each singles as release}
						<a href={getReleaseLink(release)} class="card p-4 hover:variant-filled-primary transition-all">
							{#if release.coverArt}
								<img
									src={release.coverArt}
									alt={release.title}
									class="w-full aspect-square object-cover rounded-lg mb-2"
								/>
							{:else}
								<div class="w-full aspect-square bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
									<span class="text-2xl text-gray-400">🎵</span>
								</div>
							{/if}
							<h3 class="font-semibold truncate" title={release.title}>{release.title}</h3>
							{#if release.releaseDate}
								<p class="text-sm text-gray-400">{release.releaseDate.split('-')[0]}</p>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if eps.length > 0}
			<div>
				<h2 class="text-2xl font-bold mb-4">EPs</h2>
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{#each eps as release}
						<a href={getReleaseLink(release)} class="card p-4 hover:variant-filled-primary transition-all">
							{#if release.coverArt}
								<img
									src={release.coverArt}
									alt={release.title}
									class="w-full aspect-square object-cover rounded-lg mb-2"
								/>
							{:else}
								<div class="w-full aspect-square bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
									<span class="text-2xl text-gray-400">📀</span>
								</div>
							{/if}
							<h3 class="font-semibold truncate" title={release.title}>{release.title}</h3>
							{#if release.releaseDate}
								<p class="text-sm text-gray-400">{release.releaseDate.split('-')[0]}</p>
							{/if}
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if others.length > 0}
			<div>
				<h2 class="text-2xl font-bold mb-4">Other Releases</h2>
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
					{#each others as release}
						<a href={getReleaseLink(release)} class="card p-4 hover:variant-filled-primary transition-all">
							{#if release.coverArt}
								<img
									src={release.coverArt}
									alt={release.title}
									class="w-full aspect-square object-cover rounded-lg mb-2"
								/>
							{:else}
								<div class="w-full aspect-square bg-gray-700 rounded-lg mb-2 flex items-center justify-center">
									<span class="text-2xl text-gray-400">🎶</span>
								</div>
							{/if}
							<h3 class="font-semibold truncate" title={release.title}>{release.title}</h3>
							{#if release.releaseDate}
								<p class="text-sm text-gray-400">{release.releaseDate.split('-')[0]}</p>
							{/if}
							<p class="text-xs text-gray-500">{release.type}</p>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		{#if releases.length === 0}
			<div class="card p-8 text-center text-gray-400">
				<p>No releases found for this artist.</p>
			</div>
		{/if}
	</div>
</div>
