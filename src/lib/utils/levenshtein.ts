export function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = Array.from({ length: an + 1 }, () => new Array(bn + 1).fill(0));

  for (let i = 0; i <= an; i++) matrix[i][0] = i;
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[an][bn];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const dist = levenshtein(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}
export function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;
	const matrix: number[][] = Array(len2 + 1)
		.fill(null)
		.map(() => Array(len1 + 1).fill(0));

	for (let i = 0; i <= len1; i++) matrix[0][i] = i;
	for (let j = 0; j <= len2; j++) matrix[j][0] = j;

	for (let j = 1; j <= len2; j++) {
		for (let i = 1; i <= len1; i++) {
			const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
			matrix[j][i] = Math.min(
				matrix[j][i - 1] + 1, 
				matrix[j - 1][i] + 1, 
				matrix[j - 1][i - 1] + indicator 
			);
		}
	}

	return matrix[len2][len1];
}

export function normalizeString(str: string): string {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ');
}

export function findClosestMatch<T extends string | { name: string }>(
	query: string,
	items: T[],
	threshold: number = 3,
	keyFn?: (item: T) => string
): T | null {
	const normalizedQuery = normalizeString(query);
	const itemsWithDistance = items.map((item) => {
		const itemStr = typeof item === 'string' ? item : keyFn ? keyFn(item) : item.name;
		const normalizedItem = normalizeString(itemStr);
		const distance = levenshteinDistance(normalizedQuery, normalizedItem);
		return { item, distance };
	});

	const closest = itemsWithDistance.reduce((min, current) =>
		current.distance < min.distance ? current : min
	);

	return closest.distance <= threshold ? closest.item : null;
}

export function findSimilarMatches<T extends string | { name: string }>(
	query: string,
	items: T[],
	threshold: number = 5,
	limit: number = 10,
	keyFn?: (item: T) => string
): Array<{ item: T; distance: number; score: number }> {
	const normalizedQuery = normalizeString(query);
	return items
		.map((item) => {
			const itemStr = typeof item === 'string' ? item : keyFn ? keyFn(item) : item.name;
			const normalizedItem = normalizeString(itemStr);
			const distance = levenshteinDistance(normalizedQuery, normalizedItem);
			const score = 1 / (1 + distance); 
			return { item, distance, score };
		})
		.filter(({ distance }) => distance <= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}
