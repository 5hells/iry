import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, statusPost, notification } from '$lib/server/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	if ((locals.user as any).isGuest) {
		return json({ error: 'guest users cannot reply' }, { status: 403 });
	}

	const reviewId = params.id;
	if (!reviewId) {
		return json({ error: 'invalid review id' }, { status: 400 });
	}

	try {
		const body = await request.json();
		const { content } = body;

		if (!content || !content.trim()) {
			return json({ error: 'reply content required' }, { status: 400 });
		}

		if (content.length > 500) {
			return json({ error: 'content too long (max 500 characters)' }, { status: 400 });
		}

		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, reviewId),
			with: {
				user: {
					columns: {
						id: true,
						name: true
					}
				}
			}
		});

		if (!review) {
			return json({ error: 'review not found' }, { status: 404 });
		}

		let reviewPost = await db.query.statusPost.findFirst({
			where: and(eq(statusPost.reviewId, reviewId), isNull(statusPost.parentPostId))
		});

		if (!reviewPost) {
			const [newPost] = await db
				.insert(statusPost)
				.values({
					userId: review.userId,
					content: review.reviewText || `Reviewed with a ${review.rating}/10`,
					imageUrls: null,
					reviewId: reviewId,
					albumId: review.albumId,
					parentPostId: null
				})
				.returning();
			reviewPost = newPost;
		}

		const comment = await db
			.insert(statusPost)
			.values({
				userId: locals.user.id,
				content: content.trim(),
				imageUrls: null,
				reviewId: reviewId,
				albumId: review.albumId,
				parentPostId: reviewPost.id
			})
			.returning();

		await db
			.update(statusPost)
			.set({ replyCount: (reviewPost.replyCount || 0) + 1 })
			.where(eq(statusPost.id, reviewPost.id));

		if (review.userId !== locals.user.id) {
			await db.insert(notification).values({
				userId: review.userId,
				type: 'review_reply',
				title: 'New review reply',
				message: `${locals.user.name} replied to your review`,
				linkUrl: `/review/${reviewId}`,
				fromUserId: locals.user.id,
				isRead: false
			});
		}

		return json(
			{
				success: true,
				comment: {
					...comment[0],
					createdAt:
						typeof comment[0].createdAt === 'number'
							? comment[0].createdAt
							: (comment[0].createdAt as any).getTime(),
					updatedAt:
						typeof comment[0].updatedAt === 'number'
							? comment[0].updatedAt
							: (comment[0].updatedAt as any).getTime(),
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
