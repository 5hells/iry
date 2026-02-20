<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let rating = $state(5);
	let reviewText = $state('');
	let images = $state<string[]>([]);
	let uploading = $state(false);
	let saving = $state(false);
	let error = $state('');
	let artistName = $state('artist');

	const source = $derived(data.source);
	const artistId = $derived(data.artistId);

	onMount(async () => {
		try {
			const resp = await fetch(`/api/artist/${source}/${artistId}`);
			if (resp.ok) {
				const payload = await resp.json();
				if (payload?.artist?.name) artistName = payload.artist.name;
			}
		} catch (err) {
			console.error('Failed to load artist:', err);
		}
	});

	async function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		uploading = true;
		const formData = new FormData();

		for (let i = 0; i < Math.min(input.files.length, 4 - images.length); i++) {
			formData.append('images', input.files[i]);
		}

		try {
			const response = await fetch('/api/upload/images', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				const result = await response.json();
				images = [...images, ...result.urls].slice(0, 4);
			}
		} catch (err) {
			error = 'Failed to upload images';
			console.error(err);
		} finally {
			uploading = false;
		}
	}

	function removeImage(index: number) {
		images = images.filter((_, i) => i !== index);
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			handleSubmit();
		}
	}

	async function handleSubmit() {
		error = '';
		saving = true;
		try {
			const resp = await fetch('/api/reviews/artist', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					artistId,
					source,
					rating: Number(rating),
					reviewText,
					imageUrls: images
				})
			});

			if (resp.ok) {
				await goto(`/artist/${source}/${artistId}`);
				return;
			}

			const data = await resp.json();
			error = data?.message || data?.error || 'Failed to save review';
		} catch (err) {
			console.error(err);
			error = 'Failed to save review';
		} finally {
			saving = false;
		}
	}
</script>

<div class="review-page mx-auto max-w-3xl p-4">
	<div class="mb-8">
		<a href={`/artist/${source}/${artistId}`} class="variant-ghost-primary mb-4 btn lowercase"
			>&larr; back to artist</a
		>
		<h1 class="h1 lowercase">write your review</h1>
		<p class="mt-1 text-sm lowercase opacity-60">{artistName}</p>
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
		class="space-y-6"
	>
		<div class="card p-6">
			<label class="mb-3 block">
				<span class="mb-3 block h4 lowercase">your rating</span>
				<div class="flex gap-1 text-3xl">
					{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as star}
						<button
							type="button"
							onclick={() => (rating = star)}
							class="transform transition hover:scale-125"
							style={`opacity: ${star <= rating ? 1 : 0.3}; color: ${star <= rating ? '#fbbf24' : '#9ca3af'}`}
						>
							★
						</button>
					{/each}
				</div>
				<p class="mt-2 text-sm lowercase opacity-50">{rating}/10</p>
			</label>
		</div>

		<div class="card p-6">
			<label class="block">
				<span class="mb-3 block h4 lowercase">your review</span>
				<textarea
					bind:value={reviewText}
					placeholder="share your thoughts about this artist..."
					class="input w-full resize-none"
					rows="6"
					maxlength="5000"
					onkeydown={handleKeydown}
				></textarea>
				<p class="mt-2 text-xs opacity-50">{reviewText.length}/5000 characters</p>
			</label>
		</div>

		<div class="card p-6">
			<label class="mb-3 block">
				<span class="mb-3 block h4 lowercase">add images</span>
				<label
					class="variant-ghost-surface btn w-full cursor-pointer lowercase"
					class:opacity-50={uploading || images.length >= 4}
				>
					<input
						type="file"
						accept="image/*"
						multiple
						onchange={handleImageUpload}
						disabled={uploading || images.length >= 4}
						class="hidden"
					/>
					upload images
				</label>
				<p class="mt-2 text-xs opacity-50">{images.length}/4 images</p>
			</label>

			{#if images.length > 0}
				<div class="mt-3 grid grid-cols-2 gap-2">
					{#each images as image, idx}
						<div class="relative">
							<img src={image} alt="preview" class="h-32 w-full rounded object-cover" />
							<button
								type="button"
								onclick={() => removeImage(idx)}
								class="variant-filled-error absolute top-1 right-1 btn-icon btn btn-icon-sm"
							>
								×
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if error}
			<div
				class="card border border-error-300 bg-error-100 p-4 text-error-800 lowercase dark:border-error-700 dark:bg-error-900 dark:text-error-200"
			>
				{error}
			</div>
		{/if}

		<div class="flex gap-2">
			<button type="submit" disabled={saving} class="variant-filled-primary btn flex-1 lowercase">
				{saving ? 'saving...' : 'submit review'}
			</button>
			<a href={`/artist/${source}/${artistId}`} class="variant-ghost-surface btn flex-1 lowercase"
				>cancel</a
			>
		</div>
	</form>
</div>
