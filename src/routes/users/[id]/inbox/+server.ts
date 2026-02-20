import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

interface ActivityPubActivity {
	'@context'?: string | string[];
	type: string;
	actor?: string;
	object?: any;
	target?: string;
	[key: string]: any;
}

export const POST: RequestHandler = async ({ params, request, url }) => {
	const userId = params.id;

	const userData = await db
		.select({ id: userTable.id })
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (userData.length === 0) {
		return error(404, 'User not found');
	}

	try {
		const activity: ActivityPubActivity = await request.json();

		if (!activity.type || !activity.actor) {
			return json({ error: 'Invalid activity' }, { status: 400 });
		}

		switch (activity.type) {
			case 'Follow':
				console.log(`Received follow request from ${activity.actor}`);

				break;

			case 'Undo':
				if (activity.object?.type === 'Follow') {
					console.log(`Received unfollow from ${activity.actor}`);
				}
				break;

			case 'Like':
				console.log(`Received like from ${activity.actor}`);
				break;

			case 'Announce':
				console.log(`Received announce from ${activity.actor}`);
				break;

			case 'Create':
				if (activity.object?.inReplyTo) {
					console.log(`Received reply from ${activity.actor}`);
				} else {
					console.log(`Received post from ${activity.actor}`);
				}
				break;

			default:
				console.log(`Received unknown activity type: ${activity.type}`);
		}

		return json({ status: 'accepted' }, { status: 202 });
	} catch (err) {
		console.error('Inbox error:', err);
		return error(400, 'Invalid request');
	}
};

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
			id: `${protocol}//${domain}/users/${userId}/inbox`,
			type: 'OrderedCollection',
			totalItems: 0,
			first: `${protocol}//${domain}/users/${userId}/inbox?page=1`,
			last: `${protocol}//${domain}/users/${userId}/inbox?page=1`
		},
		{
			headers: {
				'content-type': 'application/activity+json'
			}
		}
	);
};
