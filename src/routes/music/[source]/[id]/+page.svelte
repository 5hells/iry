<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import { Star, MessageCircle, Trophy, Heart, Share2, Search } from '@lucide/svelte';
	import StackedHeads from '$lib/components/StackedHeads.svelte';
	import { toasts } from '$lib/stores/notifications';

	interface Album {
		id: string;
		title: string;
		artist: string;
		artistUrl?: string | null;
		releaseDate: string;
		coverArtUrl: string | null;
		genres: string[];
		totalTracks: number;
		spotifyUri?: string;
		discogsUrl?: string;
		tracks?: Array<{
			id: string;
			spotifyId?: string | null;
			title: string;
			trackNumber: number;
			durationMs?: number;
		}>;
	}

	interface Review {
		id: string;
		userId: string;
		rating: number;
		reviewText: string;
		imageUrls: string[];
		createdAt: number;
		likeCount: number;
		likeHeads?: {
			id: string;
			name: string;
			image: string | null;
		}[];
		isLiked: boolean;
		replyCount?: number;
		replyHeads?: {
			id: string;
			name: string;
			image: string | null;
		}[];
		comments?: Comment[];
		user: {
			id: string;
			name: string;
			image: string | null;
		};
		trackReviews?: TrackReview[];
	}

	interface TrackReview {
		id: string;
		rating: number;
		reviewText?: string;
		track?: { id: string; title?: string } | null;
		reviewer?: { id: string; name?: string } | null;
	}

	interface Comment {
		id: string;
		userId: string;
		content: string;
		createdAt: number;
		likeCount: number;
		likeHeads?: {
			id: string;
			name: string;
			image: string | null;
		}[];
		isLiked: boolean;
		user: {
			id: string;
			name: string;
			image: string | null;
			isPro?: boolean;
			customTag?: string | null;
		};
	}

	type UserHead = {
		id: string;
		name: string;
		image: string | null;
	};

	interface DiscogsFeedback {
		releaseId: number;
		ratingAverage: number | null;
		ratingCount: number;
		have: number;
		want: number;
		url?: string;
	}

	let {
		data
	}: {
		data: PageData;
	} = $props();

	let album = $state<Album | null>(null);
	let reviews = $state<Review[]>([]);
	let stats = $state({ reviewCount: 0, avgRating: 0 });
	let userReview = $state<Review | null>(null);
	let discogsFeedback = $state<DiscogsFeedback | null>(null);
	let loading = $state(true);
	let showReviewForm = $state(false);
	let expandedReviews = $state<Set<string>>(new Set());
	let expandedReviewText = $state<Set<string>>(new Set());

	let expandedTracks = $state<Set<string>>(new Set());
	let expandedTrackReviews = $state<Set<string>>(new Set());
	let showAllTrackReviews = $state<Set<string>>(new Set());
	let trackTypes = $state<Record<string, string>>({});
	let lyricsByTrack = $state<Record<string, { loading: boolean; results: any[] | null }>>({});
	let lyricsTimers = $state<Record<string, any>>({});
	let replyText = $state<Record<string, string>>({});

	let canvasUrls = $state<string[]>([]);
	let currentCanvasIndex = $state<number>(0);
	function prevCanvas() {
		if (!canvasUrls || canvasUrls.length === 0) return;
		currentCanvasIndex = (currentCanvasIndex - 1 + canvasUrls.length) % canvasUrls.length;
	}
	function nextCanvas() {
		if (!canvasUrls || canvasUrls.length === 0) return;
		currentCanvasIndex = (currentCanvasIndex + 1) % canvasUrls.length;
	}

	let albumId = $state<string>('');
	let source = $state<string>('');

	let streamingQuery = $state<string>('');

	onMount(async () => {
		albumId = (data as any)?.albumId ?? (data as any)?.params?.id ?? albumId;
		source = (data as any)?.source ?? (data as any)?.params?.source ?? source;

		try {
			const resp = await fetch(`/api/albums/${source}/${albumId}`);
			if (resp.ok) {
				const payload = await resp.json();
				album = payload.album ?? null;

				if (album && Array.isArray(album.tracks) && album.tracks.length > 0) {
					const map = new Map();
					for (const t of album.tracks) {
						const key = (t.title || '').trim().toLowerCase();
						if (!map.has(key)) map.set(key, t);
						else {
							const existing = map.get(key);

							if (!existing.spotifyId && t.spotifyId) map.set(key, t);
						}
					}
					let deduped = Array.from(map.values());
					deduped.sort((a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
					deduped.forEach((t, i) => (t.trackNumber = i + 1));
					album = { ...album, tracks: deduped, totalTracks: deduped.length };
				}
				reviews = (payload.reviews ?? []).map((review: Review) => ({
					...review,
					likeHeads: review.likeHeads || [],
					replyHeads: review.replyHeads || [],
					comments: (review.comments || []).map((comment) => ({
						...comment,
						likeHeads: comment.likeHeads || []
					}))
				}));
				stats = payload.stats ?? { reviewCount: 0, avgRating: 0 };
				userReview = payload.userReview ?? null;
				discogsFeedback = payload.discogsFeedback ?? null;

				const tt: Record<string, string> = {};
				(album?.tracks || []).forEach((t: any) => {
					tt[t.id] = trackTypes[t.id] || '';
				});
				trackTypes = { ...trackTypes, ...tt };
			} else {
				console.warn('Album API returned', resp.status);
			}
		} catch (err) {
			console.error('Failed to load album data:', err);
		} finally {
			streamingQuery = album ? `${album.artist} ${album.title}` : '';
			loading = false;
		}
	});

	let editingTrackId = $state<string | null>(null);
	let editPosition = $state<{ [key: string]: string }>({});
	let editTitle = $state<{ [key: string]: string }>({});
	let editDisc = $state<{ [key: string]: string }>({});
	let editWithin = $state<{ [key: string]: number }>({});

	const isAdmin = $derived.by(
		() => (data && (data as any).user && (data as any).user.role === 'admin') || false
	);

	function computeDiscs(tracks: any[]) {
		if (!tracks || tracks.length === 0) return [{ key: 'disc-1', label: 'Tracks', tracks: [] }];

		const hasDisc = tracks.some((t) => t.discNumber !== undefined || t.disc !== undefined);
		if (hasDisc) {
			const map = new Map<string, { key: string; label: string; tracks: any[] }>();
			for (const t of tracks) {
				const discNum = t.discNumber ?? t.disc ?? 1;
				const key = `disc-${discNum}`;
				if (!map.has(key)) map.set(key, { key, label: `Disc ${discNum}`, tracks: [] });
				map.get(key)!.tracks.push(t);
			}
			return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
		}

		const hasPositionLabels = tracks.some((t) => t.position && /\D/.test(String(t.position)));

		if (hasPositionLabels) {
			const parsePosition = (p: any) => {
				if (!p && p !== 0) return { prefix: null, num: null, sub: null };
				let s = String(p).trim();
				if (!s) return { prefix: null, num: null, sub: null };
				s = s.replace(/^(side|disc|track)\s*/i, '');
				s = s.replace(/[-—–]/g, '.');
				s = s.replace(/\s*[:\-]\s*/g, '.');
				s = s.replace(/\s+/g, '');
				s = s.toUpperCase();

				const m1 = s.match(/^([A-Z]+)(\d+)(?:\.(\d+))?$/);
				if (m1)
					return {
						prefix: m1[1],
						num: parseInt(m1[2], 10),
						sub: m1[3] ? parseInt(m1[3], 10) : null
					};

				const m2 = s.match(/^(\d+)(?:\.(\d+))?$/);
				if (m2)
					return {
						prefix: null,
						num: parseInt(m2[1], 10),
						sub: m2[2] ? parseInt(m2[2], 10) : null
					};

				const prefixMatch = s.match(/^([^0-9]+)[0-9]*/);
				const numMatch = s.match(/(\d+)/);
				return {
					prefix: prefixMatch ? prefixMatch[1] : null,
					num: numMatch ? parseInt(numMatch[0], 10) : null,
					sub: null
				};
			};

			const groups = new Map<string, { key: string; label: string; tracks: any[] }>();
			for (const t of tracks) {
				const pos = parsePosition(t.position);
				const key = pos.prefix ? `side-${pos.prefix}` : 'side-1';
				if (!groups.has(key))
					groups.set(key, { key, label: pos.prefix ? `Side ${pos.prefix}` : 'Tracks', tracks: [] });
				groups.get(key)!.tracks.push({ ...t, __posParsed: pos });
			}

			for (const g of groups.values()) {
				g.tracks.sort((a, b) => {
					const aNum =
						a.__posParsed && a.__posParsed.num ? a.__posParsed.num : (a.trackNumber ?? 0);
					const bNum =
						b.__posParsed && b.__posParsed.num ? b.__posParsed.num : (b.trackNumber ?? 0);
					const aSub = a.__posParsed && a.__posParsed.sub ? a.__posParsed.sub : 0;
					const bSub = b.__posParsed && b.__posParsed.sub ? b.__posParsed.sub : 0;
					return aNum === bNum ? aSub - bSub : aNum - bNum;
				});
			}

			return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
		}

		return [{ key: 'disc-1', label: 'Tracks', tracks }];
	}

	function toggleTrackExpanded(trackId: string) {
		if (expandedTracks.has(trackId)) {
			expandedTracks.delete(trackId);
		} else {
			expandedTracks.add(trackId);
		}
		expandedTracks = expandedTracks;
	}

	function toggleAllTrackReviews(trackId: string) {
		const newSet = new Set(showAllTrackReviews);
		if (newSet.has(trackId)) {
			newSet.delete(trackId);
		} else {
			newSet.add(trackId);
		}
		showAllTrackReviews = newSet;
	}

	function cycleTrackType(trackId: string) {
		const types = ['song', 'feat', 'remix', 'cover', 'live', 'unreleased'];
		const current = trackTypes[trackId] || 'song';
		const currentIndex = types.indexOf(current);
		const nextIndex = (currentIndex + 1) % types.length;
		trackTypes[trackId] = types[nextIndex];
	}

	function searchLyricsForTrack(track: any) {
		const id = track.id;

		lyricsByTrack = { ...lyricsByTrack, [id]: { loading: true, results: null } };

		if (lyricsTimers[id]) {
			clearTimeout(lyricsTimers[id]);
		}

		lyricsTimers = {
			...lyricsTimers,
			[id]: setTimeout(async () => {
				try {
					const q = `${album!.artist} ${track.title}`;
					const resp = await fetch(`/api/search/lyrics?q=${encodeURIComponent(q)}`);
					if (resp.ok) {
						const data = await resp.json();
						lyricsByTrack = {
							...lyricsByTrack,
							[id]: { loading: false, results: data.lyrics || [] }
						};
					} else {
						lyricsByTrack = { ...lyricsByTrack, [id]: { loading: false, results: [] } };
					}
				} catch (err) {
					console.error('Lyrics search failed:', err);
					lyricsByTrack = { ...lyricsByTrack, [id]: { loading: false, results: [] } };
				} finally {
					const t = { ...lyricsTimers };
					delete t[id];
					lyricsTimers = t;
				}
			}, 400)
		};
	}

	function toggleReplyForm(reviewId: string) {
		const newSet = new Set(expandedReviews);
		if (newSet.has(reviewId)) {
			newSet.delete(reviewId);
		} else {
			newSet.add(reviewId);
		}
		expandedReviews = newSet;
	}

	function toggleReviewText(reviewId: string) {
		const newSet = new Set(expandedReviewText);
		if (newSet.has(reviewId)) {
			newSet.delete(reviewId);
		} else {
			newSet.add(reviewId);
		}
		expandedReviewText = newSet;
	}

	function toggleTrackReviews(reviewId: string) {
		const newSet = new Set(expandedTrackReviews);
		if (newSet.has(reviewId)) {
			newSet.delete(reviewId);
		} else {
			newSet.add(reviewId);
		}
		expandedTrackReviews = newSet;
	}

	function calculateTrackAverageRating(trackId: string): number {
		const trackReviewsForTrack = reviews
			.flatMap((r) => r.trackReviews || [])
			.filter((tr) => tr.track?.id === trackId);

		if (trackReviewsForTrack.length === 0) return 0;

		const sum = trackReviewsForTrack.reduce((acc, tr) => acc + tr.rating, 0);
		return sum / trackReviewsForTrack.length;
	}

	function getTrackReviewCount(trackId: string): number {
		return reviews.flatMap((r) => r.trackReviews || []).filter((tr) => tr.track?.id === trackId)
			.length;
	}

	function getTrackReviewsForTrack(trackId: string) {
		return reviews
			.flatMap((r) =>
				(r.trackReviews || []).map((tr) => ({
					...tr,
					reviewId: r.id,
					reviewer: r.user
				}))
			)
			.filter((tr) => tr.track?.id === trackId);
	}

	function uniqueHeads(users: Array<{ id?: string; name?: string; image?: string | null }>, max = 5) {
		const seen = new Set<string>();
		const heads: UserHead[] = [];

		for (const user of users) {
			if (!user?.id || seen.has(user.id)) continue;
			seen.add(user.id);
			heads.push({
				id: user.id,
				name: user.name || 'Anonymous',
				image: user.image || null
			});
			if (heads.length >= max) break;
		}

		return heads;
	}

	function toggleCurrentUserHead(heads: UserHead[] = [], liked: boolean) {
		const currentUser = (data as any)?.user;
		if (!currentUser?.id) return heads;

		if (liked) {
			return uniqueHeads([
				{ id: currentUser.id, name: currentUser.name || 'You', image: currentUser.image || null },
				...heads
			]);
		}

		return heads.filter((head) => head.id !== currentUser.id);
	}

	async function toggleReviewLike(reviewId: string) {
		try {
			const response = await fetch(`/api/reviews/${reviewId}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				reviews = reviews.map((r) =>
					r.id === reviewId
						? {
								...r,
								isLiked: data.liked,
								likeCount: data.likeCount,
								likeHeads: toggleCurrentUserHead(r.likeHeads || [], data.liked)
							}
						: r
				);
			}
		} catch (error) {
			console.error('Failed to toggle review like:', error);
		}
	}

	async function toggleCommentLike(reviewId: string, commentId: string) {
		try {
			const response = await fetch(`/api/feed/${commentId}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				reviews = reviews.map((review) => {
					if (review.id !== reviewId) return review;
					return {
						...review,
						comments: (review.comments || []).map((comment) =>
							comment.id === commentId
								? {
										...comment,
										isLiked: data.liked,
										likeCount: data.likeCount,
										likeHeads: toggleCurrentUserHead(comment.likeHeads || [], data.liked)
								  }
								: comment
						)
					};
				});
			}
		} catch (error) {
			console.error('Failed to toggle comment like:', error);
		}
	}

	async function submitReply(reviewId: string) {
		const reply = replyText[reviewId]?.trim();
		if (!reply) return;

		try {
			const response = await fetch(`/api/reviews/${reviewId}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: reply })
			});

			if (response.ok) {
				const data = await response.json();

				reviews = reviews.map((r) =>
					r.id === reviewId
						? {
								...r,
								comments: [{ ...data.comment, likeHeads: [] }, ...(r.comments || [])],
								replyHeads: uniqueHeads([
										data.comment?.user,
										...((r.comments || []).map((comment) => comment.user) as any[])
								]),
								replyCount: (r.replyCount || (r.comments || []).length) + 1
							}
						: r
				);
				replyText[reviewId] = '';
				toasts.add('Comment posted', 'success');
			} else {
				const data = await response.json();
				toasts.add(data.error || 'Failed to post comment', 'error');
			}
		} catch (error) {
			console.error('Failed to submit reply:', error);
			toasts.add('Failed to post comment', 'error');
		}
	}

	async function copyPermalink(id: string, type: 'post' | 'review') {
		const url = `${window.location.origin}/${type}/${id}`;
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
		return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatDuration(ms: number) {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function formatRating(rating: number) {
		return `${rating.toFixed(1)} / 10`;
	}

	function getRatingColor(rating: number) {
		if (rating >= 8) return 'text-green-500';
		if (rating >= 5) return 'text-yellow-500';
		return 'text-red-500';
	}

	function renderStars(rating: number) {
		const fullStars = Math.floor(rating / 2);
		const halfStar = rating % 2 >= 1;
		const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

		return [
			...Array(fullStars).fill('★'),
			...(halfStar ? ['⯪'] : []),
			...Array(emptyStars).fill('☆')
		];
	}

	function formatTimeAgo(timestamp: number) {
		const now = Date.now();
		const diff = now - timestamp;

		if (diff < 60 * 1000) return 'just now';
		if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} minutes ago`;
		if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} hours ago`;
		return `${Math.floor(diff / (24 * 60 * 60 * 1000))} days ago`;
	}
</script>

{#if loading}
	<div class="flex items-center justify-center py-12">
		<p class="lowercase opacity-50">loading album</p>
	</div>
{:else if album}
	<div class="album-container mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
		<div class="mb-8 flex flex-col gap-6 md:flex-row">
			<div class="flex-shrink-0">
				<div class="w-full md:w-64">
					{#if album.coverArtUrl}
						<img
							src={album.coverArtUrl}
							alt={album.title}
							class="w-full rounded-lg object-cover shadow-lg"
						/>
					{:else}
						<div
							class="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--bg-secondary)] font-medium text-[var(--text-primary)] lowercase shadow-lg"
						>
							no cover art
						</div>
					{/if}
				</div>

				{#if canvasUrls.length > 0}
					<div class="relative mt-4 w-full overflow-hidden rounded-lg bg-black shadow-lg">
						<video
							src={canvasUrls[currentCanvasIndex]}
							autoplay
							muted
							loop
							class="aspect-square w-full object-cover"
						></video>
						{#if canvasUrls.length > 1}
							<div class="absolute inset-0 flex items-center justify-between p-2">
								<button
									onclick={prevCanvas}
									class="rounded bg-black/50 p-2 text-white transition hover:bg-black/75"
									title="Previous canvas"
									aria-label="Previous canvas"
								>
									←
								</button>
								<button
									onclick={nextCanvas}
									class="rounded bg-black/50 p-2 text-white transition hover:bg-black/75"
									title="Next canvas"
									aria-label="Next canvas"
								>
									→
								</button>
							</div>
							<div class="absolute right-0 bottom-2 left-0 flex justify-center gap-1">
								{#each canvasUrls as _, i}
									<button
										class={`h-2 w-2 rounded-full transition ${
											i === currentCanvasIndex ? 'bg-white' : 'bg-white/50'
										}`}
										onclick={() => (currentCanvasIndex = i)}
										aria-label={`Canvas ${i + 1}`}
									></button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="flex flex-1 flex-col gap-4">
				<div>
					<h1 class="mb-2 text-3xl font-bold text-[var(--text-primary)]">{album.title}</h1>
					<p class="text-xl text-[var(--text-secondary)]">
						{#if album.artistUrl}
							<a href={album.artistUrl} class="underline">{album.artist}</a>
						{:else}
							{album.artist}
						{/if}
					</p>
					<p class="mt-1 text-sm text-[var(--text-secondary)]">{album.releaseDate}</p>
				</div>

				{#if album.genres && album.genres.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each album.genres.slice(0, 5) as genre}
							<span
								class="rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-sm font-medium text-[var(--text-primary)] lowercase"
								>{genre}</span
							>
						{/each}
					</div>
				{/if}

				<div
					class="grid grid-cols-3 gap-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] p-4"
				>
					<div>
						<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">rating</p>
						<p class="text-2xl font-bold text-[var(--text-primary)]">
							{stats.avgRating.toFixed(1)}
						</p>
					</div>
					<div>
						<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">reviews</p>
						<p class="text-2xl font-bold text-secondary-500">{stats.reviewCount}</p>
					</div>
					<div>
						<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">tracks</p>
						<p class="text-2xl font-bold text-tertiary-500">{album.totalTracks}</p>
					</div>
				</div>

				{#if discogsFeedback}
					<div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] p-4">
						<div class="mb-3 flex items-center justify-between">
							<p class="font-semibold text-[var(--text-primary)] lowercase">discogs feedback</p>
							{#if discogsFeedback.url}
								<a
									href={discogsFeedback.url}
									target="_blank"
									rel="noreferrer"
									class="text-xs text-secondary-500 lowercase transition hover:text-secondary-400"
								>
									view on discogs →
								</a>
							{/if}
						</div>
						<div class="grid grid-cols-3 gap-4">
							<div>
								<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">rating</p>
								<p class="text-lg font-semibold text-[var(--text-primary)]">
									{discogsFeedback.ratingAverage !== null
										? `${discogsFeedback.ratingAverage.toFixed(1)}`
										: 'n/a'}
									<span
										style="color: color-mix(in srgb, var(--text-secondary) 50%, black); font-size: 0.8rem;"
										>/ 5</span
									>
								</p>
								<p class="text-xs text-[var(--text-secondary)]">
									{discogsFeedback.ratingCount} votes
								</p>
							</div>
							<div>
								<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">have</p>
								<p class="text-lg font-semibold text-[var(--text-primary)]">
									{discogsFeedback.have}
								</p>
							</div>
							<div>
								<p class="mb-1 text-xs text-[var(--text-secondary)] lowercase">want</p>
								<p class="text-lg font-semibold text-[var(--text-primary)]">
									{discogsFeedback.want}
								</p>
							</div>
						</div>
					</div>
				{/if}

				<div class="flex flex-wrap gap-3">
					<a
						href={`/music/${source}/${albumId}/rankings`}
						class="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 font-semibold text-white lowercase transition hover:bg-primary-600"
					>
						<Trophy class="h-4 w-4" /> rankings
					</a>
					<a
						href={`/music/${source}/${albumId}/review`}
						class="inline-flex items-center gap-2 rounded-lg bg-secondary-500 px-4 py-2.5 font-semibold text-white lowercase transition hover:bg-secondary-600"
					>
						<MessageCircle class="h-4 w-4" /> review
					</a>
					{#if album.spotifyUri}
						<a
							href={`https://open.spotify.com/album/${album.spotifyUri.split(':').pop()}`}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2.5 font-semibold text-white lowercase transition hover:bg-green-600"
						>
							<Star class="h-4 w-4" /> listen
						</a>
					{/if}
					{#if album.discogsUrl}
						<a
							href={album.discogsUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2.5 font-semibold text-white lowercase transition hover:bg-gray-600"
						>
							<Share2 class="h-4 w-4" /> discogs
						</a>
					{/if}
				</div>
			</div>
		</div>

		<div class="mb-8">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-2xl font-bold">tracks</h2>
				{#if isAdmin}
					<a
						href={`/music/${source}/${albumId}/edit`}
						class="rounded bg-primary-600 px-4 py-2 font-semibold text-white lowercase transition hover:bg-primary-700"
					>
						edit album
					</a>
				{/if}
			</div>
			<div
				class="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)]"
			>
				{#each computeDiscs(album.tracks || []) as disc}
					<div class="p-4">
						<h3 class="mb-3 text-lg font-semibold">{disc.label}</h3>
						{#each disc.tracks as track}
							<div
								class="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-[var(--bg-secondary)]"
								onclick={() => toggleTrackExpanded(track.id)}
							>
								<div class="flex items-center gap-3">
									<p class="text-sm text-[var(--text-secondary)]">
										{track.position ?? track.trackNumber}.
									</p>
									<p class="text-sm text-[var(--text-primary)]">{track.title}</p>
								</div>
								<div class="flex items-center gap-2">
									{#if calculateTrackAverageRating(track.id) > 0}
										<span class="text-yellow-500">
											★ {calculateTrackAverageRating(track.id).toFixed(1)}
										</span>
									{/if}
									<button
										type="button"
										class="rounded px-2 py-1 text-xs text-primary-500 transition hover:bg-[var(--bg-secondary)]"
										onclick={(e) => {
											e.stopPropagation();
											cycleTrackType(track.id);
										}}
										title={`type: ${trackTypes[track.id] || 'song'} (click to change)`}
										aria-label={`type: ${trackTypes[track.id] || 'song'} (click to change)`}
									>
										{trackTypes[track.id] || 'song'}
									</button>
								</div>
							</div>

							{#if expandedTracks.has(track.id)}
								<div class="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/5 p-3">
									{#if track.spotifyId}
										<div class="flex items-center gap-2">
											<a
												href={`https://open.spotify.com/search/${encodeURIComponent(`${album.artist} ${track.title}`)}`}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border-color)] text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
												title="Search on Spotify"
												aria-label="Search on Spotify"
											>
												
												<svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
													<path
														fill="currentColor"
														d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.6 14.2c-.2.3-.6.4-.9.3-2.6-.8-4.7-1-8-1.6-.4-.1-.8-.5-.7-.9.1-.4.5-.8.9-.7 3.1.6 5.1.9 7.9 1.7.4.1.6.5.8.9.1.3 0 .6-.0.8zM17 11.4c-.3.4-.8.5-1.2.4-2.9-.9-4.9-1.1-7.4-1.8-.4-.1-.7-.5-.6-.9s.5-.7.9-.6c2.3.7 4.1.9 6.9 1.7.5.1.8.5 1.2.8.2.1.3.4.2.4zM15.6 9c-2.3-.8-4.9-1.6-7.3-2.4-.4-.1-.6-.5-.5-.9.1-.4.5-.6.9-.5 2.5.8 5.1 1.5 7.6 2.3.4.1.6.5.5.9-.1.4-.4.6-.8.6z"
													/>
												</svg>
											</a>
											<button
												type="button"
												onclick={() => searchLyricsForTrack(track)}
												class="inline-flex h-8 items-center gap-2 rounded border px-2 text-xs lowercase transition hover:bg-[var(--bg-secondary)]"
												title="Search lyrics"
												aria-label="Search lyrics"
											>
												<Search class="h-4 w-4" />
												<span class="sr-only">search lyrics</span>
											</button>
										</div>
									{/if}

									{#if lyricsByTrack[track.id]}
										{#if lyricsByTrack[track.id].loading}
											<p class="mt-2 text-xs text-[var(--text-secondary)]">searching lyrics…</p>
										{:else if lyricsByTrack[track.id].results && lyricsByTrack[track.id].results!.length > 0}
											<div class="mt-2 space-y-2">
												{#each lyricsByTrack[track.id].results!.slice(0, 3) as l}
													<div
														class="rounded border border-[var(--border-color)]/50 bg-[var(--bg-secondary)]/20 p-2 text-xs"
													>
														<p class="font-medium text-[var(--text-primary)]">
															{l.title} — {l.artist}
														</p>
														{#if l.excerpt}
															<p class="mt-1 text-[var(--text-secondary)]">{l.excerpt}</p>
														{/if}
														{#if l.url}
															<a
																href={l.url}
																target="_blank"
																rel="noopener noreferrer"
																class="text-xs text-primary-500 hover:underline">view →</a
															>
														{/if}
													</div>
												{/each}
											</div>
										{:else}
											<p class="mt-2 text-xs text-[var(--text-secondary)]">no lyrics found</p>
										{/if}
									{/if}

									{#if getTrackReviewCount(track.id) > 0}
										<div class="mt-3 space-y-2">
											<p class="text-xs font-semibold text-[var(--text-secondary)] uppercase">
												track reviews ({getTrackReviewCount(track.id)})
											</p>
											{#each showAllTrackReviews.has(track.id) ? getTrackReviewsForTrack(track.id) : getTrackReviewsForTrack(track.id).slice(0, 3) as tr (tr.id)}
												<div
													class="rounded border border-[var(--border-color)]/50 bg-[var(--bg-secondary)]/20 p-2 text-xs"
												>
													<div class="flex items-center justify-between">
														<p class="font-medium text-[var(--text-primary)]">
															{tr.track?.title || 'Unknown Track'}
														</p>
														<span class="text-yellow-500">★ {tr.rating}/10</span>
													</div>
													<p class="mt-1 text-[var(--text-secondary)]">
														{tr.reviewText || 'No review text'}
													</p>
													{#if tr.reviewer?.name}
														<a
															href={`/user/${tr.reviewer.id}`}
															class="mt-1 inline-block text-[var(--text-secondary)] hover:underline"
														>
															by {tr.reviewer.name}
														</a>
													{/if}
												</div>
											{/each}

											{#if getTrackReviewCount(track.id) > 3}
												<button
													type="button"
													onclick={() => toggleAllTrackReviews(track.id)}
													class="text-xs text-primary-500 lowercase transition hover:text-primary-600 hover:underline"
												>
													{showAllTrackReviews.has(track.id) ? 'show less' : 'show all'}
												</button>
											{/if}
										</div>
									{:else}
										<p class="mt-3 text-xs text-[var(--text-secondary)] lowercase">
											no track reviews yet
										</p>
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<div class="mx-auto mb-8 box-border w-full max-w-6xl card p-6 px-4 sm:px-6 lg:px-8">
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-2xl font-bold">reviews ({stats.reviewCount})</h2>
				{#if data.user}
					<button
						onclick={() => (showReviewForm = !showReviewForm)}
						class="rounded bg-primary-600 px-4 py-2 font-semibold text-white lowercase transition hover:bg-primary-700"
					>
						{userReview ? 'edit review' : 'write review'}
					</button>
				{:else}
					<span class="text-xs text-[var(--text-secondary)] lowercase">sign in to review</span>
				{/if}
			</div>

			{#if showReviewForm && data.user}
				<div class="review-form mb-6 p-6">
					<h3 class="mb-4 text-lg font-semibold">your review</h3>
					<a
						href={`/music/${source}/${albumId}/review${userReview ? `?id=${userReview.id}` : ''}`}
						class="block w-full rounded bg-[var(--bg-secondary)] px-6 py-3 text-center font-semibold text-white lowercase transition hover:bg-[var(--bg-secondary)]"
					>
						{userReview ? 'edit your review' : 'create new review'}
					</a>
				</div>
			{/if}

			<div class="space-y-4">
				{#if reviews.length > 0}
					{#each reviews as review (review.id)}
						<div class="review-item p-4">
							<div class="mb-3 flex gap-3">
								<a
									href={`/user/${review.userId}`}
									class="avatar flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold transition hover:opacity-75"
								>
									{#if review.user.image}
										<img
											src={review.user.image}
											alt={review.user.name}
											class="h-full w-full rounded-full object-cover"
										/>
									{:else}
										<span>{review.user.name[0].toUpperCase()}</span>
									{/if}
								</a>
								<div class="flex-1">
									<div class="flex items-center justify-between">
										<a href={`/user/${review.userId}`} class="font-semibold hover:underline">
											{review.user.name}
										</a>
										<a
											href={`/review/${review.id}`}
											class="text-xs text-primary-500 lowercase hover:underline"
											>{formatTimeAgo(review.createdAt)}</a
										>
									</div>
									<div class="text-sm text-yellow-500">
										{renderStars(review.rating).join(' ')} <span class="ml-1 text-[var(--text-secondary)]">{formatRating(review.rating)}</span>
									</div>
								</div>
							</div>

							{#if review.reviewText}
								<div class="mb-3">
									<p class="text-sm" class:line-clamp-3={!expandedReviewText.has(review.id)}>
										{review.reviewText}
									</p>
									{#if review.reviewText.split('\n').length > 3 || review.reviewText.length > 300}
										<button
											type="button"
											onclick={() => toggleReviewText(review.id)}
											class="mt-1 text-xs text-primary-500 lowercase transition hover:text-primary-600"
										>
											{expandedReviewText.has(review.id) ? 'show less' : 'show more'}
										</button>
									{/if}
								</div>
							{/if}
							{#if review.trackReviews && review.trackReviews.length > 0}
								<div class="mt-4 space-y-2 border-t border-[var(--border-color)] pt-3">
									<p class="text-xs font-semibold text-[var(--text-secondary)] lowercase">
										{review.trackReviews.length} track {review.trackReviews.length === 1
											? 'review'
											: 'reviews'}
									</p>
									{#each expandedTrackReviews.has(review.id) ? review.trackReviews : review.trackReviews.slice(0, 3) as trackReview (trackReview.id)}
										<div
											class="rounded border border-[var(--border-color)]/50 bg-[var(--bg-secondary)]/30 p-2 text-xs"
										>
											<div class="mb-1 flex items-center justify-between">
												<p class="font-medium text-[var(--text-primary)]">
													{trackReview.track?.title || 'Unknown Track'}
												</p>
												<span class="text-yellow-500">★ {trackReview.rating}/10</span>
											</div>
											{#if trackReview.reviewText}
												<p class="line-clamp-2 text-[var(--text-secondary)]">
													{trackReview.reviewText}
												</p>
											{/if}
										</div>
									{/each}
									{#if review.trackReviews.length > 3}
										<button
											type="button"
											onclick={() => toggleTrackReviews(review.id)}
											class="text-xs text-primary-500 lowercase transition hover:text-primary-600 hover:underline"
										>
											{expandedTrackReviews.has(review.id)
												? 'show less'
												: `+${review.trackReviews.length - 3} more track reviews`}
										</button>
									{/if}
								</div>
							{/if}

							<div class="flex items-center gap-4">
								<button
									type="button"
									onclick={() => toggleReviewLike(review.id)}
									class="like-button flex items-center gap-1 text-xs font-medium lowercase transition"
									class:liked={review.isLiked}
								>
									<Heart class="h-3 w-3" fill={review.isLiked ? 'currentColor' : 'none'} />
									<StackedHeads users={review.likeHeads || []} size={14} />
									<span>{review.likeCount} {review.likeCount !== 1 ? 'likes' : 'like'}</span>
								</button>
								<button
									type="button"
									onclick={() => toggleReplyForm(review.id)}
									class="flex items-center gap-1 text-xs font-medium lowercase transition hover:text-primary-600"
								>
									<MessageCircle class="h-3 w-3" />
									<StackedHeads users={review.replyHeads || []} size={14} />
									<span
										>{review.replyCount || (review.comments && review.comments.length) || 0}
										{(review.replyCount || (review.comments && review.comments.length) || 0) === 1
											? 'reply'
											: 'replies'}</span
									>
								</button>
								<button
									type="button"
									onclick={() => copyPermalink(review.id, 'review')}
									class="flex items-center gap-1 text-xs font-medium lowercase transition hover:text-green-600"
									title="copy link"
								>
									<Share2 class="h-3 w-3" />
									<span>share</span>
								</button>
							</div>

							{#if expandedReviews.has(review.id)}
								<div class="mt-3 space-y-2">
									{#if data.user}
										<div
											class="rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-3"
										>
											<div class="flex gap-2">
												<textarea
													bind:value={replyText[review.id]}
													placeholder="write a reply..."
													class="flex-1 resize-none rounded border border-[var(--border-color)] bg-[var(--bg-base)] p-2 text-sm"
													style="min-height: 40px;"
												></textarea>
												<button
													onclick={() => submitReply(review.id)}
													disabled={!replyText[review.id]?.trim()}
													class="rounded bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium whitespace-nowrap text-white hover:bg-[var(--bg-secondary)] disabled:opacity-50"
												>
													reply
												</button>
											</div>
										</div>
									{:else}
										<p class="text-xs opacity-60">
											<a href="/auth/login" class="text-[var(--text-primary)] hover:underline"
												>sign in</a
											> to reply
										</p>
									{/if}

									{#if review.comments && review.comments.length > 0}
										<div class="space-y-3 pt-2">
											{#each review.comments as comment}
												<div class="flex gap-2">
													<a href={`/user/${comment.user.id}`} class="flex-shrink-0">
														{#if comment.user.image}
															<img
																src={comment.user.image}
																alt={comment.user.name}
																class="h-6 w-6 rounded-full object-cover"
															/>
														{:else}
															<div
																class="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-xs font-medium"
															>
																{comment.user.name.toUpperCase()}
															</div>
														{/if}
													</a>
													<div class="min-w-0 flex-1">
														<div class="flex items-center gap-2">
															<a
																href={`/user/${comment.user.id}`}
																class="text-xs font-medium lowercase hover:underline"
															>
																{comment.user.name}
															</a>
															{#if comment.user.isPro}
																<span
																	class="ml-1 rounded-sm bg-yellow-100/40 px-1 text-[10px] font-semibold text-yellow-600 uppercase"
																	>{comment.user.customTag || 'PRO'}</span
																>
															{/if}
															<span class="text-xs opacity-50">
																{formatTimeAgo(comment.createdAt)}
															</span>
														</div>
														<p class="mt-0.5 text-sm break-words">{comment.content}</p>
														<div class="mt-1 flex items-center gap-2">
															<button
																type="button"
																onclick={() => toggleCommentLike(review.id, comment.id)}
																class="like-button flex items-center gap-1 text-xs lowercase transition"
																class:liked={comment.isLiked}
															>
																<Heart
																	class="h-3 w-3"
																	fill={comment.isLiked ? 'currentColor' : 'none'}
																/>
																<StackedHeads users={comment.likeHeads || []} size={12} />
																<span>{comment.likeCount || 0}</span>
															</button>
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				{:else}
					<p class="py-8 text-center text-primary-600 lowercase dark:text-primary-400">
						no reviews yet. be the first to review
					</p>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<div class="py-12 text-center">
		<p class="lowercase opacity-50">album not found</p>
	</div>
{/if}

<style>
	.card {
		background: var(--bg-base, var(--bg-card));
		border: 1px solid var(--border-color);
		border-radius: 0.75rem;
		color: var(--text-primary);
	}

	:global(.dark) .card {
		background-color: var(--bg-base);
		border-color: var(--border-color);
	}

	.card:hover {
		border-color: rgb(var(--color-primary-500));
	}

	:global(.dark) .card:hover {
		background-color: var(--bg-secondary);
		border-color: rgb(var(--color-primary-500));
	}

	.review-item {
		background: var(--bg-base, var(--bg-card));
		border: 1px solid var(--border-color);
		border-radius: 0.75rem;
		color: var(--text-primary);
		transition: box-shadow 150ms ease;
	}

	.review-item:hover {
		background-color: var(--bg-secondary);
	}

	:global(.dark) .review-item:hover {
		background-color: var(--bg-secondary);
	}

	.review-form {
		background: var(--bg-base, var(--bg-card));
		border: 2px solid rgb(var(--color-primary-500)) !important;
		border-radius: 0.75rem;
		color: var(--text-primary);
	}

	.like-button {
		color: var(--text-secondary);
	}

	.like-button:hover {
		color: var(--text-primary);
	}

	.like-button.liked {
		color: var(--theme-accent);
	}

	.avatar {
		background: rgb(var(--color-primary-500));
		color: white;
		font-weight: 600;
	}
</style>
