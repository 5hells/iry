import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { artistReview } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';

export const GET: RequestHandler = async ({ params }) => {
	const review = await db.query.artistReview.findFirst({
		where: eq(artistReview.id, params.reviewId),
		with: {
			user: {
				columns: { id: true, name: true, image: true }
			},
			artist: true
		}
	});

	if (!review) return error(404, 'Artist review not found');

	return json({
		...review,
		type: 'artist',
		createdAt: typeof review.createdAt === 'number' ? review.createdAt : review.createdAt.getTime(),
		updatedAt: typeof review.updatedAt === 'number' ? review.updatedAt : review.updatedAt.getTime(),
		imageUrls: review.imageUrls ? JSON.parse(review.imageUrls) : []
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return error(401, 'Unauthorized');

	let body: any;
	try {
		body = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const rating = body.rating !== undefined ? Number(body.rating) : undefined;
	const reviewText = typeof body.reviewText === 'string' ? body.reviewText.trim() : undefined;
	const imageUrls = body.imageUrls as string[] | undefined;

	if (rating !== undefined && (Number.isNaN(rating) || rating < 0 || rating > 10)) {
		return error(400, 'rating must be 0-10');
	}
	if (reviewText !== undefined && reviewText.length > 5000) {
		return error(400, 'review text too long (max 5000 chars)');
	}
	if (imageUrls && (!Array.isArray(imageUrls) || imageUrls.length > 4)) {
		return error(400, 'Maximum 4 images allowed');
	}

	const existing = await db.query.artistReview.findFirst({ where: eq(artistReview.id, params.reviewId) });
	if (!existing) return error(404, 'Artist review not found');
	if (existing.userId !== locals.user.id) return error(403, 'Forbidden');

	const pointsAwarded = await calculateReviewPoints(
		reviewText !== undefined ? reviewText : existing.reviewText,
		0,
		0
	);

	const [updated] = await db
		.update(artistReview)
		.set({
			rating: rating ?? existing.rating,
			reviewText: reviewText !== undefined ? reviewText || null : existing.reviewText,
			imageUrls:
				imageUrls !== undefined
					? imageUrls.length > 0
						? JSON.stringify(imageUrls)
						: null
					: existing.imageUrls,
			pointsAwarded
		})
		.where(eq(artistReview.id, params.reviewId))
		.returning();

	await updateUserPoints(locals.user.id);
	return json({ review: updated });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return error(401, 'Unauthorized');

	const existing = await db.query.artistReview.findFirst({ where: eq(artistReview.id, params.reviewId) });
	if (!existing) return error(404, 'Artist review not found');
	if (existing.userId !== locals.user.id) return error(403, 'Forbidden');

	await db.delete(artistReview).where(eq(artistReview.id, params.reviewId));
	await updateUserPoints(locals.user.id);

	return json({ success: true });
};
