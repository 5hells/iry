<script lang="ts">
	import { onMount } from 'svelte';
	import { Heart, ImagePlus, Search, X, Trash2, Star, MessageCircle } from '@lucide/svelte';
	import MentionAutocomplete from '$lib/components/MentionAutocomplete.svelte';
	import StackedHeads from '$lib/components/StackedHeads.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { toasts, modals } from '$lib/stores/notifications';

	interface Album {
		id: string;
		title: string;
		artist: string;
		coverArtUrl: string | null;
		source?: string;
		routeId?: string;
	}

	interface TopAlbum {
		album: Album;
		reviewCount: number;
		avgRating: number;
		recentReview: {
			userId: string;
			userName: string;
			userImage: string | null;
			rating: number;
			createdAt: number;
		};
	}

	interface User {
		userId: string;
		userName: string;
		userImage: string | null;
		points: number;
		level: number;
		reviewCount: number;
	}

	interface RecentPost {
		id: string;
		userId: string;
		user: {
			id: string;
			name: string;
			image: string | null;
		};
		content: string;
		imageUrls: string[];
		likeCount: number;
		replyCount: number;
		likeHeads?: {
			id: string;
			name: string;
			image: string | null;
		}[];
		replyHeads?: {
			id: string;
			name: string;
			image: string | null;
		}[];
		isLiked: boolean;
		album: Album | null;
		review: any;
		createdAt: number;
		replies?: {
			id: string;
			userId: string;
			userName?: string;
			content: string;
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
			};
		}[];
	}

	type UserHead = {
		id: string;
		name: string;
		image: string | null;
	};

	interface SearchResult {
		source: string;
		id: string;
		title: string;
		artist: string;
		releaseDate: string;
		coverArt: string;
		totalTracks?: number;
		genres?: string[];
		externalUrl?: string;
	}

	let topAlbums = $state<TopAlbum[]>([]);
	let topUsers = $state<User[]>([]);
	let recentPosts = $state<RecentPost[]>([]);
	let searchResults = $state<SearchResult[]>([]);
	let loading = $state(true);
	let newPostContent = $state('');
	let newPostImages = $state<string[]>([]);
	let uploading = $state(false);
	let searchQuery = $state('');
	let searchLoading = $state(false);
	let showSearchResults = $state(false);
	let likedPostIds = $state<Set<string>>(new Set());
	let postTextarea: HTMLTextAreaElement | null = $state(null);
	let feedOffset = $state(0);
	const feedLimit = 20;
	let feedHasMore = $state(true);
	let feedLoadingMore = $state(false);
	let feedSentinel: HTMLDivElement | null = $state(null);
	let feedObserver: IntersectionObserver | null = null;
	let expandedPosts = $state<Set<string>>(new Set());
	let expandedReplies = $state<Set<string>>(new Set());
	let replyText = $state<{ [key: string]: string }>({});

	let {
		data
	}: {
		data: {
			user:
				| {
						id: string;
						isGuest?: boolean;
						name: string;
						image: string | null;
						role?: 'contributor' | 'moderator' | 'admin';
				  }
				| null;
		} | null;
	} = $props();

	function canModerate() {
		const role = data?.user?.role;
		return role === 'admin' || role === 'moderator';
	}

	onMount(() => {
		(async () => {
			if (data?.user?.isGuest) {
				modals.open({
					title: 'the global album club',
					message:
						'iry is a community of music lovers sharing their thoughts and reviews on albums.',
					confirmText: 'sign up',
					cancelText: '...not now',
					onConfirm: () => {
						window.location.href = '/auth/login';
					}
				});
			}

			data!.user = await fetch('/api/user/profile')
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => data?.user || null)
				.catch(() => null);

			try {
				const response = await fetch('/api/home');
				if (response.ok) {
					const data = await response.json();
					topAlbums = data.topAlbums;
					topUsers = data.topUsers;
				}
				await loadFeed(true);
			} catch (error) {
				console.error('Failed to load dashboard:', error);
			} finally {
				loading = false;
			}

			feedObserver = new IntersectionObserver(
				(entries) => {
					const [entry] = entries;
					if (entry?.isIntersecting) {
						loadFeed();
					}
				},
				{ rootMargin: '200px' }
			);

			if (feedSentinel) {
				feedObserver.observe(feedSentinel);
			}
		})();

		return () => {
			feedObserver?.disconnect();
		};
	});

	$effect(() => {
		if (!feedObserver || !feedSentinel) return;
		feedObserver.observe(feedSentinel);
		return () => feedObserver?.unobserve(feedSentinel!);
	});

	async function loadFeed(reset = false) {
		if (feedLoadingMore || (!feedHasMore && !reset)) return;

		feedLoadingMore = true;
		try {
			if (reset) {
				feedOffset = 0;
				feedHasMore = true;
			}

			const response = await fetch(`/api/feed?limit=${feedLimit}&offset=${feedOffset}`);
			if (response.ok) {
				const data = await response.json();
				const newPosts = data.posts || [];
				const combined = reset ? newPosts : [...recentPosts, ...newPosts];

				const seen = new Set<string>();
				recentPosts = combined
					.filter((post: RecentPost) => {
						if (seen.has(post.id)) return false;
						seen.add(post.id);
						return true;
					})
					.map((post: RecentPost) => ({
						...post,
						createdAt:
							typeof post.createdAt === 'number'
								? post.createdAt
								: (post.createdAt as any).getTime(),
						imageUrls: post.imageUrls || [],
						likeHeads: post.likeHeads || [],
						replyHeads: post.replyHeads || [],
						replies: (post.replies || []).map((reply) => ({
							...reply,
							likeHeads: reply.likeHeads || []
						}))
					}));
				feedOffset += newPosts.length;
				if (newPosts.length < feedLimit) {
					feedHasMore = false;
				}
			}
		} catch (error) {
			console.error('Failed to load feed:', error);
		} finally {
			feedLoadingMore = false;
		}
	}

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(timestamp).toLocaleDateString();
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
		if (!data?.user) return heads;
		if (liked) {
			return uniqueHeads([
				{ id: data.user.id, name: data.user.name || 'You', image: data.user.image || null },
				...heads
			]);
		}

		return heads.filter((head) => head.id !== data.user?.id);
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
				const data = await response.json();
				newPostImages = [...newPostImages, ...data.urls].slice(0, 4);
			}
		} catch (error) {
			console.error('Failed to upload images:', error);
		} finally {
			uploading = false;
		}
	}

	async function createPost() {
		if (!newPostContent.trim()) return;

		try {
			const response = await fetch('/api/feed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: newPostContent,
					imageUrls: newPostImages
				})
			});

			if (response.ok) {
				newPostContent = '';
				newPostImages = [];
				await loadFeed(true);
			}
		} catch (error) {
			console.error('Failed to create post:', error);
		}
	}

	async function handleSearch() {
		if (!searchQuery.trim()) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		searchLoading = true;
		showSearchResults = true;

		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=30`);
			if (response.ok) {
				const data = await response.json();
				searchResults = data.results;
			} else {
				searchResults = [];
			}
		} catch (error) {
			console.error('Search failed:', error);
			searchResults = [];
		} finally {
			searchLoading = false;
		}
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearch();
		}
	}

	$effect(() => {
		if (!searchQuery.trim() && !searchLoading) {
			showSearchResults = false;
		}
	});

	async function toggleLike(post: RecentPost) {
		try {
			likedPostIds = new Set(likedPostIds.add(post.id));

			const response = await fetch(`/api/feed/${post.id}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				recentPosts = recentPosts.map((item) =>
					item.id === post.id
						? {
								...item,
								isLiked: data.liked,
								likeCount: data.likeCount,
								likeHeads: toggleCurrentUserHead(item.likeHeads || [], data.liked)
							}
						: item
				);

				setTimeout(() => {
					likedPostIds.delete(post.id);
					likedPostIds = new Set(likedPostIds);
				}, 600);
			} else {
				likedPostIds.delete(post.id);
				likedPostIds = new Set(likedPostIds);
			}
		} catch (error) {
			console.error('Failed to toggle like:', error);
			likedPostIds.delete(post.id);
			likedPostIds = new Set(likedPostIds);
		}
	}

	async function toggleReplyLike(postId: string, replyId: string) {
		try {
			const response = await fetch(`/api/feed/${replyId}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				recentPosts = recentPosts.map((item) => {
					if (item.id !== postId) return item;
					return {
						...item,
						replies: (item.replies || []).map((reply) =>
							reply.id === replyId
								? {
										...reply,
										isLiked: data.liked,
										likeCount: data.likeCount,
										likeHeads: toggleCurrentUserHead(reply.likeHeads || [], data.liked)
								  }
								: reply
						)
					};
				});
			}
		} catch (error) {
			console.error('Failed to toggle reply like:', error);
		}
	}

	async function deletePost(postId: string) {
		console.log('deletePost clicked', postId);
		modals.open({
			title: 'Delete Post',
			message: 'Are you sure you want to delete this post? This action cannot be undone.',
			confirmText: 'Delete',
			cancelText: 'Cancel',
			isDangerous: true,
			onConfirm: async () => {
				console.log('modal confirm for delete', postId);
				try {
					const response = await fetch(`/api/feed/${postId}/delete`, {
						method: 'POST'
					});

					if (response.ok) {
						recentPosts = recentPosts.filter((p) => p.id !== postId);
						toasts.add('Post deleted successfully', 'success');
					} else {
						const data = await response.json();
						toasts.add(data.error || 'Failed to delete post', 'error');
					}
				} catch (error) {
					console.error('Failed to delete post:', error);
					toasts.add('Failed to delete post', 'error');
				}
			}
		});
	}

	function toggleReplyForm(postId: string) {
		if (expandedReplies.has(postId)) {
			expandedReplies.delete(postId);
		} else {
			expandedReplies.add(postId);
		}

		expandedReplies = new Set(expandedReplies);
	}

	async function submitReply(postId: string) {
		const reply = replyText[postId]?.trim();
		if (!reply) return;

		try {
			const response = await fetch(`/api/feed/${postId}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: reply })
			});

			if (response.ok) {
				const data = await response.json();
				replyText[postId] = '';
				expandedReplies.delete(postId);
				expandedReplies = new Set(expandedReplies);
				toasts.add('Reply sent', 'success');

				const post = recentPosts.find((p) => p.id === postId);
				if (post) {
					post.replyCount = (post.replyCount || 0) + 1;

					if (!post.replies) post.replies = [];
					post.replies.unshift({
						...data.reply,
						likeHeads: []
					});
					post.replyHeads = uniqueHeads((post.replies || []).map((item) => item.user));
					recentPosts = [...recentPosts];
				}
			} else {
				toasts.add('Failed to send reply', 'error');
			}
		} catch (error) {
			console.error('Error sending reply:', error);
			toasts.add('Failed to send reply', 'error');
		}
	}

	function toggleExpandPost(postId: string) {
		if (expandedPosts.has(postId)) {
			expandedPosts.delete(postId);
		} else {
			expandedPosts.add(postId);
		}

		expandedPosts = new Set(expandedPosts);
	}

	function isPostExpandable(content: string): boolean {
		const lineCount = content.split('\n').length;
		return lineCount > 3 || content.length > 300;
	}
