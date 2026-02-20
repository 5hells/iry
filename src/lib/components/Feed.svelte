<script lang="ts">
	import { onMount } from 'svelte';
	import { Heart, ImagePlus, X, MessageCircle, Share2 } from '@lucide/svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { toasts } from '$lib/stores/notifications';
	import BlockButton from '$lib/components/BlockButton.svelte';

	interface StatusPost {
		id: string;
		userId: string;
		content: string;
		imageUrls: string[];
		likeCount: number;
		replyCount: number;
		isLiked: boolean;
		createdAt: number;
		parentPostId?: string | null;
		replies?: StatusPost[];
		user: {
			id: string;
			name: string;
			image: string | null;
			nameGradient?: { colors: string[]; angle: number } | null;
		};
		album?: any;
		review?: any;
	}

	let posts = $state<StatusPost[]>([]);
	let loading = $state(true);
	let newPostContent = $state('');
	let newPostImages = $state<string[]>([]);
	let uploading = $state(false);
	let replyingTo = $state<Set<string>>(new Set());
	let replyContent = $state<Record<string, string>>({});
	let replyImages = $state<Record<string, string[]>>({});
	let replyUploading = $state(false);
	let expandedPosts = $state<Set<string>>(new Set());
	let blockedUserIds = $state<Set<string>>(new Set());

	onMount(async () => {
		try {
			const response = await fetch('/api/user/block');
			if (response.ok) {
				const data = await response.json();
				blockedUserIds = new Set(data.blockedUsers?.map((u: any) => u.id) || []);
			}
		} catch (error) {
			console.error('Failed to load blocked users:', error);
		}

		await loadFeed();
	});

	async function loadFeed() {
		try {
			const response = await fetch('/api/feed');
			if (response.ok) {
				const data = await response.json();
				posts = (data.posts || [])
					.filter((p: any) => !blockedUserIds.has(p.userId))
					.map((p: any) => {
						
						const filteredReplies = (p.replies || []).filter(
							(reply: any) => !blockedUserIds.has(reply.userId)
						);
						return {
							...p,
							replies: filteredReplies,
							replyCount: p.replyCount || filteredReplies.length || 0
						};
					});
			}
		} catch (error) {
			console.error('Failed to load feed:', error);
		} finally {
			loading = false;
		}
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
				await loadFeed();
			}
		} catch (error) {
			console.error('Failed to create post:', error);
		}
	}

	async function toggleLike(postId: string) {
		try {
			const response = await fetch(`/api/feed/${postId}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				posts = posts.map((p) =>
					p.id === postId ? { ...p, isLiked: data.liked, likeCount: data.likeCount } : p
				);
			}
		} catch (error) {
			console.error('Failed to toggle like:', error);
		}
	}

	async function handleReplyImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		replyUploading = true;
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
				const postId = Object.keys(replyContent).find((id) => replyingTo.has(id));
				if (postId) {
					replyImages[postId] = [...(replyImages[postId] || []), ...data.urls].slice(0, 4);
				}
			}
		} catch (error) {
			console.error('Failed to upload images:', error);
		} finally {
			replyUploading = false;
		}
	}

	async function submitReply(postId: string) {
		const content = replyContent[postId];
		if (!content || !content.trim()) return;

		try {
			const response = await fetch(`/api/feed/${postId}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: content,
					imageUrls: replyImages[postId] || []
				})
			});

			if (response.ok) {
				const data = await response.json();
				const newReply: StatusPost = {
					id: data.reply.id,
					userId: data.reply.userId,
					content: data.reply.content,
					imageUrls: data.reply.imageUrls || [],
					likeCount: 0,
					replyCount: 0,
					isLiked: false,
					createdAt: data.reply.createdAt,
					parentPostId: postId,
					user: data.reply.user || {
						id: data.reply.userId,
						name: 'you',
						image: null
					}
				};

				posts = posts.map((p) => {
					if (p.id === postId) {
						return {
							...p,
							replies: [...(p.replies || []), newReply],
							replyCount: (p.replyCount || 0) + 1
						};
					}
					return p;
				});

				delete replyContent[postId];
				delete replyImages[postId];
				replyingTo.delete(postId);
				replyingTo = replyingTo; 
			}
		} catch (error) {
			console.error('Failed to create reply:', error);
		}
	}

	function cancelReply(postId: string) {
		delete replyContent[postId];
		delete replyImages[postId];
		replyingTo.delete(postId);
		replyingTo = replyingTo; 
	}

	function toggleReplyForm(postId: string) {
		if (replyingTo.has(postId)) {
			replyingTo.delete(postId);
		} else {
			replyingTo.add(postId);
		}
		replyingTo = replyingTo; 
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

	function getNameStyle(user: {
		nameGradient?: { colors: string[]; angle: number } | null;
	}): string {
		if (!user?.nameGradient?.colors?.length) return '';
		const angle = user.nameGradient.angle ?? 90;
		const colors = user.nameGradient.colors.join(', ');
		return `background: linear-gradient(${angle}deg, ${colors}); -webkit-background-clip: text; background-clip: text; color: transparent;`;
	}

	function toggleExpandPost(postId: string) {
		if (expandedPosts.has(postId)) {
			expandedPosts.delete(postId);
		} else {
			expandedPosts.add(postId);
		}
		expandedPosts = expandedPosts;
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
</script>

<div
	class="feed-container mx-auto max-w-[600px] border-x border-surface-300 bg-white dark:border-surface-700 dark:bg-surface-900"
>
	
	<div
		class="compose-box border-b-2 border-surface-300 bg-surface-50 dark:border-surface-700 dark:bg-surface-800"
	>
		<div class="p-4">
			<div class="flex gap-3">
				<div
					class="avatar flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-primary-600 font-semibold text-white"
				>
					U
				</div>
				<div class="flex-1">
					<textarea
						bind:value={newPostContent}
						placeholder="what's on your mind"
						class="w-full resize-none rounded border border-surface-300 bg-white px-3 py-2 text-sm lowercase outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-surface-700 dark:bg-surface-900"
						rows="3"
						maxlength="500"
					></textarea>

					{#if newPostImages.length > 0}
						<div
							class="grid {newPostImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} mt-3 gap-2"
						>
							{#each newPostImages as imageUrl, idx}
									<div
										class="relative overflow-hidden rounded border border-surface-300 dark:border-surface-700"
										class:col-span-2={idx === 0 && newPostImages.length === 3}
									>
										<img src={imageUrl} alt="upload preview" class="h-full w-full object-cover" />
										<button
											type="button"
											aria-label="Remove uploaded image"
											onclick={() =>
												(newPostImages = newPostImages.filter((url) => url !== imageUrl))}
											class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded bg-black/80 text-white hover:bg-red-600"
										>
											<X size={16} />
										</button>
									</div>
							{/each}
						</div>
					{/if}

					<div
						class="mt-3 flex items-center justify-between border-t border-surface-300 pt-3 dark:border-surface-700"
					>
						<div class="flex items-center gap-2">
							<label
								aria-label="Upload images"
								class="cursor-pointer rounded border border-transparent p-2 hover:bg-surface-200 dark:hover:bg-surface-700"
								class:opacity-50={uploading || newPostImages.length >= 4}
							>
								<input
									type="file"
									accept="image/*"
									multiple
									onchange={handleImageUpload}
									disabled={uploading || newPostImages.length >= 4}
									class="hidden"
								/>
								<ImagePlus size={18} class="text-surface-600 dark:text-surface-400" />
							</label>
							<span class="text-xs text-surface-500">{newPostContent.length}/500</span>
						</div>
						<button
							onclick={createPost}
							disabled={!newPostContent.trim() || newPostContent.length > 500}
							class="rounded border border-primary-700 bg-primary-600 px-5 py-1.5 text-sm font-medium text-white lowercase hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							post
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>

	
	{#if loading}
		<div class="flex justify-center py-12">
			<div class="loading-spinner"></div>
		</div>
	{:else if posts.length === 0}
		<div class="py-12 text-center">
			<p class="text-surface-500 lowercase">no posts yet. be the first to share something</p>
		</div>
	{:else}
		<div class="posts-feed">
			{#each posts as post (post.id)}
				<article
					class="post border-b border-surface-300 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800"
				>
					<div class="p-4">
						<div class="flex gap-3">
							<div
								class="avatar flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-surface-200 dark:bg-surface-700"
							>
								{#if post.user.image}
									<img
										src={post.user.image}
										alt={post.user.name}
										class="h-full w-full rounded object-cover"
									/>
								{:else}
									<span class="text-sm font-semibold">{post.user.name[0].toUpperCase()}</span>
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<h3
											class="cursor-pointer font-semibold hover:underline"
											style={getNameStyle(post.user)}
										>
											{post.user.name}
										</h3>
										<span class="text-xs text-surface-400">·</span>
										<a href={`/post/${post.id}`} class="text-xs text-surface-500 hover:underline"
											>{formatTimeAgo(post.createdAt)}</a
										>
									</div>
									<BlockButton
										userId={post.userId}
										userName={post.user.name}
										isBlocked={blockedUserIds.has(post.userId)}
										onBlockChange={(blocked) => {
											if (blocked) {
												blockedUserIds.add(post.userId);
											} else {
												blockedUserIds.delete(post.userId);
											}
										}}
										size="sm"
										variant="icon"
									/>
								</div>

								<div>
									<p
										class="text-sm break-words whitespace-pre-wrap lowercase"
										class:line-clamp-3={!expandedPosts.has(post.id)}
									>
										{post.content}
									</p>
									{#if post.content.split('\n').length > 3 || post.content.length > 300}
										<button
											type="button"
											onclick={() => toggleExpandPost(post.id)}
											class="mt-1 text-xs text-primary-500 lowercase transition hover:text-primary-600"
										>
											{expandedPosts.has(post.id) ? 'show less' : 'show more'}
										</button>
									{/if}
								</div>
								{#if post.review}
									<a
										href={`/review/${post.review.id}`}
										class="mt-2 block rounded border border-surface-300 p-3 hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800"
									>
										{#if post.album}
											<div class="text-xs text-surface-500 lowercase">
												review of {post.album.title}
											</div>
										{/if}
										<div class="text-sm font-semibold lowercase">
											{post.review.rating.toFixed(1)} rating
										</div>
										{#if post.review.reviewText}
											<p
												class="mt-1 line-clamp-2 text-xs text-surface-600 lowercase dark:text-surface-400"
											>
												{post.review.reviewText}
											</p>
										{/if}
									</a>
								{/if}

								{#if post.imageUrls.length > 0}
									<div
										class="mt-3 overflow-hidden rounded border border-surface-300 dark:border-surface-700"
									>
										<div
											class="grid {post.imageUrls.length === 1
												? 'grid-cols-1'
												: 'grid-cols-2'} gap-0.5"
										>
											{#each post.imageUrls as imageUrl, idx}
												<div
													class="relative"
													class:col-span-2={idx === 0 && post.imageUrls.length === 3}
												>
													<img src={imageUrl} alt="" class="h-full max-h-80 w-full object-cover" />
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<div
									class="mt-3 flex items-center gap-4 border-t border-surface-200 pt-2 dark:border-surface-800"
								>
									<button
										onclick={() => toggleLike(post.id)}
										class="flex items-center gap-1.5 text-xs font-medium lowercase hover:text-red-600"
										class:text-red-600={post.isLiked}
									>
										<Heart size={16} fill={post.isLiked ? 'currentColor' : 'none'} />
										<span>{post.likeCount} {post.likeCount !== 1 ? 'likes' : 'like'}</span>
									</button>
									<button
										onclick={() => toggleReplyForm(post.id)}
										class="flex items-center gap-1.5 text-xs font-medium lowercase hover:text-blue-600"
									>
										<MessageCircle size={16} />
										<span>{post.replyCount} {post.replyCount !== 1 ? 'replies' : 'reply'}</span>
									</button>
									<button
										onclick={() => copyPermalink(post.id, 'post')}
										class="flex items-center gap-1.5 text-xs font-medium lowercase hover:text-green-600"
										title="copy link"
									>
										<Share2 size={16} />
										<span>share</span>
									</button>
								</div>

								
								{#if replyingTo.has(post.id)}
									<div
										class="mt-3 rounded border border-surface-300 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800"
									>
										<textarea
											bind:value={replyContent[post.id]}
											placeholder="write a reply..."
											class="w-full resize-none rounded border border-surface-300 bg-white px-3 py-2 text-sm lowercase outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:border-surface-700 dark:bg-surface-900"
											rows="2"
											maxlength="500"
										></textarea>

										{#if (replyImages[post.id] || []).length > 0}
											<div
												class="grid {(replyImages[post.id] || []).length === 1
													? 'grid-cols-1'
													: 'grid-cols-2'} mt-2 gap-2"
											>
												{#each replyImages[post.id] || [] as imageUrl}
													<div
														class="relative overflow-hidden rounded border border-surface-300 dark:border-surface-700"
													>
														<img
															src={imageUrl}
															alt="upload preview"
															class="h-full w-full object-cover"
														/>
														<button
															type="button"
															aria-label="Remove reply image"
															onclick={() => {
																if (replyImages[post.id]) {
																	replyImages[post.id] = replyImages[post.id].filter(
																		(url) => url !== imageUrl
																	);
																}
															}}
															class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded bg-black/80 text-white hover:bg-red-600"
														>
															<X size={16} />
														</button>
													</div>
												{/each}
											</div>
										{/if}

										<div class="mt-2 flex items-center justify-between">
											<label
												class="cursor-pointer rounded border border-transparent p-2 hover:bg-surface-200 dark:hover:bg-surface-700"
												class:opacity-50={replyUploading ||
													(replyImages[post.id] || []).length >= 4}
											>
												<input
													type="file"
													accept="image/*"
													multiple
													onchange={(e) => {
														const input = e.target as HTMLInputElement;
														if (!input.files) return;
														replyUploading = true;
														const formData = new FormData();
														for (let i = 0; i < Math.min(input.files.length, 4); i++) {
															formData.append('images', input.files[i]);
														}
														fetch('/api/upload/images', {
															method: 'POST',
															body: formData
														})
															.then((res) => res.json())
															.then((data) => {
																replyImages[post.id] = [
																	...(replyImages[post.id] || []),
																	...data.urls
																].slice(0, 4);
															})
															.finally(() => {
																replyUploading = false;
															});
													}}
													disabled={replyUploading || (replyImages[post.id] || []).length >= 4}
													class="hidden"
												/>
												<ImagePlus size={18} class="text-surface-600 dark:text-surface-400" />
											</label>
											<div class="flex gap-2">
												<button
													onclick={() => cancelReply(post.id)}
													class="rounded border border-surface-300 px-4 py-1.5 text-sm font-medium lowercase hover:bg-surface-100 dark:border-surface-700 dark:hover:bg-surface-700"
												>
													cancel
												</button>
												<button
													onclick={() => submitReply(post.id)}
													disabled={!(replyContent[post.id] || '').trim() ||
														(replyContent[post.id] || '').length > 500}
													class="rounded border border-primary-700 bg-primary-600 px-4 py-1.5 text-sm font-medium text-white lowercase hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
												>
													reply
												</button>
											</div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed-container {
		min-height: 100vh;
	}

	.compose-box textarea {
		resize: none;
		border: none;
		outline: none;
		background: transparent;
		font-size: inherit;
		font-family: inherit;
	}

	.compose-box textarea::placeholder {
		color: rgb(var(--color-surface-500));
	}

	.post {
		transition: background-color 0.15s;
		cursor: pointer;
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 2px solid rgba(var(--color-surface-400), 0.3);
		border-top-color: rgb(var(--color-primary-600));
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.avatar {
		user-select: none;
	}
</style>
