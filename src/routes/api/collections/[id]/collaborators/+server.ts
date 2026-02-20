import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection, collectionCollaborator } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		const collaborators = await db.query.collectionCollaborator.findMany({
			where: eq(collectionCollaborator.collectionId, id),
			with: {
				user: {
					columns: { id: true, name: true, image: true }
				}
			}
		});

		return json({ collaborators });
	} catch (error) {
		console.error('Failed to fetch collection collaborators:', error);
		return json({ error: 'failed to fetch collaborators' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		if (coll.userId !== locals.user.id) {
			return json({ error: 'only collection owner can add collaborators' }, { status: 403 });
		}

		const body = await request.json();
		const { userId, role = 'contributor' } = body;

		if (!userId) {
			return json({ error: 'user id required' }, { status: 400 });
		}

		const existing = await db.query.collectionCollaborator.findFirst({
			where: and(
				eq(collectionCollaborator.collectionId, id),
				eq(collectionCollaborator.userId, userId)
			)
		});

		if (existing) {
			return json({ error: 'user already collaborator' }, { status: 400 });
		}

		await db.insert(collectionCollaborator).values({
			collectionId: id,
			userId,
			role
		});

		return json({ success: true }, { status: 201 });
	} catch (error) {
		console.error('Failed to add collection collaborator:', error);
		return json({ error: 'failed to add collaborator' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id)
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		if (coll.userId !== locals.user.id) {
			return json({ error: 'only collection owner can remove collaborators' }, { status: 403 });
		}

		const body = await request.json();
		const { userId } = body;

		if (!userId) {
			return json({ error: 'user id required' }, { status: 400 });
		}

		await db
			.delete(collectionCollaborator)
			.where(
				and(eq(collectionCollaborator.collectionId, id), eq(collectionCollaborator.userId, userId))
			);

		return json({ success: true });
	} catch (error) {
		console.error('Failed to remove collection collaborator:', error);
		return json({ error: 'failed to remove collaborator' }, { status: 500 });
	}
};
