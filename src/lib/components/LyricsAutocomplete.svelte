<script lang="ts">
	import { onMount } from 'svelte';
	import { Music, X } from '@lucide/svelte';

	interface LyricsResult {
		id: string;
		title: string;
		artist: string;
		url?: string;
		excerpt?: string;
	}

	let {
		textareaElement = null as HTMLTextAreaElement | null,
		onSelect = (lyrics: LyricsResult) => {}
	}: {
		textareaElement?: HTMLTextAreaElement | null;
		onSelect?: (lyrics: LyricsResult) => void;
	} = $props();

	let lyricsResults = $state<LyricsResult[]>([]);
	let showResults = $state(false);
	let searchQuery = $state('');
	let selectedIndex = $state(-1);
	let loading = $state(false);
	let position = $state({ top: 0, left: 0 });

	onMount(() => {
		if (!textareaElement) return;

		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === '/' && !showResults) {
				const textarea = e.target as HTMLTextAreaElement;
				const beforeCursor = textarea.value.substring(0, textarea.selectionStart);

				if (beforeCursor.endsWith('\n') || beforeCursor.length === 0) {
					e.preventDefault();
					showResults = true;
					searchQuery = '';
					selectedIndex = -1;

					const coords = getCoordinates(textarea, textarea.selectionStart);
					position = coords;
					return;
				}
			}

			if (!showResults) return;

			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % Math.max(1, lyricsResults.length);
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedIndex = selectedIndex <= 0 ? lyricsResults.length - 1 : selectedIndex - 1;
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (selectedIndex >= 0 && lyricsResults[selectedIndex]) {
					selectLyrics(lyricsResults[selectedIndex]);
				}
			} else if (e.key === 'Escape') {
				showResults = false;
			}
		};

		const handleInput = async (e: Event) => {
			if (!showResults) return;

			const textarea = e.target as HTMLTextAreaElement;
			const text = textarea.value;
			const cursorPos = textarea.selectionStart;

			const beforeCursor = text.substring(Math.max(0, cursorPos - 50), cursorPos);
			if (!beforeCursor.includes('/')) {
				showResults = false;
				return;
			}

			const lastSlashIndex = beforeCursor.lastIndexOf('/');
			searchQuery = beforeCursor.substring(lastSlashIndex + 1);

			if (searchQuery.length >= 1) {
				selectedIndex = -1;
				await searchLyrics(searchQuery);

				const coords = getCoordinates(textarea, cursorPos);
				position = coords;
			} else {
				lyricsResults = [];
			}
		};

		textareaElement.addEventListener('keydown', handleKeydown);
		textareaElement.addEventListener('input', handleInput);

		return () => {
			textareaElement?.removeEventListener('keydown', handleKeydown);
			textareaElement?.removeEventListener('input', handleInput);
		};
	});

	async function searchLyrics(query: string) {
		if (!query) {
			lyricsResults = [];
			return;
		}

		loading = true;
		try {
			const response = await fetch(`/api/search/lyrics?q=${encodeURIComponent(query)}`);
			if (response.ok) {
				const data = await response.json();
				lyricsResults = data.lyrics || [];
			}
		} catch (error) {
			console.error('Failed to search lyrics:', error);
			lyricsResults = [];
		} finally {
			loading = false;
		}
	}

	function selectLyrics(lyrics: LyricsResult) {
		if (!textareaElement) return;

		const text = textareaElement.value;
		const cursorPos = textareaElement.selectionStart;

		const beforeSlash = text.substring(0, cursorPos).lastIndexOf('/');
		const before = text.substring(0, beforeSlash);
		const after = text.substring(cursorPos);

		let lyricsRef = `/${lyrics.title} - ${lyrics.artist}`;
		if (lyrics.excerpt) {
			lyricsRef += ` (${lyrics.excerpt.slice(0, 50).replace(/\n/g, ' ')}...)`;
		}
		const newText = before + lyricsRef + ' ' + after;

		textareaElement.value = newText;

		const newCursorPos = (before + lyricsRef + ' ').length;
		textareaElement.selectionStart = newCursorPos;
		textareaElement.selectionEnd = newCursorPos;

		showResults = false;
		lyricsResults = [];
		searchQuery = '';

		textareaElement.dispatchEvent(new Event('input', { bubbles: true }));

		onSelect(lyrics);
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
</script>

{#if showResults && (lyricsResults.length > 0 || loading)}
	<div
		class="fixed z-50 max-w-[350px] min-w-[250px] rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-lg"
		style="top: {position.top}px; left: {position.left}px;"
	>
		{#if loading}
			<div class="px-3 py-2 text-center text-sm text-[var(--text-secondary)]">
				Searching lyrics...
			</div>
		{:else if lyricsResults.length === 0}
			<div class="px-3 py-2 text-center text-sm text-[var(--text-secondary)]">No lyrics found</div>
		{:else}
			<div class="max-h-[300px] overflow-y-auto">
				{#each lyricsResults as lyrics, idx}
					<button
						type="button"
						onclick={() => selectLyrics(lyrics)}
						class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--bg-base)]"
						class:bg-[var(--bg-base)]={selectedIndex === idx}
					>
						<Music class="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-secondary)]" />
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium text-[var(--text-primary)]">{lyrics.title}</p>
							<p class="truncate text-xs text-[var(--text-secondary)]">{lyrics.artist}</p>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
