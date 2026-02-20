import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { track, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

async function requireAdmin(userId?: string) {
	if (!userId) throw error(401, 'Unauthorized');
	const me = await db.query.user.findFirst({ where: eq(user.id, userId) });
	if (!me || me.role !== 'admin') throw error(403, 'Forbidden');
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireAdmin(locals.user?.id);

	const id = params.id;
	if (!id) return error(400, 'Missing track id');

	const body = await request.json().catch(() => ({}));
	const updates: any = {};
	if (body.position !== undefined) updates.position = body.position;
	if (body.title !== undefined) updates.title = body.title;
	if (body.trackNumber !== undefined) updates.trackNumber = Number(body.trackNumber) || null;

	try {
		await db.update(track).set(updates).where(eq(track.id, id));
		return json({ success: true });
	} catch (err) {
		console.error('Failed to update track', err);
		return error(500, 'Failed to update track');
	}
};

export const GET: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!id) return error(400, 'Missing track id');
	try {
		const t = await db.query.track.findFirst({ where: eq(track.id, id) });
		if (!t) return error(404, 'Track not found');
		return json({ track: t });
	} catch (err) {
		console.error('Failed to fetch track', err);
		return error(500, 'Failed to fetch track');
	}
};
