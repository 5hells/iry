<script lang="ts">
	import { onMount } from 'svelte';
	import { Send, Search, MessageCircle, ImagePlus, Heart } from '@lucide/svelte';
	import { renderMarkdown } from '$lib/utils/markdown';

	interface Message {
		id: string;
		senderId: string;
		recipientId: string;
		content: string;
		imageUrls: string[];
		isRead: boolean;
		likeCount: number;
		isLiked?: boolean;
		createdAt: number;
		sender: {
			id: string;
			name: string;
			image: string | null;
		};
	}

	interface Conversation {
		user: {
			id: string;
			name: string;
			image: string | null;
		};
		lastMessage: Message;
		unreadCount: number;
	}

	let conversations = $state<Conversation[]>([]);
	let selectedUserId = $state<string | null>(null);
	let messages = $state<Message[]>([]);
	let newMessage = $state('');
	let newMessageImages = $state<string[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searching = $state(false);
	let showSearch = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	onMount(async () => {
		await loadConversations();
	});

	$effect(() => {
		if (searchTimeout) clearTimeout(searchTimeout);

		if (!searchQuery.trim()) {
			searchResults = [];
			return;
		}

		searching = true;
		searchTimeout = setTimeout(async () => {
			try {
				const response = await fetch(`/api/search/users?q=${encodeURIComponent(searchQuery)}`);
				if (response.ok) {
					const data = await response.json();
					searchResults = data.users;
				}
			} catch (error) {
				console.error('Failed to search users:', error);
			} finally {
				searching = false;
			}
		}, 300); // 300ms debounce
	});

	async function loadConversations() {
		try {
			const response = await fetch('/api/messages');
			if (response.ok) {
				const data = await response.json();
				conversations = data.conversations;
			}
		} catch (error) {
			console.error('Failed to load conversations:', error);
		} finally {
			loading = false;
		}
	}

	async function loadMessages(userId: string) {
		selectedUserId = userId;
		showSearch = false;
		try {
			const response = await fetch(`/api/messages?userId=${userId}`);
			if (response.ok) {
				const data = await response.json();
				messages = data.messages;
			}
		} catch (error) {
			console.error('Failed to load messages:', error);
		}
	}

	async function searchUsers() {
		if (!searchQuery.trim()) return;

		searching = true;
		try {
			const response = await fetch(`/api/search/users?q=${encodeURIComponent(searchQuery)}`);
			if (response.ok) {
				const data = await response.json();
				searchResults = data.users;
			}
		} catch (error) {
			console.error('Failed to search users:', error);
		} finally {
			searching = false;
		}
	}

	async function startConversation(userId: string) {
		selectedUserId = userId;
		searchQuery = '';
		searchResults = [];
		showSearch = false;
		await loadMessages(userId);
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
				newMessageImages = [...newMessageImages, ...data.urls].slice(0, 4);
			}
		} catch (error) {
			console.error('Failed to upload images:', error);
		} finally {
			uploading = false;
		}
	}

	async function sendMessage() {
		if (!selectedUserId || (!newMessage.trim() && newMessageImages.length === 0)) return;

		try {
			const response = await fetch('/api/messages', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					recipientId: selectedUserId,
					content: newMessage,
					imageUrls: newMessageImages
				})
			});

			if (response.ok) {
				newMessage = '';
				newMessageImages = [];
				await loadMessages(selectedUserId);
				await loadConversations(); // refresh conversation list
			}
		} catch (error) {
			console.error('Failed to send message:', error);
		}
	}

	async function toggleMessageLike(messageId: string) {
		try {
			const response = await fetch(`/api/messages/${messageId}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				messages = messages.map((msg) =>
					msg.id === messageId ? { ...msg, isLiked: data.liked, likeCount: data.likeCount } : msg
				);
			}
		} catch (error) {
			console.error('Failed to toggle message like:', error);
		}
	}

	function isStackedMessage(index: number): boolean {
		if (index === 0) return false;
		return messages[index - 1]?.senderId === messages[index]?.senderId;
	}

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="messages-container mx-auto flex h-screen max-w-7xl flex-col p-4">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="flex items-center gap-2 h1">
			<MessageCircle size={32} />
			messages
		</h1>
		<button onclick={() => (showSearch = !showSearch)} class="variant-filled-primary btn">
			<Search size={18} />
			new conversation
		</button>
	</div>

	
	{#if showSearch}
		<div class="search-section mb-6 card p-4">
			<div class="flex gap-2">
				<div class="search-input-wrapper relative flex-1">
					<Search class="absolute top-1/2 left-3 -translate-y-1/2 transform opacity-50" size={20} />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search users..."
						class="input w-full pl-10"
						onkeydown={(e) => e.key === 'Enter' && searchUsers()}
					/>
				</div>
				<button
					onclick={searchUsers}
					disabled={searching || !searchQuery.trim()}
					class="variant-filled-primary btn"
				>
					{searching ? 'Searching...' : 'Search'}
				</button>
			</div>

			{#if searchResults.length > 0}
				<div class="search-results mt-4 max-h-64 space-y-2 overflow-y-auto">
					{#each searchResults as user (user.id)}
						<button
							onclick={() => startConversation(user.id)}
							class="search-result flex w-full items-center gap-3 rounded-lg p-3 text-left transition hover:bg-[var(--bg-secondary)]"
						>
							<div
								class="avatar-circle flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]"
							>
								{#if user.image}
									<img
										src={user.image}
										alt={user.name}
										class="h-full w-full rounded-full object-cover"
									/>
								{:else}
									<span class="text-lg">{user.name[0].toUpperCase()}</span>
								{/if}
							</div>
							<div class="flex-1">
								<h3 class="font-semibold">{user.name}</h3>
								{#if user.lastfmUsername}
									<p class="text-xs opacity-50">Last.fm: {user.lastfmUsername}</p>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{:else if searchQuery && !searching}
				<p class="py-4 text-center opacity-50">No users found</p>
			{/if}
		</div>
	{/if}

	
	<div class="grid min-h-0 flex-1 gap-4 md:grid-cols-4">
		
		<div class="conversations flex flex-col card p-4 md:col-span-1">
			<h2 class="mb-4 h4">Conversations</h2>
			<div class="flex-1 space-y-2 overflow-y-auto">
				{#if loading}
					<p class="text-center opacity-50">Loading...</p>
				{:else if conversations.length === 0}
					<p class="text-center opacity-50">No conversations yet</p>
				{:else}
					{#each conversations as conv (conv.user.id)}
						{@const lastPreview = conv.lastMessage.content?.trim()
							? conv.lastMessage.content
							: conv.lastMessage.imageUrls && conv.lastMessage.imageUrls.length > 0
								? 'attachment'
								: ''}
						<button
							onclick={() => loadMessages(conv.user.id)}
							class="conversation-item w-full rounded-lg border-2 p-3 text-left transition hover:bg-[var(--bg-secondary)]"
							class:border-[var(--border-color)]={selectedUserId === conv.user.id}
							class:border-transparent={selectedUserId !== conv.user.id}
						>
							<div class="flex items-center gap-3">
								<a
									href={`/user/${conv.user.id}`}
									class="avatar-circle relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-300"
									title="View profile"
								>
									{#if conv.user.image}
										<img
											src={conv.user.image}
											alt={conv.user.name}
											class="h-full w-full rounded-full object-cover"
										/>
									{:else}
										<span class="text-lg">{conv.user.name[0].toUpperCase()}</span>
									{/if}
									{#if conv.unreadCount > 0}
										<span
											class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-xs text-white"
										>
											{conv.unreadCount > 9 ? '9+' : conv.unreadCount}
										</span>
									{/if}
								</a>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between">
										<a href={`/user/${conv.user.id}`} class="truncate font-semibold hover:underline"
											>{conv.user.name}</a
										>
										<span class="text-xs opacity-50"
											>{formatTimeAgo(conv.lastMessage.createdAt)}</span
										>
									</div>
									<p class="truncate text-xs opacity-50">{lastPreview}</p>
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>

		
		<div class="messages-view flex min-h-0 flex-col card p-4 md:col-span-3">
			{#if !selectedUserId}
				<div class="flex flex-1 items-center justify-center">
					<div class="text-center">
						<MessageCircle size={48} class="mx-auto mb-4 opacity-25" />
						<p class="opacity-50">Select a conversation to view messages</p>
					</div>
				</div>
			{:else}
				<div class="messages-list mb-4 flex-1 space-y-4 overflow-y-auto p-2">
					{#each messages as message, index (message.id)}
						{@const stacked = isStackedMessage(index)}
						<div class="message" class:self={message.senderId !== selectedUserId} class:stacked>
							<div class="flex gap-3" class:flex-row-reverse={message.senderId !== selectedUserId}>
								{#if !stacked}
									<a
										href={`/user/${message.sender.id}`}
										class="avatar-circle flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-secondary)]"
										title="View profile"
									>
										{#if message.sender.image}
											<img
												src={message.sender.image}
												alt={message.sender.name}
												class="h-full w-full rounded-full object-cover"
											/>
										{:else}
											<span class="text-sm">{message.sender.name[0].toUpperCase()}</span>
										{/if}
									</a>
								{:else}
									<div class="avatar-spacer h-10 w-10 flex-shrink-0"></div>
								{/if}
								<div class="max-w-md flex-1">
									<div
										class="message-bubble rounded-lg px-4 py-3"
										class:bg-[var(--bg-secondary)]={message.senderId !== selectedUserId}
										class:bg-[var(--bg-base)]={message.senderId === selectedUserId}
										class:text-white={message.senderId !== selectedUserId}
										class:ml-auto={message.senderId !== selectedUserId}
									>
										{#if message.content && message.content.trim().length > 0}
											<p class="text-sm leading-relaxed whitespace-pre-wrap">
												{@html renderMarkdown(message.content)}
											</p>
										{/if}
										{#if message.imageUrls.length > 0}
											<div class="mt-3 grid grid-cols-2 gap-2">
												{#each message.imageUrls as imageUrl}
													<img
														src={imageUrl}
														alt="message attachment"
														class="h-auto max-w-full rounded-lg"
													/>
												{/each}
											</div>
										{/if}
									</div>
									<div
										class="message-meta mt-2 flex items-center gap-2"
										class:justify-end={message.senderId !== selectedUserId}
									>
										{#if message.senderId !== selectedUserId}
											<span class="text-xs opacity-50">
												{formatTimeAgo(message.createdAt)}
											</span>
											<button
												type="button"
												onclick={() => toggleMessageLike(message.id)}
												class="message-like flex items-center gap-1 text-xs transition ml-2"
												class:liked={message.isLiked}
											>
												<Heart size={12} fill={message.isLiked ? 'currentColor' : 'none'} />
												{#if message.likeCount > 0}
													<span>{message.likeCount}</span>
												{/if}
											</button>
										{:else}
											<button
												type="button"
												onclick={() => toggleMessageLike(message.id)}
												class="message-like flex items-center gap-1 text-xs transition"
												class:liked={message.isLiked}
											>
												<Heart size={12} fill={message.isLiked ? 'currentColor' : 'none'} />
												{#if message.likeCount > 0}
													<span>{message.likeCount}</span>
												{/if}
											</button>
											<span class="text-xs opacity-50">
												{formatTimeAgo(message.createdAt)}
											</span>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>

				
				<div class="send-message-section border-t border-[var(--border-color)] pt-4">
					{#if newMessageImages.length > 0}
						<div class="mb-3 flex gap-2 overflow-x-auto">
							{#each newMessageImages as imageUrl}
								<div class="relative flex-shrink-0">
									<img
										src={imageUrl}
										alt="upload preview"
										class="h-16 w-16 rounded-lg object-cover"
									/>
									<button
										onclick={() =>
											(newMessageImages = newMessageImages.filter((url) => url !== imageUrl))}
										class="variant-filled-error absolute -top-1 -right-1 btn-icon btn-icon-sm"
									>
										×
									</button>
								</div>
							{/each}
						</div>
					{/if}
					<div class="flex gap-2">
						<label
							class="variant-ghost-surface btn flex-shrink-0 btn-sm"
							class:opacity-50={uploading}
						>
							<input
								type="file"
								accept="image/*"
								multiple
								class="hidden"
								onchange={handleImageUpload}
								disabled={uploading || newMessageImages.length >= 4}
							/>
							<ImagePlus size={18} />
						</label>
						<textarea
							bind:value={newMessage}
							placeholder="Type your message..."
							class="input flex-1 resize-none"
							onkeydown={handleKeydown}
						></textarea>
						<button
							onclick={sendMessage}
							disabled={!newMessage.trim() && newMessageImages.length === 0}
							class="variant-filled-primary btn"
						>
							<Send size={18} />
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.message.self {
		flex-direction: row-reverse;
	}

	.message .message-bubble {
		max-width: 70%;
	}

	.message-meta {
		justify-content: flex-start;
	}

	.message-meta .message-like {
		color: var(--text-primary);
	}

	.message-meta .message-like.liked {
		color: var(--primary);
	}

	:global(.send-message-section textarea) {
		min-height: 2.5rem;
		max-height: 6rem;
		resize: none;
	}
</style>
