import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, albumReviewLike } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const reviewId = params.id;

		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, reviewId)
		});

		if (!review) {
			return json({ error: 'review not found' }, { status: 404 });
		}

		const existingLike = await db.query.albumReviewLike.findFirst({
			where: and(
				eq(albumReviewLike.albumReviewId, reviewId),
				eq(albumReviewLike.userId, locals.user.id)
			)
		});

		if (existingLike) {
			await db
				.delete(albumReviewLike)
				.where(
					and(
						eq(albumReviewLike.albumReviewId, reviewId),
						eq(albumReviewLike.userId, locals.user.id)
					)
				);

			await db
				.update(albumReview)
				.set({ likeCount: review.likeCount - 1 })
				.where(eq(albumReview.id, reviewId));

			return json({ liked: false, likeCount: review.likeCount - 1 });
		} else {
			await db.insert(albumReviewLike).values({
				albumReviewId: reviewId,
				userId: locals.user.id
			});

			await db
				.update(albumReview)
				.set({ likeCount: review.likeCount + 1 })
				.where(eq(albumReview.id, reviewId));

			return json({ liked: true, likeCount: review.likeCount + 1 });
		}
	} catch (err) {
		console.error('Failed to toggle review like:', err);
		return json({ error: 'failed to toggle like' }, { status: 500 });
	}
};
