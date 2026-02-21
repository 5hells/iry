import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { album, track } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import * as spotify from '$lib/server/music/spotify';

function normalizeTrackNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
		const match = value.match(/\d+/);
		if (match) {
			const n = parseInt(match[0], 10);
			if (Number.isFinite(n) && n > 0) return n;
		}
	}
	return fallback;
}

export const GET: RequestHandler = async ({ params }) => {
	const { source, id } = params;

	if (!source || !id) {
		return error(400, 'Missing source or id parameter');
	}

	try {
		let tracks: any[] = [];
		let fallbackTitle = '';
		let fallbackArtist = '';

		const dbAlbum =
			source === 'musicbrainz'
				? await db.query.album.findFirst({ where: eq(album.musicbrainzId, id) })
				: source === 'discogs'
					? await db.query.album.findFirst({ where: eq(album.discogsId, id) })
					: await db.query.album.findFirst({ where: eq(album.id, id) });

		if (dbAlbum) {
			const dbTracks = await db.query.track.findMany({
				where: eq(track.albumId, dbAlbum.id),
				orderBy: [asc(track.trackNumber), asc(track.title)]
			});

			if (dbTracks.length > 0) {
				tracks = dbTracks.map((dbTrack) => ({
					id: dbTrack.id,
					spotifyId: dbTrack.spotifyId,
					musicbrainzId: dbTrack.musicbrainzId,
					title: dbTrack.title,
					duration: dbTrack.durationMs ? Math.floor(dbTrack.durationMs / 1000) : null,
					trackNumber: dbTrack.trackNumber,
					position: dbTrack.position || null,
					artist: fallbackArtist
				}));

				return json({
					tracks: tracks
						.map((trackRow, index) => ({
							...trackRow,
							trackNumber: normalizeTrackNumber(trackRow.trackNumber, index + 1)
						}))
						.sort((a, b) => {
							const aNum = normalizeTrackNumber(a.trackNumber, Number.MAX_SAFE_INTEGER);
							const bNum = normalizeTrackNumber(b.trackNumber, Number.MAX_SAFE_INTEGER);
							if (aNum !== bNum) return aNum - bNum;
							return String(a.title || '').localeCompare(String(b.title || ''));
						})
				});
			}

			fallbackTitle = dbAlbum.title || '';
			fallbackArtist = discogs.cleanDiscogsArtistName(dbAlbum.artist || '') || dbAlbum.artist || '';
		}

		if (source === 'musicbrainz') {
			let mbRelease = await musicbrainz.getRelease(id);
			if (!mbRelease) {
				const preferredRelease = await musicbrainz.getPreferredReleaseFromReleaseGroup(id);
				if (preferredRelease?.id) {
					mbRelease = await musicbrainz.getRelease(preferredRelease.id);
				}
			}
			if (mbRelease && mbRelease.media) {
				fallbackTitle = mbRelease.title || '';
				fallbackArtist = musicbrainz.formatArtistCredit(mbRelease['artist-credit']) || '';
				let fallbackTrackIndex = 1;
				tracks = mbRelease.media.flatMap((media: any, mediaIndex: number) => {
					const mediaTracks = media.tracks || [];
					const sideLetter = String.fromCharCode(65 + mediaIndex); // 0->A, 1->B
					return mediaTracks.map((track: any, localIdx: number) => {
						const title = track.title || track.recording?.title || '';
						let pos: string | null = null;
						if (track.number && String(track.number).trim() !== '') {
							pos = String(track.number);
						} else if (track.position) {
							pos = `${sideLetter}${String(track.position).trim()}`;
						} else {
							pos = `${sideLetter}${localIdx + 1}`;
						}
						const mapped = {
							id: track.recording?.id || track.id,
							title,
							duration: track.length ? Math.floor(track.length / 1000) : null,

							trackNumber: fallbackTrackIndex,
							position: pos,
							artist: musicbrainz.formatArtistCredit(track.recording?.['artist-credit'])
						};
						fallbackTrackIndex += 1;
						return mapped;
					});
				});
			}
		} else if (source === 'discogs') {
			const release = await discogs.getRelease(parseInt(id, 10));
			if (release) {
				fallbackTitle = release.title || '';
				fallbackArtist =
					discogs.cleanDiscogsArtistName(
						release.artist || (release as any).artists?.[0]?.name || ''
					) || '';
				tracks = (release.tracklist || []).map((t: any, idx: number) => ({
					id: `${release.id}-${idx + 1}`,
					title: t.title,
					duration: t.duration
						? (() => {
								const parts = String(t.duration).split(':');
								if (parts.length !== 2) return null;
								const m = parseInt(parts[0], 10);
								const s = parseInt(parts[1], 10);
								if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
								return m * 60 + s;
							})()
						: null,
					trackNumber: normalizeTrackNumber(t.position, idx + 1),
					position: t.position ? String(t.position) : null,
					artist: fallbackArtist
				}));
			}
		}

		if (tracks.length === 0 && fallbackTitle && fallbackArtist) {
			try {
				const spotifyAlbums = await spotify.searchAlbums(`${fallbackArtist} ${fallbackTitle}`, 5);
				if (spotifyAlbums.length > 0) {
					const spotifyTracks = await spotify.getAlbumTracks(spotifyAlbums[0].id);
					tracks = spotifyTracks.map((t) => {
						let pos: string | null = null;
						if ((t as any).disc_number && Number.isFinite((t as any).disc_number)) {
							const disc = Number((t as any).disc_number) || 1;
							const sideLetter = String.fromCharCode(65 + (disc - 1));
							pos = `${sideLetter}${t.track_number}`;
						} else if (t.track_number) {
							pos = String(t.track_number);
						}
						return {
							id: t.id,
							title: t.name,
							duration: t.duration_ms ? Math.floor(t.duration_ms / 1000) : null,
							trackNumber: normalizeTrackNumber(t.track_number, 0),
							position: pos,
							artist: fallbackArtist
						};
					});
				}
			} catch (spotifyErr) {
				console.warn('Spotify fallback track fetch failed:', spotifyErr);
			}
		}

		return json({
			tracks: tracks
				.map((t, idx) => ({ ...t, trackNumber: normalizeTrackNumber(t.trackNumber, idx + 1) }))
				.sort((a, b) => {
					const aNum = normalizeTrackNumber(a.trackNumber, Number.MAX_SAFE_INTEGER);
					const bNum = normalizeTrackNumber(b.trackNumber, Number.MAX_SAFE_INTEGER);
					if (aNum !== bNum) return aNum - bNum;
					return String(a.title || '').localeCompare(String(b.title || ''));
				})
		});
	} catch (err) {
		console.error('Error fetching album tracks:', err);
		return error(500, 'Failed to fetch album tracks');
	}
};
