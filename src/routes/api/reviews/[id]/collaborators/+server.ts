import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { albumReview, reviewCollaborator, user } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, id)
		});

		if (!review) {
			return json({ error: 'review not found' }, { status: 404 });
		}

		const collaborators = await db.query.reviewCollaborator.findMany({
			where: eq(reviewCollaborator.reviewId, id),
			with: {
				user: {
					columns: { id: true, name: true, image: true }
				}
			}
		});

		return json({ collaborators });
	} catch (error) {
		console.error('Failed to fetch review collaborators:', error);
		return json({ error: 'failed to fetch collaborators' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, id)
		});

		if (!review) {
			return json({ error: 'review not found' }, { status: 404 });
		}

		if (review.userId !== locals.user.id) {
			return json({ error: 'only review owner can add collaborators' }, { status: 403 });
		}

		const body = await request.json();
		const { userId, role = 'contributor' } = body;

		if (!userId) {
			return json({ error: 'user id required' }, { status: 400 });
		}

		const existing = await db.query.reviewCollaborator.findFirst({
			where: and(eq(reviewCollaborator.reviewId, id), eq(reviewCollaborator.userId, userId))
		});

		if (existing) {
			return json({ error: 'user already collaborator' }, { status: 400 });
		}

		await db.insert(reviewCollaborator).values({
			reviewId: id,
			userId,
			role
		});

		return json({ success: true }, { status: 201 });
	} catch (error) {
		console.error('Failed to add review collaborator:', error);
		return json({ error: 'failed to add collaborator' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const review = await db.query.albumReview.findFirst({
			where: eq(albumReview.id, id)
		});

		if (!review) {
			return json({ error: 'review not found' }, { status: 404 });
		}

		if (review.userId !== locals.user.id) {
			return json({ error: 'only review owner can remove collaborators' }, { status: 403 });
		}

		const body = await request.json();
		const { userId } = body;

		if (!userId) {
			return json({ error: 'user id required' }, { status: 400 });
		}

		await db
			.delete(reviewCollaborator)
			.where(and(eq(reviewCollaborator.reviewId, id), eq(reviewCollaborator.userId, userId)));

		return json({ success: true });
	} catch (error) {
		console.error('Failed to remove review collaborator:', error);
		return json({ error: 'failed to remove collaborator' }, { status: 500 });
	}
};
