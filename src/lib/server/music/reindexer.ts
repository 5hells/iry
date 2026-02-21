import { db } from '$lib/server/db';
import { album, artist, track } from '$lib/server/db/schema';
import { sql, eq } from 'drizzle-orm';
import { indexAlbumFromMusicBrainz, indexAlbumFromDiscogs, indexAlbumFromSpotify } from './indexer';
import * as musicbrainz from './musicbrainz';

const RETRY_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const MAX_RETRIES = 6;

let running = false;

async function processAlbum(a: any) {
    const now = new Date();

    const retryCount = Number(a.indexRetryCount || 0);
    const nextAttempt = a.nextIndexAttempt ? new Date(a.nextIndexAttempt) : null;
    if (retryCount >= MAX_RETRIES) return;
    if (nextAttempt && nextAttempt > now) return;

    let success = false;
    try {
        if (a.musicbrainzId) {
            try {
                const resolved = await indexAlbumFromMusicBrainz(a.musicbrainzId);
                const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                if (tracks.length > 0) success = true;
            } catch (err) {
                // fall through to other fallbacks
                console.warn('MB index attempt failed for album', a.id, err);
            }
        }

        if (!success && a.discogsId) {
            try {
                const resolved = await indexAlbumFromDiscogs(a.discogsId);
                const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                if (tracks.length > 0) success = true;
            } catch (err) {
                console.warn('Discogs index attempt failed for album', a.id, err);
            }
        }

        if (!success && a.spotifyId) {
            try {
                const resolved = await indexAlbumFromSpotify(a.spotifyId);
                const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                if (tracks.length > 0) success = true;
            } catch (err) {
                console.warn('Spotify index attempt failed for album', a.id, err);
            }
        }

        if (!success) {
            // If we have a musicbrainz URL that looks like a release-group, try resolving via MB
            if (a.musicbrainzUrl) {
                try {
                    const m = String(a.musicbrainzUrl).match(/release-group\/(\w[-\w]*)/i);
                    if (m && m[1]) {
                        const resolved = await indexAlbumFromMusicBrainz(m[1]);
                        const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                        if (tracks.length > 0) success = true;
                    }
                } catch (err) {
                    console.warn('MB release-group fallback failed for album', a.id, err);
                }
            }
        }
    } finally {
        if (success) {
            await db.update(album).set({ indexRetryCount: 0, nextIndexAttempt: null }).where(eq(album.id, a.id));
        } else {
            const next = new Date(Date.now() + RETRY_INTERVAL_MS);
            await db.update(album).set({ indexRetryCount: (retryCount + 1), nextIndexAttempt: next }).where(eq(album.id, a.id));
        }
    }
}

async function processArtist(ar: any) {
    const now = new Date();
    const retryCount = Number(ar.indexRetryCount || 0);
    const nextAttempt = ar.nextIndexAttempt ? new Date(ar.nextIndexAttempt) : null;
    if (retryCount >= MAX_RETRIES) return;
    if (nextAttempt && nextAttempt > now) return;

    let success = false;
    try {
        if (ar.musicbrainzId) {
            try {
                const mbArtist = await musicbrainz.getArtist(ar.musicbrainzId);
                const rgs = mbArtist?.['release-groups'] || [];
                for (const rg of rgs) {
                    try {
                        const resolved = await indexAlbumFromMusicBrainz(rg.id);
                        const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                        if (tracks.length > 0) {
                            success = true;
                            // continue indexing other releases but mark success
                        }
                    } catch (err) {
                        console.warn('Failed to index artist release-group', rg?.id, err);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch MB artist for reindex', ar.id, err);
            }
        }
    } finally {
        if (success) {
            await db.update(artist).set({ indexRetryCount: 0, nextIndexAttempt: null }).where(eq(artist.id, ar.id));
        } else {
            const next = new Date(Date.now() + RETRY_INTERVAL_MS);
            await db.update(artist).set({ indexRetryCount: (retryCount + 1), nextIndexAttempt: next }).where(eq(artist.id, ar.id));
        }
    }
}

export function startReindexer() {
    if (running) return;
    running = true;

    async function tick() {
        try {
            // Albums with zero tracks or totalTracks=0
            const candidates = await db.select().from(album).where(sql`COALESCE(total_tracks,0) = 0`).limit(100);
            const now = new Date();
            for (const a of candidates) {
                const retryCount = Number(a.indexRetryCount || 0);
                const nextAttempt = a.nextIndexAttempt ? new Date(a.nextIndexAttempt) : null;
                if (retryCount >= MAX_RETRIES) continue;
                if (nextAttempt && nextAttempt > now) continue;

                // double-check there are truly no tracks
                const tracks = await db.select().from(track).where(eq(track.albumId, a.id));
                if (tracks.length === 0) {
                    // process in background (sequential to avoid rate limits)
                    await processAlbum(a);
                } else {
                    // if tracks appeared since, clear retry
                    await db.update(album).set({ indexRetryCount: 0, nextIndexAttempt: null }).where(eq(album.id, a.id));
                }
            }

            // Artists: attempt if retry conditions match
            const artistCandidates = await db.select().from(artist).limit(50);
            for (const ar of artistCandidates) {
                const retryCount = Number(ar.indexRetryCount || 0);
                const nextAttempt = ar.nextIndexAttempt ? new Date(ar.nextIndexAttempt) : null;
                if (retryCount >= MAX_RETRIES) continue;
                if (nextAttempt && nextAttempt > now) continue;

                // crude heuristic: reindex artists that have few or zero albums matching their name
                const artistAlbums = await db.select().from(album).where(sql`album.artist ILIKE ${ar.name}`).limit(1);
                if (!artistAlbums || artistAlbums.length === 0) {
                    await processArtist(ar);
                } else {
                    await db.update(artist).set({ indexRetryCount: 0, nextIndexAttempt: null }).where(eq(artist.id, ar.id));
                }
            }
        } catch (err) {
            console.error('Reindexer tick failed:', err);
        } finally {
            // schedule next tick after 60s
            setTimeout(tick, 60 * 1000);
        }
    }

    // initial run
    tick().catch((e) => console.error('Reindexer startup error:', e));
}

export function stopReindexer() {
    running = false;
}
