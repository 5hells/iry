import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	albumReview,
	userPoints,
	statusPost,
	album,
	user,
	statusPostLike
} from '$lib/server/db/schema';
import { desc, sql, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const albumReviewStats = await db
			.select({
				albumId: albumReview.albumId,
				reviewCount: sql<number>`count(*)`,
				avgRating: sql<number>`avg(${albumReview.rating})`,
				latestReviewDate: sql<number>`max(${albumReview.createdAt})`
			})
			.from(albumReview)
			.groupBy(albumReview.albumId)
			.orderBy(sql`count(*) desc`)
			.limit(10);

		const topAlbumsDetailed = await Promise.all(
			albumReviewStats.map(async (stats) => {
				const albumData = (await db.select().from(album).where(eq(album.id, stats.albumId)))[0];

				const latestReview = (
					await db
						.select()
						.from(albumReview)
						.where(eq(albumReview.albumId, stats.albumId))
						.orderBy(desc(albumReview.createdAt))
						.limit(1)
				)[0];

				const userData = latestReview
					? (await db.select().from(user).where(eq(user.id, latestReview.userId)))[0]
					: null;

				return {
					album: albumData,
					reviewCount: Number(stats.reviewCount),
					avgRating: Number(stats.avgRating),
					latestReview:
						latestReview && userData
							? {
									userId: latestReview.userId,
									userName: userData.name,
									userImage: userData.image,
									rating: latestReview.rating,
									createdAt:
										typeof latestReview.createdAt === 'number'
											? latestReview.createdAt
											: (latestReview.createdAt as any).getTime()
								}
							: null
				};
			})
		);

		const topUsers = await db.query.userPoints.findMany({
			limit: 10,
			orderBy: [desc(userPoints.totalPoints)],
			with: {
				user: {
					columns: {
						id: true,
						name: true,
						image: true
					}
				}
			}
		});

		const recentPosts = await db.query.statusPost.findMany({
			limit: 10,
			orderBy: [desc(statusPost.createdAt)],
			with: {
				user: {
					columns: {
						id: true,
						name: true,
						image: true
					}
				},
				album: true,
				review: true,
				likes:
					locals.user && !(locals.user as any).isGuest
						? {
								where: eq(statusPostLike.userId, locals.user.id)
							}
						: undefined
			}
		});

		return json({
			topAlbums: topAlbumsDetailed
				.filter((item) => item.album)
				.map((item) => ({
					album: {
						id: item.album!.id,
						dbId: item.album!.id,
						spotifyId: item.album!.spotifyId || null,
						discogsId: item.album!.discogsId || null,
						source: item.album!.spotifyId
							? 'spotify'
							: item.album!.discogsId
								? 'discogs'
								: 'unknown',
						routeId: item.album!.spotifyId || item.album!.discogsId || item.album!.id,
						title: item.album!.title,
						artist: item.album!.artist,
						coverArtUrl: item.album!.coverArtUrl || null,
						releaseDate: item.album!.releaseDate || null,
						totalTracks: item.album!.totalTracks || null,
						genres: item.album!.genres ? JSON.parse(item.album!.genres) : null
					},
					reviewCount: item.reviewCount,
					avgRating: item.avgRating,
					recentReview: item.latestReview
				})),
			topUsers: topUsers.map((up) => ({
				userId: up.user?.id,
				userName: up.user?.name,
				userImage: up.user?.image,
				points: up.totalPoints,
				level: up.level,
				reviewCount: up.reviewCount
			})),
			recentPosts: recentPosts.map((post) => ({
				id: post.id,
				userId: post.userId,
				userName: post.user.name,
				userImage: post.user.image,
				content: post.content,
				imageUrls: post.imageUrls ? JSON.parse(post.imageUrls) : [],
				likeCount: post.likeCount,
				isLiked: post.likes && post.likes.length > 0,
				album: post.album,
				review: post.review,
				createdAt:
					typeof post.createdAt === 'number' ? post.createdAt : (post.createdAt as any).getTime()
			}))
		});
	} catch (error) {
		console.error('Failed to fetch dashboard data:', error);
		return json({ error: 'failed to load dashboard data' }, { status: 500 });
	}
};
