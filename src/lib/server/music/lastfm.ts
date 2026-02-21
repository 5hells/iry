import LastFMPackage from 'lastfm-typed';
import { db } from '$lib/server/db';
import { lastfmScrobble, user } from '$lib/server/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config({
	path: '.env'
});

const LastFM = (LastFMPackage as any).default || LastFMPackage;

let lastfm: any;

async function getLastfmClient() {
	if (lastfm) return lastfm;

	let env = process.env as Record<string, string | undefined>;
	try {
		const i = await import('$env/dynamic/private');
		env = { ...env, ...i.env };
	} catch (e) {
		console.warn('LastFM env import failed:', e);
	}

	const apiKey = env.LASTFM_API_KEY;
	const apiSecret = env.LASTFM_API_SECRET;

	if (!apiKey || !apiSecret) {
		throw new Error('LastFM API credentials not configured');
	}

	lastfm = new LastFM(apiKey, {
		apiSecret: apiSecret,
		userAgent: 'iry/1.0'
	});

	return lastfm;
}

export interface LastFMTrack {
	artist: string;
	track: string;
	album?: string;
	albumArtUrl?: string;
	timestamp?: number;
	nowPlaying?: boolean;
}

export interface LastFMUserInfo {
	name: string;
	playcount: string;
	url: string;
	image?: string;
	registered?: number;
}

export async function getLastFMUserInfo(username: string): Promise<LastFMUserInfo | null> {
	const client = await getLastfmClient();
	const u = await client.user.getInfo(username);
	return {
		name: u.name,
		playcount: u.playcount.toString(),
		url: u.url,
		image: u.image?.find((img: any) => img.size === 'large')?.url,
		registered: u.registered || undefined
	};
}

export async function getRecentTracks(
	username: string,
	limit: number = 50
): Promise<LastFMTrack[]> {
	const client = await getLastfmClient();
	const r = await client.user.getRecentTracks(username, { limit });
	return r.tracks.map((t: any) => {
		let timestamp: number | undefined = undefined;
		if (t.date && t.date.uts) {
			const uts = Number(t.date.uts);

			if (uts > 0) {
				timestamp = uts * 1000; 
			}
		}
		return {
			artist: t.artist.name,
			track: t.name,
			album: t.album.name,
			albumArtUrl: t.image?.find((img: any) => img.size === 'large')?.url,
			timestamp,
			nowPlaying: t.nowplaying || t['@attr']?.nowplaying === 'true' || false
		};
	});
}

export async function getNowPlaying(username: string): Promise<LastFMTrack | null> {
	const tracks = await getRecentTracks(username, 1);
	return tracks.length > 0 && tracks[0].nowPlaying ? tracks[0] : null;
}

export async function insertScrobbleIfMissing(input: {
	userId: string;
	artist: string;
	track: string;
	album?: string | null;
	albumArtUrl?: string | null;
	timestamp: Date;
	nowPlaying?: boolean;
	timestampToleranceMs?: number;
}) {
	const toleranceMs = Math.max(0, input.timestampToleranceMs ?? 2000);
	const from = new Date(input.timestamp.getTime() - toleranceMs);
	const to = new Date(input.timestamp.getTime() + toleranceMs);
	const nowPlaying = input.nowPlaying ?? false;

	const existing = await db.query.lastfmScrobble.findFirst({
		where: and(
			eq(lastfmScrobble.userId, input.userId),
			eq(lastfmScrobble.artist, input.artist),
			eq(lastfmScrobble.track, input.track),
			eq(lastfmScrobble.nowPlaying, nowPlaying),
			gte(lastfmScrobble.timestamp, from),
			lte(lastfmScrobble.timestamp, to)
		)
	});

	if (existing) {
		return existing;
	}

	const inserted = await db
		.insert(lastfmScrobble)
		.values({
			userId: input.userId,
			artist: input.artist,
			track: input.track,
			album: input.album || null,
			albumArtUrl: input.albumArtUrl || null,
			timestamp: input.timestamp,
			nowPlaying
		})
		.returning();

	return inserted[0] ?? null;
}

export async function indexUserLastFM(userId: string, username: string, limit: number = 200) {
	await db.update(user).set({ lastfmUsername: username }).where(eq(user.id, userId));

	const tracks = await getRecentTracks(username, limit);

	await db
		.update(lastfmScrobble)
		.set({ nowPlaying: false })
		.where(eq(lastfmScrobble.userId, userId));

	for (const track of tracks) {
		try {
			const timestamp =
				track.timestamp && track.timestamp > 0 ? new Date(track.timestamp) : new Date();

			await insertScrobbleIfMissing({
				userId,
				artist: track.artist,
				track: track.track,
				album: track.album || null,
				albumArtUrl: track.albumArtUrl || null,
				timestamp,
				nowPlaying: track.nowPlaying || false,
				timestampToleranceMs: track.nowPlaying ? 15000 : 2000
			});
		} catch (err) {}
	}

	return tracks.length;
}

export async function updateNowPlaying(userId: string, username: string) {
	const nowPlaying = await getNowPlaying(username);

	await db
		.update(lastfmScrobble)
		.set({ nowPlaying: false })
		.where(eq(lastfmScrobble.userId, userId));

	if (nowPlaying) {
		const existing = await db.query.lastfmScrobble.findFirst({
			where: and(
				eq(lastfmScrobble.userId, userId),
				eq(lastfmScrobble.artist, nowPlaying.artist),
				eq(lastfmScrobble.track, nowPlaying.track)
			)
		});

		if (existing) {
			await db
				.update(lastfmScrobble)
				.set({ nowPlaying: true })
				.where(eq(lastfmScrobble.id, existing.id));
		} else {
			await db.insert(lastfmScrobble).values({
				userId,
				artist: nowPlaying.artist,
				track: nowPlaying.track,
				album: nowPlaying.album,
				albumArtUrl: nowPlaying.albumArtUrl,
				timestamp: new Date(),
				nowPlaying: true
			});
		}
	}

	return nowPlaying;
}

export async function getUserListeningHistory(userId: string, limit: number = 50) {
	return db.query.lastfmScrobble.findMany({
		where: eq(lastfmScrobble.userId, userId),
		orderBy: [desc(lastfmScrobble.timestamp)],
		limit
	});
}

export async function getUserNowPlaying(userId: string) {
	return db.query.lastfmScrobble.findFirst({
		where: and(eq(lastfmScrobble.userId, userId), eq(lastfmScrobble.nowPlaying, true))
	});
}
