import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { statusPost, statusPostLike } from '$lib/server/db/schema';
import { updateUserPoints } from '$lib/server/points';
import { eq } from 'drizzle-orm';

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

		const role = (locals.user as any)?.role;
		const canModerate = role === 'admin' || role === 'moderator';

		if (post.userId !== locals.user.id && !canModerate) {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		await db.delete(statusPostLike).where(eq(statusPostLike.statusPostId, postId));

		await db.delete(statusPost).where(eq(statusPost.id, postId));

		await updateUserPoints(post.userId);

		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete post:', error);
		return json({ error: 'failed to delete post' }, { status: 500 });
	}
};
