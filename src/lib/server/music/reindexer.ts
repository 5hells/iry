import { db } from '$lib/server/db';
import { album, artist, track } from '$lib/server/db/schema';
import { sql, eq } from 'drizzle-orm';
import { indexAlbumFromMusicBrainz, indexAlbumFromDiscogs, indexAlbumFromSpotify } from './indexer';
import * as musicbrainz from './musicbrainz';
import * as discogs from './discogs';

const RETRY_INTERVAL_MS = 3 * 60 * 1000;
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
                console.warn('MB index attempt failed for album', a.id, err);
                try {
                    const title = a.title || '';
                    const artistName = a.artist || '';
                    if (title && artistName) {
                        const query = `${artistName} ${title}`;
                        const results = await discogs.searchReleases(query, 'release');
                        if (results && results.length > 0) {
                            const candidates = results.slice(0, 5);
                            for (const cand of candidates) {
                                try {
                                    if (!cand || !cand.id) continue;
                                    const resolved = await indexAlbumFromDiscogs(String(cand.id));
                                    const tracks = await db.select().from(track).where(eq(track.albumId, resolved.id));
                                    if (tracks.length > 0) {
                                        success = true;
                                        break;
                                    }
                                } catch (e) {
                                    console.warn('Discogs candidate indexing failed for', cand?.id, e);
                                }
                            }
                        }
                    }
                } catch (discErr) {
                    console.warn('Discogs fallback search failed for album', a.id, discErr);
                }
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
            const candidates = await db.select().from(album).where(sql`COALESCE(total_tracks,0) = 0`).limit(100);
            const now = new Date();
            for (const a of candidates) {
                const retryCount = Number(a.indexRetryCount || 0);
                const nextAttempt = a.nextIndexAttempt ? new Date(a.nextIndexAttempt) : null;
                if (retryCount >= MAX_RETRIES) continue;
                if (nextAttempt && nextAttempt > now) continue;

                const tracks = await db.select().from(track).where(eq(track.albumId, a.id));
                if (tracks.length === 0) {
                    await processAlbum(a);
                } else {
                    await db.update(album).set({ indexRetryCount: 0, nextIndexAttempt: null }).where(eq(album.id, a.id));
                }
            }

            const artistCandidates = await db.select().from(artist).limit(50);
            for (const ar of artistCandidates) {
                const retryCount = Number(ar.indexRetryCount || 0);
                const nextAttempt = ar.nextIndexAttempt ? new Date(ar.nextIndexAttempt) : null;
                if (retryCount >= MAX_RETRIES) continue;
                if (nextAttempt && nextAttempt > now) continue;

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
            setTimeout(tick, 60 * 1000);
        }
    }

    tick().catch((e) => console.error('Reindexer startup error:', e));
}

export function stopReindexer() {
    running = false;
}
