import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { blockedUser } from '$lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const blocked = await db.query.blockedUser.findMany({
			where: eq(blockedUser.userId, locals.user.id),
			with: {
				blockedUser: {
					columns: {
						id: true,
						name: true,
						image: true
					}
				}
			}
		});

		return json({
			blockedUsers: blocked.map((b) => b.blockedUser)
		});
	} catch (error) {
		console.error('Failed to fetch blocked users:', error);
		return json({ error: 'failed to fetch blocked users' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot block' }, { status: 403 });
	}

	try {
		const { userId, action } = await request.json();

		if (!userId || !action) {
			return json({ error: 'userId and action are required' }, { status: 400 });
		}

		if (userId === locals.user.id) {
			return json({ error: 'cannot block yourself' }, { status: 400 });
		}

		if (action === 'block') {
			const existing = await db.query.blockedUser.findFirst({
				where: and(eq(blockedUser.userId, locals.user.id), eq(blockedUser.blockedUserId, userId))
			});

			if (existing) {
				return json({ error: 'user already blocked' }, { status: 400 });
			}

			await db.insert(blockedUser).values({
				userId: locals.user.id,
				blockedUserId: userId
			});

			return json({ success: true, blocked: true });
		} else if (action === 'unblock') {
			await db
				.delete(blockedUser)
				.where(and(eq(blockedUser.userId, locals.user.id), eq(blockedUser.blockedUserId, userId)));

			return json({ success: true, blocked: false });
		} else {
			return json({ error: 'invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Failed to block/unblock user:', error);
		return json({ error: 'failed to process request' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const { userId } = await request.json();

		if (!userId) {
			return json({ error: 'userId is required' }, { status: 400 });
		}

		
		
		const blocked = await db.query.blockedUser.findFirst({
			where: and(eq(blockedUser.userId, locals.user.id), eq(blockedUser.blockedUserId, userId))
		});

		return json({ blocked: !!blocked });
	} catch (error) {
		console.error('Failed to check block status:', error);
		return json({ error: 'failed to check block status' }, { status: 500 });
	}
};
