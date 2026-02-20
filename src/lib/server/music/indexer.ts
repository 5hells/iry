import { db } from '$lib/server/db';
import { album, track } from '$lib/server/db/schema';
import * as spotify from './spotify';
import * as discogs from './discogs';
import * as musicbrainz from './musicbrainz';
import { eq } from 'drizzle-orm';
import { linkExternalIdToAlbum, ensureAlbumSourceIds } from './id-resolver';

function isUuid(val: any) {
	return (
		typeof val === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
	);
}

function extractMusicBrainzGenres(mbRelease: any): string[] {
	const genres: string[] = [];

	if (mbRelease['release-group']?.['primary-type']) {
		genres.push(mbRelease['release-group']['primary-type']);
	}

	return genres;
}

function extractDiscogsGenres(discogsRelease: any): string[] {
	let genres: string[] = [];

	if (Array.isArray(discogsRelease.genre)) {
		genres = genres.concat(discogsRelease.genre);
	}
	if (Array.isArray(discogsRelease.style)) {
		genres = genres.concat(discogsRelease.style);
	}

	return [...new Set(genres)]; 
}

function parseDiscogsTrackNumber(position: string, defaultIndex: number): number {
	if (!position) return defaultIndex + 1;

	if (/^\d+$/.test(String(position).trim())) {
		return parseInt(position, 10);
	}

	return defaultIndex + 1;
}

function normalizePosition(pos: unknown): {
	normalized: string | null;
	prefix: string | null;
	num: number | null;
	sub: number | null;
} {
	if (pos === null || pos === undefined)
		return { normalized: null, prefix: null, num: null, sub: null };
	let s = String(pos).trim();
	if (!s) return { normalized: null, prefix: null, num: null, sub: null };

	s = s.replace(/^(side|disc|track)\s*/i, '');
	s = s.replace(/[-—–]/g, '.');
	s = s.replace(/\s*[:\-]\s*/g, '.');
	s = s.replace(/\s+/g, '');

	s = s.toUpperCase();

	const m1 = s.match(/^([A-Z]+)(\d+)(?:\.(\d+))?$/);
	if (m1) {
		const prefix = m1[1];
		const num = parseInt(m1[2], 10);
		const sub = m1[3] ? parseInt(m1[3], 10) : null;
		const normalized = sub ? `${prefix}${num}.${sub}` : `${prefix}${num}`;
		return { normalized, prefix, num, sub };
	}

	const m2 = s.match(/^(\d+)(?:\.(\d+))?$/);
	if (m2) {
		const num = parseInt(m2[1], 10);
		const sub = m2[2] ? parseInt(m2[2], 10) : null;
		const normalized = sub ? `${num}.${sub}` : `${num}`;
		return { normalized, prefix: null, num, sub };
	}

	const letters = (s.match(/^[A-Z]+/) || [null])[0];
	const numMatch = s.match(/(\d+)/);
	const num = numMatch ? parseInt(numMatch[1], 10) : null;
	const prefix = letters || null;
	const normalized = prefix && num ? `${prefix}${num}` : num ? `${num}` : s;
	return { normalized, prefix, num, sub: null };
}

/**
 * Parse Discogs track duration
 * Format: "MM:SS" or similar
 */
function parseDiscogsTrackDuration(duration?: string): number | null {
	if (!duration) return null;

	const parts = duration.split(':').map((p) => p.trim());
	if (parts.length === 2) {
		const minutes = parseInt(parts[0], 10);
		const seconds = parseInt(parts[1], 10);
		if (!isNaN(minutes) && !isNaN(seconds)) {
			return (minutes * 60 + seconds) * 1000;
		}
	}

	return null;
}

/**
 * Extract track info from MusicBrainz media structure
 */
