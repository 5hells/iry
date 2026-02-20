import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { statusPost, statusPostLike } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const postId = params.id;

		const post = await db.query.statusPost.findFirst({
			where: eq(statusPost.id, postId)
		});

		if (!post) {
			return json({ error: 'post not found' }, { status: 404 });
		}

		const existingLike = await db.query.statusPostLike.findFirst({
			where: and(eq(statusPostLike.statusPostId, postId), eq(statusPostLike.userId, locals.user.id))
		});

		if (existingLike) {
			await db
				.delete(statusPostLike)
				.where(
					and(eq(statusPostLike.statusPostId, postId), eq(statusPostLike.userId, locals.user.id))
				);

			await db
				.update(statusPost)
				.set({ likeCount: post.likeCount - 1 })
				.where(eq(statusPost.id, postId));

			return json({ liked: false, likeCount: post.likeCount - 1 });
		} else {
			await db.insert(statusPostLike).values({
				statusPostId: postId,
				userId: locals.user.id
			});

			await db
				.update(statusPost)
				.set({ likeCount: post.likeCount + 1 })
				.where(eq(statusPost.id, postId));

			return json({ liked: true, likeCount: post.likeCount + 1 });
		}
	} catch (err) {
		console.error('Failed to toggle like:', err);
		return json({ error: 'failed to toggle like' }, { status: 500 });
	}
};
