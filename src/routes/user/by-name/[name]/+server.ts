import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq, or } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const rawName = params.name;
	if (!rawName) {
		throw error(400, 'Name is required');
	}

	const name = decodeURIComponent(rawName);
	const match = await db.query.user.findFirst({
		where: or(eq(userTable.name, name), eq(userTable.displayName, name))
	});

	if (!match) {
		throw error(404, 'User not found');
	}

	throw redirect(302, `/user/${match.id}`);
};