function extractMusicBrainzTracks(mbRelease: any): Array<{
	title: string;
	trackNumber: number;
	durationMs: number | null;
	musicbrainzId: string;
	position?: string | null;
}> {
	const allTracks: Array<{
		title: string;
		trackNumber: number;
		durationMs: number | null;
		musicbrainzId: string;
		position?: string | null;
	}> = [];

	if (!mbRelease.media || !Array.isArray(mbRelease.media)) {
		return allTracks;
	}

	let globalTrackIndex = 1;
	for (let mediaIndex = 0; mediaIndex < mbRelease.media.length; mediaIndex++) {
		const media = mbRelease.media[mediaIndex];
		if (!media.tracks || !Array.isArray(media.tracks)) continue;

		for (let localIdx = 0; localIdx < media.tracks.length; localIdx++) {
			const t = media.tracks[localIdx];
			const musicbrainzId = t.recording?.id || t.id;
			const duration = t.length || t.recording?.length || null;

			if (musicbrainzId && t.title) {
				let position: string | null = null;
				if (t.number && String(t.number).trim() !== '') {
					position = String(t.number);
				} else {
					const sideLetter = String.fromCharCode(65 + mediaIndex);
					const within =
						t.position && String(t.position).trim()
							? String(t.position).trim()
							: String(localIdx + 1);
					position = `${sideLetter}${within}`;
				}
				allTracks.push({
					title: t.title,

					trackNumber: globalTrackIndex,
					durationMs: duration,
					musicbrainzId,
					position
				});
			}

			globalTrackIndex++;
		}
	}

	return allTracks;
}

/**
 * Extract track info from Discogs tracklist
 */
function extractDiscogsTracks(discogsRelease: any): Array<{
	title: string;
	trackNumber: number;
	durationMs: number | null;
	position?: string | null;
}> {
	const allTracks: Array<{
		title: string;
		trackNumber: number;
		durationMs: number | null;
		position?: string | null;
	}> = [];

	if (!discogsRelease.tracklist || !Array.isArray(discogsRelease.tracklist)) {
		return allTracks;
	}

	for (let i = 0; i < discogsRelease.tracklist.length; i++) {
		const t = discogsRelease.tracklist[i];
		if (!t.title) continue;

		const rawPos = t.position ? String(t.position) : null;
		const norm = normalizePosition(rawPos);
		allTracks.push({
			title: t.title,
			trackNumber: norm.num ?? parseDiscogsTrackNumber(t.position, i),
			durationMs: parseDiscogsTrackDuration(t.duration),
			position: norm.normalized ?? (rawPos || null)
		});
	}

	return allTracks;
}

function normalizeInsertTrackNumber(value: unknown, fallbackIndex: number) {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
		const match = String(value).match(/\d+/);
		if (match) return parseInt(match[0], 10);
	}
	return fallbackIndex + 1;
}

