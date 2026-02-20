import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { collection, collectionTrack } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url, locals }) => {
	const userId = url.searchParams.get('userId');
	const isPublic = url.searchParams.get('public') !== 'false';

	try {
		let collections: any[] = [];
		if (userId) {
			collections = await db.query.collection.findMany({
				where: userId
					? and(eq(collection.userId, userId), isPublic ? eq(collection.isPublic, true) : undefined)
					: undefined,
				with: {
					user: {
						columns: { id: true, name: true, image: true }
					},
					tracks: {
						with: { track: true }
					}
				}
			});
		} else if (locals.user) {
			collections = await db.query.collection.findMany({
				where: eq(collection.userId, locals.user.id),
				with: {
					user: {
						columns: { id: true, name: true, image: true }
					},
					tracks: {
						with: { track: true }
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
		} else {
			collections = [];
		}

		return json({
			collections: collections.map((c) => ({
				...c,
				createdAt: typeof c.createdAt === 'number' ? c.createdAt : (c.createdAt as any).getTime(),
				updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : (c.updatedAt as any).getTime()
			}))
		});
	} catch (error) {
		console.error('Failed to fetch collections:', error);
		return json({ error: 'failed to fetch collections' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { title, description, isOrdered = false, isPublic = true } = body;

		if (!title || !title.trim()) {
			return json({ error: 'title required' }, { status: 400 });
		}

		const result = await db.insert(collection).values({
			userId: locals.user.id,
			title: title.trim(),
			description: description?.trim() || null,
			isOrdered,
			isPublic
		});

		const collId = typeof result === 'object' && result ? Object.values(result)[0] : null;

		return json(
			{
				id: collId,
				title,
				description,
				isOrdered,
				isPublic
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Failed to create collection:', error);
		return json({ error: 'failed to create collection' }, { status: 500 });
	}
};
