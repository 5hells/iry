import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const userId = params.id;
	const domain = url.hostname;
	const protocol = url.protocol;

	const userData = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (userData.length === 0) {
		return error(404, 'User not found');
	}

	return json(
		{
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${protocol}//${domain}/users/${userId}/following`,
			type: 'OrderedCollection',
			totalItems: 0,
			first: `${protocol}//${domain}/users/${userId}/following?page=1`
		},
		{
			headers: {
				'content-type': 'application/activity+json'
			}
		}
	);
};
