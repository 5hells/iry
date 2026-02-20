<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let id = '';
	let loading = false;
	let song: any = null;
	let showSynced = false;

	onMount(() => {
		id = page.url.searchParams.get('id') || '';
		if (id) {
			fetchSong(id);
		}
	});

	async function fetchSong(songId: string) {
		loading = true;
		try {
			const response = await fetch(`/api/search/lyrics?id=${encodeURIComponent(songId)}`);
			if (response.ok) {
				const data = await response.json();
				song = (data.lyrics || []).find((s: any) => s.id === songId) || null;

				showSynced = !!song?.syncedLyrics;
			}
		} catch (err) {
			console.error('Failed to fetch song', err);
		} finally {
			loading = false;
		}
	}

	function parseSyncedLyrics(syncedLyrics: string) {
		const lines = syncedLyrics.split('\n');
		return lines
			.map((line) => {
				const match = line.match(/\[(\d{2}):(\d{2}\.\d{2})\](.*)/);
				if (match) {
					const [, min, sec, lyric] = match;
					const ms = parseInt(min) * 60000 + parseFloat(sec) * 1000;
					return { time: `${min}:${sec}`, ms, lyric };
				}
				return null;
			})
			.filter(Boolean);
	}
</script>

<div class="mx-auto max-w-4xl p-6">
	{#if loading}
		<p>Loading...</p>
	{:else if !song}
		<p class="text-sm opacity-50">Song not found</p>
	{:else}
		<div class="mb-6">
			<h1 class="text-2xl font-semibold">{song.title}</h1>
			<p class="text-lg opacity-70">{song.artist}</p>
			{#if song.album}
				<p class="text-sm opacity-60">{song.album}</p>
			{/if}
		</div>

		{#if song.plainLyrics || song.syncedLyrics}
			{#if song.syncedLyrics && song.plainLyrics}
				<div class="mb-4 flex gap-2">
					<button
						onclick={() => (showSynced = false)}
						class="rounded px-3 py-1 text-sm transition"
						class:bg-blue-600={!showSynced}
						class:text-white={!showSynced}
						class:bg-[var(--bg-base)]={showSynced}
					>
						Plain
					</button>
					<button
						onclick={() => (showSynced = true)}
						class="rounded px-3 py-1 text-sm transition"
						class:bg-blue-600={showSynced}
						class:text-white={showSynced}
						class:bg-[var(--bg-base)]={!showSynced}
					>
						Synced
					</button>
				</div>
			{/if}

			{#if showSynced && song.syncedLyrics}
				<div class="max-h-96 overflow-y-auto rounded bg-[var(--bg-base)] p-4 font-mono text-sm">
					{#each parseSyncedLyrics(song.syncedLyrics) as item (item!.ms)}
						<div class="mb-2">
							<span class="text-xs opacity-60">[{item!.time}]</span>
							<span class="ml-2">{item!.lyric}</span>
						</div>
					{/each}
				</div>
			{:else if song.plainLyrics}
				<pre
					class="max-h-96 overflow-y-auto rounded bg-[var(--bg-base)] p-4 text-sm whitespace-pre-wrap">{song.plainLyrics}</pre>
			{/if}
		{:else}
			<p class="mt-4 text-sm opacity-50">No lyrics available</p>
		{/if}
	{/if}
</div>
