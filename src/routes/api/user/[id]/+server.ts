import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user, albumReview, userPoints, statusPost, lastfmScrobble } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
	const userId = params.id;

	if (!userId) {
		return error(400, 'User ID is required');
	}

	try {
		const userInfo = await db.query.user.findFirst({
			where: eq(user.id, userId),
			columns: {
				id: true,
				name: true,
				image: true,
				lastfmUsername: true,
				createdAt: true
			}
		});

		if (!userInfo) {
			return error(404, 'User not found');
		}

		const points = await db.query.userPoints.findFirst({
			where: eq(userPoints.userId, userId)
		});

		const reviews = await db.query.albumReview.findMany({
			where: eq(albumReview.userId, userId),
			limit: 10,
			orderBy: [desc(albumReview.createdAt)],
			with: {
				album: true
			}
		});

		const posts: any[] = await db.query.statusPost.findMany({
			where: eq(statusPost.userId, userId),
			limit: 10,
			orderBy: [desc(statusPost.createdAt)],
			with: {
				album: true,
				review: true
			}
		});

		let recentScrobbles = await db.query.lastfmScrobble.findMany({
			where: eq(lastfmScrobble.userId, userId),
			limit: 10,
			orderBy: [desc(lastfmScrobble.timestamp)]
		});

		return json({
			user: userInfo,
			points: points || { totalPoints: 0, level: 1, reviewCount: 0 },
			recentReviews: reviews.map((r) => ({
				...r,
				imageUrls: r.imageUrls ? JSON.parse(r.imageUrls) : []
			})),
			recentPosts: posts.map((p) => ({
				...p,
				imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : []
			})),
			recentScrobbles
		});
	} catch (err) {
		console.error('Failed to fetch user profile:', err);
		return error(500, 'Failed to fetch user profile');
	}
};
