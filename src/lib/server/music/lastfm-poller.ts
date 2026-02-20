import { db } from '../db';
import { user, lastfmScrobble } from '../db/schema';
import { eq, desc, and, gte, lte, isNotNull, ne } from 'drizzle-orm';
import { getRecentTracks, getNowPlaying } from './lastfm';

const nowPlayingState = new Map<string, any>();
const listeners = new Set<(data: any) => void>();

const POLL_INTERVAL = 30000;

let pollingInterval: NodeJS.Timeout | null = null;

export function subscribe(callback: (data: any) => void) {
	listeners.add(callback);

	callback({
		type: 'initial',
		nowPlaying: Array.from(nowPlayingState.entries()).map(([userId, track]) => ({
			userId,
			track
		}))
	});

	return () => {
		listeners.delete(callback);
	};
}

function broadcast(data: any) {
	listeners.forEach((callback) => callback(data));
}

async function pollLastFM() {
	try {
		const users = await db
			.select()
			.from(user)
			.where(and(isNotNull(user.lastfmUsername), ne(user.lastfmUsername, '')));

		for (const u of users) {
			if (!u.lastfmUsername) continue;

			try {
				const nowPlaying = await getNowPlaying(u.lastfmUsername);
				const previousNowPlaying = nowPlayingState.get(u.id);

				if (
					nowPlaying &&
					(!previousNowPlaying ||
						previousNowPlaying.track !== nowPlaying.track ||
						previousNowPlaying.artist !== nowPlaying.artist)
				) {
					nowPlayingState.set(u.id, nowPlaying);

					await db
						.update(lastfmScrobble)
						.set({ nowPlaying: false })
						.where(eq(lastfmScrobble.userId, u.id));

					await db.insert(lastfmScrobble).values({
						userId: u.id,
						artist: nowPlaying.artist,
						track: nowPlaying.track,
						album: nowPlaying.album,
						albumArtUrl: nowPlaying.albumArtUrl,
						timestamp: new Date(),
						nowPlaying: true
					});

					broadcast({
						type: 'nowPlaying',
						userId: u.id,
						userName: u.displayName || u.name,
						userImage: u.image,
						track: nowPlaying
					});
				} else if (!nowPlaying && previousNowPlaying) {
					nowPlayingState.delete(u.id);
					await db
						.update(lastfmScrobble)
						.set({ nowPlaying: false })
						.where(and(eq(lastfmScrobble.userId, u.id), eq(lastfmScrobble.nowPlaying, true)));

					broadcast({
						type: 'stopped',
						userId: u.id
					});
				}

				const recentTracks = await getRecentTracks(u.lastfmUsername, 50);

				for (const track of recentTracks) {
					if (!track.timestamp || track.timestamp <= 0) {
						continue;
					}
					const existing = await db
						.select()
						.from(lastfmScrobble)
						.where(
							and(
								eq(lastfmScrobble.userId, u.id),
								eq(lastfmScrobble.artist, track.artist),
								eq(lastfmScrobble.track, track.track),
								gte(lastfmScrobble.timestamp, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) 
							)
						)
						.limit(1);

					if (existing.length === 0) {
						await db.insert(lastfmScrobble).values({
							userId: u.id,
							artist: track.artist,
							track: track.track,
							album: track.album || null,
							albumArtUrl: track.albumArtUrl || null,
							timestamp: new Date(track.timestamp),
							nowPlaying: false
						});
					}
				}
			} catch (err) {
				console.error(`Error polling LastFM for user ${u.name}:`, err);
			}
		}
	} catch (err) {
		console.error('Error polling LastFM:', err);
	}
}

export function startPolling() {
	if (pollingInterval) {
		console.log('LastFM polling already running');
		return;
	}

	console.log('Starting LastFM polling service');
	pollLastFM(); 
	pollingInterval = setInterval(pollLastFM, POLL_INTERVAL);
}

export function stopPolling() {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
		console.log('LastFM polling stopped');
	}
}

export function getCurrentNowPlaying() {
	return Array.from(nowPlayingState.entries()).map(([userId, track]) => ({
		userId,
		track
	}));
}
