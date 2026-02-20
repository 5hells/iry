import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection, collectionTrack } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		const coll = await db.query.collection.findFirst({
			where: eq(collection.id, id),
			with: {
				user: {
					columns: { id: true, name: true, image: true }
				},
				tracks: {
					with: {
						track: {
							columns: {
								id: true,
								title: true,
								trackNumber: true,
								durationMs: true
							}
						}
					},
					orderBy: (ct) => ct.position
				},
				collaborators: {
					with: {
						user: {
							columns: { id: true, name: true, image: true }
						}
					}
				}
			}
		});

		if (!coll) {
			return json({ error: 'collection not found' }, { status: 404 });
		}

		return json(coll);
	} catch (error) {
		console.error('Failed to fetch collection:', error);
		return json({ error: 'failed to fetch collection' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
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

		const role = (locals.user as any)?.role;
		if (coll.userId !== locals.user.id && role !== 'admin' && role !== 'moderator') {
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const { title, description, isPublic } = body;

		await db
			.update(collection)
			.set({
				title: title !== undefined ? title : coll.title,
				description: description !== undefined ? description : coll.description,
				isPublic: isPublic !== undefined ? isPublic : coll.isPublic,
				updatedAt: new Date()
			})
			.where(eq(collection.id, id));

		return json({ success: true });
	} catch (error) {
		console.error('Failed to update collection:', error);
		return json({ error: 'failed to update collection' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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
			return json({ error: 'forbidden' }, { status: 403 });
		}

		await db.delete(collection).where(eq(collection.id, id));

		return json({ success: true });
	} catch (error) {
		console.error('Failed to delete collection:', error);
		return json({ error: 'failed to delete collection' }, { status: 500 });
	}
};
