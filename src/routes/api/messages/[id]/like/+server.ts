import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { directMessage, directMessageLike } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot like messages' }, { status: 403 });
	}

	const messageId = params.id;
	if (!messageId) {
		return json({ error: 'invalid message id' }, { status: 400 });
	}

	try {
		const message = await db.query.directMessage.findFirst({
			where: eq(directMessage.id, messageId)
		});

		if (!message) {
			return json({ error: 'message not found' }, { status: 404 });
		}

		if (message.senderId !== locals.user.id && message.recipientId !== locals.user.id) {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const existingLike = await db.query.directMessageLike.findFirst({
			where: and(
				eq(directMessageLike.messageId, messageId),
				eq(directMessageLike.userId, locals.user.id)
			)
		});

		if (existingLike) {
			await db
				.delete(directMessageLike)
				.where(
					and(
						eq(directMessageLike.messageId, messageId),
						eq(directMessageLike.userId, locals.user.id)
					)
				);

			const nextCount = Math.max(0, message.likeCount - 1);
			await db
				.update(directMessage)
				.set({ likeCount: nextCount })
				.where(eq(directMessage.id, messageId));

			return json({ liked: false, likeCount: nextCount });
		}

		await db.insert(directMessageLike).values({
			userId: locals.user.id,
			messageId: messageId
		});

		await db
			.update(directMessage)
			.set({ likeCount: message.likeCount + 1 })
			.where(eq(directMessage.id, messageId));

		return json({ liked: true, likeCount: message.likeCount + 1 });
	} catch (error) {
		console.error('Failed to toggle message like:', error);
		return json({ error: 'failed to toggle like' }, { status: 500 });
	}
};
