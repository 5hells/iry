import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { perk, userPoints } from '$lib/server/db/schema';
import { getUserPerks } from '$lib/server/points';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	try {
		const allPerks = await db.query.perk.findMany();

		const userPerks = await getUserPerks(locals.user.id);
		const unlockedPerkIds = new Set(userPerks.map((p) => p.id));

		const points = await db.query.userPoints.findFirst({
			where: eq(userPoints.userId, locals.user.id)
		});

		const unlocked = userPerks.map((p) => {
			const parsed = p.config ? JSON.parse(p.config as string) : null;
			return {
				...p,
				configParsed: parsed
			};
		});
		const locked = allPerks
			.filter((p) => !unlockedPerkIds.has(p.id as string))
			.map((p) => {
				const parsed = p.config ? JSON.parse(p.config as string) : null;
				return {
					...p,
					configParsed: parsed
				};
			});

		return json({
			unlocked,
			locked,
			totalPoints: points?.totalPoints || 0,
			level: points?.level || 1
		});
	} catch (err) {
		console.error('Error fetching perks:', err);
		return error(500, 'Failed to fetch perks');
	}
};
