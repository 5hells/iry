import { db } from '$lib/server/db';
import { album } from '$lib/server/db/schema';
import { eq, or } from 'drizzle-orm';
import { levenshteinDistance, normalizeString } from '$lib/utils/levenshtein';


export async function findAlbumBySourceId(
	sourceId: string,
	source?: 'musicbrainz' | 'discogs' | 'spotify'
): Promise<any | null> {
	try {
		if (source === 'musicbrainz') {
			return await db.query.album.findFirst({
				where: eq(album.musicbrainzId, sourceId)
			});
		} else if (source === 'discogs') {
			return await db.query.album.findFirst({
				where: eq(album.discogsId, sourceId)
			});
		} else if (source === 'spotify') {
			return await db.query.album.findFirst({
				where: eq(album.spotifyId, sourceId)
			});
		} else {
			return await db.query.album.findFirst({
				where: or(
					eq(album.musicbrainzId, sourceId),
					eq(album.discogsId, sourceId),
					eq(album.spotifyId, sourceId)
				)
			});
		}
	} catch (error) {
		console.error(`Error finding album by source ID ${sourceId}:`, error);
		return null;
	}
}

export async function resolveIdToUuid(
	externalId: string,
	source?: 'musicbrainz' | 'discogs' | 'spotify'
): Promise<string | null> {
	const found = await findAlbumBySourceId(externalId, source);
	if (found && found.id) {
		return found.id;
	}
	return null;
}

export function albumSimilarityScore(
	album1: { artist: string; title: string },
	album2: { artist: string; title: string }
): number {
	const artistSim = stringSimilarity(album1.artist, album2.artist);
	const titleSim = stringSimilarity(album1.title, album2.title);

	return artistSim * 0.3 + titleSim * 0.7;
}

export function stringSimilarity(a: string, b: string): number {
	const normalizedA = normalizeString(a);
	const normalizedB = normalizeString(b);

	if (!normalizedA || !normalizedB) return 0;
	if (normalizedA === normalizedB) return 1;

	const distance = levenshteinDistance(normalizedA, normalizedB);
	const maxLen = Math.max(normalizedA.length, normalizedB.length);
	return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

export async function findMatchingAlbum(
	newAlbumData: { artist: string; title: string },
	threshold = 0.85
): Promise<string | null> {
	try {
		const existingAlbums = await db.query.album.findMany({
			limit: 100 
		});

		let bestMatch = null;
		let bestScore = 0;

		for (const existing of existingAlbums) {
			const score = albumSimilarityScore(newAlbumData, {
				artist: existing.artist,
				title: existing.title
			});

			if (score > bestScore) {
				bestScore = score;
				if (score >= threshold) {
					bestMatch = existing;
				}
			}
		}

		return bestMatch?.id || null;
	} catch (error) {
		console.error('Error finding matching album:', error);
		return null;
	}
}

export async function linkExternalIdToAlbum(
	albumId: string,
	externalId: string,
	source: 'musicbrainz' | 'discogs' | 'spotify'
): Promise<boolean> {
	try {
		const updateData: Record<string, string> = {};
		if (source === 'musicbrainz') {
			updateData.musicbrainzId = externalId;
		} else if (source === 'discogs') {
			updateData.discogsId = externalId;
		} else if (source === 'spotify') {
			updateData.spotifyId = externalId;
		}

		await db.update(album).set(updateData).where(eq(album.id, albumId));
		console.log(`Linked ${source} ID ${externalId} to album ${albumId}`);
		return true;
	} catch (error) {
		console.error(`Error linking ${source} ID to album:`, error);
		return false;
	}
}

export async function ensureAlbumSourceIds(
	externalId: string,
	source: 'musicbrainz' | 'discogs' | 'spotify',
	albumData: { artist: string; title: string }
): Promise<string | null> {
	const existing = await findAlbumBySourceId(externalId, source);
	if (existing && existing.id) {
		return existing.id;
	}

	const matchedId = await findMatchingAlbum(albumData, 0.85);
	if (matchedId) {
		await linkExternalIdToAlbum(matchedId, externalId, source);
		return matchedId;
	}

	return null;
}
