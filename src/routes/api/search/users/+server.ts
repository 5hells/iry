import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { like } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q');

	if (!q || q.length < 1) {
		return json({ users: [] });
	}

	try {
		const users = await db
			.select({
				id: userTable.id,
				name: userTable.name,
				image: userTable.image
			})
			.from(userTable)
			.where(like(userTable.name, `%${q}%`))
			.limit(8);

		return json({ users });
	} catch (error) {
		console.error('Failed to search users:', error);
		return json({ users: [], error: 'Failed to search users' }, { status: 500 });
	}
};
