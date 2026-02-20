import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { track, album } from '$lib/server/db/schema';
import { like, or, sql } from 'drizzle-orm';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import { indexAlbumFromMusicBrainz, indexAlbumFromDiscogs } from '$lib/server/music/indexer';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

	if (!query) {
		return error(400, 'Query parameter "q" is required');
	}

	try {
		let tracks = await db
			.select({
				id: track.id,
				musicbrainzTrackId: track.musicbrainzId,
				spotifyTrackId: track.spotifyId,
				title: track.title,
				trackNumber: track.trackNumber,
				durationMs: track.durationMs,
				spotifyUri: track.spotifyUri,
				albumId: track.albumId,
				musicbrainzAlbumId: album.musicbrainzId,
				spotifyAlbumId: album.spotifyId,
				albumTitle: album.title,
				albumArtist: album.artist,
				albumCoverArt: album.coverArtUrl
			})
			.from(track)
			.innerJoin(album, sql`${track.albumId} = ${album.id}`)
			.where(
				or(
					like(track.title, `%${query}%`),
					like(album.title, `%${query}%`),
					like(album.artist, `%${query}%`)
				)
			)
			.limit(limit);

		if (tracks.length === 0) {
			try {
				const matchingAlbums = await db
					.select({
						id: album.id,
						musicbrainzId: album.musicbrainzId,
						discogsId: album.discogsId,
						spotifyId: album.spotifyId
					})
					.from(album)
					.where(or(like(album.title, `%${query}%`), like(album.artist, `%${query}%`)))
					.limit(8);

				for (const ma of matchingAlbums) {
					try {
						if (ma.musicbrainzId) {
							await indexAlbumFromMusicBrainz(ma.musicbrainzId);
						} else if (ma.discogsId) {
							await indexAlbumFromDiscogs(ma.discogsId);
						}
					} catch (e) {
						console.error('Failed to index existing album from DB:', e);
					}
				}

				tracks = await db
					.select({
						id: track.id,
						musicbrainzTrackId: track.musicbrainzId,
						spotifyTrackId: track.spotifyId,
						title: track.title,
						trackNumber: track.trackNumber,
						durationMs: track.durationMs,
						spotifyUri: track.spotifyUri,
						albumId: track.albumId,
						musicbrainzAlbumId: album.musicbrainzId,
						spotifyAlbumId: album.spotifyId,
						albumTitle: album.title,
						albumArtist: album.artist,
						albumCoverArt: album.coverArtUrl
					})
					.from(track)
					.innerJoin(album, sql`${track.albumId} = ${album.id}`)
					.where(
						or(
							like(track.title, `%${query}%`),
							like(album.title, `%${query}%`),
							like(album.artist, `%${query}%`)
						)
					)
					.limit(limit);
			} catch (indexDbErr) {
				console.error('Error while indexing matching DB albums:', indexDbErr);
			}
		}

		if (tracks.length === 0) {
			const mbRecordings = await musicbrainz.searchRecordings(query, limit).catch(() => []);

			if (mbRecordings.length > 0) {
				const releaseIds = Array.from(
					new Set(
						mbRecordings
							.flatMap((r) => r.releases || [])
							.map((rel) => rel.id)
							.filter(Boolean)
					)
				).slice(0, 12);

				for (const releaseId of releaseIds) {
					try {
						await indexAlbumFromMusicBrainz(releaseId);
					} catch (indexError) {
						console.error(`Failed to index MusicBrainz album ${releaseId}:`, indexError);
					}
				}

				tracks = await db
					.select({
						id: track.id,
						musicbrainzTrackId: track.musicbrainzId,
						spotifyTrackId: track.spotifyId,
						title: track.title,
						trackNumber: track.trackNumber,
						durationMs: track.durationMs,
						spotifyUri: track.spotifyUri,
						albumId: track.albumId,
						musicbrainzAlbumId: album.musicbrainzId,
						spotifyAlbumId: album.spotifyId,
						albumTitle: album.title,
						albumArtist: album.artist,
						albumCoverArt: album.coverArtUrl
					})
					.from(track)
					.innerJoin(album, sql`${track.albumId} = ${album.id}`)
					.where(
						or(
							like(track.title, `%${query}%`),
							like(album.title, `%${query}%`),
							like(album.artist, `%${query}%`)
						)
					)
					.limit(limit);

				if (tracks.length === 0) {
					tracks = mbRecordings.slice(0, limit).map((r) => {
						const release = r.releases?.[0];
						const artistName = musicbrainz.formatArtistCredit(r['artist-credit']);

						return {
							id: r.id,
							musicbrainzTrackId: r.id,
							spotifyTrackId: null,
							title: r.title,
							trackNumber: 0,
							durationMs: r.length || null,
							spotifyUri: null,
							albumId: '',
							musicbrainzAlbumId: release?.id || '',
							spotifyAlbumId: null,
							albumTitle: release?.title || 'Unknown',
							albumArtist: artistName,
							albumCoverArt: null
						};
					});
				}

				if (tracks.length > 0) {
					return json({ tracks });
				}
			}

			try {
				const discogsResults = await discogs.searchReleases(query).catch(() => []);
				const discogsIds = discogsResults.map((r) => r.id).slice(0, 8);
				for (const did of discogsIds) {
					try {
						await indexAlbumFromDiscogs(String(did));
					} catch (idxErr) {
						console.error(`Failed to index Discogs album ${did}:`, idxErr);
					}
				}

				tracks = await db
					.select({
						id: track.id,
						musicbrainzTrackId: track.musicbrainzId,
						spotifyTrackId: track.spotifyId,
						title: track.title,
						trackNumber: track.trackNumber,
						durationMs: track.durationMs,
						spotifyUri: track.spotifyUri,
						albumId: track.albumId,
						musicbrainzAlbumId: album.musicbrainzId,
						spotifyAlbumId: album.spotifyId,
						albumTitle: album.title,
						albumArtist: album.artist,
						albumCoverArt: album.coverArtUrl
					})
					.from(track)
					.innerJoin(album, sql`${track.albumId} = ${album.id}`)
					.where(
						or(
							like(track.title, `%${query}%`),
							like(album.title, `%${query}%`),
							like(album.artist, `%${query}%`)
						)
					)
					.limit(limit);

				if (tracks.length > 0) {
					return json({ tracks });
				}
			} catch (discErr) {
				console.error('Discogs fallback error:', discErr);
			}
		}

		return json({ tracks });
	} catch (err) {
		console.error('Track search error:', err);
		return error(500, 'Track search failed');
	}
};
