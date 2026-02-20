import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { statusPost, statusPostLike, userTheme, notification, user } from '$lib/server/db/schema';
import { updateUserPoints } from '$lib/server/points';
import { desc, eq, and, isNotNull, isNull, inArray } from 'drizzle-orm';
import { escapeHtml } from '$lib/utils/markdown';

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

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		const posts: any[] = await db.query.statusPost.findMany({
			limit,
			offset,
			where: and(isNull(statusPost.parentPostId), isNull(statusPost.reviewId)),
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
						: undefined,

				replies: {
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
					},
					orderBy: [desc(statusPost.createdAt)]
				}
			}
		});

		const likeTargetIds = posts.flatMap((post) => [
			post.id,
			...((post.replies || []).map((reply: any) => reply.id) as string[])
		]);

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

		const postsWithThemes = await Promise.all(
			posts.map(async (post) => {
				const theme = await db.query.userTheme.findFirst({
					where: eq(userTheme.userId, post.userId)
				});

				const repliesWithThemes = await Promise.all(
					(post.replies || []).map(async (reply: any) => {
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
							user: reply.user
						};
					})
				);

			return {
					...post,
					createdAt:
						typeof post.createdAt === 'number' ? post.createdAt : (post.createdAt as any).getTime(),
					updatedAt:
						typeof post.updatedAt === 'number' ? post.updatedAt : (post.updatedAt as any).getTime(),
					imageUrls: post.imageUrls ? JSON.parse(post.imageUrls) : [],
					isLiked: post.likes && post.likes.length > 0,
					likeHeads: uniqueHeads(likesByPostId.get(post.id) || []),
					replyHeads: uniqueHeads(repliesWithThemes.map((reply: any) => reply.user)),
					replyCount: post.replyCount || repliesWithThemes.length || 0,
					replies: repliesWithThemes.map((r: any) => ({ ...r, replyCount: r.replyCount || 0 })),
					user: post.user
				};
			})
		);

		return json({
			posts: postsWithThemes
		});
	} catch (error) {
		console.error('Failed to fetch feed:', error);
		return json({ error: 'failed to load feed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot post' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const { content, imageUrls, albumId, reviewId, parentPostId } = body;

		if (!content || content.trim().length === 0) {
			return json({ error: 'content is required' }, { status: 400 });
		}

		if (content.length > 500) {
			return json({ error: 'content too long (max 500 characters)' }, { status: 400 });
		}

		const newPost = await db
			.insert(statusPost)
			.values({
				userId: locals.user.id,
				content: content.trim(),
				imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
				albumId: albumId || null,
				reviewId: reviewId || null,
				parentPostId: parentPostId || null
			})
			.returning();

		const postId = (newPost as any)[0].id;

		const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
		const mentions = content.match(mentionRegex) || [];
		const mentionedUsernames = Array.from(
			new Set(mentions.map((m: string) => m.substring(1))) as Set<string>
		);

		for (const username of mentionedUsernames) {
			const mentionedUser = await db.query.user.findFirst({
				where: eq(user.name, username as string)
			});

			if (mentionedUser && mentionedUser.id !== locals.user.id) {
				await db
					.insert(notification)
					.values({
						title: 'Mention Notification',
						userId: mentionedUser.id,
						fromUserId: locals.user.id,
						type: 'mention',
						message: `@${(locals.user as any).name || 'Someone'} mentioned you in a post`,
						linkUrl: `/post/${postId}`,
						relatedPostId: postId
					})
					.catch(() => {});
			}
		}

		await updateUserPoints(locals.user.id);

		return json({ post: newPost[0] }, { status: 201 });
	} catch (error) {
		console.error('Failed to create post:', error);
		return json({ error: 'failed to create post' }, { status: 500 });
	}
};
