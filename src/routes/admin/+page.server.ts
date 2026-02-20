import { db, user } from '$lib/server/db';
import { and, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user;
	if (!me) throw redirect(302, '/auth/login');
	const admin = await db.query.user.findFirst({
		where: and(eq(user.id, me.id), eq(user.role, 'admin'))
	});
	if (!admin) throw redirect(302, '/auth/login');
	return {};
};
