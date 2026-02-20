
export interface Summary {
	summary: string;
	highlights: string[];
	keyPhrases: string[];
}

function extractEmphasisSentences(text: string): string[] {
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
	const emphasizedSentences: string[] = [];

	const emphasisPatterns = [
		/\b(really|absolutely|definitely|incredibly|amazing|terrible|awful|brilliant|worst|best)\b/gi,
		/\b(favorite|love|hate|adore|despise|outstanding|mediocre)\b/gi,
		/(\*\*|__)(.*?)\1/g 
	];

	for (const sentence of sentences.slice(0, 10)) {
		const trimmed = sentence.trim();
		if (trimmed.length > 20 && emphasisPatterns.some((p) => p.test(trimmed))) {
			emphasizedSentences.push(trimmed);
		}
	}

	return emphasizedSentences.slice(0, 3);
}

function extractKeyPhrases(text: string): string[] {
	const phrases: string[] = [];

	const patterns = [
		/(?:the |this |a )([a-z\s]+?) (?:is|are|was|were|feels|sounds|becomes)/gi,
		/production is ([a-z\s]+?)(?:\.|,)/gi,
		/vocals? (?:are |is )?([a-z\s]+?)(?:\.|,)/gi,
		/[\w\s]+ (?:throughout|all over|everywhere)/gi,
		/(?:love|hate|enjoy|dislike) ([a-z\s]+?)(?:\.|,)/gi,
		/(?:standout|highlight|notable) (?:track|song|moment) is ([a-z\s]+?)(?:\.|,)/gi,
		/(?:instrumentation|arrangement) (?:is )?([a-z\s]+?)(?:\.|,)/gi,
		/(?:lyrics|writing) (?:is )?([a-z\s]+?)(?:\.|,)/gi
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(text)) !== null) {
			const phrase = match[1] || match[0];
			if (phrase && phrase.length > 3 && phrase.split(' ').length <= 5) {
				phrases.push(phrase.trim());
			}
		}
	}

	return Array.from(new Set(phrases)).slice(0, 5);
}

export function createSummary(reviewText: string): Summary {
	if (!reviewText || reviewText.trim().length === 0) {
		return {
			summary: '',
			highlights: [],
			keyPhrases: []
		};
	}

	const text = reviewText.slice(0, 500);

	const highlighted = extractEmphasisSentences(text);

	const keyPhrases = extractKeyPhrases(text);

	const allSentences = text.match(/[^.!?]+[.!?]+/g) || [];
	const summaryLength = Math.min(2, allSentences.length);
	const summary = allSentences.slice(0, summaryLength).join(' ').trim().replace(/\s+/g, ' ');

	return {
		summary: summary.slice(0, 200),
		highlights: highlighted.slice(0, 2),
		keyPhrases
	};
}

/**
 * Highlight text by wrapping key phrases in markup
 */
export function highlightKeyPhrases(text: string, keyPhrases: string[]): string {
	let highlightedText = text;

	for (const phrase of keyPhrases) {
		const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
		highlightedText = highlightedText.replace(regex, `**${phrase}**`);
	}

	return highlightedText;
}

export function getPreview(text: string, maxLength = 150): string {
	if (!text || text.length <= maxLength) {
		return text;
	}

	const truncated = text.slice(0, maxLength);
	const lastPeriod = truncated.lastIndexOf('.');
	if (lastPeriod > maxLength - 50) {
		return truncated.slice(0, lastPeriod + 1);
	}

	return truncated + '...';
}
