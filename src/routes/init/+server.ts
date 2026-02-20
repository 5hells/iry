import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { auth } from '$lib/server/auth';
import { eq } from 'drizzle-orm';

export const prerender = false;

export const GET: RequestHandler = async () => {
	const admins = await db.select().from(userTable).where(eq(userTable.role, 'admin')).limit(1);
	return json({ needsInit: admins.length === 0 });
};

export const POST: RequestHandler = async ({ request }) => {
	const payload = await request.json();
	const { name, email, password } = payload;
	if (!name || !email || !password) return json({ error: 'missing_fields' }, { status: 400 });

	const admins = await db.select().from(userTable).where(eq(userTable.role, 'admin')).limit(1);
	if (admins.length > 0) return json({ error: 'already_initialized' }, { status: 400 });

	const result = await auth.api.signUpEmail({ body: { email, password, name } });
	if (!result || (result as Partial<{ status: number }>)?.status || 0 >= 400) {
		return json({ error: 'signup_failed', result }, { status: 500 });
	}

	const created = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
	if (created.length === 0) return json({ error: 'user_not_found' }, { status: 500 });

	await db
		.update(userTable)
		.set({ role: 'admin', newsletterSubscribed: true })
		.where(eq(userTable.email, email));
	return json({ status: 'ok' });
};
