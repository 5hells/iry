import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, artistReview, track } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const albumRev = await db.query.albumReview.findFirst({
		where: eq(albumReview.id, params.id),
		with: {
			user: {
				columns: {
					id: true,
					name: true,
					image: true
				}
			},
			album: {
				with: {
					tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
				}
			},
			trackReviews: {
				with: {
					track: true
				}
			}
		}
	});

	if (albumRev) {
		return json({
			...albumRev,
			type: 'album',
			createdAt:
				typeof albumRev.createdAt === 'number'
					? albumRev.createdAt
					: (albumRev.createdAt as any).getTime(),
			updatedAt:
				typeof albumRev.updatedAt === 'number'
					? albumRev.updatedAt
					: (albumRev.updatedAt as any).getTime(),
			imageUrls: albumRev.imageUrls ? JSON.parse(albumRev.imageUrls) : []
		});
	}

	const artistRev = await db.query.artistReview.findFirst({
		where: eq(artistReview.id, params.id),
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

	if (!artistRev) {
		return error(404, 'Review not found');
	}

	return json({
		...artistRev,
		type: 'artist',
		createdAt:
			typeof artistRev.createdAt === 'number'
				? artistRev.createdAt
				: (artistRev.createdAt as any).getTime(),
		updatedAt:
			typeof artistRev.updatedAt === 'number'
				? artistRev.updatedAt
				: (artistRev.updatedAt as any).getTime(),
		imageUrls: artistRev.imageUrls ? JSON.parse(artistRev.imageUrls) : [],
		trackReviews: []
	});
};
