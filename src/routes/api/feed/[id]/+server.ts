import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { statusPost, statusPostLike, userTheme } from '$lib/server/db/schema';
import { eq, desc, inArray } from 'drizzle-orm';

function uniqueHeads(users: Array<{ id?: string; name?: string; image?: string | null }>, max = 5) {
	const seen = new Set<string>();
	const heads: Array<{ id: string; name: string; image: string | null }> = [];

	for (const user of users) {
		if (!user?.id || seen.has(user.id)) continue;
		seen.add(user.id);
		heads.push({
			id: user.id,
			name: user.name || 'Anonymous',
			image: user.image || null
		});
		if (heads.length >= max) break;
	}

	return heads;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const postId = params.id;

	if (!postId) {
		return json({ error: 'invalid post id' }, { status: 400 });
	}

	try {
		const post = await db.query.statusPost.findFirst({
			where: eq(statusPost.id, postId),
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
						: undefined,
				replies: {
					orderBy: [desc(statusPost.createdAt)],
					with: {
						user: {
							columns: {
								id: true,
								name: true,
								image: true
							}
						},
						likes:
							locals.user && !(locals.user as any).isGuest
								? {
										where: eq(statusPostLike.userId, locals.user.id)
									}
								: undefined
					}
				}
			}
		});

		if (!post) {
			return json({ error: 'post not found' }, { status: 404 });
		}

		const likeTargetIds = [post.id, ...((post.replies || []).map((reply) => reply.id) as string[])];
		const likesByPostId = new Map<
			string,
			Array<{ id?: string; name?: string; image?: string | null }>
		>();

		if (likeTargetIds.length > 0) {
			const likes = await db.query.statusPostLike.findMany({
				where: inArray(statusPostLike.statusPostId, likeTargetIds),
				with: {
					user: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					}
				},
				orderBy: [desc(statusPostLike.createdAt)]
			});

			for (const like of likes) {
				if (!likesByPostId.has(like.statusPostId)) likesByPostId.set(like.statusPostId, []);
				likesByPostId.get(like.statusPostId)!.push(like.user);
			}
		}

		const theme = await db.query.userTheme.findFirst({
			where: eq(userTheme.userId, post.userId)
		});

		const repliesWithThemes = await Promise.all(
			(post.replies || []).map(async (reply) => {
				const replyTheme = await db.query.userTheme.findFirst({
					where: eq(userTheme.userId, reply.userId)
				});

				return {
					...reply,
					createdAt:
						typeof reply.createdAt === 'number'
							? reply.createdAt
							: (reply.createdAt as any).getTime(),
					updatedAt:
						typeof reply.updatedAt === 'number'
							? reply.updatedAt
							: (reply.updatedAt as any).getTime(),
					imageUrls: reply.imageUrls ? JSON.parse(reply.imageUrls) : [],
					isLiked: reply.likes && reply.likes.length > 0,
					likeHeads: uniqueHeads(likesByPostId.get(reply.id) || []),
					replyCount: reply.replyCount || 0,
					user: reply.user
				};
			})
		);

		return json({
			post: {
				...post,
				createdAt:
					typeof post.createdAt === 'number' ? post.createdAt : (post.createdAt as any).getTime(),
				updatedAt:
					typeof post.updatedAt === 'number' ? post.updatedAt : (post.updatedAt as any).getTime(),
				imageUrls: post.imageUrls ? JSON.parse(post.imageUrls) : [],
				isLiked: post.likes && post.likes.length > 0,
				likeHeads: uniqueHeads(likesByPostId.get(post.id) || []),
				replyHeads: uniqueHeads(repliesWithThemes.map((reply: any) => reply.user)),
				user: post.user,
				replies: repliesWithThemes
			}
		});
	} catch (error) {
		console.error('Failed to fetch post:', error);
		return json({ error: 'failed to fetch post' }, { status: 500 });
	}
};
