import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import { indexAlbumFromMusicBrainz, indexAlbumFromDiscogs } from '$lib/server/music/indexer';
import { levenshteinDistance, normalizeString } from '$lib/utils/levenshtein';
import { getCachedResults, setCachedResults } from '$lib/server/search-cache';

type SearchResult = {
	source: 'musicbrainz' | 'discogs';
	id: string;
	title: string;
	artist: string;
	releaseDate?: string;
	coverArt?: string | null;
	totalTracks?: number;
	externalUrl?: string;
	country?: string;
	status?: string;
};

function parseDiscogsArtistAndTitle(release: any): { artist: string; title: string } {
	const fallbackArtist = discogs.cleanDiscogsArtistName(String(release.artist || '').trim());
	const rawTitle = String(release.title || '').trim();

	if (!rawTitle.includes(' - ')) {
		return {
			artist: fallbackArtist || 'Unknown',
			title: rawTitle
		};
	}

	const [left, ...rest] = rawTitle.split(' - ');
	const right = rest.join(' - ').trim();
	const leftArtist = discogs.cleanDiscogsArtistName(left.trim());

	if (!right) {
		return {
			artist: fallbackArtist || leftArtist || 'Unknown',
			title: rawTitle
		};
	}

	const normalizedFallbackArtist = normalizeString(fallbackArtist);
	const normalizedLeftArtist = normalizeString(leftArtist);
	const useLeftArtist =
		!normalizedFallbackArtist || normalizedFallbackArtist === normalizedLeftArtist;

	return {
		artist: useLeftArtist
			? leftArtist || fallbackArtist || 'Unknown'
			: fallbackArtist || leftArtist || 'Unknown',
		title: right
	};
}

function similarityScore(a: string, b: string): number {
	const normalizedA = normalizeString(a);
	const normalizedB = normalizeString(b);
	if (!normalizedA || !normalizedB) return 0;
	if (normalizedA === normalizedB) return 1;
	const distance = levenshteinDistance(normalizedA, normalizedB);
	const maxLen = Math.max(normalizedA.length, normalizedB.length);
	return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function isLikelySameAlbum(
	a: Pick<SearchResult, 'title' | 'artist'>,
	b: Pick<SearchResult, 'title' | 'artist'>
): boolean {
	const titleSim = similarityScore(a.title, b.title);
	const artistSim = similarityScore(a.artist, b.artist);
	const oneArtistContainsOther =
		normalizeString(a.artist).includes(normalizeString(b.artist)) ||
		normalizeString(b.artist).includes(normalizeString(a.artist));

	return titleSim >= 0.82 && (artistSim >= 0.72 || oneArtistContainsOther);
}

function upsertMergedResult(results: SearchResult[], candidate: SearchResult) {
	const existingIndex = results.findIndex((existing) => isLikelySameAlbum(existing, candidate));
	if (existingIndex === -1) {
		results.push(candidate);
		return;
	}

	const existing = results[existingIndex];

	if (existing.source === 'musicbrainz' && candidate.source === 'discogs') {
		if (!existing.coverArt && candidate.coverArt) {
			results[existingIndex] = { ...existing, coverArt: candidate.coverArt };
		}
		return;
	}

	if (existing.source === 'discogs' && candidate.source === 'musicbrainz') {
		results[existingIndex] = {
			...candidate,
			coverArt: candidate.coverArt || existing.coverArt
		};
		return;
	}

	const existingScore =
		(existing.coverArt ? 1 : 0) + (existing.releaseDate ? 1 : 0) + (existing.totalTracks ? 1 : 0);
	const candidateScore =
		(candidate.coverArt ? 1 : 0) +
		(candidate.releaseDate ? 1 : 0) +
		(candidate.totalTracks ? 1 : 0);
	if (candidateScore > existingScore) {
		results[existingIndex] = candidate;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const source = url.searchParams.get('source') || 'both'; 
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 50);

	if (!query) {
		return error(400, 'Query parameter "q" is required');
	}

	try {
		
		const cached = await getCachedResults(query, 'album');
		if (cached && cached.length > 0) {
			return json({ results: cached.slice(0, limit) });
		}

		const results: SearchResult[] = [];

		if (source === 'musicbrainz' || source === 'both') {
			try {
				const mbResults = await musicbrainz.searchReleases(query, Math.ceil(limit / 2));

				for (const release of mbResults) {
					const artistName = musicbrainz.formatArtistCredit(release['artist-credit']);

					const coverArtInfo = await musicbrainz.getCoverArtWithFallback(release.id, {
						artist: artistName,
						album: release.title
					});

					upsertMergedResult(results, {
						source: 'musicbrainz',
						id: release.id,
						title: release.title,
						artist: artistName,
						releaseDate: release.date,
						coverArt: coverArtInfo?.image || null,
						totalTracks: release['track-count'],
						externalUrl: `https://musicbrainz.org/release/${release.id}`,
						country: release.country,
						status: release.status
					});
				}
			} catch (err) {
				console.error('MusicBrainz search error:', err);
			}
		}

		if (source === 'discogs' || source === 'both') {
			try {
				const discogsResults = await discogs.searchReleases(query);

				for (const release of discogsResults) {
					const parsed = parseDiscogsArtistAndTitle(release);
					upsertMergedResult(results, {
						source: 'discogs',
						id: String(release.id),
						title: parsed.title,
						artist: parsed.artist,
						releaseDate: release.year || '',
						coverArt: release.thumb || release.cover_image,
						externalUrl: release.uri || release.resource_url
					});
				}
			} catch (err) {
				console.error('Discogs search error:', err);
			}
		}

		try {
			for (const r of results) {
				if (r.source === 'musicbrainz' && r.id) {
					indexAlbumFromMusicBrainz(r.id).catch((err) => console.error('Indexing MB failed:', err));
				} else if (r.source === 'discogs' && r.id) {
					indexAlbumFromDiscogs(String(r.id)).catch((err) =>
						console.error('Indexing Discogs failed:', err)
					);
				}
			}
		} catch (idxErr) {
			console.error('Background indexing error:', idxErr);
		}

		const normalizedQuery = normalizeString(query);
		const sortedResults = results.sort((a, b) => {
			const aExact = normalizeString(a.title) === normalizedQuery;
			const bExact = normalizeString(b.title) === normalizedQuery;
			if (aExact && !bExact) return -1;
			if (!aExact && bExact) return 1;

			if (a.source === 'musicbrainz' && b.source !== 'musicbrainz') return -1;
			if (a.source !== 'musicbrainz' && b.source === 'musicbrainz') return 1;

			const aContains = normalizeString(a.title).includes(normalizedQuery);
			const bContains = normalizeString(b.title).includes(normalizedQuery);
			if (aContains && !bContains) return -1;
			if (!aContains && bContains) return 1;

			const aDistance = levenshteinDistance(
				normalizedQuery,
				normalizeString(`${a.artist} ${a.title}`)
			);
			const bDistance = levenshteinDistance(
				normalizedQuery,
				normalizeString(`${b.artist} ${b.title}`)
			);
			if (aDistance !== bDistance) return aDistance - bDistance;

			return 0;
		});

		
		setCachedResults(query, 'album', sortedResults).catch((err) =>
			console.error('Error caching results:', err)
		);

		return json({ results: sortedResults.slice(0, limit) });
	} catch (err) {
		console.error('Search error:', err);
		return error(500, 'Search failed');
	}
};
