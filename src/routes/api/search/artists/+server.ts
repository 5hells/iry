import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as spotify from '$lib/server/music/spotify';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import { levenshteinDistance, normalizeString } from '$lib/utils/levenshtein';
import { getCachedResults, setCachedResults } from '$lib/server/search-cache';

type ArtistSearchResult = {
	source: 'musicbrainz' | 'discogs' | 'spotify';
	id: string;
	name: string;
	imageUrl?: string | null;
	genres?: string[];
	externalUrl?: string;
	popularity?: number;
	type?: string;
};

const SOURCE_PRIORITY: Record<ArtistSearchResult['source'], number> = {
	musicbrainz: 3,
	discogs: 2,
	spotify: 1
};

function parseDiscogsArtistName(raw: string): string {
	if (!raw) return 'Unknown Artist';
	const base = raw.includes(' - ') ? raw.split(' - ')[0].trim() : raw.trim();
	return discogs.cleanDiscogsArtistName(base) || 'Unknown Artist';
}

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

	if (!query) {
		return error(400, 'Query parameter "q" is required');
	}

	try {
		
		const cached = await getCachedResults(query, 'artist');
		if (cached && cached.length > 0) {
			const withUrls = cached.map((a: any) => ({
				...a,
				artistUrl: `/artist/${a.source}/${a.id}`,
				releasesUrl: `/api/artist/${a.source}/${a.id}/releases`
			}));
			return json({ results: withUrls.slice(0, limit) });
		}

		const results: ArtistSearchResult[] = [];

		let mbResults: any[] = [];
		let discogsResults: any[] = [];

		try {
			mbResults = await musicbrainz.searchArtists(query, Math.min(limit, 20));

			for (const mbArtist of mbResults) {
				results.push({
					source: 'musicbrainz',
					id: mbArtist.id,
					name: mbArtist.name,
					imageUrl: null,
					genres: [],
					externalUrl: `https://musicbrainz.org/artist/${mbArtist.id}`,
					type: mbArtist.type
				});
			}
		} catch (err) {
			console.error('MusicBrainz artist search error:', err);
		}

		
		if (results.length < limit) {
			try {
				discogsResults = await discogs.searchReleases(query, 'artist');

				const uniqueArtists = new Map<
					string,
					{ id: string; name: string; thumb?: string; uri?: string }
				>();
				for (const release of discogsResults) {
					const typed = release as {
						id?: number | string;
						title?: string;
						thumb?: string;
						uri?: string;
						resource_url?: string;
					};
					const id = String(typed.id ?? '');
					if (!id) continue;
					if (!uniqueArtists.has(id)) {
						uniqueArtists.set(id, {
							id,
							name: parseDiscogsArtistName(typed.title || ''),
							thumb: typed.thumb,
							uri: typed.uri || typed.resource_url
						});
					}
				}

				for (const [, discogsArtist] of uniqueArtists) {
					if (results.length >= limit) break;

					results.push({
						source: 'discogs',
						id: discogsArtist.id,
						name: discogsArtist.name,
						imageUrl: discogsArtist.thumb || null,
						genres: [],
						externalUrl: discogsArtist.uri
					});
				}
			} catch (err) {
				console.error('Discogs artist search error:', err);
			}
		}

		if ((mbResults.length === 0) && (discogsResults.length === 0)) {
			if (results.length < limit) {
				try {
					const spotifyResults = await spotify.searchArtists(query, Math.min(limit - results.length, 10));

					for (const artist of spotifyResults) {
						results.push({
							source: 'spotify',
							id: artist.id,
							name: artist.name,
							imageUrl: artist.images?.[0]?.url || null,
							genres: artist.genres || [],
							externalUrl: artist.external_urls?.spotify,
							popularity: artist.popularity
						});
					}
				} catch (err) {
					console.error('Spotify artist search error:', err);
				}
			}
		} else {
			// skip
		}

		const normalizedQuery = normalizeString(query);
		const decorated = results.map((item) => {
			const normalizedName = normalizeString(item.name);
			return {
				item,
				normalizedName,
				distance: levenshteinDistance(normalizedQuery, normalizedName),
				exact: normalizedName === normalizedQuery,
				contains: normalizedName.includes(normalizedQuery)
			};
		});

		decorated.sort((a, b) => {
			if (a.exact !== b.exact) return a.exact ? -1 : 1;
			if (a.contains !== b.contains) return a.contains ? -1 : 1;
			if (a.distance !== b.distance) return a.distance - b.distance;
			const rankDiff = SOURCE_PRIORITY[b.item.source] - SOURCE_PRIORITY[a.item.source];
			if (rankDiff !== 0) return rankDiff;
			return (b.item.popularity || 0) - (a.item.popularity || 0);
		});

		const dedupedByName = new Map<string, (typeof decorated)[number]>();
		for (const candidate of decorated) {
			const existing = dedupedByName.get(candidate.normalizedName);
			if (!existing) {
				dedupedByName.set(candidate.normalizedName, candidate);
				continue;
			}

			const candidateRank = SOURCE_PRIORITY[candidate.item.source];
			const existingRank = SOURCE_PRIORITY[existing.item.source];
			if (candidateRank > existingRank) {
				dedupedByName.set(candidate.normalizedName, candidate);
				continue;
			}
			if (candidateRank === existingRank && candidate.distance < existing.distance) {
				dedupedByName.set(candidate.normalizedName, candidate);
			}
		}

		const sortedResults = Array.from(dedupedByName.values()).map((d) => d.item);

		
		setCachedResults(query, 'artist', sortedResults).catch((err) =>
			console.error('Error caching artist results:', err)
		);

		
		const withUrls = sortedResults.map((a) => ({
			...a,
			artistUrl: `/artist/${a.source}/${a.id}`,
			releasesUrl: `/api/artist/${a.source}/${a.id}/releases`
		}));

		return json({ results: withUrls.slice(0, limit) });
	} catch (err) {
		console.error('Artist search error:', err);
		return error(500, 'Artist search failed');
	}
};
