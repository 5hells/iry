import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, trackReview, album, track } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getOrCreateAlbum } from '$lib/server/music/indexer';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	let data;
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const {
		albumId,
		spotifyId,
		discogsId,
		rating,
		reviewText,
		imageUrls,
		trackReviews,
		isPartialReview
	} = data;

	if (typeof rating !== 'number' || rating < 0 || rating > 10) {
		return error(400, 'Rating must be between 0 and 10');
	}

	if (imageUrls && (!Array.isArray(imageUrls) || imageUrls.length > 4)) {
		return error(400, 'Maximum 4 images allowed');
	}

	try {
		let albumRecord;
		if (albumId) {
			albumRecord = await db.query.album.findFirst({
				where: eq(album.id, albumId),
				with: { tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] } }
			});
			if (!albumRecord) {
				return error(404, 'Album not found');
			}
		} else if (spotifyId || discogsId) {
			albumRecord = await getOrCreateAlbum(undefined, spotifyId, discogsId);

			albumRecord = await db.query.album.findFirst({
				where: eq(album.id, albumRecord.id),
				with: { tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] } }
			});
		} else {
			return error(400, 'albumId, spotifyId, or discogsId is required');
		}

		if (!albumRecord) {
			return error(404, 'Album not found');
		}

		const existingReview = await db.query.albumReview.findFirst({
			where: eq(albumReview.albumId, albumRecord.id)
		});

		if (existingReview) {
			return error(400, 'You have already reviewed this album');
		}

		const trackReviewCount = trackReviews?.length || 0;
		const pointsAwarded = await calculateReviewPoints(
			reviewText,
			trackReviewCount,
			albumRecord.totalTracks || 0
		);

		const [newReview] = await db
			.insert(albumReview)
			.values({
				userId: locals.user.id,
				albumId: albumRecord.id,
				rating,
				reviewText: reviewText || null,
				imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
				isPartialReview: isPartialReview || false,
				pointsAwarded
			})
			.returning();

		if (trackReviews && Array.isArray(trackReviews) && trackReviews.length > 0) {
			const validTrackReviews = trackReviews
				.filter((tr: any) => tr.trackId && typeof tr.rating === 'number')
				.map((tr: any) => ({
					spotifyId: tr.trackId,
					rating: tr.rating,
					reviewText: tr.reviewText || null
				}));

			if (validTrackReviews.length > 0) {
				const spotifyToDbIdMap = new Map(albumRecord.tracks?.map((t) => [t.spotifyId, t.id]) || []);

				const mappedTrackReviews = validTrackReviews
					.map((tr) => {
						const trackId = spotifyToDbIdMap.get(tr.spotifyId);
						if (!trackId) return null; 
						return {
							albumReviewId: newReview.id,
							trackId: String(trackId),
							rating: Number(tr.rating),
							reviewText: tr.reviewText || null
						};
					})
					.filter((tr): tr is NonNullable<typeof tr> => tr !== null);

				if (mappedTrackReviews.length > 0) {
					await db.insert(trackReview).values(mappedTrackReviews);
				}
			}
		}

		await updateUserPoints(locals.user.id);

		const completeReview = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, newReview.id),
			with: {
				album: {
					with: { tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] } }
				},
				trackReviews: {
					with: { track: true }
				}
			}
		});

		return json(completeReview, { status: 201 });
	} catch (err) {
		console.error('Error creating review:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to create review');
	}
};
