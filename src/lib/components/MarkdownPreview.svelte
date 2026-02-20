<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';

	let {
		content = '',
		showPreview = true
	}: {
		content?: string;
		showPreview?: boolean;
	} = $props();

	let preview = $derived(content ? renderMarkdown(content) : '');
</script>

{#if showPreview && content}
	<div
		class="markdown-preview prose prose-sm dark:prose-invert max-w-none text-sm text-[var(--text-primary)]"
	>
		{@html preview}
	</div>
{/if}

<style>
	:global(.markdown-preview strong) {
		font-weight: bold;
	}

	:global(.markdown-preview em) {
		font-style: italic;
	}

	:global(.markdown-preview a) {
		color: rgb(59, 130, 246);
	}

	:global(.markdown-preview a:hover) {
		text-decoration: underline;
	}

	:global(.markdown-preview code) {
		font-family: 'Courier New', monospace;
		background-color: var(--bg-base);
		padding: 0 0.25rem;
		border-radius: 0.25rem;
		font-size: 0.875em;
	}

	:global(.markdown-preview pre) {
		overflow-x: auto;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin: 0.5rem 0;
	}

	:global(.markdown-preview pre code) {
		background: none;
		padding: 0;
		border-radius: 0;
	}

	:global(.markdown-preview br) {
		display: block;
		height: 0.5rem;
	}
</style>
