import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { follow, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	const type = url.searchParams.get('type'); 

	if (!userId) {
		return json({ error: 'userId is required' }, { status: 400 });
	}

	if (!type || !['followers', 'following'].includes(type)) {
		return json({ error: 'type must be "followers" or "following"' }, { status: 400 });
	}

	try {
		let relationships;

		if (type === 'followers') {
			
			relationships = await db.query.follow.findMany({
				where: eq(follow.followingId, userId),
				with: {
					follower: {
						columns: {
							id: true,
							name: true,
							displayName: true,
							image: true,
							bio: true
						}
					}
				}
			});
		} else {
			
			relationships = await db.query.follow.findMany({
				where: eq(follow.followerId, userId),
				with: {
					following: {
						columns: {
							id: true,
							name: true,
							displayName: true,
							image: true,
							bio: true
						}
					}
				}
			});
		}

		const users = relationships.map(rel => 
			type === 'followers' ? rel.follower : rel.following
		);

		return json({
			[type]: users,
			count: users.length
		});
	} catch (error) {
		console.error(`Failed to fetch ${type}:`, error);
		return json({ error: `failed to fetch ${type}` }, { status: 500 });
	}
};
