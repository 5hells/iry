import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as musicbrainz from '../src/lib/server/music/musicbrainz';
import * as discogs from '../src/lib/server/music/discogs';

function normalizeKey(t: any) {
    return (String(t.title || '').trim().toLowerCase());
}

async function dedupeAndReindex(albumRow: any, dryRun = false) {
    const rows = await db.query.track.findMany({ where: eq(track.albumId, albumRow.id) });
    if (!rows || rows.length === 0) return { deduped: 0, reindexed: 0 };

    const groups = new Map<string, any[]>();
    for (const r of rows) {
        const key = r.position ? `pos:${String(r.position).trim()}` : `title:${normalizeKey(r)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(r);
    }

    let deleted = 0;
    for (const [key, items] of groups) {
        if (items.length <= 1) continue;
        items.sort((a, b) => {
            const aScore = (a.musicbrainzId ? 1 : 0) + (a.spotifyId ? 1 : 0);
            const bScore = (b.musicbrainzId ? 1 : 0) + (b.spotifyId ? 1 : 0);
            if (aScore !== bScore) return bScore - aScore;
            return (a.createdAt as any) - (b.createdAt as any);
        });
        const keep = items[0];
        const remove = items.slice(1);
        for (const r of remove) {
            if (!dryRun) {
                await db.delete(track).where(eq(track.id, r.id));
            }
            deleted++;
            console.log(`  - removing duplicate track ${r.id} (${r.title}) from album ${albumRow.id}`);
        }
    }

    const remaining = await db.query.track.findMany({ where: eq(track.albumId, albumRow.id) });
    remaining.sort((a, b) => {
        const aNum = Number.isFinite(a.trackNumber) && a.trackNumber > 0 ? a.trackNumber : Number.MAX_SAFE_INTEGER;
        const bNum = Number.isFinite(b.trackNumber) && b.trackNumber > 0 ? b.trackNumber : Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) return aNum - bNum;
        return String(a.title || '').localeCompare(String(b.title || ''));
    });

    let reindexed = 0;
    for (let i = 0; i < remaining.length; i++) {
        const desired = i + 1;
        if (remaining[i].trackNumber !== desired) {
            if (!dryRun) {
                await db.update(track).set({ trackNumber: desired }).where(eq(track.id, remaining[i].id));
            }
            reindexed++;
        }
    }

    if (!dryRun) {
        await db.update(album).set({ totalTracks: remaining.length }).where(eq(album.id, albumRow.id));
    }

    return { deduped: deleted, reindexed };
}

async function fetchCoverIfMissing(albumRow: any, dryRun = false) {
    if (albumRow.coverArtUrl) return false;

    let coverUrl: string | null = null;

    try {
        if (albumRow.musicbrainzId) {
            const info = await musicbrainz.getCoverArtWithFallback(albumRow.musicbrainzId, {
                artist: albumRow.artist,
                album: albumRow.title
            });
            if (info && info.image) coverUrl = info.image;
        }

        if (!coverUrl && albumRow.discogsId) {
            const d = await discogs.getRelease(parseInt(String(albumRow.discogsId), 10)).catch(() => null);
            if (d && (d.cover_image || d.thumb)) coverUrl = d.cover_image || d.thumb;
        }

        if (!coverUrl && albumRow.artist && albumRow.title) {
            const q = `${albumRow.artist} ${albumRow.title}`;
            const found = await musicbrainz.searchReleases(q, 3).catch(() => []);
            if (found && found.length > 0) {
                const rid = found[0].id;
                const info = await musicbrainz.getCoverArtWithFallback(rid, {
                    artist: albumRow.artist,
                    album: albumRow.title
                }).catch(() => null);
                if (info && info.image) coverUrl = info.image;
            }
        }

        if (coverUrl) {
            if (!dryRun) await db.update(album).set({ coverArtUrl: coverUrl }).where(eq(album.id, albumRow.id));
            console.log(`  + updated cover for album ${albumRow.id}`);
            return true;
        }
    } catch (err) {
        console.error('Error fetching cover for', albumRow.id, err);
    }

    return false;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const limitArg = process.argv.find((a) => a.startsWith('--limit='));
    const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;

    console.log('Fixing tracks and covers (dryRun=', dryRun, ')');

    let albums = await db.query.album.findMany();
    if (limit > 0) albums = albums.slice(0, limit);

    let processed = 0;
    let totalDeduped = 0;
    let totalReindexed = 0;
    let coversUpdated = 0;

    for (const a of albums) {
        processed++;
        try {
            const tracks = await db.query.track.findMany({ where: eq(track.albumId, a.id) });
            const hasDuplicates = (() => {
                const seen = new Set();
                for (const t of tracks) {
                    const key = t.position ? `pos:${String(t.position).trim()}` : `title:${normalizeKey(t)}`;
                    if (seen.has(key)) return true;
                    seen.add(key);
                }
                return false;
            })();

            if (hasDuplicates) {
                console.log(`Processing album ${a.id} (${a.artist} - ${a.title}) -> duplicates detected`);
                const res = await dedupeAndReindex(a, dryRun);
                totalDeduped += res.deduped;
                totalReindexed += res.reindexed;
            }

            if (!a.coverArtUrl) {
                console.log(`Processing album ${a.id} (${a.artist} - ${a.title}) -> missing cover`);
                const ok = await fetchCoverIfMissing(a, dryRun);
                if (ok) coversUpdated++;
            }
        } catch (err) {
            console.error('Failed album', a.id, err);
        }
    }

    console.log('\nSummary:');
    console.log('Albums processed:', processed);
    console.log('Total duplicates removed:', totalDeduped);
    console.log('Total track numbers changed:', totalReindexed);
    console.log('Covers updated:', coversUpdated);

    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
