import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { statusPost, notification } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot reply' }, { status: 403 });
	}

	const postId = params.id;
	if (!postId) {
		return json({ error: 'invalid post id' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { content, imageUrls } = body;

		if (!content || !content.trim()) {
			return json({ error: 'reply content required' }, { status: 400 });
		}

		if (content.length > 500) {
			return json({ error: 'content too long (max 500 characters)' }, { status: 400 });
		}

		const post = await db.query.statusPost.findFirst({
			where: eq(statusPost.id, postId),
			with: {
				user: {
					columns: { id: true, name: true }
				}
			}
		});

		if (!post) {
			return json({ error: 'post not found' }, { status: 404 });
		}

		const reply = await db
			.insert(statusPost)
			.values({
				userId: locals.user.id,
				content: content.trim(),
				imageUrls: imageUrls && imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
				parentPostId: postId,
				albumId: null,
				reviewId: null
			})
			.returning();

		return json(
			{
				success: true,
				reply: {
					...(reply as any)[0],
					createdAt:
						typeof (reply as any)[0].createdAt === 'number'
							? (reply as any)[0].createdAt
							: ((reply as any)[0].createdAt as any).getTime(),
					updatedAt:
						typeof (reply as any)[0].updatedAt === 'number'
							? (reply as any)[0].updatedAt
							: ((reply as any)[0].updatedAt as any).getTime(),
					imageUrls: (reply as any)[0].imageUrls ? JSON.parse((reply as any)[0].imageUrls) : [],
					user: {
						id: locals.user.id,
						name: locals.user.name,
						image: (locals.user as any).image || null
					}
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Failed to create reply:', error);
		return json({ error: 'failed to create reply' }, { status: 500 });
	}
};
