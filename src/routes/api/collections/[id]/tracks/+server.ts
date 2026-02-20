import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection, collectionTrack, track, album } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		const role = (locals.user as any)?.role;
		if (coll.userId !== locals.user.id && role !== 'admin' && role !== 'moderator') {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const {
			trackId,
			musicbrainzTrackId,
			musicbrainzAlbumId,
			discogsTrackId,
			discogsAlbumId,
			description
		} = body;

		let dbTrackId: string | null = null;

		if (trackId) {
			const dbTrack = await db.query.track.findFirst({
				where: eq(track.id, trackId)
			});
			if (dbTrack) {
				dbTrackId = dbTrack.id;
			} else {
				const mbTrack = await db.query.track.findFirst({
					where: eq(track.musicbrainzId, trackId)
				});
				if (mbTrack) {
					dbTrackId = mbTrack.id;
				}
			}
		} else if (musicbrainzTrackId) {
			const existingTrack = await db.query.track.findFirst({
				where: eq(track.musicbrainzId, musicbrainzTrackId)
			});
			if (existingTrack) {
				dbTrackId = existingTrack.id;
			} else {
				let albumId: string | null = null;

				if (musicbrainzAlbumId) {
					let dbAlbum = await db.query.album.findFirst({
						where: eq(album.musicbrainzId, musicbrainzAlbumId)
					});

					if (!dbAlbum) {
						const mbRelease = await musicbrainz.getRelease(musicbrainzAlbumId);
						if (mbRelease) {
							const artistName = musicbrainz.formatArtistCredit(mbRelease['artist-credit']);
							const coverArtInfo = await musicbrainz.getCoverArtWithFallback(musicbrainzAlbumId, {
								artist: artistName,
								album: mbRelease.title
							});
							const coverArtUrl = coverArtInfo?.image || null;

							const newAlbum = await db
								.insert(album)
								.values({
									musicbrainzId: musicbrainzAlbumId,
									title: mbRelease.title,
									artist: artistName,
									releaseDate: mbRelease.date,
									coverArtUrl: coverArtUrl,
									genres: JSON.stringify([]),
									totalTracks: mbRelease['track-count'] || 0,
									musicbrainzUrl: `https://musicbrainz.org/release/${musicbrainzAlbumId}`
								})
								.returning();

							dbAlbum = newAlbum[0];
						}
					}

					albumId = dbAlbum?.id || null;
				}

				const trackData: any = {
					musicbrainzId: musicbrainzTrackId,
					title: 'Unknown Track',
					trackNumber: 0,
					durationMs: null
				};

				if (albumId) {
					trackData.albumId = albumId;
				}

				const newTrack = await db.insert(track).values(trackData).returning();
				dbTrackId = newTrack[0].id;
			}
		}

		if (!dbTrackId) {
			return json({ error: 'track not found in database' }, { status: 404 });
		}

		const existing = await db.query.collectionTrack.findFirst({
			where: and(eq(collectionTrack.collectionId, id), eq(collectionTrack.trackId, dbTrackId))
		});

		if (existing) {
			return json({ error: 'track already in collection' }, { status: 400 });
		}

		const maxPos = await db.query.collectionTrack.findFirst({
			where: eq(collectionTrack.collectionId, id)
		});

		const position = (maxPos?.position || 0) + 1;

		await db.insert(collectionTrack).values({
			collectionId: id,
			trackId: dbTrackId,
			position,
			description: description || null
		});

		return json({ success: true }, { status: 201 });
	} catch (error) {
		console.error('Failed to add track to collection:', error);
		return json({ error: 'failed to add track' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		if (coll.userId !== locals.user.id) {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const { trackId, spotifyTrackId } = body;

		let dbTrackId: string | null = null;

		if (trackId) {
			const dbTrack = await db.query.track.findFirst({
				where: eq(track.id, trackId)
			});
			if (dbTrack) {
				dbTrackId = dbTrack.id;
			} else {
				const spotifyTrack = await db.query.track.findFirst({
					where: eq(track.spotifyId, trackId)
				});
				if (spotifyTrack) {
					dbTrackId = spotifyTrack.id;
				}
			}
		} else if (spotifyTrackId) {
			const spotifyTrack = await db.query.track.findFirst({
				where: eq(track.spotifyId, spotifyTrackId)
			});
			if (spotifyTrack) {
				dbTrackId = spotifyTrack.id;
			}
		}

		if (!dbTrackId) {
			return json({ error: 'track not found in database' }, { status: 404 });
		}

		await db
			.delete(collectionTrack)
			.where(and(eq(collectionTrack.collectionId, id), eq(collectionTrack.trackId, dbTrackId)));

		return json({ success: true });
	} catch (error) {
		console.error('Failed to remove track from collection:', error);
		return json({ error: 'failed to remove track' }, { status: 500 });
	}
};