export async function indexAlbumFromSpotify(spotifyId: string) {
	const existing = await db.query.album.findFirst({
		where: eq(album.spotifyId, spotifyId)
	});

	if (existing) {
		return existing;
	}

	const spotifyAlbum = await spotify.getAlbum(spotifyId);
	if (!spotifyAlbum) {
		throw new Error('Album not found on Spotify');
	}

	let genres: string[] = [];
	if (spotifyAlbum.artists && spotifyAlbum.artists.length > 0) {
		genres = spotifyAlbum.genres || [];
	}

	const newAlbumData = {
		title: spotifyAlbum.name,
		artist: spotifyAlbum.artists.map((a) => a.name).join(', '),
		releaseDate: spotifyAlbum.release_date
	};

	let newAlbum = null;
	try {
		const duplicateDbId = await ensureAlbumSourceIds(spotifyId, 'spotify', newAlbumData);
		if (duplicateDbId) {
			newAlbum = await db.query.album.findFirst({
				where: eq(album.id, duplicateDbId)
			});
			if (newAlbum && !newAlbum.spotifyId) {
				await linkExternalIdToAlbum(duplicateDbId, spotifyId, 'spotify');
			}
		}
	} catch (e) {
		console.warn('Failed to check for duplicate album in ensureAlbumSourceIds:', e);
	}

	if (!newAlbum) {
		const inserted = await db
			.insert(album)
			.values({
				spotifyId: spotifyAlbum.id,
				title: spotifyAlbum.name,
				artist: spotifyAlbum.artists.map((a) => a.name).join(', '),
				releaseDate: spotifyAlbum.release_date,
				coverArtUrl: spotifyAlbum.images[0]?.url,
				genres: JSON.stringify(genres),
				totalTracks: spotifyAlbum.total_tracks,
				spotifyUri: spotifyAlbum.uri
			})
			.onConflictDoNothing({ target: album.spotifyId })
			.returning();

		newAlbum =
			inserted[0] ||
			(await db.query.album.findFirst({
				where: eq(album.spotifyId, spotifyId)
			}));
	}

	if (!newAlbum) {
		throw new Error('Failed to create Spotify album record');
	}

	const spotifyTracks = await spotify.getAlbumTracks(spotifyId);
	if (spotifyTracks.length > 0) {
		await db
			.insert(track)
			.values(
				spotifyTracks.map((t, idx) => {
					let pos: string | null = null;
					if ((t as any).disc_number && Number.isFinite((t as any).disc_number)) {
						const disc = Number((t as any).disc_number) || 1;
						const sideLetter = String.fromCharCode(65 + (disc - 1));
						pos = `${sideLetter}${t.track_number}`;
					} else if (t.track_number) {
						pos = String(t.track_number);
					}
					return {
						albumId: newAlbum.id,
						spotifyId: t.id,
						title: t.name,
						trackNumber: normalizeInsertTrackNumber(t.track_number, idx),
						durationMs: t.duration_ms,
						spotifyUri: t.uri,
						position: pos
					};
				})
			)
			.onConflictDoNothing({ target: track.spotifyId });
	}

	return newAlbum;
}

export async function indexAlbumFromMusicBrainz(musicbrainzId: string) {
	const existing = await db.query.album.findFirst({
		where: eq(album.musicbrainzId, musicbrainzId)
	});

	if (existing) {
		try {
			if (isUuid(existing.id)) {
				const existingTracks = await db.query.track.findMany({
					where: eq(track.albumId, existing.id)
				});

				if (!existingTracks || existingTracks.length === 0) {
				} else {
					const missingPos = existingTracks.some((t) => !t.position);
					if (!missingPos) {
						return existing;
					}
				}
			} else {
				console.warn('Skipping DB track lookup: album.id is not a UUID', existing.id);
			}
		} catch (e) {
			console.error('Error checking existing tracks for album:', existing.id, e);
		}
	}

	const mbRelease = await musicbrainz.getRelease(musicbrainzId);
	if (!mbRelease) {
		throw new Error('Release not found on MusicBrainz');
	}

	const artistName = musicbrainz.formatArtistCredit(mbRelease['artist-credit']);

	const coverArtInfo = await musicbrainz.getCoverArtWithFallback(musicbrainzId, {
		artist: artistName,
		album: mbRelease.title
	});
	const coverArtUrl = coverArtInfo?.image || null;

	const genres = extractMusicBrainzGenres(mbRelease);

	const newAlbumData = {
		title: mbRelease.title,
		artist: artistName,
		releaseDate: mbRelease.date
	};

	let newAlbum = null;
	try {
		const duplicateDbId = await ensureAlbumSourceIds(musicbrainzId, 'musicbrainz', newAlbumData);
		if (duplicateDbId) {
			newAlbum = await db.query.album.findFirst({
				where: eq(album.id, duplicateDbId)
			});
			if (newAlbum && !newAlbum.musicbrainzId) {
				await linkExternalIdToAlbum(duplicateDbId, musicbrainzId, 'musicbrainz');
			}
		}
	} catch (e) {
		console.warn('Failed to check for duplicate album in ensureAlbumSourceIds:', e);
	}

	if (!newAlbum) {
		const inserted = await db
			.insert(album)
			.values({
				musicbrainzId: mbRelease.id,
				title: mbRelease.title,
				artist: artistName,
				releaseDate: mbRelease.date,
				coverArtUrl: coverArtUrl,
				genres: JSON.stringify(genres),
				totalTracks: mbRelease['track-count'] || 0,
				musicbrainzUrl: `https://musicbrainz.org/release/${mbRelease.id}`
			})
			.onConflictDoNothing({ target: album.musicbrainzId })
			.returning();

		newAlbum =
			inserted[0] ||
			(await db.query.album.findFirst({
				where: eq(album.musicbrainzId, musicbrainzId)
			}));
	}

	if (!newAlbum) {
		throw new Error('Failed to create MusicBrainz album record');
	}

	const mbTracks = extractMusicBrainzTracks(mbRelease);
	if (mbTracks.length > 0) {
		const tracksToInsert = mbTracks.map((t, idx) => ({
			albumId: newAlbum.id,
			musicbrainzId: t.musicbrainzId,
			title: t.title,
			trackNumber: normalizeInsertTrackNumber(t.trackNumber, idx),
			durationMs: t.durationMs,
			position: t.position || null
		}));

		await db
			.insert(track)
			.values(tracksToInsert)
			.onConflictDoNothing({ target: track.musicbrainzId });

		for (const t of mbTracks) {
			try {
				if (!t.musicbrainzId) continue;
				const existing = await db.query.track.findFirst({
					where: eq(track.musicbrainzId, t.musicbrainzId)
				});
				if (existing && !existing.position && t.position) {
					await db.update(track).set({ position: t.position }).where(eq(track.id, existing.id));
				}
			} catch (e) {
				console.warn('Failed to update track position for MB track', t.musicbrainzId, e);
			}
		}
	}

	if (existing && isUuid(existing.id)) {
		try {
			await db
				.update(album)
				.set({
					totalTracks: mbRelease['track-count'] || existing.totalTracks,
					coverArtUrl: coverArtUrl || existing.coverArtUrl
				})
				.where(eq(album.id, existing.id));
		} catch (e) {
			console.error('Failed to update existing album metadata after indexing MB release:', e);
		}
	}

	return newAlbum;
}

