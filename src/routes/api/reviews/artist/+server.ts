import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { artist, artistReview } from '$lib/server/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getOrCreateArtist } from '$lib/server/music/artist-indexer';
import { calculateReviewPoints, updateUserPoints } from '$lib/server/points';

type ArtistSource = 'musicbrainz' | 'discogs' | 'spotify';

async function resolveArtist(source: ArtistSource | undefined, artistId: string) {
	if (source === 'musicbrainz') return getOrCreateArtist(artistId);
	if (source === 'discogs') return getOrCreateArtist(undefined, undefined, artistId);
	if (source === 'spotify') return getOrCreateArtist(undefined, artistId);

	const byDbId = await db.query.artist.findFirst({ where: eq(artist.id, artistId) });
	if (byDbId) return byDbId;
	throw new Error('Could not resolve artist. Provide source + artistId.');
}

export const GET: RequestHandler = async ({ url }) => {
	const artistId = url.searchParams.get('artistId');
	const source = url.searchParams.get('source') as ArtistSource | null;
	if (!artistId) {
		return error(400, 'artistId is required');
	}

	let resolvedArtistId = artistId;
	if (source) {
		try {
			const resolvedArtist = await resolveArtist(source, artistId);
			resolvedArtistId = resolvedArtist.id;
		} catch {
			return json({ reviews: [] });
		}
	}

	const rows = await db.query.artistReview.findMany({
		where: eq(artistReview.artistId, resolvedArtistId),
		orderBy: [desc(artistReview.createdAt)],
		with: {
			user: {
				columns: { id: true, name: true, image: true }
			},
			artist: true
		}
	});

	return json({
		reviews: rows.map((row) => ({
			...row,
			type: 'artist',
			createdAt: typeof row.createdAt === 'number' ? row.createdAt : row.createdAt.getTime(),
			updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : row.updatedAt.getTime(),
			imageUrls: row.imageUrls ? JSON.parse(row.imageUrls) : []
		}))
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}
	if ((locals.user as any).isGuest) {
		return error(403, 'Guest users cannot write reviews');
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const source = body.source as ArtistSource | undefined;
	const artistIdInput = body.artistId as string | undefined;
	const reviewId = body.reviewId as string | undefined;
	const rating = Number(body.rating);
	const reviewText = typeof body.reviewText === 'string' ? body.reviewText.trim() : '';
	const imageUrls = body.imageUrls as string[] | undefined;

	if (!artistIdInput) return error(400, 'artistId is required');
	if (Number.isNaN(rating) || rating < 0 || rating > 10) return error(400, 'rating must be 0-10');
	if (reviewText.length > 5000) return error(400, 'review text too long (max 5000 chars)');
	if (imageUrls && (!Array.isArray(imageUrls) || imageUrls.length > 4)) {
		return error(400, 'Maximum 4 images allowed');
	}

	try {
		const artistRecord = await resolveArtist(source, artistIdInput);
		const pointsAwarded = await calculateReviewPoints(reviewText || null, 0, 0);

		let targetReview = reviewId
			? await db.query.artistReview.findFirst({ where: eq(artistReview.id, reviewId) })
			: await db.query.artistReview.findFirst({
					where: and(
						eq(artistReview.userId, locals.user.id),
						eq(artistReview.artistId, artistRecord.id)
					)
			  });

		if (targetReview) {
			if (targetReview.userId !== locals.user.id) return error(403, 'Forbidden');

			const [updated] = await db
				.update(artistReview)
				.set({
					rating,
					reviewText: reviewText || null,
					imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
					pointsAwarded
				})
				.where(eq(artistReview.id, targetReview.id))
				.returning();

			await updateUserPoints(locals.user.id);
			return json({ review: updated, updated: true });
		}

		const [created] = await db
			.insert(artistReview)
			.values({
				userId: locals.user.id,
				artistId: artistRecord.id,
				rating,
				reviewText: reviewText || null,
				imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
				pointsAwarded
			})
			.returning();

		await updateUserPoints(locals.user.id);
		return json({ review: created, created: true }, { status: 201 });
	} catch (err) {
		console.error('Failed to save artist review:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to save artist review');
	}
};
