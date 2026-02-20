import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user, userPerk, perk } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

async function requireAdmin(userId?: string) {
	if (!userId) throw error(401, 'Unauthorized');
	const me = await db.query.user.findFirst({ where: eq(user.id, userId) });
	if (!me || me.role !== 'admin') throw error(403, 'Forbidden');
}

export const GET: RequestHandler = async ({ locals }) => {
	await requireAdmin(locals.user?.id);

	const rows = await db.query.userPerk.findMany({
		where: eq(userPerk.isActive, true),
		with: {
			user: { columns: { id: true, name: true, displayName: true, email: true } },
			perk: true
		}
	});

	const proRows = rows
		.filter((r) => r.perk?.name === 'Pro Supporter' || r.perk?.type === 'support')
		.map((r) => {
			let customTag: string | null = null;
			if (r.customConfig) {
				try {
					const cfg = JSON.parse(r.customConfig);
					customTag = cfg.customTag ?? null;
				} catch {
					customTag = null;
				}
			}

			return {
				id: r.id,
				userId: r.userId,
				user: r.user,
				perkId: r.perkId,
				customTag,
				unlockedAt: r.unlockedAt
			};
		});

	return json({ subscriptions: proRows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	await requireAdmin(locals.user?.id);

	const body = await request.json().catch(() => ({}));
	const action = String(body?.action || '').toLowerCase();
	const targetUserId = String(body?.userId || '').trim();
	const customTag = body?.customTag ? String(body.customTag).trim() : null;

	if (!targetUserId) return error(400, 'userId required');
	if (!['grant', 'revoke'].includes(action)) return error(400, 'Invalid action');

	const target = await db.query.user.findFirst({ where: eq(user.id, targetUserId) });
	if (!target) return error(404, 'Target user not found');

	const proPerk = await db.query.perk.findFirst({ where: eq(perk.name, 'Pro Supporter') });
	if (!proPerk) return error(500, 'Pro Supporter perk not found');

	const existing = await db.query.userPerk.findFirst({
		where: and(eq(userPerk.userId, targetUserId), eq(userPerk.perkId, proPerk.id))
	});

	if (action === 'revoke') {
		if (existing) {
			await db.update(userPerk).set({ isActive: false }).where(eq(userPerk.id, existing.id));
		}
		return json({ success: true, action: 'revoke' });
	}

	const cfg = existing?.customConfig
		? (() => {
				try {
					return JSON.parse(existing.customConfig as string);
				} catch {
					return {};
				}
			})()
		: {};
	if (customTag) cfg.customTag = customTag;
	cfg.adminGranted = true;

	if (!existing) {
		await db.insert(userPerk).values({
			userId: targetUserId,
			perkId: proPerk.id,
			isActive: true,
			customConfig: JSON.stringify(cfg)
		});
	} else {
		await db
			.update(userPerk)
			.set({ isActive: true, customConfig: JSON.stringify(cfg) })
			.where(eq(userPerk.id, existing.id));
	}

	return json({ success: true, action: 'grant' });
};
