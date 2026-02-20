import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, trackReview, track } from '$lib/server/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';
import { escapeHtml } from '$lib/utils/markdown';

export const PUT: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	let data;
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const { rating, reviewText, imageUrls, trackReviews } = data;

	if (imageUrls && (!Array.isArray(imageUrls) || imageUrls.length > 4)) {
		return error(400, 'Maximum 4 images allowed');
	}

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, params.id),
			with: {
				album: true,
				trackReviews: true
			}
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		if (review.userId !== locals.user.id) {
			return error(403, 'Forbidden');
		}

		const updateData: any = {};
		if (typeof rating === 'number' && rating >= 0 && rating <= 10) {
			updateData.rating = rating;
		}
		if (reviewText !== undefined) {
			updateData.reviewText = reviewText ? reviewText.trim().substring(0, 5000) : null;
		}
		if (imageUrls !== undefined) {
			updateData.imageUrls = imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
		}

		const trackReviewCount = trackReviews?.length || review.trackReviews?.length || 0;
		updateData.pointsAwarded = await calculateReviewPoints(
			reviewText || review.reviewText,
			trackReviewCount,
			review.album.totalTracks || 0
		);

		await db.update(albumReview).set(updateData).where(eq(albumReview.id, params.id));

		if (trackReviews && Array.isArray(trackReviews)) {
			await db.delete(trackReview).where(eq(trackReview.albumReviewId, params.id));

			if (trackReviews.length > 0) {
				const trackReviewData = trackReviews
					.filter((tr: any) => tr.trackId && typeof tr.rating === 'number')
					.map((tr: any) => ({
						albumReviewId: params.id,
						trackId: tr.trackId,
						rating: tr.rating,
						reviewText: tr.reviewText || null
					}));

				if (trackReviewData.length > 0) {
					await db.insert(trackReview).values(trackReviewData);
				}
			}
		}

		await updateUserPoints(locals.user.id);

		const updatedReview = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, params.id),
			with: {
				album: {
					with: { tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] } }
				},
				trackReviews: {
					with: { track: true }
				}
			}
		});

		return json(updatedReview);
	} catch (err) {
		console.error('Error updating review:', err);
		return error(500, 'Failed to update review');
	}
};