export async function indexAlbumFromDiscogs(discogsId: string) {
	const discogsIdNum = parseInt(discogsId);

	const existing = await db.query.album.findFirst({
		where: eq(album.discogsId, discogsId)
	});

	if (existing) {
		try {
			if (isUuid(existing.id)) {
				const existingTracks = await db.query.track.findMany({
					where: eq(track.albumId, existing.id)
				});
				if (!existingTracks || existingTracks.length === 0) {
				} else {
					const missingPos = existingTracks.some((t) => !t.position);
					if (!missingPos) {
						return existing;
					}
				}
			} else {
				console.warn(
					'Skipping DB track lookup for Discogs album: album.id is not a UUID',
					existing.id
				);
			}
		} catch (e) {
			console.error('Error checking existing tracks for discogs album:', existing.id, e);
		}
	}

	const discogsRelease = await discogs.getRelease(discogsIdNum);
	if (!discogsRelease) {
		throw new Error('Release not found on Discogs');
	}

	const artistName =
		discogs.cleanDiscogsArtistName(
			discogsRelease.artist || (discogsRelease as any).artists?.[0]?.name || 'Unknown Artist'
		) || 'Unknown Artist';

	const discogsGenres = extractDiscogsGenres(discogsRelease);
	const discogsTracks = extractDiscogsTracks(discogsRelease);

	const newAlbumData = {
		title: discogsRelease.title,
		artist: artistName,
		releaseDate: discogsRelease.year?.toString() || null
	};

	let newAlbum = null;
	try {
		const duplicateDbId = await ensureAlbumSourceIds(discogsId, 'discogs', newAlbumData);
		if (duplicateDbId) {
			newAlbum = await db.query.album.findFirst({
				where: eq(album.id, duplicateDbId)
			});
			if (newAlbum && !newAlbum.discogsId) {
				await linkExternalIdToAlbum(duplicateDbId, discogsId, 'discogs');
			}
		}
	} catch (e) {
		console.warn('Failed to check for duplicate album in ensureAlbumSourceIds:', e);
	}

	if (!newAlbum) {
		const inserted = await db
			.insert(album)
			.values({
				discogsId: discogsId,
				title: discogsRelease.title,
				artist: artistName,
				releaseDate: discogsRelease.year?.toString() || null,
				coverArtUrl: discogsRelease.cover_image || discogsRelease.thumb,
				genres: JSON.stringify(discogsGenres),
				totalTracks: discogsTracks.length,
				discogsUrl: discogsRelease.uri || discogsRelease.resource_url
			})
			.onConflictDoNothing({ target: album.discogsId })
			.returning();

		newAlbum =
			inserted[0] ||
			(await db.query.album.findFirst({
				where: eq(album.discogsId, discogsId)
			}));
	}

	if (!newAlbum) {
		throw new Error('Failed to create Discogs album record');
	}

	if (discogsTracks.length > 0) {
		const existingTracks = await db.query.track.findMany({ where: eq(track.albumId, newAlbum.id) });

		const existingByPos = new Set<string>();
		const existingByTitleAndNum = new Set<string>();
		const existingTrackNumbers = new Set<number>();

		for (const et of existingTracks) {
			if (et.position) existingByPos.add(String(et.position).toLowerCase());
			if (et.title) existingByTitleAndNum.add(`${String(et.title).toLowerCase()}::${et.trackNumber}`);
			if (et.trackNumber) existingTrackNumbers.add(et.trackNumber);
		}

		const tracksToInsert = [] as Array<any>;
		for (let idx = 0; idx < discogsTracks.length; idx++) {
			const t = discogsTracks[idx];
			const normalizedNumber = normalizeInsertTrackNumber(t.trackNumber, idx);
			const pos = t.position || null;

			const titleKey = `${String(t.title || '').toLowerCase()}::${normalizedNumber}`;
			const posKey = pos ? String(pos).toLowerCase() : null;

			if ((posKey && existingByPos.has(posKey)) || existingByTitleAndNum.has(titleKey)) {
				continue;
			}

			if (existingTrackNumbers.has(normalizedNumber) && !(t.title && t.title.trim())) {
				continue;
			}

			tracksToInsert.push({
				albumId: newAlbum.id,
				title: t.title,
				trackNumber: normalizedNumber,
				durationMs: t.durationMs,
				position: pos || null
			});
		}

		if (tracksToInsert.length > 0) {
			await db.insert(track).values(tracksToInsert);
		}

		for (const t of discogsTracks) {
			try {
				const match = await db.query.track.findMany({ where: eq(track.albumId, newAlbum.id) });
				const candidate = match.find(
					(m) => String(m.title || '').toLowerCase() === String(t.title || '').toLowerCase()
				);
				if (candidate && !candidate.position && t.position) {
					await db.update(track).set({ position: t.position }).where(eq(track.id, candidate.id));
				}
			} catch (e) {
				console.warn('Failed to update track position for Discogs track', t.title, e);
			}
		}
	}

	return newAlbum;
}

export async function getOrCreateAlbum(
	musicbrainzId?: string,
	spotifyId?: string,
	discogsId?: string
) {
	let mbId = musicbrainzId;
	let spId = spotifyId;
	let dcId = discogsId;

	if (!mbId && spId && dcId === undefined) {
	}

	const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	if (mbId && !uuidRe.test(String(mbId))) {
		if (spId && /^[0-9]+$/.test(String(spId))) {
			dcId = String(spId);
			spId = String(mbId);
			mbId = undefined;
		} else if (dcId && /^[0-9]+$/.test(String(dcId))) {
			spId = String(mbId);
			mbId = undefined;
		}
	}

	if (!mbId) {
		if (spId && uuidRe.test(String(spId))) {
			mbId = spId;
			spId = undefined;
		} else if (dcId && uuidRe.test(String(dcId))) {
			mbId = String(dcId);
			dcId = undefined;
		}
	}

	if (mbId) {
		return await indexAlbumFromMusicBrainz(mbId);
	}
	if (dcId) {
		return await indexAlbumFromDiscogs(dcId);
	}
	if (spId) {
		return await indexAlbumFromSpotify(spId);
	}

	throw new Error('Either musicbrainzId, spotifyId, or discogsId must be provided');
}
