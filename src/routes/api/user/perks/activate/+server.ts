import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { activatePerk } from '$lib/server/points';
import { db } from '$lib/server/db';
import { userPerk } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	let data;
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const { perkId, customConfig } = data;

	if (!perkId) {
		return error(400, 'perkId is required');
	}

	try {
		await activatePerk(locals.user.id, perkId);

		if (customConfig) {
			await db
				.update(userPerk)
				.set({ customConfig: JSON.stringify(customConfig) })
				.where(and(eq(userPerk.userId, locals.user.id), eq(userPerk.perkId, perkId)));
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error activating perk:', err);
		return error(500, err instanceof Error ? err.message : 'Failed to activate perk');
	}
};
