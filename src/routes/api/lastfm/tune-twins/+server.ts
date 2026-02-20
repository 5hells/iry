import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { lastfmScrobble, user } from '$lib/server/db/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';

async function calculateSimilarity(userId1: string, userId2: string): Promise<number> {
	const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

	const user1Artists = await db
		.select({ artist: lastfmScrobble.artist, count: sql<number>`count(*)` })
		.from(lastfmScrobble)
		.where(
			and(
				eq(lastfmScrobble.userId, userId1),
				gte(lastfmScrobble.timestamp, ninetyDaysAgo),
				eq(lastfmScrobble.nowPlaying, false)
			)
		)
		.groupBy(lastfmScrobble.artist)
		.orderBy(desc(sql`count(*)`))
		.limit(100);

	const user2Artists = await db
		.select({ artist: lastfmScrobble.artist, count: sql<number>`count(*)` })
		.from(lastfmScrobble)
		.where(
			and(
				eq(lastfmScrobble.userId, userId2),
				gte(lastfmScrobble.timestamp, ninetyDaysAgo),
				eq(lastfmScrobble.nowPlaying, false)
			)
		)
		.groupBy(lastfmScrobble.artist)
		.orderBy(desc(sql`count(*)`))
		.limit(100);

	const user1ArtistMap = new Map(user1Artists.map((a) => [a.artist.toLowerCase(), a.count]));
	const user2ArtistMap = new Map(user2Artists.map((a) => [a.artist.toLowerCase(), a.count]));

	const sharedArtists = new Set(
		[...user1ArtistMap.keys()].filter((artist) => user2ArtistMap.has(artist))
	);

	if (sharedArtists.size === 0) return 0;

	const union = new Set([...user1ArtistMap.keys(), ...user2ArtistMap.keys()]);
	const similarity = sharedArtists.size / union.size;

	return similarity;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const limit = parseInt(url.searchParams.get('limit') || '10');
	const userId = locals.user.id;

	try {
		const otherUsers = await db
			.select({
				id: user.id,
				name: user.name,
				displayName: user.displayName,
				image: user.image,
				lastfmUsername: user.lastfmUsername
			})
			.from(user)
			.where(
				and(
					sql`${user.id} != ${userId}`,
					sql`${user.lastfmUsername} IS NOT NULL`,
					sql`${user.lastfmUsername} != ''`
				)
			);

		const similarities: Array<{
			user: (typeof otherUsers)[0];
			similarity: number;
			sharedArtists: string[];
		}> = [];

		const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

		const currentUserArtists = await db
			.select({ artist: lastfmScrobble.artist })
			.from(lastfmScrobble)
			.where(
				and(
					eq(lastfmScrobble.userId, userId),
					gte(lastfmScrobble.timestamp, ninetyDaysAgo),
					eq(lastfmScrobble.nowPlaying, false)
				)
			)
			.groupBy(lastfmScrobble.artist);

		const currentUserArtistSet = new Set(currentUserArtists.map((a) => a.artist.toLowerCase()));

		for (const otherUser of otherUsers) {
			const similarity = await calculateSimilarity(userId, otherUser.id);

			if (similarity > 0) {
				const otherUserArtists = await db
					.select({ artist: lastfmScrobble.artist })
					.from(lastfmScrobble)
					.where(
						and(
							eq(lastfmScrobble.userId, otherUser.id),
							gte(lastfmScrobble.timestamp, ninetyDaysAgo),
							eq(lastfmScrobble.nowPlaying, false)
						)
					)
					.groupBy(lastfmScrobble.artist);

				const sharedArtists = otherUserArtists
					.filter((a) => currentUserArtistSet.has(a.artist.toLowerCase()))
					.map((a) => a.artist)
					.slice(0, 10);

				similarities.push({
					user: otherUser,
					similarity,
					sharedArtists
				});
			}
		}

		similarities.sort((a, b) => b.similarity - a.similarity);
		const topTwins = similarities.slice(0, limit);

		return json({
			tuneTwins: topTwins.map((t) => ({
				user: {
					id: t.user.id,
					name: t.user.displayName || t.user.name,
					image: t.user.image,
					lastfmUsername: t.user.lastfmUsername
				},
				similarity: Math.round(t.similarity * 100),
				sharedArtists: t.sharedArtists
			}))
		});
	} catch (err) {
		console.error('Error calculating tune twins:', err);
		return error(500, 'Failed to calculate tune twins');
	}
};
