import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { album, albumReview, track } from '$lib/server/db/schema';
import { eq, desc, asc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const albumData = await db.query.album.findFirst({
		where: eq(album.id, params.id),
		with: {
			tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] },
			reviews: {
				orderBy: [desc(albumReview.createdAt)],
				with: {
					user: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					},
					trackReviews: {
						with: {
							track: true
						}
					}
				}
			}
		}
	});

	if (!albumData) {
		return error(404, 'Album not found');
	}

	const normalizedReviews = (albumData.reviews || []).map((r: any) => ({
		...r,
		createdAt: typeof r.createdAt === 'number' ? r.createdAt : (r.createdAt as any).getTime(),
		updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : (r.updatedAt as any).getTime(),
		imageUrls: r.imageUrls ? JSON.parse(r.imageUrls) : []
	}));

	return json({
		...albumData,
		reviews: normalizedReviews
	});
};
