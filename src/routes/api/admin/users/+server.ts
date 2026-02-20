import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';

export const prerender = false;

export const GET: RequestHandler = async ({ locals }) => {
	const me = locals.user;
	if (
		!me ||
		(await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, me.id))
			.then((r) => r[0]?.role)) !== 'admin'
	) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const rows = await db.select().from(userTable).limit(200);
	return json({ users: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const me = locals.user;
	if (
		!me ||
		(await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, me.id))
			.then((r) => r[0]?.role)) !== 'admin'
	)
		return json({ error: 'unauthorized' }, { status: 401 });

	const payload = await request.json();
	const { id, role, newsletterSubscribed } = payload;
	if (!id) return json({ error: 'missing_id' }, { status: 400 });

	const updates: Partial<{ role: string; newsletterSubscribed: boolean }> = {};
	if (role) updates.role = role;
	if (typeof newsletterSubscribed === 'boolean')
		updates.newsletterSubscribed = newsletterSubscribed;

	await db.update(userTable).set(updates).where(eq(userTable.id, id));
	return json({ status: 'ok' });
};
