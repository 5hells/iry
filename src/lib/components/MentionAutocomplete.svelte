<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { AtSign } from '@lucide/svelte';

	interface MentionUser {
		id: string;
		name: string;
		image: string | null;
	}

	let {
		textareaElement = null as HTMLTextAreaElement | null,
		onMentionSelect = (user: MentionUser) => {}
	}: {
		textareaElement?: HTMLTextAreaElement | null;
		onMentionSelect?: (user: MentionUser) => void;
	} = $props();

	let mentionUsers = $state<MentionUser[]>([]);
	let showMentions = $state(false);
	let searchQuery = $state('');
	let selectedIndex = $state(-1);
	let mentionStartPos = $state(-1);
	let loading = $state(false);
	let position = $state({ top: 0, left: 0 });

	onMount(() => {
		if (!textareaElement) return;

		const handleInput = async (e: Event) => {
			const textarea = e.target as HTMLTextAreaElement;
			const text = textarea.value;
			const cursorPos = textarea.selectionStart;

			const beforeCursor = text.substring(0, cursorPos);
			const lastAtIndex = beforeCursor.lastIndexOf('@');

			if (lastAtIndex === -1 || lastAtIndex === beforeCursor.length - 1) {
				showMentions = false;
				return;
			}

			if (lastAtIndex > 0 && !/\s/.test(text[lastAtIndex - 1])) {
				showMentions = false;
				return;
			}

			const query = text.substring(lastAtIndex + 1, cursorPos);

			if (query.length === 0 || /\s/.test(query.charAt(query.length - 1))) {
				showMentions = false;
				return;
			}

			mentionStartPos = lastAtIndex;
			searchQuery = query;
			selectedIndex = -1;
			showMentions = true;

			await searchUsers(query);

			const coords = getCoordinates(textarea, cursorPos);
			position = coords;
		};

		const handleKeydown = (e: KeyboardEvent) => {
			if (!showMentions) return;

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % Math.max(1, mentionUsers.length);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = selectedIndex <= 0 ? mentionUsers.length - 1 : selectedIndex - 1;
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (selectedIndex >= 0 && mentionUsers[selectedIndex]) {
					selectMention(mentionUsers[selectedIndex]);
				}
			} else if (e.key === 'Escape') {
				showMentions = false;
			}
		};

		textareaElement.addEventListener('input', handleInput);
		textareaElement.addEventListener('keydown', handleKeydown);

		return () => {
			textareaElement?.removeEventListener('input', handleInput);
			textareaElement?.removeEventListener('keydown', handleKeydown);
		};
	});

	async function searchUsers(query: string) {
		if (!query) {
			mentionUsers = [];
			return;
		}

		loading = true;
		try {
			const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`);
			if (response.ok) {
				const data = await response.json();
				mentionUsers = data.users || [];
			}
		} catch (error) {
			console.error('Failed to search users:', error);
			mentionUsers = [];
		} finally {
			loading = false;
		}
	}

	function selectMention(user: MentionUser) {
		if (!textareaElement) return;

		const text = textareaElement.value;
		const cursorPos = textareaElement.selectionStart;

		const beforeMention = text.substring(0, mentionStartPos);
		const afterMention = text.substring(cursorPos);
		const mention = `@${user.name}`;

		const newText = beforeMention + mention + ' ' + afterMention;
		textareaElement.value = newText;

		const newCursorPos = (beforeMention + mention + ' ').length;
		textareaElement.selectionStart = newCursorPos;
		textareaElement.selectionEnd = newCursorPos;

		showMentions = false;
		mentionUsers = [];
		searchQuery = '';
		mentionStartPos = -1;

		textareaElement.dispatchEvent(
			new CustomEvent('mentionSelected', { detail: user, bubbles: true })
		);
		onMentionSelect(user);
	}

	function getCoordinates(
		textarea: HTMLTextAreaElement,
		position: number
	): { top: number; left: number } {
		const div = document.createElement('div');
		const style = window.getComputedStyle(textarea);
		const rect = textarea.getBoundingClientRect();

		[
			'direction',
			'boxSizing',
			'width',
			'height',
			'overflowX',
			'overflowY',
			'borderTopWidth',
			'borderRightWidth',
			'borderBottomWidth',
			'borderLeftWidth',
			'paddingTop',
			'paddingRight',
			'paddingBottom',
			'paddingLeft',
			'fontStyle',
			'fontVariant',
			'fontWeight',
			'fontStretch',
			'fontSize',
			'fontSizeAdjust',
			'lineHeight',
			'fontFamily',
			'textAlign',
			'textTransform',
			'textIndent',
			'textDecoration',
			'letterSpacing',
			'wordSpacing',
			'tabSize'
		].forEach((prop) => {
			div.style[prop as any] = style[prop as any];
		});

		div.style.position = 'absolute';
		div.style.visibility = 'hidden';
		div.style.left = `${rect.left}px`;
		div.style.top = `${rect.top}px`;
		div.style.width = `${rect.width}px`;
		div.style.height = `${rect.height}px`;
		div.style.overflow = 'hidden';
		div.style.whiteSpace = 'pre-wrap';
		div.style.wordWrap = 'break-word';
		div.scrollTop = textarea.scrollTop;
		div.scrollLeft = textarea.scrollLeft;

		document.body.appendChild(div);

		div.textContent = textarea.value.substring(0, position);
		const span = document.createElement('span');
		span.textContent = textarea.value.substring(position) || '.';
		div.appendChild(span);

		const spanRect = span.getBoundingClientRect();
		document.body.removeChild(div);

		return {
			top: spanRect.top + 20,
			left: spanRect.left
		};
	}

	onDestroy(() => {
		showMentions = false;
	});
</script>

{#if showMentions && (mentionUsers.length > 0 || loading)}
	<div
		class="fixed z-50 max-w-[300px] min-w-[200px] rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg"
		style="top: {position.top}px; left: {position.left}px;"
	>
		{#if loading}
			<div class="px-3 py-2 text-center text-sm text-[var(--text-secondary)]">
				Searching users...
			</div>
		{:else if mentionUsers.length === 0}
			<div class="px-3 py-2 text-center text-sm text-[var(--text-secondary)]">No users found</div>
		{:else}
			<div class="max-h-[300px] overflow-y-auto">
				{#each mentionUsers as user, idx}
					<button
						type="button"
						onclick={() => selectMention(user)}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-base)]"
						class:bg-[var(--bg-base)]={selectedIndex === idx}
					>
						{#if user.image}
							<img src={user.image} alt={user.name} class="h-6 w-6 flex-shrink-0 rounded-full" />
						{:else}
							<div
								class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--border-color)]"
							>
								<AtSign class="h-3 w-3" />
							</div>
						{/if}
						<span class="truncate font-medium">{user.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
