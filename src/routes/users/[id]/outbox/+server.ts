import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { albumReview } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const userId = params.id;
	const domain = url.hostname;
	const protocol = url.protocol;
	const page = parseInt(url.searchParams.get('page') || '1', 10);

	const userData = await db
		.select({ id: userTable.id, name: userTable.name })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (userData.length === 0) {
		return error(404, 'User not found');
	}

	const user = userData[0];

	const pageSize = 20;
	const offset = (page - 1) * pageSize;

	const userReviews = await db
		.select()
		.from(albumReview)
		.where(eq(albumReview.userId, userId))
		.orderBy(desc(albumReview.createdAt))
		.limit(pageSize)
		.offset(offset);

	const totalReviews = await db
		.select({ count: eq(albumReview.id, '*') })
		.from(albumReview)
		.where(eq(albumReview.userId, userId));

	const totalItems = totalReviews[0]?.count || 0;
	const totalPages = Math.ceil(Number(totalItems) / pageSize);

	if (page > 0) {
		return json(
			{
				'@context': 'https://www.w3.org/ns/activitystreams',
				id: `${protocol}//${domain}/users/${userId}/outbox?page=${page}`,
				type: 'OrderedCollectionPage',
				partOf: `${protocol}//${domain}/users/${userId}/outbox`,
				prev:
					page > 1 ? `${protocol}//${domain}/users/${userId}/outbox?page=${page - 1}` : undefined,
				next:
					page < totalPages
						? `${protocol}//${domain}/users/${userId}/outbox?page=${page + 1}`
						: undefined,
				startIndex: offset,
				orderedItems: userReviews.map((r: any) => ({
					'@context': 'https://www.w3.org/ns/activitystreams',
					type: 'Create',
					actor: `${protocol}//${domain}/users/${userId}`,
					published: new Date(r.createdAt).toISOString(),
					object: {
						type: 'Note',
						id: `${protocol}//${domain}/reviews/${r.id}`,
						attributedTo: `${protocol}//${domain}/users/${userId}`,
						content: r.reviewText || 'Music review',
						published: new Date(r.createdAt).toISOString(),
						url: `${protocol}//${domain}/reviews/${r.id}`
					}
				}))
			},
			{
				headers: {
					'content-type': 'application/activity+json'
				}
			}
		);
	}

	return json(
		{
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${protocol}//${domain}/users/${userId}/outbox`,
			type: 'OrderedCollection',
			totalItems: totalItems,
			first: `${protocol}//${domain}/users/${userId}/outbox?page=1`,
			last: `${protocol}//${domain}/users/${userId}/outbox?page=${Math.max(1, totalPages)}`
		},
		{
			headers: {
				'content-type': 'application/activity+json'
			}
		}
	);
};
