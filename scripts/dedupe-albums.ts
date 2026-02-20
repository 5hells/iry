import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { albumReview, trackRanking, statusPost } from '../src/lib/server/db/schema';
import { normalizeString } from '../src/lib/utils/levenshtein';
import { albumSimilarityScore } from '../src/lib/server/music/id-resolver';
import { eq } from 'drizzle-orm';

function externalIdScore(a: any) {
	let s = 0;
	if (a.musicbrainzId) s += 4;
	if (a.discogsId) s += 2;
	if (a.spotifyId) s += 1;
	return s;
}

async function cleanupTracksForAlbum(albumId: string) {
	
	const rows = await db.query.track.findMany({ where: eq(track.albumId, albumId) });
	if (!rows || rows.length === 0) return { deleted: 0, renumbered: 0 };

	const groups = new Map<string, typeof rows>();
	for (const r of rows) {
		const key = r.position ? `pos:${r.position}` : `title:${(r.title || '').toLowerCase()}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)!.push(r);
	}

	let deleted = 0;
	for (const [key, items] of groups) {
		if (items.length <= 1) continue;
		items.sort((a, b) => {
			const aScore = externalIdScore(a);
			const bScore = externalIdScore(b);
			if (aScore !== bScore) return bScore - aScore;
			return (a.createdAt as any) - (b.createdAt as any);
		});
		const keep = items[0];
		const remove = items.slice(1);
		for (const r of remove) {
			await db.delete(track).where(eq(track.id, r.id));
			deleted++;
		}
	}

	
	const remaining = await db.query.track.findMany({ where: eq(track.albumId, albumId) });
	remaining.sort((a, b) => {
		const aPos = (a.position || '').toString();
		const bPos = (b.position || '').toString();
		if (aPos !== bPos) return aPos.localeCompare(bPos);
		return (a.title || '').localeCompare(b.title || '');
	});

	let renumbered = 0;
	for (let i = 0; i < remaining.length; i++) {
		const desired = i + 1;
		if (remaining[i].trackNumber !== desired) {
			await db.update(track).set({ trackNumber: desired }).where(eq(track.id, remaining[i].id));
			renumbered++;
		}
	}

	return { deleted, renumbered };
}

async function main() {
	console.log('🔎 Loading albums for dedupe...');
	const albums = await db.query.album.findMany();
	console.log(`Found ${albums.length} albums`);

	const processed = new Set<string>();
	let mergedGroups = 0;
	let mergedAlbums = 0;
	for (let i = 0; i < albums.length; i++) {
		const a = albums[i];
		if (processed.has(a.id)) continue;
		const cluster = [a];
		processed.add(a.id);

		for (let j = i + 1; j < albums.length; j++) {
			const b = albums[j];
			if (processed.has(b.id)) continue;
			const score = albumSimilarityScore(
				{ artist: a.artist || '', title: a.title || '' },
				{ artist: b.artist || '', title: b.title || '' }
			);
			if (score >= 0.88) {
				cluster.push(b);
				processed.add(b.id);
			}
		}

		if (cluster.length <= 1) continue;
		mergedGroups++;
		const items = cluster;
		items.sort((a, b) => {
			const scoreDiff = externalIdScore(b) - externalIdScore(a);
			if (scoreDiff !== 0) return scoreDiff;
			return (a.createdAt as any) - (b.createdAt as any);
		});
		const canonical = items[0];
		const others = items.slice(1);
		console.log(
			`Merging ${others.length} duplicates into canonical album ${canonical.id} (${canonical.artist} - ${canonical.title})`
		);

		for (const dup of others) {
			const update: Record<string, any> = {};
			if (!canonical.musicbrainzId && dup.musicbrainzId) update.musicbrainzId = dup.musicbrainzId;
			if (!canonical.discogsId && dup.discogsId) update.discogsId = dup.discogsId;
			if (!canonical.spotifyId && dup.spotifyId) update.spotifyId = dup.spotifyId;
			if (Object.keys(update).length > 0) {
				await db.update(album).set(update).where(eq(album.id, canonical.id));
			}

			await db.update(track).set({ albumId: canonical.id }).where(eq(track.albumId, dup.id));
			await db
				.update(albumReview)
				.set({ albumId: canonical.id })
				.where(eq(albumReview.albumId, dup.id));
			await db
				.update(trackRanking)
				.set({ albumId: canonical.id })
				.where(eq(trackRanking.albumId, dup.id));
			await db
				.update(statusPost)
				.set({ albumId: canonical.id })
				.where(eq(statusPost.albumId, dup.id));

			await db.delete(album).where(eq(album.id, dup.id));
			mergedAlbums++;
		}

		const res = await cleanupTracksForAlbum(canonical.id);
		if (res.deleted || res.renumbered) {
			console.log(
				`Cleaned album ${canonical.id}: deleted ${res.deleted} duplicate tracks, renumbered ${res.renumbered}`
			);
		}
	}

	console.log(`Merged ${mergedAlbums} albums across ${mergedGroups} groups`);

	try {
		await db.execute(
			"CREATE UNIQUE INDEX IF NOT EXISTS album_artist_title_unique ON album ((lower(trim(artist)) || '|' || lower(trim(title))))"
		);
		console.log('Created unique index album_artist_title_unique');
	} catch (err) {
		console.warn('Failed to create unique index (maybe already exists):', err);
	}

	console.log('✅ Dedupe complete');
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
