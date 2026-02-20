<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { Heart, MessageCircle, Edit2, Save, X, Music, Sparkles, Share2 } from '@lucide/svelte';
	import { similarity } from '$lib/utils/levenshtein';
	import { toasts } from '$lib/stores/notifications';
	import { UserMinus } from 'lucide-svelte';
	import BlockButton from '$lib/components/BlockButton.svelte';

	interface UserProfile {
		user: {
			id: string;
			name: string;
			displayName?: string;
			email?: string;
			image: string | null;
			bio?: string;
			pronouns?: string;
			bannerUrl?: string;
			bannerPosition?: string;
			imagePosition?: string;
			lastfmUsername?: string;
		};
		stats: {
			totalPoints: number;
			level: number;
			reviewCount: number;
			trackReviewCount: number;
		};
		follows?: {
			followers: number;
			following: number;
			isFollowing: boolean;
		};
		perks: Array<any>;
		activePerks?: Array<any>;
		recentReviews: any[];
		pinnedReview?: any;
		lastfm?: {
			nowPlaying: any;
			recentTracks: Array<{
				artist: string;
				track: string;
				album?: string;
				albumArtUrl?: string;
				timestamp: number;
			}>;
		};
		theme?: {
			primaryColor: string;
			secondaryColor: string;
			accentColor: string;
			backgroundColor: string;
		} | null;
	}

	let { data }: any = $props();
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isOwnProfile = $state(false);
	let isProfileUserBlocked = $state(false);
	let selectedTab = $state<'reviews' | 'perks'>('reviews');
	let editingBio = $state(false);
	let editingDisplayName = $state(false);
	let bioValue = $state('');
	let displayNameValue = $state('');
	let saving = $state(false);
	let originalTheme: UserProfile['theme'] | null = null;
	let showFollowersModal = $state(false);
	let showFollowingModal = $state(false);
	let followers = $state<any[]>([]);
	let following = $state<any[]>([]);
	let loadingFollows = $state(false);
	let lastLoadedUserId: string | null = null;

	function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
		const normalized = hex.replace('#', '');
		if (normalized.length !== 6) return null;
		const r = Number.parseInt(normalized.slice(0, 2), 16);
		const g = Number.parseInt(normalized.slice(2, 4), 16);
		const b = Number.parseInt(normalized.slice(4, 6), 16);
		if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
		return { r, g, b };
	}

	function mixRgb(
		base: { r: number; g: number; b: number },
		mix: { r: number; g: number; b: number },
		weight: number
	): { r: number; g: number; b: number } {
		return {
			r: Math.round(base.r * (1 - weight) + mix.r * weight),
			g: Math.round(base.g * (1 - weight) + mix.g * weight),
			b: Math.round(base.b * (1 - weight) + mix.b * weight)
		};
	}

	function setColorScale(prefix: string, hex: string) {
		const base = hexToRgb(hex);
		if (!base) return;
		const white = { r: 255, g: 255, b: 255 };
		const black = { r: 0, g: 0, b: 0 };
		const scale: Record<number, { r: number; g: number; b: number }> = {
			50: mixRgb(base, white, 0.92),
			100: mixRgb(base, white, 0.84),
			200: mixRgb(base, white, 0.72),
			300: mixRgb(base, white, 0.58),
			400: mixRgb(base, white, 0.4),
			500: base,
			600: mixRgb(base, black, 0.12),
			700: mixRgb(base, black, 0.24),
			800: mixRgb(base, black, 0.38),
			900: mixRgb(base, black, 0.52),
			950: mixRgb(base, black, 0.68)
		};

		Object.entries(scale).forEach(([key, value]) => {
			document.documentElement.style.setProperty(
				`--color-${prefix}-${key}`,
				`${value.r} ${value.g} ${value.b}`
			);
		});
	}

	function applyTheme(theme: UserProfile['theme']) {
		if (!theme) return;
		document.documentElement.style.setProperty('--theme-primary', theme.primaryColor);
		document.documentElement.style.setProperty('--theme-secondary', theme.secondaryColor);
		document.documentElement.style.setProperty('--theme-accent', theme.accentColor);
		document.documentElement.style.setProperty('--theme-background', theme.backgroundColor);
		setColorScale('primary', theme.primaryColor);
		setColorScale('secondary', theme.secondaryColor);
		setColorScale('tertiary', theme.accentColor);
	}

	function getSupportPerk() {
		if (!profile?.activePerks) return null;
		return profile.activePerks.find((p: any) => p.type === 'support') || null;
	}

	function getSupportTag() {
		const supportPerk = getSupportPerk();
		if (!supportPerk) return null;
		return supportPerk.customConfig?.customTag || 'PRO';
	}

	async function loadProfile() {
		try {
			const query = data.userId ? `?userId=${encodeURIComponent(data.userId)}` : '';
			const response = await fetch(`/api/user/profile${query}`);
			if (response.ok) {
				profile = await response.json();
				isOwnProfile = !!data?.user?.id && profile?.user.id === data.user.id;
				bioValue = profile?.user.bio || '';
				displayNameValue = profile?.user.displayName || '';

				if (!isOwnProfile && profile?.user.id) {
					try {
						const blockListResp = await fetch('/api/user/block');
						if (blockListResp.ok) {
							const blockList = await blockListResp.json();
							isProfileUserBlocked = (blockList.blockedUsers || []).some((u: any) => u.id === profile.user.id);
						}
					} catch (err) {
						console.error('Failed to load blocked users list:', err);
					}
				}

				if (!originalTheme && data?.theme) {
					originalTheme = data.theme;
				}
				if (profile!.theme) {
					applyTheme(profile!.theme);
				}
			} else {
				error = 'Failed to load profile';
			}
		} catch (err) {
			error = 'An error occurred';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function saveBio() {
		if (!profile) return;
		saving = true;
		try {
			const response = await fetch('/api/user/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bio: bioValue })
			});
			if (response.ok) {
				profile.user.bio = bioValue;
				editingBio = false;
			}
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function saveDisplayName() {
		if (!profile) return;
		saving = true;
		try {
			const response = await fetch('/api/user/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayName: displayNameValue })
			});
			if (response.ok) {
				profile.user.displayName = displayNameValue;
				editingDisplayName = false;
			}
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		const userId = data?.userId ?? null;
		if (!userId || userId === lastLoadedUserId) return;

		lastLoadedUserId = userId;
		loading = true;
		error = null;
		profile = null;
		showFollowersModal = false;
		showFollowingModal = false;
		followers = [];
		following = [];
		void loadProfile();
	});

	onDestroy(() => {
		if (originalTheme) {
			applyTheme(originalTheme);
		}
	});

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString('en-US', {
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

	function parsePosition(value?: string): { x: number; y: number; scale: number } {
		if (!value) return { x: 0, y: 0, scale: 1 };
		try {
			const parsed = JSON.parse(value);
			if (
				parsed &&
				typeof parsed.x === 'number' &&
				typeof parsed.y === 'number' &&
				typeof parsed.scale === 'number'
			) {
				return parsed;
			}
		} catch (err) {
			console.warn('Invalid position JSON:', err);
		}
		return { x: 0, y: 0, scale: 1 };
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

	function getReviewLink(review: any) {
		if (review.type === 'artist' || review.artist) {
			const artist = review.artist || review.album?.artistObj;
			if (artist) {
				const id = artist.musicbrainzId || artist.discogsId || artist.spotifyId || artist.id;
				const source =
					artist.source ||
					(artist.musicbrainzId
						? 'musicbrainz'
						: artist.discogsId
							? 'discogs'
							: artist.spotifyId
								? 'spotify'
								: 'db');
				if (id) return `/artist/${source}/${id}`;
			}
		}

		if (review.album) {
			const a = review.album;
			const id = a.musicbrainzId || a.discogsId || a.spotifyId || a.id;
			const source =
				a.source ||
				(a.musicbrainzId ? 'musicbrainz' : a.discogsId ? 'discogs' : a.spotifyId ? 'spotify' : 'db');
			if (id) return `/music/${source}/${id}`;
		}

		const artistName = review.artist?.name || review.album?.artist || '';
		const albumTitle = review.album?.title || '';
		if (artistName && albumTitle) {
			const sim = similarity(artistName, albumTitle);
			if (sim > 0.5 && review.album) {
				const a = review.album;
				const id = a.musicbrainzId || a.discogsId || a.spotifyId || a.id;
				const source =
					a.source ||
					(a.musicbrainzId
						? 'musicbrainz'
						: a.discogsId
							? 'discogs'
							: a.spotifyId
								? 'spotify'
								: 'db');
				if (id) return `/music/${source}/${id}`;
			}
		}

		return '/music';
	}

	async function loadFollowers() {
		if (loadingFollows) return;
		loadingFollows = true;
		try {
			const resp = await fetch(`/api/user/follows?userId=${profile.user.id}&type=followers`);
			if (resp.ok) {
				const data = await resp.json();
				followers = data.followers || [];
			}
		} catch (err) {
			console.error('Failed to load followers:', err);
			toasts.add('failed to load followers', 'error');
		} finally {
			loadingFollows = false;
		}
	}

	async function loadFollowing() {
		if (loadingFollows) return;
		loadingFollows = true;
		try {
			const resp = await fetch(`/api/user/follows?userId=${profile.user.id}&type=following`);
			if (resp.ok) {
				const data = await resp.json();
				following = data.following || [];
			}
		} catch (err) {
			console.error('Failed to load following:', err);
			toasts.add('failed to load following', 'error');
		} finally {
			loadingFollows = false;
		}
	}

	async function toggleFollow() {
		if (!isOwnProfile && profile) {
			try {
				const method = profile.follows?.isFollowing ? 'DELETE' : 'POST';
				const resp = await fetch('/api/user/follow', {
					method,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: profile.user.id })
				});
				if (resp.ok) {
					if (profile.follows) {
						profile.follows.isFollowing = !profile.follows.isFollowing;
						profile.follows.followers += profile.follows.isFollowing ? 1 : -1;
						toasts.add(profile.follows.isFollowing ? 'now following' : 'unfollowed', 'success');
					}
				}
			} catch (err) {
				console.error('Failed to toggle follow:', err);
				toasts.add('failed to update follow', 'error');
			}
		}
	}

	async function navigateToProfile(userId: string) {
		showFollowersModal = false;
		showFollowingModal = false;
		await goto(`/user/${userId}`);
	}
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center">
		<p class="lowercase opacity-50">loading profile</p>
	</div>
{:else if error || !profile}
	<div class="flex min-h-screen items-center justify-center">
		<p class="lowercase opacity-50">{error || 'profile not found'}</p>
	</div>
{:else}
	<div class="mx-auto max-w-6xl">
		
		{#if profile.user.bannerUrl}
			{@const position = parsePosition(profile.user.bannerPosition)}

			<div class="banner-container relative h-48 w-full overflow-hidden rounded-t-lg md:h-64">
				<img
					src={profile.user.bannerUrl}
					alt="Profile banner"
					class="absolute inset-0 h-full w-full object-cover"
				/>
			</div>
		{:else}
			<div
				class="h-48 w-full rounded-t-lg bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-base)] md:h-64"
			></div>
		{/if}

		<div class="flex flex-col gap-6 p-4 lg:flex-row">
			
			<div class="flex-1">
				
				<div class="relative -mt-16 mb-6 card p-6">
					<div class="flex gap-6">
						
						<div class="flex-shrink-0">
							{#if profile.user.image}
								{@const imgPosition = parsePosition(profile.user.imagePosition)}
								<div
									class="relative h-24 w-24 overflow-hidden rounded-lg border-4 border-[var(--bg-base)] bg-[var(--bg-secondary)]"
								>
									<img
										src={profile.user.image}
										alt={profile.user.name}
										class="absolute inset-0 h-full w-full object-cover"
									/>
								</div>
							{:else}
								<div
									class="flex h-24 w-24 items-center justify-center rounded-lg border-4 border-[var(--bg-base)] bg-[var(--bg-secondary)] text-4xl font-bold text-white"
								>
									{profile.user.name[0].toUpperCase()}
								</div>
							{/if}
						</div>

						<!-- Profile Info -->
						<div class="flex-1">
							{#if editingDisplayName && isOwnProfile}
								<div class="mb-1 flex items-center gap-2">
									<input
										type="text"
										bind:value={displayNameValue}
										class="flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-1 text-2xl font-bold"
										placeholder={profile.user.name}
									/>
									<button
										onclick={() => saveDisplayName()}
										disabled={saving}
										class="rounded p-2 transition hover:bg-[var(--bg-secondary)]"
									>
										<Save size={18} />
									</button>
									<button
										onclick={() => {
											editingDisplayName = false;
											displayNameValue = profile?.user.displayName || '';
										}}
										class="rounded p-2 transition hover:bg-[var(--bg-secondary)]"
									>
										<X size={18} />
									</button>
								</div>
							{:else}
								<div class="mb-1 flex items-center gap-2">
									<h1 class="text-2xl font-bold">
										{profile.user.displayName || profile.user.name}
									</h1>
									{#if profile.user.pronouns}
										<span class="text-sm opacity-70">({profile.user.pronouns})</span>
									{/if}
									{#if getSupportPerk()}
										<span
											class="ml-2 rounded-sm bg-yellow-100/40 px-2 text-xs font-semibold text-yellow-600 uppercase"
											>{getSupportTag()}</span
										>
									{/if}
									{#if isOwnProfile}
										<button
											onclick={() => (editingDisplayName = true)}
											class="rounded p-1 transition hover:bg-[var(--bg-secondary)]"
										>
											<Edit2 size={16} />
										</button>
									{/if}
								</div>
							{/if}

							{#if editingBio && isOwnProfile}
								<div class="mb-3 flex flex-col gap-2">
									<textarea
										bind:value={bioValue}
										class="resize-none rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
										rows="3"
										placeholder="Write something about yourself..."
									></textarea>
									<div class="flex gap-2">
										<button
											onclick={() => saveBio()}
											disabled={saving}
											class="rounded bg-[var(--bg-secondary)] px-3 py-1 text-sm transition hover:bg-[var(--border-color)]"
										>
											Save
										</button>
										<button
											onclick={() => {
												editingBio = false;
												bioValue = profile?.user.bio || '';
											}}
											class="rounded px-3 py-1 text-sm transition hover:bg-[var(--bg-secondary)]"
										>
											Cancel
										</button>
									</div>
								</div>
							{:else}
								<div class="mb-3 flex items-start gap-2">
									{#if profile.user.bio}
										<p
											class="prose prose-sm dark:prose-invert text-sm break-words whitespace-pre-wrap opacity-75"
										>
											{@html profile.user.bio}
										</p>
									{:else if isOwnProfile}
										<p class="text-sm italic opacity-50">No bio yet</p>
									{/if}
									{#if isOwnProfile}
										<button
											onclick={() => (editingBio = true)}
											class="flex-shrink-0 rounded p-1 transition hover:bg-[var(--bg-secondary)]"
										>
											<Edit2 size={14} />
										</button>
									{/if}
								</div>
							{/if}

							
							<div class="mb-4 grid grid-cols-6 gap-2">
								<div>
									<p class="text-lg font-bold text-[var(--text-primary)]">
										{profile.stats.totalPoints}
									</p>
									<p class="text-xs lowercase opacity-60">points</p>
								</div>
								<div>
									<p class="text-lg font-bold text-[var(--text-primary)]">
										lv{profile.stats.level}
									</p>
									<p class="text-xs lowercase opacity-60">level</p>
								</div>
								{#if profile.follows}
									<button
										onclick={() => {
											loadFollowers();
											showFollowersModal = true;
										}}
										class="group text-left transition hover:opacity-80"
									>
										<p class="text-lg font-bold text-[var(--text-primary)]">
											{profile.follows.followers}
										</p>
										<p class="text-xs lowercase opacity-60 group-hover:opacity-100">followers</p>
									</button>
									<button
										onclick={() => {
											loadFollowing();
											showFollowingModal = true;
										}}
										class="group text-left transition hover:opacity-80"
									>
										<p class="text-lg font-bold text-[var(--text-primary)]">
											{profile.follows.following}
										</p>
										<p class="text-xs lowercase opacity-60 group-hover:opacity-100">following</p>
									</button>
								{/if}
							</div>

							{#if !isOwnProfile && profile.follows}
								<div class="mb-2 flex items-center gap-2">
									<button
										onclick={toggleFollow}
										aria-label={profile.follows.isFollowing ? 'Unfollow' : 'Follow'}
										title={profile.follows.isFollowing ? 'Unfollow' : 'Follow'}
										class="icon-btn transition {profile.follows.isFollowing ? 'follow-active' : 'follow-inactive'}"
									>
										{#if profile.follows.isFollowing}
											<UserMinus size={16} />
										{:else}
											<Heart size={16} />
										{/if}
									</button>

									<div class="block-btn-wrapper" title={isProfileUserBlocked ? 'Unblock' : 'Block'}>
										<BlockButton
											userId={profile.user.id}
											userName={profile.user.name}
											isBlocked={isProfileUserBlocked}
											onBlockChange={(blocked) => {
												isProfileUserBlocked = blocked;
											}}
											size="md"
											variant="button"
										/>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>

				
				{#if profile.user.lastfmUsername && profile.lastfm}
					<div class="mb-6 card p-6">
						<p class="mb-3 flex items-center gap-2 text-xs tracking-wide uppercase opacity-50">
							<Music size={14} /> Last.fm
						</p>

						
						{#if profile.lastfm.nowPlaying}
							<div
								class="mb-4 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
							>
								<p class="mb-2 text-xs opacity-60">now playing</p>
								<p class="text-sm font-semibold">{profile.lastfm.nowPlaying.track}</p>
								<p class="text-sm opacity-75">{profile.lastfm.nowPlaying.artist}</p>
								{#if profile.lastfm.nowPlaying.album}
									<p class="mt-1 text-xs opacity-60">{profile.lastfm.nowPlaying.album}</p>
								{/if}
							</div>
						{/if}

						
						{#if profile.lastfm.recentTracks && profile.lastfm.recentTracks.length > 0}
							<div>
								<p class="mb-2 text-xs opacity-60">recent tracks</p>
								<div class="lastfm-tracks space-y-2">
									{#each profile.lastfm.recentTracks.slice(0, 10) as track, idx (idx)}
										<div
											class="border-t border-[var(--border-color)] pt-2 text-xs"
											class:mt-0={idx === 0}
										>
											<p class="truncate font-medium">{track.track}</p>
											<p class="truncate opacity-75">{track.artist}</p>
											{#if track.album}
												<p class="truncate text-xs opacity-60">{track.album}</p>
											{/if}
											{#if track.timestamp}
												<p class="mt-1 text-xs opacity-50">
													{new Date(track.timestamp).toLocaleDateString()}
												</p>
											{:else}
												<p class="mt-1 text-xs opacity-50">just now</p>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				
				{#if profile.pinnedReview}
					<a
						href={`/review/${profile.pinnedReview.id}`}
						class="group mb-6 block card p-6 transition hover:bg-[var(--bg-secondary)]"
					>
						<div class="mb-3 flex items-center justify-between">
							<p class="text-xs tracking-wide uppercase opacity-50">pinned review</p>
							<button
								onclick={(e) => {
									e.preventDefault();
									copyPermalink(profile?.pinnedReview.id, 'review');
								}}
								class="rounded p-1 transition hover:bg-[var(--bg-base)]"
								title="copy link"
							>
								<Share2 size={14} />
							</button>
						</div>
						<div class="border-l-4 border-[var(--border-color)] pl-4">
							<h3 class="font-semibold group-hover:underline">
								{profile.pinnedReview.album?.title}
							</h3>
							<p class="mb-2 text-sm opacity-75">{profile.pinnedReview.album?.artist}</p>
							<div class="mb-2 text-sm text-yellow-500">
								{renderStars(profile.pinnedReview.rating)}
							</div>
							<p class="mb-3 text-sm">{profile.pinnedReview.reviewText}</p>
							{#if profile.pinnedReview.trackReviews && profile.pinnedReview.trackReviews.length > 0}
								<div class="mt-3 space-y-2 rounded bg-[var(--bg-base)] p-3 text-xs">
									<p class="font-semibold lowercase">
										{profile.pinnedReview.trackReviews.length} track reviews
									</p>
									{#each profile.pinnedReview.trackReviews.slice(0, 2) as trackReview}
										<div class="border-t border-[var(--border-color)] pt-2">
											<p class="opacity-75">{trackReview.trackName}</p>
											<p class="text-xs opacity-50">{trackReview.reviewText?.slice(0, 60)}</p>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</a>
				{/if}

				
				<div class="card p-6">
					<div class="mb-6 flex gap-4 border-b border-[var(--border-color)] pb-4">
						<button
							onclick={() => (selectedTab = 'reviews')}
							class="border-b-2 pb-2 text-sm font-semibold tracking-wide uppercase transition"
							class:border-[var(--border-color)]={selectedTab === 'reviews'}
							class:text-[var(--text-primary)]={selectedTab === 'reviews'}
							class:border-transparent={selectedTab !== 'reviews'}
							class:opacity-60={selectedTab !== 'reviews'}
						>
							reviews ({profile.stats.reviewCount})
						</button>
						<button
							onclick={() => (selectedTab = 'perks')}
							class="border-b-2 pb-2 text-sm font-semibold tracking-wide uppercase transition"
							class:border-[var(--border-color)]={selectedTab === 'perks'}
							class:text-[var(--text-primary)]={selectedTab === 'perks'}
							class:border-transparent={selectedTab !== 'perks'}
							class:opacity-60={selectedTab !== 'perks'}
						>
							perks ({profile.perks.length})
						</button>
					</div>

					
					{#if selectedTab === 'reviews'}
						<div class="space-y-4">
							{#if profile.recentReviews.length > 0}
								{#each profile.recentReviews as review (review.id)}
									<div class="relative">
										<a
											href={`/review/${review.id}`}
											class="group block rounded border border-[var(--border-color)] p-4 transition hover:bg-[var(--bg-secondary)]"
										>
											<div class="flex gap-3">
												{#if review.album?.coverArtUrl}
													<img
														src={review.album.coverArtUrl}
														alt={review.album.title}
														class="h-16 w-16 flex-shrink-0 rounded object-cover"
													/>
												{:else}
													<div
														class="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-[var(--bg-secondary)] text-xs opacity-50"
													>
														-
													</div>
												{/if}
												<div class="min-w-0 flex-1">
													<div class="flex items-center justify-between">
														<p class="truncate font-semibold group-hover:underline">
															{review.album?.title}
														</p>
													</div>
													<p class="truncate text-sm opacity-60">{review.album?.artist}</p>
													<div class="mt-1 text-xs text-yellow-500">
														{renderStars(review.rating)}
													</div>
													{#if review.reviewText}
														<p class="mt-2 line-clamp-2 text-xs opacity-75">{review.reviewText}</p>
													{/if}
												</div>
											</div>
										</a>
										<button
											onclick={() => copyPermalink(review.id, 'review')}
											class="absolute right-4 bottom-4 rounded p-1.5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
											title="copy link"
										>
											<Share2 size={14} />
										</button>
									</div>
								{/each}
							{:else}
								<p class="py-8 text-center text-sm opacity-50">no reviews yet</p>
							{/if}
						</div>
					{:else}
						
						<div class="grid grid-cols-2 gap-3">
							{#each profile.perks as perk (perk.id)}
								<div
									class="rounded border border-[var(--border-color)] p-3"
									class:ring-2={perk.isActive}
									class:ring-[var(--border-color)]={perk.isActive}
								>
									<div class="mb-2 text-2xl">
										{#if perk.imageUrl}
											<img src={perk.imageUrl} alt={perk.name} class="h-6 w-6" />
										{:else}
											<Sparkles size={20} />
										{/if}
									</div>
									<h4 class="mb-1 text-sm font-semibold">{perk.name}</h4>
									<p class="text-xs opacity-60">{perk.description}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			
			<div class="flex w-full flex-col gap-4 lg:w-80">
				
				<div class="card p-4">
					<h3 class="mb-3 text-sm font-semibold tracking-wide uppercase">level progress</h3>
					<div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-base)]">
						<div class="h-full bg-[var(--bg-secondary)]" style="width: 65%"></div>
					</div>
					<p class="text-xs opacity-60">65% to level {profile.stats.level + 1}</p>
				</div>

				
				<div class="min-h-0 flex-1 overflow-y-auto">
					<h3
						class="sticky top-0 mb-3 bg-[var(--bg-base)] py-2 text-sm font-semibold tracking-wide uppercase"
					>
						latest reviews
					</h3>
					<div class="space-y-3">
						{#each profile.recentReviews.slice(0, 5) as review (review.id)}
							<a
								href={getReviewLink(review)}
								class="card p-3 text-xs transition"
								style="border: none;"
							>
								{#if review.album?.coverArtUrl}
									<img
										src={review.album.coverArtUrl}
										alt={review.album.title}
										class="mb-2 h-20 w-full rounded object-cover"
									/>
								{:else}
									<div
										class="mb-2 flex h-20 w-full items-center justify-center rounded bg-[var(--bg-secondary)] text-xs opacity-50"
									>
										-
									</div>
								{/if}
								<p class="truncate font-semibold">{review.album?.title}</p>
								<p class="truncate opacity-60">{review.album?.artist}</p>
								<div class="mt-1 text-xs text-yellow-500">{renderStars(review.rating)}</div>
								{#if review.reviewText}
									<p class="mt-2 line-clamp-2 opacity-75">{review.reviewText}</p>
								{/if}
							</a>
						{/each}

					</div>
				</div>
			</div>
		</div>
	</div>

	
	{#if showFollowersModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="max-h-96 w-full max-w-md overflow-y-auto card p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-bold">followers</h2>
					<button onclick={() => (showFollowersModal = false)} class="text-xl">✕</button>
				</div>
				{#if loadingFollows}
					<p class="text-center opacity-50">loading...</p>
				{:else if followers.length === 0}
					<p class="text-center opacity-50">no followers yet</p>
				{:else}
					<div class="space-y-2">
						{#each followers as follower (follower.id)}
							<a
								href={`/user/${follower.id}`}
								class="flex items-center gap-3 rounded p-3 transition hover:bg-[var(--bg-secondary)]"
								onclick={(event) => {
									event.preventDefault();
									void navigateToProfile(follower.id);
								}}
							>
								{#if follower.image}
									<img
										src={follower.image}
										alt={follower.name}
										class="h-10 w-10 rounded-full object-cover"
									/>
								{:else}
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-xs font-bold"
									>
										{follower.name[0]?.toUpperCase()}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate font-semibold">{follower.displayName || follower.name}</p>
									{#if follower.bio}
										<p class="truncate text-xs opacity-60">{follower.bio}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	
	{#if showFollowingModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="max-h-96 w-full max-w-md overflow-y-auto card p-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-bold">following</h2>
					<button onclick={() => (showFollowingModal = false)} class="text-xl">✕</button>
				</div>
				{#if loadingFollows}
					<p class="text-center opacity-50">loading...</p>
				{:else if following.length === 0}
					<p class="text-center opacity-50">not following anyone yet</p>
				{:else}
					<div class="space-y-2">
						{#each following as user (user.id)}
							<a
								href={`/user/${user.id}`}
								class="flex items-center gap-3 rounded p-3 transition hover:bg-[var(--bg-secondary)]"
								onclick={(event) => {
									event.preventDefault();
									void navigateToProfile(user.id);
								}}
							>
								{#if user.image}
									<img
										src={user.image}
										alt={user.name}
										class="h-10 w-10 rounded-full object-cover"
									/>
								{:else}
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-xs font-bold"
									>
										{user.name[0]?.toUpperCase()}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate font-semibold">{user.displayName || user.name}</p>
									{#if user.bio}
										<p class="truncate text-xs opacity-60">{user.bio}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	.card {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 0.75rem;
		color: var(--text-primary);
	}

	.card:hover {
		border-color: rgb(var(--color-primary-500));
	}

	::-webkit-scrollbar {
		width: 6px;
	}

	::-webkit-scrollbar-track {
		background: transparent;
	}

	::-webkit-scrollbar-thumb {
		background: rgb(var(--color-primary-400));
		border-radius: 3px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: rgb(var(--color-primary-500));
	}

	/* Icon-only button styles for follow/unblock */
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		padding: 0.25rem;
		border-radius: 9999px;
		border: 1px solid transparent;
		font-weight: 600;
		cursor: pointer;
	}

	.follow-inactive {
		background: rgb(var(--color-primary-500));
		color: white;
	}

	.follow-active {
		background: transparent;
		color: var(--text-primary);
		border: 1px solid var(--border-color);
	}

	.icon-btn:hover {
		transform: translateY(-1px);
	}

	/* Style the BlockButton when wrapped so it appears as an icon */
	.block-btn-wrapper > * {
		/* If the component renders a button as the root, force sizing */
		width: 40px;
		height: 40px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border-radius: 9999px;
	}
</style>
