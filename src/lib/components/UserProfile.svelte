<script lang="ts">
	import { onMount } from 'svelte';

	interface UserProfile {
		user: {
			id: string;
			name: string;
			email?: string;
			image: string | null;
			bio?: string;
			bannerUrl?: string;
			lastfmUsername?: string;
		};
		stats: {
			totalPoints: number;
			level: number;
			reviewCount: number;
			trackReviewCount: number;
		};
		perks: Array<{
			id: string;
			name: string;
			description: string;
			type: string;
			imageUrl: string | null;
			unlockedAt: number;
			isActive: boolean;
		}>;
		activePerks: Array<any>;
		recentReviews: any[];
		pinnedReview?: any;
		lastfm?: {
			nowPlaying: any;
			recentTracks: any[];
		};
	}

	let { userId = null }: { userId?: string | null } = $props();
	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isOwnProfile = $state(true);

	async function loadProfile() {
		try {
			const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
			const response = await fetch(`/api/user/profile${query}`);
			if (response.ok) {
				profile = await response.json();
				isOwnProfile = !userId || profile!.user.id === userId;
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

	onMount(() => {
		loadProfile();
	});

	async function activatePerk(perkId: string) {
		if (!isOwnProfile) return;
		try {
			const response = await fetch('/api/user/perks/activate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ perkId })
			});

			if (response.ok) {
				await loadProfile();
			}
		} catch (err) {
			console.error('Failed to activate perk:', err);
		}
	}

	function getProgressToNextLevel(level: number, points: number): number {
		const thresholds = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500];
		if (level >= thresholds.length) return 100;

		const currentThreshold = thresholds[level - 1];
		const nextThreshold = thresholds[level];
		const progress = ((points - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
		return Math.min(Math.max(progress, 0), 100);
	}

	$effect(() => {
		if (profile?.activePerks) {
			applyActivePerks(profile.activePerks);
		}
	});

	function applyActivePerks(perks: any[]) {
		const gradientPerk = perks.find((p) => p.type === 'gradient' && p.isActive);
		if (gradientPerk && gradientPerk.customConfig) {
			const nameElement = document.querySelector('.user-name');
			if (nameElement) {
				const gradient = `linear-gradient(45deg, ${gradientPerk.customConfig.colors.join(', ')})`;
				(nameElement as HTMLElement).style.background = gradient;
				(nameElement as HTMLElement).style.webkitBackgroundClip = 'text';
				(nameElement as HTMLElement).style.webkitTextFillColor = 'transparent';
			}
		}

		const fontPerk = perks.find((p) => p.type === 'font' && p.isActive);
		if (fontPerk && fontPerk.customConfig?.selectedFont) {
			const profileElement = document.querySelector('.profile-content');
			if (profileElement) {
				(profileElement as HTMLElement).style.fontFamily =
					`'${fontPerk.customConfig.selectedFont}', sans-serif`;
			}
		}
	}
</script>

{#if loading}
	<div class="flex min-h-screen items-center justify-center">
		<div class="text-center">
			<p class="lowercase">loading profile</p>
		</div>
	</div>
{:else if error}
	<div class="alert alert-error mx-auto mt-8 max-w-2xl">
		<p>{error}</p>
	</div>
{:else if profile}
	<div class="profile-content">
		
		{#if profile.user.bannerUrl}
			<div
				class="h-40 w-full overflow-hidden bg-gradient-to-b from-primary-500/20 to-primary-100 dark:to-primary-900"
			>
				<img src={profile.user.bannerUrl} alt="banner" class="h-full w-full object-cover" />
			</div>
		{:else}
			<div
				class="h-40 w-full bg-gradient-to-b from-primary-500/10 to-transparent dark:to-primary-900"
			></div>
		{/if}

		<div class="mx-auto max-w-6xl space-y-8 p-6">
			
			<div class="relative z-10 -mt-12 card p-6">
				<div class="flex items-start gap-4">
					{#if profile.user.image}
						<img
							src={profile.user.image}
							alt={profile.user.name}
							class="h-24 w-24 rounded-lg border-4 border-primary-50 dark:border-primary-900"
						/>
					{:else}
						<div
							class="flex h-24 w-24 items-center justify-center rounded-lg border-4 border-primary-50 bg-gradient-to-br from-primary-500 to-primary-600 text-3xl font-bold text-white dark:border-primary-900"
						>
							{profile.user.name.charAt(0).toUpperCase()}
						</div>
					{/if}
					<div class="flex-1">
						<h1 class="user-name text-3xl font-bold">{profile.user.name}</h1>
						{#if profile.user.bio}
							<p class="mt-2 text-[var(--text-secondary)]">{profile.user.bio}</p>
						{/if}
						{#if profile.user.lastfmUsername}
							<div class="mt-2 flex items-center gap-2 text-sm">
								<span class="inline-block h-2 w-2 rounded-full bg-[var(--bg-secondary)]"></span>
								<a
									href={`https://www.last.fm/user/${profile.user.lastfmUsername}`}
									target="_blank"
									class="text-[var(--text-primary)] lowercase hover:underline"
								>
									last.fm/{profile.user.lastfmUsername}
								</a>
							</div>
						{/if}
					</div>
				</div>
			</div>

			
			{#if profile.lastfm?.nowPlaying}
				<div class="card border-l-4 border-l-green-500 p-6">
					<div class="flex items-center gap-4">
						{#if profile.lastfm.nowPlaying.albumArtUrl}
							<img src={profile.lastfm.nowPlaying.albumArtUrl} alt="Album art" />
						{/if}
						<div class="flex-1">
							<p
								class="mb-1 flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400"
							>
								<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
								<span class="lowercase">listening now</span>
							</p>
							<h3 class="text-lg font-semibold">{profile.lastfm.nowPlaying.track}</h3>
							<p class="text-sm text-primary-600 dark:text-primary-400">
								{profile.lastfm.nowPlaying.artist}
								{#if profile.lastfm.nowPlaying.album}
									• {profile.lastfm.nowPlaying.album}
								{/if}
							</p>
						</div>
					</div>
				</div>
			{/if}

			
			<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
				<div class="card border-t-4 border-t-primary-500 p-6 text-center">
					<div class="text-4xl font-bold text-primary-500">
						{profile.stats.level}
					</div>
					<div class="mt-1 text-sm text-primary-600 lowercase dark:text-primary-400">level</div>
				</div>
				<div class="card border-t-4 border-t-secondary-500 p-6 text-center">
					<div class="text-4xl font-bold text-secondary-500">
						{profile.stats.totalPoints}
					</div>
					<div class="mt-1 text-sm text-primary-600 lowercase dark:text-primary-400">points</div>
				</div>
				<div class="card border-t-4 border-t-tertiary-500 p-6 text-center">
					<div class="text-4xl font-bold text-tertiary-500">
						{profile.stats.reviewCount}
					</div>
					<div class="mt-1 text-sm text-primary-600 lowercase dark:text-primary-400">reviews</div>
				</div>
				<div class="card border-t-4 border-t-success-500 p-6 text-center">
					<div class="text-4xl font-bold text-success-500">
						{profile.stats.trackReviewCount}
					</div>
					<div class="mt-1 text-sm text-primary-600 lowercase dark:text-primary-400">
						track reviews
					</div>
				</div>
			</div>

			
			<div class="card p-6">
				<h2 class="section-title mb-4 lowercase">progress to level {profile.stats.level + 1}</h2>
				<div class="h-4 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
					<div
						class="h-4 rounded-full bg-[var(--bg-secondary)] transition-all duration-300"
						style="width: {getProgressToNextLevel(profile.stats.level, profile.stats.totalPoints)}%"
					></div>
				</div>
				<p class="mt-2 text-sm text-[var(--text-secondary)] lowercase">
					{Math.round(getProgressToNextLevel(profile.stats.level, profile.stats.totalPoints))}%
					complete
				</p>
			</div>

			
			{#if profile.pinnedReview}
				<a
					href={`/review/${profile.pinnedReview.id}`}
					class="block card border-l-4 border-l-primary-500 p-6 transition hover:border-primary-600"
				>
					<h2 class="section-title mb-4 lowercase">pinned review</h2>
					<div class="flex gap-4">
						<div class="flex-1">
							<div class="mb-2 flex items-start justify-between">
								<div>
									<h3 class="font-semibold">{profile.pinnedReview.album?.title}</h3>
									<p class="text-sm text-primary-600 dark:text-primary-400">
										{profile.pinnedReview.album?.artist}
									</p>
								</div>
								<div class="text-right">
									<div class="text-2xl font-bold text-primary-500">
										{profile.pinnedReview.rating.toFixed(1)}
									</div>
								</div>
							</div>
							{#if profile.pinnedReview.reviewText}
								<p class="text-sm">{profile.pinnedReview.reviewText}</p>
							{/if}
						</div>
					</div>
				</a>
			{/if}

			
			{#if profile.lastfm?.recentTracks && profile.lastfm.recentTracks.length > 0}
				<div class="card p-6">
					<h2 class="section-title mb-4 lowercase">recent listening</h2>
					<div class="space-y-3">
						{#each profile.lastfm.recentTracks.slice(0, 10) as track}
							<div
								class="flex items-center gap-3 rounded p-2 transition hover:bg-[var(--bg-secondary)]"
							>
								{#if track.albumArtUrl}{:else}
									<div
										class="flex h-12 w-12 items-center justify-center rounded bg-[var(--bg-secondary)] text-xs font-medium text-[var(--text-secondary)]"
									>
										music
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{track.track}</p>
									<p class="truncate text-sm text-[var(--text-secondary)]">
										{track.artist}
										{#if track.album}
											• {track.album}
										{/if}
									</p>
								</div>
								{#if track.nowPlaying}
									<span class="flex items-center gap-1 text-xs text-green-500">
										<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"
										></span>
										now
									</span>
								{:else if track.timestamp}
									<span class="text-xs text-primary-500">
										{new Date(track.timestamp).toLocaleDateString()}
									</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			
			{#if profile.perks.length > 0}
				<div class="card p-6">
					<h2 class="section-title mb-4 lowercase">perks</h2>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						{#each profile.perks as perk}
							{#if isOwnProfile}
								<button
									onclick={() => activatePerk(perk.id)}
									class="card p-4 text-left transition hover:border-primary-500"
									class:ring-2={perk.isActive}
									class:ring-primary-500={perk.isActive}
								>
									{#if perk.imageUrl}
										<img
											src={perk.imageUrl}
											alt={perk.name}
											class="mb-2 h-24 w-full rounded object-cover"
										/>
									{/if}
									<h3 class="font-semibold">{perk.name}</h3>
									<p class="text-sm text-primary-600 dark:text-primary-400">{perk.description}</p>
									<div class="mt-2 flex items-center gap-2">
										<span class="badge">{perk.type}</span>
										{#if perk.isActive}
											<span class="badge-success badge lowercase">active</span>
										{/if}
									</div>
								</button>
							{:else}
								<div class="card p-4 text-left">
									{#if perk.imageUrl}
										<img
											src={perk.imageUrl}
											alt={perk.name}
											class="mb-2 h-24 w-full rounded object-cover"
										/>
									{/if}
									<h3 class="font-semibold">{perk.name}</h3>
									<p class="text-sm text-primary-600 dark:text-primary-400">{perk.description}</p>
									<div class="mt-2 flex items-center gap-2">
										<span class="badge">{perk.type}</span>
										{#if perk.isActive}
											<span class="badge-success badge lowercase">active</span>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{/if}

			
			{#if profile.recentReviews.length > 0}
				<div class="card p-6">
					<h2 class="section-title mb-4 lowercase">recent reviews</h2>
					<div class="space-y-6">
						{#each profile.recentReviews as review}
							<div class="border-b border-primary-300 pb-6 last:border-0 dark:border-primary-700">
								<a href={`/review/${review.id}`} class="group flex gap-4">
									<div class="min-w-0 flex-1">
										<div class="mb-2 flex items-start justify-between">
											<div>
												<h3 class="font-semibold group-hover:underline">{review.album?.title}</h3>
												<p class="text-sm text-primary-600 dark:text-primary-400">
													{review.album?.artist}
												</p>
											</div>
											<div class="text-right">
												<div class="text-2xl font-bold text-primary-500">
													{review.rating.toFixed(1)}
												</div>
												<div class="text-xs text-primary-500 lowercase">
													+{review.pointsAwarded} pts
												</div>
											</div>
										</div>
										{#if review.reviewText}
											<p class="mt-2 text-sm">
												{review.reviewText.slice(0, 200)}{review.reviewText.length > 200
													? '...'
													: ''}
											</p>
										{/if}
										{#if review.trackReviews?.length > 0}
											<div class="mt-3 border-t border-primary-200 pt-3 dark:border-primary-800">
												<p class="mb-2 text-xs text-primary-500 lowercase">
													{review.trackReviews.length} track review{review.trackReviews.length === 1
														? ''
														: 's'}
												</p>
												<div class="space-y-2">
													{#each review.trackReviews.slice(0, 3) as trackReview}
														<div class="text-xs">
															<p class="font-medium">{trackReview.track?.title}</p>
															<div class="flex items-center gap-2">
																<div class="text-primary-500">{trackReview.rating.toFixed(1)}</div>
																{#if trackReview.reviewText}
																	<p class="text-primary-500">
																		{trackReview.reviewText.slice(0, 100)}
																	</p>
																{/if}
															</div>
														</div>
													{/each}
													{#if review.trackReviews.length > 3}
														<p class="text-xs text-primary-500 lowercase">
															+{review.trackReviews.length - 3} more
														</p>
													{/if}
												</div>
											</div>
										{/if}
									</div>
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.profile-content {
		min-height: 100vh;
		color: var(--text-primary);
	}

	.card {
		background-color: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 0.75rem;
		color: var(--text-primary);
	}

	:global(.dark) .card {
	}

	.card:hover {
		border-color: rgb(var(--color-primary-500));
	}

	:global(.dark) .card:hover {
	}

	.badge {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		background-color: var(--bg-tertiary);
		color: var(--text-secondary);
		border: 1px solid var(--border-color);
		transition: all 150ms ease;
	}

	.badge:hover {
		background-color: var(--bg-secondary);
		color: var(--text-primary);
	}

	.badge-success {
		background: rgb(34, 197, 94);
		color: white;
		border-color: rgb(22, 155, 74);
	}

	.user-name {
		display: inline-block;
		color: rgb(var(--color-primary-500));
	}

	html:not(.dark) .user-name {
		color: rgb(var(--color-primary-600));
	}

	:global(.dark) .user-name {
		color: rgb(var(--color-primary-400));
	}

	.section-title {
		color: var(--text-primary);
		font-weight: 600;
	}
</style>
