
interface ParsedMarkdown {
	html: string;
	text: string;
}

export function parseMarkdown(content: string): ParsedMarkdown {
	let html = escapeHtml(content);

	html = html.replace(/```[\s\S]*?```/g, (match) => {
		const code = match.slice(3, -3).trim();
		return `<pre class="bg-[var(--bg-base)] border border-[var(--border-color)] rounded p-3 my-2 overflow-x-auto"><code>${escapeHtml(code)}</code></pre>`;
	});

	html = html.replace(
		/`([^`]+)`/g,
		'<code class="bg-[var(--bg-base)] px-1 rounded font-mono text-sm">$1</code>'
	);

	html = html.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>'
	);

	html = html.replace(/(^|\s)@([A-Za-z0-9_.-]{2,32})/g, (match, prefix, username) => {
		const encoded = encodeURIComponent(username);
		return `${prefix}<a href="/user/by-name/${encoded}" class="text-blue-500 hover:underline">@${username}</a>`;
	});

	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
	html = html.replace(/__([^_]+)__/g, '<strong class="font-bold">$1</strong>');

	html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
	html = html.replace(/_([^_]+)_/g, '<em class="italic">$1</em>');

	html = html.replace(/\n/g, '<br>');

	html = html.replace(
		/(^|\s)\/([\w\s'".,:;!&()\-]+?\s-\s[\w\s'".,:;!&()\-]+)(?=\s|<br>|$)/g,
		(m, p1, p2) => {
			const q = encodeURIComponent(p2.trim());
			return `${p1}<a href="/lyrics?q=${q}" class="text-blue-500 hover:underline">/${p2.trim()}</a>`;
		}
	);

	return {
		html,
		text: content
	};
}

export function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (char) => map[char]);
}

export function renderMarkdown(markdown: string): string {
	return parseMarkdown(markdown).html;
}
