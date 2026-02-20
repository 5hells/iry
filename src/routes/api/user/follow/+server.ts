import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { follow } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot follow' }, { status: 403 });
	}

	try {
		const { userId } = await request.json();

		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		if (userId === locals.user.id) {
			return json({ error: 'cannot follow yourself' }, { status: 400 });
		}

		
		const existing = await db.query.follow.findFirst({
			where: and(
				eq(follow.followerId, locals.user.id),
				eq(follow.followingId, userId)
			)
		});

		if (existing) {
			return json({ error: 'already following' }, { status: 400 });
		}

		
		await db.insert(follow).values({
			followerId: locals.user.id,
			followingId: userId
		});

		return json({ success: true });
	} catch (error) {
		console.error('Failed to follow user:', error);
		return json({ error: 'failed to follow user' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const { userId } = await request.json();

		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		
		await db.delete(follow).where(
			and(
				eq(follow.followerId, locals.user.id),
				eq(follow.followingId, userId)
			)
		);

		return json({ success: true });
	} catch (error) {
		console.error('Failed to unfollow user:', error);
		return json({ error: 'failed to unfollow user' }, { status: 500 });
	}
};
