import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { lastfmScrobble, user } from '$lib/server/db/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
	const period = url.searchParams.get('period') || '30'; 
	const limit = parseInt(url.searchParams.get('limit') || '20');

	try {
		const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

		const scrobbles = await db
			.select({
				artist: lastfmScrobble.artist,
				userId: lastfmScrobble.userId,
				albumArtUrl: lastfmScrobble.albumArtUrl,
				count: sql<number>`count(*)`
			})
			.from(lastfmScrobble)
			.where(and(gte(lastfmScrobble.timestamp, daysAgo), eq(lastfmScrobble.nowPlaying, false)))
			.groupBy(lastfmScrobble.artist, lastfmScrobble.userId)
			.orderBy(desc(sql`count(*)`));

		const artistMap = new Map<
			string,
			{
				artist: string;
				totalPlays: number;
				albumArtUrl: string | null;
				listeners: Map<string, number>;
			}
		>();

		for (const scrobble of scrobbles) {
			const artistKey = scrobble.artist.toLowerCase();

			if (!artistMap.has(artistKey)) {
				artistMap.set(artistKey, {
					artist: scrobble.artist,
					totalPlays: 0,
					albumArtUrl: scrobble.albumArtUrl,
					listeners: new Map()
				});
			}

			const artistData = artistMap.get(artistKey)!;
			artistData.totalPlays += scrobble.count;
			artistData.listeners.set(scrobble.userId, scrobble.count);

			if (!artistData.albumArtUrl && scrobble.albumArtUrl) {
				artistData.albumArtUrl = scrobble.albumArtUrl;
			}
		}

		const artistArray = Array.from(artistMap.values())
			.sort((a, b) => b.totalPlays - a.totalPlays)
			.slice(0, limit);

		const leaderboard = [];

		for (const artistData of artistArray) {
			const topListeners = Array.from(artistData.listeners.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5);

			const listenerIds = topListeners.map(([userId]) => userId);

			const users = await db
				.select({
					id: user.id,
					name: user.name,
					displayName: user.displayName,
					image: user.image
				})
				.from(user)
				.where(sql`${user.id} IN ${listenerIds}`);

			const userMap = new Map(users.map((u) => [u.id, u]));

			leaderboard.push({
				artist: artistData.artist,
				totalPlays: artistData.totalPlays,
				albumArtUrl: artistData.albumArtUrl,
				topListeners: topListeners
					.map(([userId, playCount]) => {
						const userData = userMap.get(userId);
						if (!userData) return null;

						return {
							user: {
								id: userData.id,
								name: userData.displayName || userData.name,
								image: userData.image
							},
							playCount
						};
					})
					.filter(Boolean)
			});
		}

		return json({ leaderboard, period: parseInt(period) });
	} catch (err) {
		console.error('Error fetching leaderboard:', err);
		return error(500, 'Failed to fetch leaderboard');
	}
};
