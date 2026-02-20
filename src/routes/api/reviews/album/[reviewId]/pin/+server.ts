import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, album } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const { reviewId } = params as { reviewId: string };
	const albumId = url.searchParams.get('albumId');

	if (!albumId) {
		return error(400, 'albumId query parameter is required');
	}

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, reviewId)
		});

		if (!review) {
			return error(404, 'Review not found');
		}

		
		

		const albm = await db.query.album.findFirst({
			where: eq(album.id, albumId)
		});

		if (!albm) {
			return error(404, 'Album not found');
		}

		await db.update(album).set({ pinnedReviewId: reviewId }).where(eq(album.id, albumId));

		return json({ success: true, message: 'Review pinned to album' });
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
	const albumId = url.searchParams.get('albumId');

	if (!albumId) {
		return error(400, 'albumId query parameter is required');
	}

	try {
		const albm = await db.query.album.findFirst({
			where: eq(album.id, albumId)
		});

		if (!albm) {
			return error(404, 'Album not found');
		}

		if (albm.pinnedReviewId !== reviewId) {
			return error(400, 'This review is not pinned to this album');
		}

		await db.update(album).set({ pinnedReviewId: null }).where(eq(album.id, albumId));

		return json({ success: true, message: 'Review unpinned from album' });
	} catch (err) {
		console.error('Error unpinning review:', err);
		return error(500, 'Failed to unpin review');
	}
};
