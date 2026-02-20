import { db } from '$lib/server/db';
import { album } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import * as spotify from './spotify';
import { findClosestMatch, normalizeString } from '$lib/utils/levenshtein';

export async function linkDiscogsToSpotify(discogsAlbum: {
	id?: number;
	title: string;
	artist?: string;
	releaseDate?: string;
}): Promise<string | null> {
	try {
		const searchQuery = `${discogsAlbum.title} ${discogsAlbum.artist || ''}`.trim();
		const spotifyResults = await spotify.searchAlbums(searchQuery, 5);

		if (!spotifyResults || spotifyResults.length === 0) {
			return null;
		}

		let bestMatch = null;
		let bestScore = 0;

		for (const result of spotifyResults) {
			let score = 0;
			const normTitle = normalizeString(discogsAlbum.title);
			const normArtist = normalizeString(discogsAlbum.artist || '');
			const resultTitle = normalizeString(result.name);
			const resultArtist = normalizeString(
				result.artists?.map((a: any) => a.name).join(', ') || ''
			);

			if (normTitle === resultTitle) {
				score += 10;
			} else if (resultTitle.includes(normTitle) || normTitle.includes(resultTitle)) {
				score += 7;
			}

			if (normArtist === resultArtist) {
				score += 5;
			} else if (
				resultArtist.includes(normArtist) ||
				(normArtist && resultArtist.split(',')[0] === normArtist.split(',')[0])
			) {
				score += 3;
			}

			if (discogsAlbum.releaseDate && result.release_date) {
				const discogsYear = discogsAlbum.releaseDate.substring(0, 4);
				const spotifyYear = result.release_date.substring(0, 4);
				if (discogsYear === spotifyYear) {
					score += 2;
				} else if (Math.abs(parseInt(discogsYear) - parseInt(spotifyYear)) <= 1) {
					score += 1;
				}
			}

			if (score > bestScore) {
				bestScore = score;
				bestMatch = result;
			}
		}

		return bestScore >= 10 ? bestMatch?.id! : null;
	} catch (error) {
		console.error('Failed to link Discogs to Spotify:', error);
		return null;
	}
}

/**
 * Get or create an album, linking Discogs to Spotify if needed
 */
export async function getOrCreateAlbumWithLinking(spotifyId?: string, discogsId?: string | number) {
	if (spotifyId) {
		const existing = await db.query.album.findFirst({
			where: eq(album.spotifyId, spotifyId)
		});
		if (existing) return existing;
	}

	if (discogsId) {
		const existing = await db.query.album.findFirst({
			where: eq(album.discogsId, String(discogsId))
		});
		if (existing) {
			if (!existing.spotifyId) {
				const linkedSpotifyId = await linkDiscogsToSpotify({
					id: Number(discogsId),
					title: existing.title,
					artist: existing.artist,
					releaseDate: existing.releaseDate || undefined
				});
				if (linkedSpotifyId) {
					await db
						.update(album)
						.set({ spotifyId: linkedSpotifyId })
						.where(eq(album.id, existing.id));
					return {
						...existing,
						spotifyId: linkedSpotifyId
					};
				}
			}
			return existing;
		}
	}

	return null;
}

/**
 * Create album from Discogs with Spotify linking
 */
export async function createAlbumFromDiscogsWithSpotify(
	discogsId: number,
	discogsData: {
		title: string;
		artists?: Array<{ name: string }>;
		releaseDate?: string;
		images?: Array<{ url: string }>;
		genres?: string[];
		tracklist?: Array<any>;
		url?: string;
	}
) {
	let spotifyId = null;
	const spotifyMatch = await linkDiscogsToSpotify({
		id: discogsId,
		title: discogsData.title,
		artist: discogsData.artists?.[0]?.name,
		releaseDate: discogsData.releaseDate
	});

	if (spotifyMatch) {
		spotifyId = spotifyMatch;
	}

	const newAlbum = await db.insert(album).values({
		spotifyId: spotifyId,
		discogsId: String(discogsId),
		title: discogsData.title,
		artist: discogsData.artists?.map((a: any) => a.name).join(', ') || 'Unknown',
		releaseDate: discogsData.releaseDate || null,
		coverArtUrl: discogsData.images?.[0]?.url || null,
		genres: discogsData.genres ? JSON.stringify(discogsData.genres) : JSON.stringify([]),
		discogsUrl: discogsData.url || null
	});

	return newAlbum;
}
