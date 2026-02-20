import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { updateUserPoints } from '$lib/server/points';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, params.id)
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		const role = (locals.user as any)?.role;
		if (review.userId !== locals.user.id && role !== 'admin' && role !== 'moderator') {
			return error(403, 'Forbidden');
		}

		await db.delete(albumReview).where(eq(albumReview.id, params.id));

		await updateUserPoints(review.userId);

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting review:', err);
		return error(500, 'Failed to delete review');
	}
};
