import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, album, user, trackReview, track, artistReview, artist, artistReviewLike } from '$lib/server/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import * as spotify from '$lib/server/music/spotify';

function parseDuration(duration?: string): number | null {
	if (!duration) return null;

	const parts = duration.split(':');
	if (parts.length === 2) {
		const minutes = parseInt(parts[0]);
		const seconds = parseInt(parts[1]);
		return (minutes * 60 + seconds) * 1000;
	}

	return null;
}

function isUuidLike(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function mapTrackReviewsToDbTracks(
	dbAlbumId: string,
	trackReviews: Array<{
		trackId?: string;
		trackTitle?: string;
		rating: number;
		reviewText?: string | null;
	}>
) {
	if (!Array.isArray(trackReviews) || trackReviews.length === 0) return [];

	const albumTracks = await db
		.select({
			id: track.id,
			spotifyId: track.spotifyId,
			musicbrainzId: track.musicbrainzId,
			title: track.title,
			trackNumber: track.trackNumber
		})
		.from(track)
		.where(eq(track.albumId, dbAlbumId));

	if (albumTracks.length === 0) return [];

	const byDbId = new Map(albumTracks.map((trackRow) => [trackRow.id, trackRow.id]));
	const bySpotifyId = new Map(
		albumTracks
			.filter((trackRow) => trackRow.spotifyId)
			.map((trackRow) => [String(trackRow.spotifyId), trackRow.id])
	);
	const byMusicbrainzId = new Map(
		albumTracks
			.filter((trackRow) => trackRow.musicbrainzId)
			.map((trackRow) => [String(trackRow.musicbrainzId), trackRow.id])
	);
	const byTitle = new Map(
		albumTracks
			.filter((trackRow) => trackRow.title)
			.map((trackRow) => [String(trackRow.title).trim().toLowerCase(), trackRow.id])
	);

	return trackReviews
		.map((trackReviewInput) => {
			const rawTrackId = String(trackReviewInput.trackId || '').trim();
			const normalizedTitle = String(trackReviewInput.trackTitle || '').trim().toLowerCase();

			let resolvedTrackId: string | undefined;

			if (rawTrackId) {
				if (isUuidLike(rawTrackId) && byDbId.has(rawTrackId)) {
					resolvedTrackId = byDbId.get(rawTrackId);
				} else if (bySpotifyId.has(rawTrackId)) {
					resolvedTrackId = bySpotifyId.get(rawTrackId);
				} else if (byMusicbrainzId.has(rawTrackId)) {
					resolvedTrackId = byMusicbrainzId.get(rawTrackId);
				} else {
					const trailingNumber = rawTrackId.match(/(\d+)$/);
					if (trailingNumber) {
						const trackNumber = Number.parseInt(trailingNumber[1], 10);
						if (Number.isFinite(trackNumber)) {
							const matchedByTrackNumber = albumTracks.find(
								(trackRow) => trackRow.trackNumber === trackNumber
							);
							if (matchedByTrackNumber) {
								resolvedTrackId = matchedByTrackNumber.id;
							}
						}
					}
				}
			}

			if (!resolvedTrackId && normalizedTitle) {
				resolvedTrackId = byTitle.get(normalizedTitle);
			}

			if (!resolvedTrackId) return null;

			return {
				trackId: resolvedTrackId,
				rating: trackReviewInput.rating,
				reviewText: trackReviewInput.reviewText || null
			};
		})
		.filter((trackReviewRow): trackReviewRow is NonNullable<typeof trackReviewRow> => trackReviewRow !== null);
}

async function ensureAlbumTracksForReview(
	source: string,
	requestedAlbumId: string,
	dbAlbum: { id: string; musicbrainzId?: string | null; discogsId?: string | null; spotifyId?: string | null }
) {
	const existingTrack = await db.query.track.findFirst({
		where: eq(track.albumId, dbAlbum.id)
	});

	if (existingTrack) return;

	try {
		if (source === 'musicbrainz') {
			const musicbrainzId = dbAlbum.musicbrainzId || requestedAlbumId;
			const release = await musicbrainz.getRelease(musicbrainzId);
			const releaseTracks = release?.media?.flatMap((media: any) => media.tracks || []) || [];

			if (releaseTracks.length > 0) {
				let trackIndex = 1;
				await db
					.insert(track)
					.values(
						releaseTracks.map((trackRow: any) => ({
							musicbrainzId: trackRow.recording?.id || trackRow.id,
							albumId: dbAlbum.id,
							title: trackRow.title,
							durationMs: trackRow.length || trackRow.recording?.length || null,
							trackNumber: trackIndex++
						}))
					)
					.onConflictDoNothing({ target: track.musicbrainzId });
			}
			return;
		}

		if (source === 'discogs') {
			const discogsId = dbAlbum.discogsId || requestedAlbumId;
			const release = await discogs.getRelease(Number.parseInt(discogsId, 10));
			const releaseTracks = release?.tracklist || [];

			if (releaseTracks.length > 0) {
				await db.insert(track).values(
					releaseTracks.map((trackRow: any, index: number) => ({
						albumId: dbAlbum.id,
						title: trackRow.title,
						trackNumber: Number.parseInt(String(trackRow.position || ''), 10) || index + 1,
						durationMs: parseDuration(trackRow.duration)
					}))
				);
			}
			return;
		}

		if (source === 'spotify') {
			const spotifyId = dbAlbum.spotifyId || requestedAlbumId;
			const spotifyTracks = await spotify.getAlbumTracks(spotifyId);
			if (spotifyTracks.length > 0) {
				await db
					.insert(track)
					.values(
						spotifyTracks.map((trackRow) => ({
							spotifyId: trackRow.id,
							albumId: dbAlbum.id,
							title: trackRow.name,
							durationMs: trackRow.duration_ms || null,
							trackNumber: trackRow.track_number
						}))
					)
					.onConflictDoNothing({ target: track.spotifyId });
			}
		}
	} catch (trackBackfillError) {
		console.warn('Failed to backfill album tracks for review:', trackBackfillError);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const offset = (page - 1) * limit;
	const albumId = url.searchParams.get('albumId');
	const type = url.searchParams.get('type'); 

	let allReviews: any[] = [];
	let totalCount = 0;

	if (!type || type === 'album') {
		let albumWhereCondition = undefined;
		if (albumId) {
			albumWhereCondition = eq(albumReview.albumId, albumId);
		}

		const albumRevs = await db.query.albumReview.findMany({
			limit: !type && !albumId ? Math.ceil(limit / 2) : limit,
			offset,
			where: albumWhereCondition,
			orderBy: [desc(albumReview.createdAt)],
			with: {
				user: {
					columns: {
						id: true,
						name: true,
						image: true
					}
				},
				album: true,
				trackReviews: {
					with: {
						track: true
					}
				}
			}
		});

		allReviews = allReviews.concat(
			albumRevs.map((r) => ({
				...r,
				createdAt: typeof r.createdAt === 'number' ? r.createdAt : (r.createdAt as any).getTime(),
				updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : (r.updatedAt as any).getTime(),
				imageUrls: r.imageUrls ? JSON.parse(r.imageUrls) : [],
				type: 'album'
			}))
		);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(albumReview)
			.where(albumWhereCondition);
		totalCount += countResult.count;
	}

	if (!type || type === 'artist') {
		const artistRevs = await db.query.artistReview.findMany({
			limit: !type && !albumId ? Math.ceil(limit / 2) : limit,
			offset,
			orderBy: [desc(artistReview.createdAt)],
			with: {
				user: {
					columns: {
						id: true,
						name: true,
						image: true
					}
				},
				artist: true
			}
		});

		allReviews = allReviews.concat(
			artistRevs.map((r) => ({
				...r,
				createdAt: typeof r.createdAt === 'number' ? r.createdAt : (r.createdAt as any).getTime(),
				updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : (r.updatedAt as any).getTime(),
				imageUrls: r.imageUrls ? JSON.parse(r.imageUrls) : [],
				trackReviews: [],
				type: 'artist'
			}))
		);

		const [countResult] = await db
			.select({ count: sql<number>`count(*)` })
			.from(artistReview);
		totalCount += countResult.count;
	}

	
	allReviews.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	return json({
		reviews: allReviews.slice(0, limit),
		pagination: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit)
		}
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot write reviews' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const {
			albumId,
			rating,
			reviewText,
			imageUrls,
			trackReviews,
			reviewId,
			source = 'musicbrainz'
		} = body;

		if (!albumId || rating === undefined) {
			return json({ error: 'albumId and rating are required' }, { status: 400 });
		}

		if (rating < 0 || rating > 10) {
			return json({ error: 'rating must be between 0 and 10' }, { status: 400 });
		}

		if (reviewText && reviewText.length > 5000) {
			return json({ error: 'review text too long (max 5000 characters)' }, { status: 400 });
		}

		let dbAlbum: any = null;

		if (source === 'musicbrainz') {
			const foundAlbum = await db.query.album.findFirst({
				where: eq(album.musicbrainzId, albumId)
			});

			if (foundAlbum) {
				dbAlbum = foundAlbum;
			} else {
				let mbRelease = await musicbrainz.getRelease(albumId);
				if (!mbRelease) {
					const preferredRelease = await musicbrainz.getPreferredReleaseFromReleaseGroup(albumId);
					if (preferredRelease?.id) {
						const existingResolvedAlbum = await db.query.album.findFirst({
							where: eq(album.musicbrainzId, preferredRelease.id)
						});
						if (existingResolvedAlbum) {
							dbAlbum = existingResolvedAlbum;
						} else {
							mbRelease = await musicbrainz.getRelease(preferredRelease.id);
						}
					}
				}

				if (dbAlbum) {
					// resolved through existing album row
				} else if (!mbRelease) {
					return json({ error: 'Album not found on MusicBrainz' }, { status: 404 });
				}

				if (!dbAlbum && mbRelease) {
					const releaseId = mbRelease.id;
					const artistName = musicbrainz.formatArtistCredit(mbRelease['artist-credit']);
					const coverArtInfo = await musicbrainz.getCoverArtWithFallback(releaseId, {
						artist: artistName,
						album: mbRelease.title
					});
					const coverArtUrl = coverArtInfo?.image || null;

					const newAlbum = await db
						.insert(album)
						.values({
							musicbrainzId: releaseId,
							title: mbRelease.title,
							artist: artistName,
							releaseDate: mbRelease.date,
							coverArtUrl: coverArtUrl,
							genres: JSON.stringify([]),
							totalTracks: mbRelease['track-count'] || 0,
							musicbrainzUrl: `https://musicbrainz.org/release/${releaseId}`
						})
						.returning();

					const albumIdFromDb = newAlbum[0].id;

					if (mbRelease.media && mbRelease.media.length > 0) {
						const tracks = mbRelease.media.flatMap((media) => media.tracks || []);
						if (tracks.length > 0) {
							await db
								.insert(track)
								.values(
									tracks.map((t: any) => ({
										musicbrainzId: t.recording?.id || t.id,
										albumId: albumIdFromDb,
										title: t.title,
										durationMs: t.length || t.recording?.length || null,
										trackNumber: t.position
									}))
								)
								.onConflictDoNothing({ target: track.musicbrainzId });
						}
					}

					dbAlbum = newAlbum[0];
				}
			}
		} else if (source === 'discogs') {
			const foundAlbum = await db.query.album.findFirst({
				where: eq(album.discogsId, albumId)
			});

			if (foundAlbum) {
				dbAlbum = foundAlbum;
			} else {
				const discogsRelease = await discogs.getRelease(parseInt(albumId));
				if (!discogsRelease) {
					return json({ error: 'Album not found on Discogs' }, { status: 404 });
				}

				const artistName =
					discogsRelease.artist || (discogsRelease as any).artists?.[0]?.name || 'Unknown Artist';

				const newAlbum = await db
					.insert(album)
					.values({
						discogsId: albumId,
						title: discogsRelease.title,
						artist: artistName,
						releaseDate: discogsRelease.year,
						coverArtUrl: discogsRelease.cover_image || discogsRelease.thumb,
						genres: JSON.stringify(discogsRelease.genre || []),
						totalTracks: discogsRelease.tracklist?.length || 0,
						discogsUrl: discogsRelease.uri || discogsRelease.resource_url
					})
					.returning();

				const albumIdFromDb = newAlbum[0].id;

				if (discogsRelease.tracklist && discogsRelease.tracklist.length > 0) {
					await db.insert(track).values(
						discogsRelease.tracklist.map((t: any, index: number) => ({
							albumId: albumIdFromDb,
							title: t.title,
							trackNumber: parseInt(t.position) || index + 1,
							durationMs: parseDuration(t.duration)
						}))
					);
				}

				dbAlbum = newAlbum[0];
			}
		} else {
			dbAlbum = await db.query.album.findFirst({
				where: eq(album.id, albumId)
			});
		}

		if (!dbAlbum) {
			return json({ error: 'Album not found' }, { status: 404 });
		}

		let existingReview = null;
		if (!reviewId) {
			existingReview = await db.query.albumReview.findFirst({
				where: and(eq(albumReview.userId, locals.user.id), eq(albumReview.albumId, dbAlbum.id))
			});
		}

		const hasTrackReviews = Array.isArray(trackReviews);
		const sanitizedTrackReviews = hasTrackReviews
			? trackReviews
					.filter((tr: any) => tr?.trackId && typeof tr?.rating === 'number')
					.map((tr: any) => ({
						trackId: tr.trackId,
						trackTitle: tr.trackTitle,
						rating: tr.rating,
						reviewText: tr.reviewText || null
					}))
			: [];

		if (hasTrackReviews && sanitizedTrackReviews.length > 0) {
			await ensureAlbumTracksForReview(source, albumId, dbAlbum);
		}

		const mappedTrackReviews = hasTrackReviews
			? await mapTrackReviewsToDbTracks(dbAlbum.id, sanitizedTrackReviews)
			: [];

		if (reviewId) {
			const targetReview = await db.query.albumReview.findFirst({
				where: eq(albumReview.id, reviewId),
				with: { trackReviews: true, album: true }
			});

			if (!targetReview) {
				return json({ error: 'Review not found' }, { status: 404 });
			}

			if (targetReview.userId !== locals.user.id) {
				return json({ error: 'forbidden' }, { status: 403 });
			}

			const trackCount = hasTrackReviews
				? mappedTrackReviews.length
				: targetReview.trackReviews?.length || 0;
			const totalTracks = targetReview.album?.totalTracks || dbAlbum.totalTracks || 0;
			const pointsAwarded = await calculateReviewPoints(
				reviewText?.trim() || targetReview.reviewText || null,
				trackCount,
				totalTracks
			);

			const updated = await db
				.update(albumReview)
				.set({
					rating,
					reviewText: reviewText?.trim() || null,
					imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
					pointsAwarded
				})
				.where(eq(albumReview.id, reviewId))
				.returning();

			if (hasTrackReviews) {
				await db.delete(trackReview).where(eq(trackReview.albumReviewId, reviewId));
				if (mappedTrackReviews.length > 0) {
					await db.insert(trackReview).values(
						mappedTrackReviews.map((trackReviewRow) => ({
							albumReviewId: reviewId,
							trackId: trackReviewRow.trackId,
							rating: trackReviewRow.rating,
							reviewText: trackReviewRow.reviewText
						}))
					);
				}
			}

			await updateUserPoints(locals.user.id);

			return json({ review: updated[0] }, { status: 200 });
		} else if (existingReview) {
			const trackCount = hasTrackReviews ? mappedTrackReviews.length : 0;
			const totalTracks = dbAlbum.totalTracks || 0;
			const pointsAwarded = await calculateReviewPoints(
				reviewText?.trim() || existingReview.reviewText || null,
				trackCount,
				totalTracks
			);

			const updated = await db
				.update(albumReview)
				.set({
					rating,
					reviewText: reviewText?.trim() || null,
					imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
					pointsAwarded
				})
				.where(eq(albumReview.id, existingReview.id))
				.returning();

			if (hasTrackReviews) {
				await db.delete(trackReview).where(eq(trackReview.albumReviewId, existingReview.id));
				if (mappedTrackReviews.length > 0) {
					await db.insert(trackReview).values(
						mappedTrackReviews.map((trackReviewRow) => ({
							albumReviewId: existingReview.id,
							trackId: trackReviewRow.trackId,
							rating: trackReviewRow.rating,
							reviewText: trackReviewRow.reviewText
						}))
					);
				}
			}

			await updateUserPoints(locals.user.id);

			return json({ review: updated[0] }, { status: 200 });
		} else {
			const trackCount = mappedTrackReviews.length;
			const totalTracks = dbAlbum.totalTracks || 0;
			const pointsAwarded = await calculateReviewPoints(
				reviewText?.trim() || null,
				trackCount,
				totalTracks
			);

			const newReview = await db
				.insert(albumReview)
				.values({
					userId: locals.user.id,
					albumId: dbAlbum.id,
					rating,
					reviewText: reviewText?.trim() || null,
					imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
					pointsAwarded
				})
				.returning();

			if (hasTrackReviews && mappedTrackReviews.length > 0) {
				await db.insert(trackReview).values(
					mappedTrackReviews.map((trackReviewRow) => ({
						albumReviewId: newReview[0].id,
						trackId: trackReviewRow.trackId,
						rating: trackReviewRow.rating,
						reviewText: trackReviewRow.reviewText
					}))
				);
			}

			await updateUserPoints(locals.user.id);

			return json({ review: newReview[0] }, { status: 201 });
		}
	} catch (err) {
		console.error('Failed to create/update review:', err);
		return error(500, 'Failed to save review');
	}
};
