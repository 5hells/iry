import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { albumReview } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
	const userId = params.id;
	const domain = url.hostname;
	const protocol = url.protocol;

	const userData = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			image: userTable.image
		})
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (userData.length === 0) {
		return error(404, 'User not found');
	}

	const user = userData[0];

	const reviewCount = await db
		.select({ count: eq(albumReview.id, '*') })
		.from(albumReview)
		.where(eq(albumReview.userId, userId));

	const reviewsCount = (reviewCount[0]?.count as number) || 0;
	const baseUrl = `${protocol}//${domain}`;
	const userUrl = `${baseUrl}/users/${user.id}`;

	return json(
		{
			'@context': [
				'https://www.w3.org/ns/activitystreams',
				'https://w3id.org/security/v1',
				{
					PropertyValue: 'schema:PropertyValue',
					value: 'schema:value',
					identity: 'schema:identity',
					proof: 'sec:proof'
				}
			],
			id: userUrl,
			type: 'Person',
			name: user.name || `User ${user.id.slice(0, 8)}`,
			preferredUsername: user.name || `user${user.id.slice(0, 8)}`,
			summary: `Music reviewer on iry with ${reviewsCount} reviews`,
			icon: user.image
				? {
						type: 'Image',
						url: user.image
					}
				: undefined,
			image: user.image
				? {
						type: 'Image',
						url: user.image
					}
				: undefined,
			url: `${baseUrl}/user/${user.id}`,
			inbox: `${userUrl}/inbox`,
			outbox: `${userUrl}/outbox`,
			followers: `${userUrl}/followers`,
			following: `${userUrl}/following`,
			featured: `${userUrl}/collections/featured`,
			publicKey: {
				id: `${userUrl}#main-key`,
				owner: userUrl,
				publicKeyPem: `-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z0F...\n-----END PUBLIC KEY-----`
			},
			attachment: [
				{
					type: 'PropertyValue',
					name: 'Reviews',
					value: reviewsCount.toString()
				},
				{
					type: 'PropertyValue',
					name: 'Profile',
					value: `<a href="${baseUrl}/user/${user.id}" rel="me">iry</a>`
				}
			],
			discoverable: true,
			published: new Date().toISOString(),
			endpoints: {
				sharedInbox: `${baseUrl}/inbox`
			}
		},
		{
			headers: {
				'content-type': 'application/activity+json'
			}
		}
	);
};
