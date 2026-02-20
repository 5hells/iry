import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { track } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getCanvasUrl } from '$lib/server/music/canvas';
import { resolveIdToUuid } from '$lib/server/music/id-resolver';
export const GET: RequestHandler = async ({ params }) => {
	const { albumId } = params;

	if (!albumId) {
		return error(400, 'albumId is required');
	}

	try {
		let dbAlbumId = albumId;
		try {
			const resolved = await resolveIdToUuid(albumId);
			if (resolved) {
				dbAlbumId = resolved;
			}
		} catch (e) {
			console.debug('Could not resolve external ID, using provided ID:', albumId);
		}

		let tracks: any[] = [];
		if (dbAlbumId) {
			try {
				tracks = await db.query.track.findMany({
					where: eq(track.albumId, dbAlbumId),
					orderBy: [asc(track.trackNumber), asc(track.title)]
				});
			} catch (trackErr) {
				console.error('Error fetching tracks for album:', dbAlbumId, trackErr);
				tracks = [];
			}
		}

		if (tracks.length === 0) {
			return json({ canvases: {}, cached: 0 });
		}

		const canvases: { [key: string]: string | null } = {};
		let cachedCount = 0;
		let fetchedCount = 0;

		for (const t of tracks) {
			if (t.spotifyId) {
				if (t.canvasUrl) {
					canvases[t.spotifyId] = t.canvasUrl;
					cachedCount++;
				} else {
					try {
						const canvasUrl = await getCanvasUrl(t.spotifyId);
						if (canvasUrl) {
							canvases[t.spotifyId] = canvasUrl;
							fetchedCount++;

							await db.update(track).set({ canvasUrl }).where(eq(track.id, t.id));
						} else {
							canvases[t.spotifyId] = null;
						}
					} catch (err) {
						console.error(`Failed to fetch canvas for track ${t.spotifyId}:`, err);
						canvases[t.spotifyId] = null;
					}
				}
			}
		}

		return json({
			canvases,
			stats: {
				total: tracks.length,
				cached: cachedCount,
				fetched: fetchedCount,
				notFound: tracks.length - cachedCount - fetchedCount
			}
		});
	} catch (err) {
		console.error('Failed to fetch canvas:', err);
		return error(500, 'Failed to fetch canvas data');
	}
};

export const POST: RequestHandler = async ({ params, locals }) => {
	const { albumId } = params;

	if (!albumId) {
		return error(400, 'albumId is required');
	}

	try {
		let dbAlbumId = albumId;
		try {
			const resolved = await resolveIdToUuid(albumId);
			if (resolved) {
				dbAlbumId = resolved;
			}
		} catch (e) {
			console.debug('Could not resolve external ID for POST, using provided ID:', albumId);
		}

		let tracks: any[] = [];
		if (dbAlbumId) {
			try {
				tracks = await db.query.track.findMany({
					where: eq(track.albumId, dbAlbumId),
					orderBy: [asc(track.trackNumber), asc(track.title)]
				});
			} catch (trackErr) {
				console.error('Error fetching tracks for album:', dbAlbumId, trackErr);
				return error(500, 'Failed to fetch canvas data');
			}
		}

		if (tracks.length === 0) {
			return error(404, 'Album not found');
		}

		const canvases: { [key: string]: string | null } = {};

		for (const t of tracks) {
			if (t.spotifyId) {
				try {
					const canvasUrl = await getCanvasUrl(t.spotifyId);
					if (canvasUrl) {
						canvases[t.spotifyId] = canvasUrl;

						await db.update(track).set({ canvasUrl }).where(eq(track.id, t.id));
					}
				} catch (err) {
					console.error(`Failed to fetch canvas for track ${t.spotifyId}:`, err);
				}
			}
		}

		return json({ canvases, total: tracks.length });
	} catch (err) {
		console.error('Failed to fetch canvas:', err);
		return error(500, 'Failed to fetch canvas data');
	}
};
