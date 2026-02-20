import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { albumReview, userPoints } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const { id: reviewId } = params as { id: string };

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, reviewId)
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		if (review.userId !== locals.user.id) {
			return error(403, 'Cannot pin reviews that are not yours');
		}

		await db
			.update(userPoints)
			.set({ pinnedReviewId: reviewId })
			.where(eq(userPoints.userId, locals.user.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error pinning review:', err);
		return error(500, 'Failed to pin review');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const { id: reviewId } = params as { id: string };

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, reviewId)
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		if (review.userId !== locals.user.id) {
			return error(403, 'Cannot unpin reviews that are not yours');
		}

		await db
			.update(userPoints)
			.set({ pinnedReviewId: null })
			.where(eq(userPoints.userId, locals.user.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error unpinning review:', err);
		return error(500, 'Failed to unpin review');
	}
};
