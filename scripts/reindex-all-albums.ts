import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
	indexAlbumFromMusicBrainz,
	indexAlbumFromDiscogs,
	indexAlbumFromSpotify
} from '../src/lib/server/music/indexer';
import * as spotify from '../src/lib/server/music/spotify';

function parseArg(name: string, fallback?: string): string | undefined {
	const pref = `--${name}=`;
	const hit = process.argv.find((arg) => arg.startsWith(pref));
	if (hit) return hit.slice(pref.length);
	return fallback;
}

function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

async function getTrackCount(albumId: string): Promise<number> {
	const rows = await db.query.track.findMany({ where: eq(track.albumId, albumId) });
	return rows.length;
}

async function normalizeTrackNumbers(albumId: string): Promise<number> {
	const rows = await db.query.track.findMany({ where: eq(track.albumId, albumId) });
	if (rows.length === 0) return 0;

	const sorted = [...rows].sort((a, b) => {
		const aNum =
			Number.isFinite(a.trackNumber) && a.trackNumber > 0 ? a.trackNumber : Number.MAX_SAFE_INTEGER;
		const bNum =
			Number.isFinite(b.trackNumber) && b.trackNumber > 0 ? b.trackNumber : Number.MAX_SAFE_INTEGER;
		if (aNum !== bNum) return aNum - bNum;
		return String(a.title || '').localeCompare(String(b.title || ''));
	});

	let changed = 0;
	for (let i = 0; i < sorted.length; i++) {
		const desired = i + 1;
		if (sorted[i].trackNumber !== desired) {
			await db.update(track).set({ trackNumber: desired }).where(eq(track.id, sorted[i].id));
			changed += 1;
		}
	}

	return changed;
}

async function main() {
	const limit = Number(parseArg('limit', '0'));
	const offset = Number(parseArg('offset', '0'));
	const onlyMissingTracks = hasFlag('only-missing-tracks');
	const dryRun = hasFlag('dry-run');
	const spotifyFallback = !hasFlag('no-spotify-fallback');

	console.log('♻️ Re-indexing albums...');
	console.log(
		`Options: limit=${limit || 'all'} offset=${offset} onlyMissingTracks=${onlyMissingTracks} dryRun=${dryRun} spotifyFallback=${spotifyFallback}`
	);

	let albums = await db.query.album.findMany({
		orderBy: [asc(album.createdAt)]
	});

	if (offset > 0) albums = albums.slice(offset);
	if (limit > 0) albums = albums.slice(0, limit);

	console.log(`Albums selected: ${albums.length}`);

	let processed = 0;
	let indexed = 0;
	let skipped = 0;
	let failed = 0;
	let normalizedTotal = 0;

	for (const row of albums) {
		processed += 1;

		try {
			const beforeTracks = await getTrackCount(row.id);
			if (onlyMissingTracks && beforeTracks > 0) {
				skipped += 1;
				continue;
			}

			if (!dryRun) {
				
				if (row.musicbrainzId) await indexAlbumFromMusicBrainz(row.musicbrainzId);
				else if (row.discogsId) await indexAlbumFromDiscogs(row.discogsId);
				
				else if (row.spotifyId && spotifyFallback) await indexAlbumFromSpotify(row.spotifyId);
			}

			let afterTracks = await getTrackCount(row.id);

			if (!dryRun && spotifyFallback && afterTracks === 0 && row.title && row.artist) {
				const sp = await spotify.searchAlbums(`${row.artist} ${row.title}`, 3).catch(() => []);
				if (sp.length > 0) {
					await indexAlbumFromSpotify(sp[0].id);
					afterTracks = await getTrackCount(row.id);
				}
			}

			if (!dryRun && afterTracks > 0) {
				normalizedTotal += await normalizeTrackNumbers(row.id);
			}

			indexed += 1;
			if (processed % 25 === 0) {
				console.log(`...processed ${processed}/${albums.length}`);
			}
		} catch (err) {
			failed += 1;
			console.error(`❌ Failed album ${row.id} (${row.artist} - ${row.title}):`, err);
		}
	}

	console.log('\n=== Re-index Summary ===');
	console.log(`Processed: ${processed}`);
	console.log(`Indexed: ${indexed}`);
	console.log(`Skipped: ${skipped}`);
	console.log(`Failed: ${failed}`);
	console.log(`Track numbers normalized: ${normalizedTotal}`);

	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal reindex-all-albums error:', err);
	process.exit(1);
});
