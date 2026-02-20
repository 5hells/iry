import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { trackRanking, track } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { albumId } = params;

	if (!albumId) {
		return json({ error: 'album id required' }, { status: 400 });
	}

	try {
		const rankings: any[] = await db.query.trackRanking.findMany({
			where: eq(trackRanking.albumId, albumId),
			orderBy: [desc(trackRanking.avgRating)],
			with: {
				track: {
					columns: {
						id: true,
						title: true,
						trackNumber: true,
						durationMs: true
					}
				}
			}
		});

		return json({
			rankings: rankings.map((r) => ({
				trackId: r.trackId,
				trackTitle: r.track?.title,
				trackNumber: r.track?.trackNumber,
				avgRating: r.avgRating,
				ratingCount: r.ratingCount,
				position: rankings.indexOf(r) + 1
			}))
		});
	} catch (error) {
		console.error('Failed to fetch track rankings:', error);
		return json({ error: 'failed to fetch rankings' }, { status: 500 });
	}
};
