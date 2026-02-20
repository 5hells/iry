<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { ChevronDown, ChevronUp, X } from '@lucide/svelte';
	import { createSummary, getPreview } from '$lib/utils/summary';
	import LyricsAutocomplete from '$lib/components/LyricsAutocomplete.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';

	interface Track {
		id: string;
		title: string;
		artist: string;
		duration: number;
		position?: string | null;
		trackNumber: number;
		uri: string;
	}

	interface TrackReview {
		trackId: string;
		trackTitle: string;
		rating: number;
		reviewText: string;
	}

	let {
		data
	}: {
		data: PageData;
	} = $props();

	let rating = $state(5);
	let reviewText = $state('');
	let images = $state<string[]>([]);
	let uploading = $state(false);
	let saving = $state(false);
	let loading = $state(true);
	let error = $state('');
	let tracks = $state<Track[]>([]);
	let trackReviews = $state<TrackReview[]>([]);
	let expandedTrackId = $state<string | null>(null);
	let filterQuery = $state('');
	let currentTrackIndex = $state(0);
	let reviewTextarea: HTMLTextAreaElement | null = $state(null);

	const source = $derived(data.source);
	const albumId = $derived(data.albumId);

	onMount(async () => {
		try {
			const response = await fetch(`/api/albums/${source}/${albumId}/tracks`);
			if (response.ok) {
				const data = await response.json();
				tracks = data.tracks;
			}
		} catch (err) {
			console.error('Failed to load tracks:', err);
		} finally {
			loading = false;
		}
	});

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function getFilteredTracks(): Track[] {
		if (!filterQuery.trim()) return tracks;
		const query = filterQuery.toLowerCase();
		return tracks.filter(
			(t) => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query)
		);
	}

	function addTrackReview(track: Track) {
		const existing = trackReviews.find((tr) => tr.trackId === track.id);
		if (!existing) {
			trackReviews = [
				...trackReviews,
				{
					trackId: track.id,
					trackTitle: track.title,
					rating: 5,
					reviewText: ''
				}
			];
			expandedTrackId = track.id;

			setTimeout(() => {
				const ta = document.querySelector(
					`[data-track-textarea="${track.id}"]`
				) as HTMLTextAreaElement | null;
				if (ta) ta.focus();
			}, 50);
		}
	}

	function removeTrackReview(trackId: string) {
		trackReviews = trackReviews.filter((tr) => tr.trackId !== trackId);
	}

	function updateTrackReview(trackId: string, field: string, value: any) {
		trackReviews = trackReviews.map((tr) =>
			tr.trackId === trackId ? { ...tr, [field]: value } : tr
		);
	}

	function nextTrack() {
		if (currentTrackIndex < trackReviews.length - 1) {
			currentTrackIndex++;
		}
	}

	function prevTrack() {
		if (currentTrackIndex > 0) {
			currentTrackIndex--;
		}
	}

	function removeTrackReviewWithNav(trackId: string) {
		const newReviews = trackReviews.filter((tr) => tr.trackId !== trackId);
		if (newReviews.length > 0) {
			if (currentTrackIndex >= newReviews.length) {
				currentTrackIndex = newReviews.length - 1;
			}
		} else {
			currentTrackIndex = 0;
		}
		trackReviews = newReviews;
	}

	async function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		uploading = true;
		const formData = new FormData();

		for (let i = 0; i < Math.min(input.files.length, 4); i++) {
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

	async function handleSubmit() {
		if (rating === undefined) {
			error = 'Please select a rating';
			return;
		}

		saving = true;
		error = '';

		try {
			const response = await fetch('/api/reviews', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					albumId,
					source,
					rating: parseFloat(rating.toString()),
					reviewText,
					imageUrls: images,
					trackReviews: trackReviews.map((tr) => ({
						trackId: tr.trackId,
						trackTitle: tr.trackTitle,
						rating: tr.rating,
						reviewText: tr.reviewText
					}))
				})
			});

			if (response.ok) {
				await goto(`/music/${source}/${albumId}`);
			} else {
				const result = await response.json();
				error = result.error || 'Failed to save review';
			}
		} catch (err) {
			error = 'Failed to save review';
			console.error(err);
		} finally {
			saving = false;
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
</script>

<div class="review-page mx-auto max-w-3xl p-4">
	<div class="mb-8">
		<a href={`/music/${source}/${albumId}`} class="variant-ghost-primary mb-4 btn lowercase"
			>&larr; back to album</a
		>
		<h1 class="h1 lowercase">write your review</h1>
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
					bind:this={reviewTextarea}
					bind:value={reviewText}
					placeholder="share your thoughts about this album... (use / to search lyrics)"
					class="input w-full resize-none"
					rows="6"
					maxlength="5000"
					onkeydown={handleKeydown}
				></textarea>
				<p class="mt-2 text-xs opacity-50">{reviewText.length}/5000 characters</p>
			</label>
			<LyricsAutocomplete textareaElement={reviewTextarea} />
		</div>

		{#if !loading}
			<div class="card p-6">
				<h3 class="mb-4 h3 lowercase">track ratings</h3>

				<div class="mb-4">
					<input
						type="text"
						bind:value={filterQuery}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								const list = getFilteredTracks();
								if (list.length > 0) addTrackReview(list[0]);
							}
						}}
						placeholder="filter tracks..."
						class="input w-full"
					/>
				</div>

				
				{#if trackReviews.length > 0}
					<div class="mb-6 border-b border-primary-300 pb-6 dark:border-primary-700">
						<p class="mb-4 text-sm lowercase opacity-75">
							track {currentTrackIndex + 1} of {trackReviews.length}
						</p>
						<div class="space-y-4">
							{#key trackReviews[currentTrackIndex]?.trackId}
								<div
									class="animate-fadeIn rounded-lg border border-primary-200 p-4 dark:border-primary-700"
								>
									<div class="mb-4 flex items-start justify-between gap-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-lg font-semibold">
												{trackReviews[currentTrackIndex]?.trackTitle}
											</p>
											<div class="mt-2 flex gap-1 text-lg">
												{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as star}
													<button
														type="button"
														onclick={() =>
															updateTrackReview(
																trackReviews[currentTrackIndex].trackId,
																'rating',
																star
															)}
														class="transform transition-all duration-200 hover:scale-125"
														style={`opacity: ${star <= trackReviews[currentTrackIndex].rating ? 1 : 0.3}; color: ${star <= trackReviews[currentTrackIndex].rating ? '#fbbf24' : '#9ca3af'}`}
													>
														★
													</button>
												{/each}
											</div>
										</div>
										<button
											type="button"
											onclick={() =>
												removeTrackReviewWithNav(trackReviews[currentTrackIndex].trackId)}
											class="text-error-500 transition-colors hover:text-error-700"
										>
											<X size={18} />
										</button>
									</div>
									<textarea
										data-track-textarea={trackReviews[currentTrackIndex]?.trackId}
										value={trackReviews[currentTrackIndex]?.reviewText || ''}
										onchange={(e) =>
											updateTrackReview(
												trackReviews[currentTrackIndex].trackId,
												'reviewText',
												(e.target as HTMLTextAreaElement).value
											)}
										placeholder="notes about this track..."
										class="input w-full resize-none"
										rows="3"
										maxlength="500"
									></textarea>
									<p class="mt-2 text-xs opacity-50">
										{trackReviews[currentTrackIndex]?.reviewText.length || 0}/500 characters
									</p>
								</div>
							{/key}

							
							<div class="flex items-center justify-between gap-3">
								<button
									type="button"
									onclick={prevTrack}
									disabled={currentTrackIndex === 0}
									class="rounded border border-primary-300 px-4 py-2 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-primary-700"
								>
									← prev
								</button>
								<span class="text-xs opacity-60"
									>{currentTrackIndex + 1} / {trackReviews.length}</span
								>
								<button
									type="button"
									onclick={nextTrack}
									disabled={currentTrackIndex === trackReviews.length - 1}
									class="rounded border border-primary-300 px-4 py-2 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-primary-700"
								>
									next →
								</button>
							</div>
						</div>
					</div>
				{/if}

				
				<div>
					<p class="mb-3 text-sm lowercase opacity-75">select tracks to rate:</p>
					<div class="max-h-96 space-y-1 overflow-y-auto">
						{#each getFilteredTracks() as track (track.id)}
							{@const isAdded = trackReviews.some((tr) => tr.trackId === track.id)}
							<div
								class="rounded-lg border border-primary-200 p-3 transition hover:border-primary-500 dark:border-primary-700 dark:hover:border-primary-500"
							>
								<div class="flex items-center justify-between gap-2">
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium lowercase">
											{track.position ?? track.trackNumber}. {track.title}
										</p>
										<p class="text-xs lowercase opacity-50">{formatDuration(track.duration)}</p>
									</div>
									{#if isAdded}
										<button
											type="button"
											onclick={() => removeTrackReview(track.id)}
											class="variant-filled-error btn btn-sm lowercase"
										>
											remove
										</button>
									{:else}
										<button
											type="button"
											onclick={() => addTrackReview(track)}
											ondblclick={() => addTrackReview(track)}
											class="variant-filled-primary btn btn-sm lowercase"
										>
											add
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		
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
			<a href={`/music/${source}/${albumId}`} class="variant-ghost-surface btn flex-1 lowercase"
				>cancel</a
			>
		</div>
	</form>
</div>

<style>
	:global(.review-page textarea) {
		font-family: inherit;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.animate-fadeIn) {
		animation: fadeIn 0.3s ease-out;
	}
</style>
