import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const resource = url.searchParams.get('resource');

	if (!resource) {
		return error(400, 'Missing resource parameter');
	}

	let username: string | null = null;
	const domain = url.hostname;

	if (resource.startsWith('acct:')) {
		const acctPart = resource.slice(5); 
		const [user, host] = acctPart.split('@');
		if (host !== domain) {
			return error(404, 'User not found');
		}
		username = user;
	} else if (resource.startsWith('https://') || resource.startsWith('http://')) {
		const resourceUrl = new URL(resource);
		if (resourceUrl.hostname !== domain) {
			return error(404, 'User not found');
		}
		const pathParts = resourceUrl.pathname.split('/');
		if (pathParts[1] === 'users' && pathParts[2]) {
			username = pathParts[2];
		}
	}

	if (!username) {
		return error(400, 'Invalid resource format');
	}

	const userData = await db
		.select({
			id: userTable.id,
			name: userTable.name
		})
		.from(userTable)
		.where(eq(userTable.name, username))
		.limit(1);

	if (userData.length === 0) {
		return error(404, 'User not found');
	}

	const user = userData[0];
	const protocol = url.protocol;

	return json({
		subject: `acct:${username}@${domain}`,
		aliases: [
			`${protocol}//${domain}/users/${user.id}`,
			`${protocol}//${domain}/users/${username}`
		],
		links: [
			{
				rel: 'self',
				type: 'application/activity+json',
				href: `${protocol}//${domain}/users/${user.id}`
			},
			{
				rel: 'http://webfinger.net/rel/profile-page',
				type: 'text/html',
				href: `${protocol}//${domain}/user/${user.id}`
			}
		]
	});
};