</script>

<div class="app-layout flex min-h-screen flex-col">
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<p class="lowercase opacity-50">loading</p>
		</div>
	{:else}
		
		<div class="flex w-full flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
			
			<div
				class="flex min-h-0 w-full flex-col gap-4 lg:flex-1 lg:overflow-y-auto"
			>
				
				<div class="flex-shrink-0 card p-4">
					<h3 class="mb-3 text-sm font-semibold lowercase">share update</h3>
					<div class="flex gap-3">
						<div
							class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[var(--bg-secondary)]"
						>
							{#if data?.user?.image}
								<img src={data.user.image} alt={data.user.name} class="h-full w-full object-cover" />
							{:else}
								{data?.user?.name?.[0]?.toUpperCase()}
							{/if}
						</div>
						<div class="flex-1">
							<textarea
								bind:value={newPostContent}
								bind:this={postTextarea}
								placeholder="what's on your mind? (use @ to mention users)"
								class="min-h-10 w-full resize-none overflow-hidden rounded border border-[var(--border-color)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none"
								style="min-height: 60px;"
							></textarea>
							{#if newPostImages.length > 0}
								<div
									class="mt-2 grid grid-cols-2 gap-1 overflow-hidden rounded border border-primary-300 dark:border-primary-700"
								>
									{#each newPostImages as imageUrl, idx}
										<div class="relative h-16 w-full overflow-hidden">
											<img src={imageUrl} alt="" class="h-full w-full object-cover" />
											<button
												onclick={() => (newPostImages = newPostImages.filter((_, i) => i !== idx))}
												class="absolute top-0.5 right-0.5 rounded bg-black/50 p-0.5 text-xs text-white hover:bg-black/70"
											>
												<X size={12} />
											</button>
										</div>
									{/each}
								</div>
							{/if}
							<div class="mt-2 flex items-center justify-between text-xs">
								<label class="cursor-pointer rounded p-1 transition hover:bg-[var(--bg-secondary)]">
									<input
										type="file"
										accept="image/*"
										multiple
										class="hidden"
										onchange={handleImageUpload}
										disabled={uploading || newPostImages.length >= 4}
									/>
									<ImagePlus size={16} />
								</label>
								<span class="text-[var(--text-secondary)]">
									{newPostContent.length}/1000
								</span>
							</div>
							<button
								onclick={createPost}
								class="mt-3 rounded bg-[var(--color-primary-500)] px-4 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-600)] disabled:bg-[var(--color-primary-300)]"
								disabled={!newPostContent.trim() || uploading}
							>
								post
							</button>
						</div>
					</div>
				</div>

				
				<div class="flex flex-1 flex-col gap-4">
					{#each recentPosts as post}
						<div class="flex flex-col gap-3 card p-4">
							<div class="flex items-start gap-3">
								<a
									href={`/user/${post.user.id}`}
									class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[var(--bg-secondary)]"
									title="view profile"
								>
									{#if post.user.image}
										<img
											src={post.user.image}
											alt={post.user.name}
											class="h-full w-full object-cover"
										/>
									{:else}
										{post.user.name?.[0]?.toUpperCase()}
									{/if}
								</a>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<a href={`/user/${post.user.id}`} class="font-semibold hover:underline"
											>{post.user.name}</a
										>
										<span class="text-xs text-[var(--text-secondary)]">
											{formatTimeAgo(post.createdAt)}
										</span>
									</div>
									{#if post.album}
										<a
											href={post.album.routeId
												? `/albums/${post.album.routeId}`
												: `/albums/${post.album.source}/${post.album.id}`}
											class="mt-1 inline-flex items-center gap-2 rounded bg-[var(--bg-secondary)] px-2 py-1 text-xs hover:bg-[var(--bg-base)]"
										>
											<ImagePlus size={12} />
											<span>{post.album.title}</span>
										</a>
									{/if}

									
									{#if post.content}
										<div class="prose mt-2 text-sm text-[var(--text-primary)]">
											{@html renderMarkdown(post.content)}
										</div>
									{/if}

									{#if post.imageUrls && post.imageUrls.length}
										<div class="mt-2 grid grid-cols-2 gap-1 overflow-hidden rounded">
											{#each post.imageUrls as img, i}
												<img src={img} alt="" class="h-32 w-full rounded object-cover" />
											{/each}
										</div>
									{/if}

									
									<div class="mt-2 flex items-center gap-3 text-sm">
										<button
											class="like-btn flex items-center gap-1"
											class:liked={post.isLiked}
											onclick={() => toggleLike(post)}
											disabled={likedPostIds.has(post.id)}
										>
											<Heart size={16} />
											<StackedHeads users={post.likeHeads || []} size={16} />
											<span>{post.likeCount || 0}</span>
										</button>

										<button class="reply-btn flex items-center gap-1" onclick={() => toggleReplyForm(post.id)}>
											<MessageCircle size={16} />
											<StackedHeads users={post.replyHeads || []} size={16} />
											<span>{post.replyCount || 0}</span>
										</button>

										{#if data?.user?.id === post.user.id || canModerate()}
											<button
												class="ml-auto text-red-500 hover:text-red-700"
												onclick={() => deletePost(post.id)}
												aria-label="Delete post"
											>
												<Trash2 size={14} />
											</button>
										{/if}
									</div>

									
									{#if expandedReplies.has(post.id)}
										<div class="mt-3 rounded border border-[var(--border-color)] p-3">
											<textarea
												bind:value={replyText[post.id]}
												placeholder="Write a reply..."
												class="w-full resize-none rounded border border-[var(--border-color)] bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-500)]"
												rows="2"
											></textarea>
											<div class="mt-2 flex gap-2">
												<button 
													class="rounded bg-[var(--color-primary-500)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-600)]"
													onclick={() => submitReply(post.id)}
												>
													reply
												</button>
												<button
													class="rounded border border-[var(--border-color)] px-3 py-1 text-xs font-semibold hover:bg-[var(--bg-secondary)]"
													onclick={() => {
														expandedReplies.delete(post.id);
														expandedReplies = new Set(expandedReplies);
													}}
												>
													cancel
												</button>
											</div>
										</div>
									{/if}

									
									{#if post.replies && post.replies.length > 0}
										<div class="mt-3 space-y-2 border-l-2 border-[var(--border-color)] pl-3">
											{#each post.replies as reply}
												<div class="flex gap-2">
													<a
														href={reply.user?.id ? `/user/${reply.user.id}` : undefined}
														class="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[var(--bg-secondary)]"
														title="view profile"
													>
														{#if reply.user?.image}
															<img src={reply.user.image} alt="" class="h-full w-full object-cover" />
														{:else}
															{reply.user?.name?.[0]?.toUpperCase() || '?'}
														{/if}
													</a>
													<div class="flex-1">
														<div class="text-xs font-semibold">
															{#if reply.user?.id}
																<a href={`/user/${reply.user.id}`} class="hover:underline"
																	>{reply.user?.name || 'Anonymous'}</a
																>
															{:else}
																{reply.user?.name || 'Anonymous'}
															{/if}
														</div>
														<div class="prose mt-1 text-xs text-[var(--text-primary)]">
															{@html renderMarkdown(reply.content)}
														</div>

														<div class="mt-1 flex items-center gap-3">
															<button
																class="reply-like-btn mt-1 flex items-center gap-1 text-xs"
																class:liked={reply.isLiked}
																onclick={() => toggleReplyLike(post.id, reply.id)}
															>
																<Heart size={12} />
																<StackedHeads users={reply.likeHeads || []} size={12} />
																<span>{reply.likeCount || 0}</span>
															</button>

															{#if data?.user?.id === reply.userId || canModerate()}
																<button
																	class="reply-like-btn mt-1 ml-3 text-xs text-red-500 hover:text-red-700"
																	onclick={() => deletePost(reply.id)}
																>
																	<Trash2 size={12} />
																</button>
															{/if}
														</div>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					
					{#if feedHasMore}
						<div bind:this={feedSentinel} class="py-4 text-center text-sm text-[var(--text-secondary)]">
							{#if feedLoadingMore}
								loading more...
							{:else}
								scroll for more
							{/if}
						</div>
					{/if}
				</div>
			</div>

			
			<div class="hidden lg:block lg:w-80 lg:overflow-y-auto">
				<div class="sticky top-4 space-y-4">
					<div class="card p-4">
						<h4 class="mb-3 text-sm font-semibold lowercase">popular albums</h4>
						{#if topAlbums && topAlbums.length}
							<ul class="space-y-3">
								{#each topAlbums as ta}
									<li>
										<a
											href={ta.album.routeId
												? `/albums/${ta.album.routeId}`
												: `/albums/${ta.album.source}/${ta.album.id}`}
											class="flex items-center gap-3 rounded p-1 transition hover:bg-[var(--bg-secondary)]"
										>
											<img
												src={ta.album.coverArtUrl || '/placeholder.png'}
												alt=""
												class="h-12 w-12 rounded object-cover"
											/>
											<div class="flex-1 min-w-0">
												<div class="text-sm font-medium truncate">{ta.album.title}</div>
												<div class="text-xs text-[var(--text-secondary)] truncate">{ta.album.artist}</div>
												<div class="text-xs text-[var(--text-secondary)]">
													{ta.reviewCount} reviews • {Math.round(ta.avgRating * 10) / 10}★
												</div>
											</div>
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-[var(--text-secondary)]">no albums yet</p>
						{/if}
					</div>

					<div class="card p-4">
						<h4 class="mb-3 text-sm font-semibold lowercase">top users</h4>
						{#if topUsers && topUsers.length}
							<ul class="space-y-3">
								{#each topUsers as u}
									<li>
										<a
												href={`/user/${u.userId}`}
												class="flex items-center gap-3 rounded p-1 transition hover:bg-[var(--bg-secondary)]"
											>
											<div
												class="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]"
											>
												{#if u.userImage}
													<img src={u.userImage} alt="" class="h-full w-full object-cover" />
												{:else}
													{u.userName?.[0]?.toUpperCase()}
												{/if}
											</div>
											<div class="flex-1 min-w-0">
												<div class="text-sm font-medium truncate">{u.userName}</div>
												<div class="text-xs text-[var(--text-secondary)]">
													{u.points} pts • {u.reviewCount} reviews
												</div>
											</div>
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-[var(--text-secondary)]">no users yet</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
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

	.like-btn,
	.reply-like-btn {
		color: var(--text-secondary);
	}

	.like-btn:hover,
	.reply-like-btn:hover {
		color: var(--text-primary);
	}

	.like-btn.liked,
	.reply-like-btn.liked {
		color: var(--theme-accent);
	}
</style>
