<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Heart, MessageCircle, Share2 } from '@lucide/svelte';
	import { toasts } from '$lib/stores/notifications';
	import StackedHeads from '$lib/components/StackedHeads.svelte';
	import BlockButton from '$lib/components/BlockButton.svelte';

	let post = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let blockedUserIds = $state<Set<string>>(new Set());
	let isPostAuthorBlocked = $state(false);
	let currentUser = $state<any>(null);

	function canModerate() {
		const role = currentUser?.role;
		return role === 'admin' || role === 'moderator';
	}

	onMount(async () => {
		const postId = $page.params.id;
		currentUser = $page.data?.user || null;

		
		try {
			const response = await fetch('/api/user/block');
			if (response.ok) {
				const data = await response.json();
				blockedUserIds = new Set(data.blockedUsers?.map((u: any) => u.id) || []);
			}
		} catch (err) {
			console.error('Failed to load blocked users:', err);
		}

		try {
			const response = await fetch(`/api/feed/${postId}`);
			if (response.ok) {
				const data = await response.json();
				const incomingPost = data.post;

				
				isPostAuthorBlocked = blockedUserIds.has(incomingPost.userId);

				post = {
					...incomingPost,
					likeHeads: incomingPost?.likeHeads || [],
					replyHeads: incomingPost?.replyHeads || [],
					replies: (incomingPost?.replies || [])
						.filter((reply: any) => !blockedUserIds.has(reply.userId))
						.map((reply: any) => ({
							...reply,
							likeHeads: reply?.likeHeads || []
						}))
				};
			} else {
				error = 'Post not found';
			}
		} catch (err) {
			console.error('Failed to load post:', err);
			error = 'Failed to load post';
		} finally {
			loading = false;
		}
	});

	function handleBlockChange(blocked: boolean) {
		isPostAuthorBlocked = blocked;
		if (blocked) {
			blockedUserIds.add(post.userId);
			
			if (post.replies) {
				post.replies = post.replies.filter((r: any) => r.userId !== post.userId);
			}
		} else {
			blockedUserIds.delete(post.userId);
		}
	}

	function formatDate(timestamp: number) {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	async function toggleLike(postId: string) {
		try {
			const response = await fetch(`/api/feed/${postId}/like`, {
				method: 'POST'
			});
			if (response.ok) {
				const data = await response.json();
				if (post && post.id === postId) {
					post.isLiked = data.liked;
					post.likeCount = data.likeCount;
				} else if (post?.replies) {
					post.replies = post.replies.map((reply: any) =>
						reply.id === postId
							? { ...reply, isLiked: data.liked, likeCount: data.likeCount }
							: reply
					);
				}
			}
		} catch (err) {
			console.error('Failed to toggle like:', err);
		}
	}

	let replyContent = $state('');
	let replyImageUrls = $state<string[]>([]);
	let submittingReply = $state(false);

	async function submitReply() {
		if (!replyContent.trim() || !post) return;

		submittingReply = true;
		try {
			const response = await fetch(`/api/feed/${post.id}/reply`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content: replyContent,
					imageUrls: replyImageUrls
				})
			});

			if (response.ok) {
				const data = await response.json();
				replyContent = '';
				replyImageUrls = [];
				toasts.add('Reply posted', 'success');
				window.location.reload();
			} else {
				const data = await response.json();
				toasts.add(data.error || 'Failed to post reply', 'error');
			}
		} catch (err) {
			console.error('Failed to submit reply:', err);
			toasts.add('Failed to post reply', 'error');
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

	async function deleteItem(id: string) {
		if (!confirm('Delete this content? This action cannot be undone.')) return;

		try {
			const response = await fetch(`/api/feed/${id}/delete`, { method: 'POST' });
			if (!response.ok) {
				const payload = await response.json().catch(() => ({}));
				toasts.add(payload.error || 'Failed to delete', 'error');
				return;
			}

			if (id === post?.id) {
				window.location.href = '/';
				return;
			}

			post = {
				...post,
				replies: (post?.replies || []).filter((reply: any) => reply.id !== id)
			};
			toasts.add('Deleted', 'success');
		} catch (err) {
			console.error('Failed to delete:', err);
			toasts.add('Failed to delete', 'error');
		}
	}
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
	{#if loading}
		<div class="flex justify-center py-20">
			<div class="loading-spinner"></div>
		</div>
	{:else if error}
		<div class="py-20 text-center">
			<p class="text-[var(--text-secondary)]">{error}</p>
			<a href="/" class="text-[var(--color-primary-500)] hover:underline">Go home</a>
		</div>
	{:else if post}
		<div class="mb-8">
			<a
				href="/"
				class="mb-4 flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
			>
				<span>←</span> Back to feed
			</a>
		</div>

		<div class="mb-6 card p-6">
			<div class="mb-4 flex gap-4">
				{#if post.user?.image}
					<a href={`/user/${post.userId}`} title="view profile">
						<img src={post.user.image} alt={post.user.name} class="h-12 w-12 rounded-full" />
					</a>
				{:else}
					<a
						href={`/user/${post.userId}`}
						title="view profile"
						class="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
					>
						<span class="text-lg font-bold">{post.user?.name?.[0]?.toUpperCase()}</span>
					</a>
				{/if}
				<div class="flex-1">
					<div class="mb-1 flex items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<a href={`/user/${post.userId}`} class="font-semibold text-[var(--text-primary)] hover:underline"
								>{post.user?.name}</a
							>
							<span class="text-sm text-[var(--text-secondary)]">
								{formatDate(post.createdAt)}
							</span>
						</div>
						<div class="flex items-center gap-2">
							{#if currentUser && (currentUser.id === post.userId || canModerate())}
								<button
									onclick={() => deleteItem(post.id)}
									class="text-xs text-red-500 hover:text-red-700"
								>
									delete
								</button>
							{/if}
							<BlockButton
								userId={post.userId}
								userName={post.user?.name}
								isBlocked={isPostAuthorBlocked}
								onBlockChange={handleBlockChange}
								size="sm"
								variant="icon"
							/>
						</div>
					</div>
					<p class="whitespace-pre-wrap text-[var(--text-primary)]">{post.content}</p>

					{#if post.imageUrls && post.imageUrls.length > 0}
						<div class="mt-4 grid grid-cols-2 gap-2">
							{#each post.imageUrls as imageUrl}
								<img
									src={imageUrl}
									alt="post image"
									class="rounded border border-[var(--border-color)]"
								/>
							{/each}
						</div>
					{/if}

					<div class="mt-4 flex items-center gap-6 text-sm text-[var(--text-secondary)]">
						<button
							onclick={() => toggleLike(post.id)}
							class="like-btn flex items-center gap-1 transition"
							class:liked={post.isLiked}
						>
							<Heart size={14} fill={post.isLiked ? 'currentColor' : 'none'} />
							<StackedHeads users={post.likeHeads || []} size={16} />
							<span>{post.likeCount || 0}</span>
						</button>
						<span class="flex items-center gap-1">
							<MessageCircle size={14} />
							<StackedHeads users={post.replyHeads || []} size={16} />
							<span>{post.replyCount || (post.replies && post.replies.length) || 0}</span>
						</span>
						<button
							onclick={copyPermalink}
							class="flex items-center gap-1 transition hover:text-[var(--text-primary)]"
							title="copy link"
						>
							<Share2 size={14} />
							<span>share</span>
						</button>
					</div>
				</div>
			</div>
		</div>

		<div class="mb-6 card p-6">
			<h3 class="mb-4 text-lg font-semibold">Reply</h3>
			<textarea
				bind:value={replyContent}
				placeholder="Write a reply..."
				class="w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2 text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--color-primary-500)] focus:outline-none"
				rows="3"
				maxlength="500"
			></textarea>
			<div class="mt-3 flex items-center justify-between">
				<span class="text-sm text-[var(--text-secondary)]">{replyContent.length}/500</span>
				<button
					onclick={submitReply}
					disabled={!replyContent.trim() || submittingReply}
					class="rounded bg-[var(--color-primary-500)] px-4 py-2 font-medium text-white transition hover:bg-[var(--color-primary-600)] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{submittingReply ? 'Posting...' : 'Post Reply'}
				</button>
			</div>
		</div>

		{#if post.replies && post.replies.length > 0}
			<div class="space-y-4">
				<h3 class="mb-4 text-lg font-semibold">Replies ({post.replies.length})</h3>
				{#each post.replies as reply}
					<div class="card p-4">
						<div class="flex gap-3">
							{#if reply.user?.image}
								<a href={reply.userId ? `/user/${reply.userId}` : undefined} title="view profile">
									<img src={reply.user.image} alt={reply.user.name} class="h-10 w-10 rounded-full" />
								</a>
							{:else}
								<a
									href={reply.userId ? `/user/${reply.userId}` : undefined}
									title="view profile"
									class="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]"
								>
									<span class="text-sm font-bold">{reply.user?.name?.[0]?.toUpperCase()}</span>
								</a>
							{/if}
							<div class="flex-1">
								<div class="mb-1 flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										{#if reply.userId}
											<a href={`/user/${reply.userId}`} class="text-sm font-medium text-[var(--text-primary)] hover:underline"
												>{reply.user?.name}</a
											>
										{:else}
											<span class="text-sm font-medium text-[var(--text-primary)]">{reply.user?.name}</span>
										{/if}
										<span class="text-xs text-[var(--text-secondary)]">
											{formatDate(reply.createdAt)}
										</span>
									</div>
									<div class="flex items-center gap-2">
										{#if currentUser && (currentUser.id === reply.userId || canModerate())}
											<button
												onclick={() => deleteItem(reply.id)}
												class="text-xs text-red-500 hover:text-red-700"
											>
												delete
											</button>
										{/if}
										<BlockButton
											userId={reply.userId}
											userName={reply.user?.name}
											isBlocked={blockedUserIds.has(reply.userId)}
											onBlockChange={(blocked) => {
												if (blocked) {
													blockedUserIds.add(reply.userId);
													post.replies = post.replies.filter((r: any) => r.userId !== reply.userId);
												} else {
													blockedUserIds.delete(reply.userId);
												}
											}}
											size="sm"
											variant="icon"
										/>
									</div>
								</div>
								<p class="text-sm whitespace-pre-wrap text-[var(--text-primary)]">
									{reply.content}
								</p>

								{#if reply.imageUrls && reply.imageUrls.length > 0}
									<div class="mt-2 grid grid-cols-2 gap-2">
										{#each reply.imageUrls as imageUrl}
											<img
												src={imageUrl}
												alt="reply image"
												class="max-h-40 rounded border border-[var(--border-color)] object-cover"
											/>
										{/each}
									</div>
								{/if}

								<div class="mt-2 flex items-center gap-4 text-xs text-[var(--text-secondary)]">
									<button
										onclick={() => toggleLike(reply.id)}
										class="like-btn flex items-center gap-1 transition"
										class:liked={reply.isLiked}
									>
										<Heart size={14} fill={reply.isLiked ? 'currentColor' : 'none'} />
										<StackedHeads users={reply.likeHeads || []} size={12} />
										<span>{reply.likeCount || 0}</span>
									</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 2px solid rgba(var(--color-primary-400), 0.3);
		border-top-color: rgb(var(--color-primary-600));
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.card {
		background: var(--bg-base);
		border: 1px solid var(--border-color);
		border-radius: 8px;
	}

	.like-btn {
		color: var(--text-secondary);
	}

	.like-btn:hover {
		color: var(--text-primary);
	}

	.like-btn.liked {
		color: var(--theme-accent);
	}
</style>
