<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	let q = '';
	let results: any[] = [];
	let loading = false;

	onMount(() => {
		q = page.url.searchParams.get('q') || '';
		if (q) {
			fetchResults(q);
		}
	});

	async function fetchResults(query: string) {
		loading = true;
		try {
			const response = await fetch(`/api/search/lyrics?q=${encodeURIComponent(query)}`);
			if (response.ok) {
				const data = await response.json();
				results = data.lyrics || [];
			}
		} catch (err) {
			console.error('Lyrics page search failed', err);
			results = [];
		} finally {
			loading = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl p-6">
	<h1 class="mb-4 text-xl font-semibold">Lyrics</h1>

	{#if !q}
		<p class="text-sm opacity-60">
			Search lyrics by typing <code>/Title - Artist</code> in a review or use the box above.
		</p>
	{:else}
		<p class="mb-4 text-sm opacity-70">Results for <strong>{q}</strong></p>
		{#if loading}
			<p class="text-sm">Searching...</p>
		{:else if results.length === 0}
			<p class="text-sm opacity-50">No results</p>
		{:else}
			<div class="space-y-3">
				{#each results as r}
					<div class="rounded border bg-[var(--bg-base)] p-3">
						<div class="flex items-center justify-between">
							<div>
								<p class="font-medium">{r.title}</p>
								<p class="text-xs opacity-60">{r.artist}{r.album ? ` — ${r.album}` : ''}</p>
							</div>
							<a href={`/lyrics/view?id=${r.id}`} class="text-sm text-blue-500 hover:underline"
								>View</a
							>
						</div>
						{#if r.excerpt}
							<p class="mt-2 text-sm text-[var(--text-secondary)]">{r.excerpt}</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	code {
		background: var(--bg-base);
		padding: 2px 6px;
		border-radius: 4px;
	}
</style>
