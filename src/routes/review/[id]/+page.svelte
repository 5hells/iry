<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Heart, MessageCircle, Send, Share2 } from '@lucide/svelte';
	import { toasts } from '$lib/stores/notifications';

	interface User {
		id: string;
		name: string;
		displayName?: string;
		image?: string;
		role?: 'user' | 'admin' | 'moderator';
	}

	let review = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let currentUser = $state<User | null>(null);
	let replyContent = $state('');
	let submittingReply = $state(false);
	let replyError = $state<string | null>(null);
	let replySuccess = $state(false);

	onMount(async () => {
		const reviewId = $page.params.id;
		currentUser = ($page.data?.user as User | null) || null;

		try {
			const response = await fetch(`/api/reviews/${reviewId}`);
			if (response.ok) {
				review = await response.json();
			} else {
				error = 'Review not found';
			}
		} catch (err) {
			console.error('Failed to load review:', err);
			error = 'Failed to load review';
		} finally {
			loading = false;
		}

		if (!currentUser?.id) {
			try {
				const userRes = await fetch('/api/user/profile');
				if (userRes.ok) {
					const userData = await userRes.json();
					currentUser = userData.user;
				}
			} catch (err) {
				console.error('Failed to load user:', err);
			}
		}
	});

	async function submitReply() {
		if (!replyContent.trim() || !review) return;

		submittingReply = true;
		replyError = null;

		try {
			const response = await fetch(`/api/reviews/${review.id}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: replyContent
				})
			});

			if (response.ok) {
				replyContent = '';
				replySuccess = true;
				setTimeout(() => {
					replySuccess = false;
				}, 3000);
			} else {
				const data = await response.json();
				replyError = data.error || 'Failed to send reply';
			}
		} catch (err) {
			console.error('Failed to submit reply:', err);
			replyError = 'Failed to send reply. Please try again.';
		} finally {
			submittingReply = false;
		}
	}

	async function copyPermalink() {
		const url = window.location.href;
		try {
			await navigator.clipboard.writeText(url);
			toasts.add('link copied to clipboard', 'success');
		} catch (err) {
			console.error('Failed to copy:', err);
			toasts.add('failed to copy link', 'error');
		}
	}

	function formatDate(timestamp: number) {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function renderStars(rating: number): string {
		const fullStars = Math.floor(rating);
		const hasHalf = rating % 1 >= 0.5;
		let stars = '★'.repeat(fullStars);
		if (hasHalf) stars += '✩';
		stars += '☆'.repeat(10 - Math.ceil(rating));
		return stars;
	}
</script>

<svelte:head>
	<title
		>{review
			? `${review.type === 'artist' ? review.artist?.name : review.album?.title} Review by ${review.user?.displayName || review.user?.name}`
			: 'Review'} - iry</title
	>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<div class="flex justify-center py-20">
			<p class="text-[var(--text-secondary)]">Loading review...</p>
		</div>
	{:else if error || !review}
		<div class="py-20 text-center">
			<p class="text-[var(--text-secondary)]">{error || 'Review not found'}</p>
			<a href="/" class="text-[var(--color-primary-500)] hover:underline">Go home</a>
		</div>
	{:else}
			<div class="mb-8">
				{#if review.type === 'artist' || review.artist}
					{@const art = review.artist}
					<a
						href={`/artist/${art?.source || (art?.musicbrainzId ? 'musicbrainz' : art?.discogsId ? 'discogs' : art?.spotifyId ? 'spotify' : 'db')}/${art?.musicbrainzId || art?.discogsId || art?.spotifyId || art?.id}`}
						class="mb-4 flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					>
						<span>←</span> Back to artist
					</a>
				{:else}
					{@const a = review.album}
					<a
						href={`/music/${a?.source || (a?.musicbrainzId ? 'musicbrainz' : a?.discogsId ? 'discogs' : a?.spotifyId ? 'spotify' : 'db')}/${a?.musicbrainzId || a?.discogsId || a?.spotifyId || a?.id}`}
						class="mb-4 flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					>
						<span>←</span> Back to {a?.title ? 'album' : 'music'}
					</a>
				{/if}
			</div>

		
		<div class="mb-6 card p-6">
			<div class="mb-6 flex gap-4">
				{#if review.type === 'artist' || review.artist}
					{#if review.artist?.imageUrl}
						<img
							src={review.artist.imageUrl}
							alt={review.artist.name}
							class="h-32 w-32 rounded-lg object-cover"
						/>
					{:else}
						<div
							class="flex h-32 w-32 items-center justify-center rounded-lg bg-[var(--bg-secondary)]"
						>
							<span class="text-4xl opacity-50">🎤</span>
						</div>
					{/if}
					<div class="flex-1">
						<h1 class="mb-1 text-2xl font-bold">{review.artist?.name}</h1>
						<p class="mb-2 text-lg text-[var(--text-secondary)]">artist review</p>
					</div>
				{:else}
					{#if review.album?.coverArtUrl}
						<img
							src={review.album.coverArtUrl}
							alt={review.album.title}
							class="h-32 w-32 rounded-lg object-cover"
						/>
					{:else}
						<div
							class="flex h-32 w-32 items-center justify-center rounded-lg bg-[var(--bg-secondary)]"
						>
							<span class="text-4xl opacity-50">♪</span>
						</div>
					{/if}
					<div class="flex-1">
						<h1 class="mb-1 text-2xl font-bold">{review.album?.title}</h1>
						<p class="mb-2 text-lg text-[var(--text-secondary)]">{review.album?.artist}</p>
						<div class="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
							{#if review.album?.releaseDate}
								<span>{review.album.releaseDate}</span>
							{/if}
							{#if review.album?.genres}
								<span>•</span>
								<span>{JSON.parse(review.album.genres).join(', ')}</span>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			
			<div class="mb-4 flex items-center gap-3 border-b border-[var(--border-color)] pb-4">
				{#if review.user?.image}
					<img
						src={review.user.image}
						alt={review.user.displayName || review.user.name}
						class="h-10 w-10 rounded-full"
					/>
				{:else}
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
					>
						<span class="font-bold"
							>{(review.user?.displayName || review.user?.name)?.[0]?.toUpperCase()}</span
						>
					</div>
				{/if}
				<div class="flex-1">
					<a
						href={`/user/${review.user?.id}`}
						class="font-semibold hover:text-[var(--color-primary-500)]"
					>
						{review.user?.displayName || review.user?.name}
					</a>
					<p class="text-sm text-[var(--text-secondary)]">{formatDate(review.createdAt)}</p>
				</div>
				<div class="flex flex-col items-end gap-2 text-right">
					<div class="text-2xl text-yellow-500">{renderStars(review.rating)}</div>
					<p class="text-sm text-[var(--text-secondary)]">{review.rating.toFixed(1)} / 10</p>
					<button
						onclick={copyPermalink}
						class="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
						title="copy link"
					>
						<Share2 size={14} />
						<span>share link</span>
					</button>
					{#if currentUser && (currentUser.id === review.user?.id || currentUser.role === 'admin' || currentUser.role === 'moderator')}
						<button
							onclick={async () => {
								if (!confirm('Delete this review? This action cannot be undone.')) return;
								try {
									const resp = await fetch(`/api/reviews/${review.id}/delete`, { method: 'DELETE' });
									if (resp.ok) {
										let redirectTo = '/';
										if (review.album) {
											const a = review.album;
											const source = a?.source || (a?.musicbrainzId ? 'musicbrainz' : a?.discogsId ? 'discogs' : a?.spotifyId ? 'spotify' : 'db');
											const id = a?.musicbrainzId || a?.discogsId || a?.spotifyId || a?.id;
											redirectTo = `/music/${source}/${id}`;
										} else if (review.artist) {
											const art = review.artist;
											const source = art?.source || (art?.musicbrainzId ? 'musicbrainz' : art?.discogsId ? 'discogs' : art?.spotifyId ? 'spotify' : 'db');
											const id = art?.musicbrainzId || art?.discogsId || art?.spotifyId || art?.id;
											redirectTo = `/artist/${source}/${id}`;
										}
										window.location.href = redirectTo;
									} else {
										const data = await resp.json().catch(() => ({}));
										alert(data.error || 'Failed to delete review');
									}
								} catch (err) {
									console.error('Failed to delete review', err);
									alert('Failed to delete review');
								}
							}
							}
						class="mt-2 btn variant-filled-error text-xs"
						style="padding:6px 10px;"
						>
						Delete
						</button>
					{/if}
				</div>
			</div>

			
			{#if review.reviewText}
				<div class="prose mb-6 max-w-none">
					<p class="whitespace-pre-wrap text-[var(--text-primary)]">{review.reviewText}</p>
				</div>
			{/if}

			
			{#if review.imageUrls}
				{@const images = review.imageUrls}
				{#if images.length > 0}
					<div class="mb-6 grid grid-cols-2 gap-2">
						{#each images as imageUrl}
							<img
								src={imageUrl}
								alt="Review"
								class="w-full rounded border border-[var(--border-color)]"
							/>
						{/each}
					</div>
				{/if}
			{/if}

			
			{#if review.trackReviews && review.trackReviews.length > 0}
				<div class="mt-6 border-t border-[var(--border-color)] pt-6">
					<h3 class="mb-4 text-lg font-semibold">Track Reviews ({review.trackReviews.length})</h3>
					<div class="space-y-3">
						{#each review.trackReviews as trackReview}
							<div class="rounded bg-[var(--bg-secondary)] p-3">
								<div class="mb-1 flex items-center justify-between">
									<span class="font-medium">
										{trackReview.track?.position ?? trackReview.track?.trackNumber}. {trackReview
											.track?.title}
									</span>
									<span class="text-sm text-yellow-500">
										{renderStars(trackReview.rating)}
									</span>
								</div>
								{#if trackReview.reviewText}
									<p class="text-sm text-[var(--text-secondary)]">{trackReview.reviewText}</p>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			
			{#if review.pointsAwarded > 0}
				<div class="mt-6 flex items-center gap-2 border-t border-[var(--border-color)] pt-6">
					<span class="text-sm text-[var(--text-secondary)]">Points awarded:</span>
					<span
						class="rounded bg-[var(--color-primary-500)]/20 px-2 py-1 text-sm font-semibold text-[var(--color-primary-500)]"
					>
						+{review.pointsAwarded}
					</span>
				</div>
			{/if}
		</div>

		
		{#if currentUser}
			<div class="mb-6 card p-6">
				<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold">
					<MessageCircle size={18} />
					Reply to Review
				</h3>

				{#if replySuccess}
					<div
						class="mb-4 rounded border border-green-500 bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300"
					>
						Reply sent successfully!
					</div>
				{/if}

				{#if replyError}
					<div
						class="mb-4 rounded border border-red-500 bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"
					>
						{replyError}
					</div>
				{/if}

				<textarea
					bind:value={replyContent}
					placeholder="Share your thoughts on this review..."
					class="w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none"
					rows="3"
					maxlength="500"
				></textarea>
				<div class="mt-3 flex items-center justify-between">
					<span class="text-sm text-[var(--text-secondary)]">{replyContent.length}/500</span>
					<button
						onclick={submitReply}
						disabled={!replyContent.trim() || submittingReply}
						class="flex items-center gap-2 rounded bg-[var(--color-primary-500)] px-4 py-2 font-medium text-white transition hover:bg-[var(--color-primary-600)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Send size={16} />
						{submittingReply ? 'Sending...' : 'Send Reply'}
					</button>
				</div>
			</div>
		{:else}
			<div
				class="mb-6 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 text-center"
			>
				<p class="text-[var(--text-primary)]">
					<a href="/login" class="text-[var(--color-primary-500)] hover:underline">Log in</a> to reply
					to this review.
				</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.card {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 0.75rem;
		color: var(--text-primary);
	}

	.prose {
		line-height: 1.7;
	}
</style>
