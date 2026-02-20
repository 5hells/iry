import { db } from '$lib/server/db';
import {
	userPoints,
	albumReview,
	trackReview,
	userPerk,
	perk,
	statusPost
} from '$lib/server/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';

const POINTS = {
	ALBUM_REVIEW: 10,
	ALBUM_REVIEW_WITH_TEXT: 15,
	TRACK_REVIEW: 2,
	TRACK_REVIEW_WITH_TEXT: 3,
	FULL_ALBUM_TRACK_REVIEWS: 20, 
	FEED_POST: 2
};

const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500];

export function calculateLevel(totalPoints: number): number {
	let level = 1;
	for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
		if (totalPoints >= LEVEL_THRESHOLDS[i]) {
			level = i + 1;
			break;
		}
	}
	return level;
}

export async function calculateReviewPoints(
	reviewText: string | null,
	trackReviewCount: number,
	totalTracks: number
): Promise<number> {
	let points = POINTS.ALBUM_REVIEW;

	if (reviewText && reviewText.length > 50) {
		points = POINTS.ALBUM_REVIEW_WITH_TEXT;
	}

	points += trackReviewCount * POINTS.TRACK_REVIEW;

	if (trackReviewCount === totalTracks && totalTracks > 0) {
		points += POINTS.FULL_ALBUM_TRACK_REVIEWS;
	}

	return points;
}

export async function updateUserPoints(userId: string) {
	const reviews = await db.query.albumReview.findMany({
		where: eq(albumReview.userId, userId),
		with: {
			trackReviews: true
		}
	});

	const reviewCount = reviews.length;
	const trackReviewCount = reviews.reduce(
		(sum, review) => sum + (review.trackReviews?.length || 0),
		0
	);

	const reviewPoints = reviews.reduce((sum, review) => sum + review.pointsAwarded, 0);

	const postCountResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(statusPost)
		.where(and(eq(statusPost.userId, userId), isNull(statusPost.parentPostId)));
	const postCount = postCountResult[0]?.count ?? 0;
	const postPoints = postCount * POINTS.FEED_POST;

	const totalPoints = reviewPoints + postPoints;

	const level = calculateLevel(totalPoints);

	const existing = await db.query.userPoints.findFirst({
		where: eq(userPoints.userId, userId)
	});

	if (existing) {
		await db
			.update(userPoints)
			.set({
				totalPoints,
				level,
				reviewCount,
				trackReviewCount
			})
			.where(eq(userPoints.userId, userId));
	} else {
		await db.insert(userPoints).values({
			userId,
			totalPoints,
			level,
			reviewCount,
			trackReviewCount
		});
	}

	await checkUnlockedPerks(userId, totalPoints);

	return { totalPoints, level, reviewCount, trackReviewCount };
}

async function checkUnlockedPerks(userId: string, totalPoints: number) {
	const availablePerks = await db.query.perk.findMany();

	const userPerks = await db.query.userPerk.findMany({
		where: eq(userPerk.userId, userId)
	});

	const unlockedPerkIds = new Set(userPerks.map((up) => up.perkId));

	const newPerks = availablePerks.filter((p) => {
		const pointsReq = Number((p as any).pointsRequired || 0);
		const pid = String((p as any).id);
		return pointsReq <= totalPoints && !unlockedPerkIds.has(pid);
	});

	if (newPerks.length > 0) {
		await db.insert(userPerk).values(
			newPerks.map((p) => ({
				userId,
				perkId: String((p as any).id)
			}))
		);
	}

	return newPerks;
}

export async function getUserPerks(userId: string) {
	const perks = await db.query.userPerk.findMany({
		where: eq(userPerk.userId, userId),
		with: {
			perk: true
		}
	});

	return perks.map((up) => ({
		...up.perk,
		unlockedAt: up.unlockedAt,
		isActive: up.isActive,
		customConfig: up.customConfig
			? (() => {
					try {
						return JSON.parse(up.customConfig as string);
					} catch {
						return null;
					}
				})()
			: null
	}));
}

export async function activatePerk(userId: string, perkId: string) {
	const perkToActivate = await db.query.perk.findFirst({
		where: eq(perk.id, perkId)
	});

	if (!perkToActivate) {
		throw new Error('Perk not found');
	}

	const userPerksOfType: any[] = await db.query.userPerk.findMany({
		where: eq(userPerk.userId, userId),
		with: {
			perk: true
		}
	});

	for (const up of userPerksOfType) {
		if (up.perk.type === perkToActivate.type) {
			await db
				.update(userPerk)
				.set({ isActive: false })
				.where(and(eq(userPerk.userId, userId), eq(userPerk.perkId, up.perkId)));
		}
	}

	await db
		.update(userPerk)
		.set({ isActive: true })
		.where(and(eq(userPerk.userId, userId), eq(userPerk.perkId, perkId)));
}
