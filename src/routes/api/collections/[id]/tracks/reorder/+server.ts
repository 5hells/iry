import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection, collectionTrack } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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
			return json({ error: 'forbidden' }, { status: 403 });
		}

		const body = await request.json();
		const { trackPositions } = body;

		if (!trackPositions || !Array.isArray(trackPositions)) {
			return json({ error: 'track positions required' }, { status: 400 });
		}

		for (const { trackId, position } of trackPositions) {
			await db
				.update(collectionTrack)
				.set({ position })
				.where(eq(collectionTrack.trackId, trackId));
		}

		return json({ success: true });
	} catch (error) {
		console.error('Failed to reorder tracks:', error);
		return json({ error: 'failed to reorder tracks' }, { status: 500 });
	}
};
