import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { artistReview, artist } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const { reviewId } = params as { reviewId: string };
	const artistId = url.searchParams.get('artistId');

	if (!artistId) {
		return error(400, 'artistId query parameter is required');
	}

	try {
		const review = await db.query.artistReview.findFirst({
			where: eq(artistReview.id, reviewId)
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		const art = await db.query.artist.findFirst({
			where: eq(artist.id, artistId)
		});

		if (!art) {
			return error(404, 'Artist not found');
		}

		await db.update(artist).set({ pinnedReviewId: reviewId }).where(eq(artist.id, artistId));

		return json({ success: true, message: 'Review pinned to artist' });
	} catch (err) {
		console.error('Error pinning review:', err);
		return error(500, 'Failed to pin review');
	}
};

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const { reviewId } = params as { reviewId: string };
	const artistId = url.searchParams.get('artistId');

	if (!artistId) {
		return error(400, 'artistId query parameter is required');
	}

	try {
		const art = await db.query.artist.findFirst({
			where: eq(artist.id, artistId)
		});

		if (!art) {
			return error(404, 'Artist not found');
		}

		if (art.pinnedReviewId !== reviewId) {
			return error(400, 'This review is not pinned to this artist');
		}

		await db.update(artist).set({ pinnedReviewId: null }).where(eq(artist.id, artistId));

		return json({ success: true, message: 'Review unpinned from artist' });
	} catch (err) {
		console.error('Error unpinning review:', err);
		return error(500, 'Failed to unpin review');
	}
};
