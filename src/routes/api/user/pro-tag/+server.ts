import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userPerk } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || (locals.user as any).isGuest) return error(401, 'Authentication required');

	const body = await request.json().catch(() => ({}));
	const tag = body?.tag?.toString()?.trim() || null;

	try {
		const existing = (
			await db.query.userPerk.findMany({
				where: and(eq(userPerk.userId, locals.user.id), eq(userPerk.isActive, true)),
				with: { perk: true }
			})
		).find((row: any) => row.perk?.type === 'support' || row.perk?.name === 'Pro Supporter');
		if (!existing) return error(404, 'Active pro perk not found');

		const cfg = existing.customConfig
			? (() => {
					try {
						return JSON.parse(existing.customConfig as string);
					} catch {
						return {};
					}
				})()
			: {};
		cfg.customTag = tag;

		await db
			.update(userPerk)
			.set({ customConfig: JSON.stringify(cfg) })
			.where(eq(userPerk.id, existing.id));

		return json({ success: true, customTag: tag });
	} catch (err: any) {
		console.error('pro-tag update error', err);
		return error(500, err.message || 'Failed to update pro tag');
	}
};
