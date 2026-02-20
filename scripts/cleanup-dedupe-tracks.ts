import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { track } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';

function parsePosition(pos: string | null) {
	if (!pos) return { side: '', num: 0 };
	const s = String(pos).trim();
	const m = s.match(/^([A-Za-z]+)?\s*([0-9]+)$/);
	if (m) return { side: (m[1] || '').toUpperCase(), num: parseInt(m[2], 10) };
	const m2 = s.match(/([0-9]+)/);
	if (m2) return { side: '', num: parseInt(m2[1], 10) };
	return { side: s.toUpperCase(), num: 0 };
}

async function main() {
	const albumId = process.argv[2];
	if (!albumId) {
		console.error('Usage: bun run scripts/cleanup-dedupe-tracks.ts <albumId>');
		process.exit(1);
	}

	const rows = await db.query.track.findMany({ where: eq(track.albumId, albumId) });
	console.log('Found tracks:', rows.length);

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
			const aScore = (a.musicbrainzId ? 1 : 0) + (a.spotifyId ? 1 : 0);
			const bScore = (b.musicbrainzId ? 1 : 0) + (b.spotifyId ? 1 : 0);
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
		const pa = parsePosition(a.position || null);
		const pb = parsePosition(b.position || null);
		if (pa.side !== pb.side) return pa.side.localeCompare(pb.side);
		if (pa.num !== pb.num) return pa.num - pb.num;
		return (a.title || '').localeCompare(b.title || '');
	});

	for (let i = 0; i < remaining.length; i++) {
		const desired = i + 1;
		if (remaining[i].trackNumber !== desired) {
			await db.update(track).set({ trackNumber: desired }).where(eq(track.id, remaining[i].id));
		}
	}

	console.log('Deleted duplicates:', deleted);
	console.log('Renumbered to', remaining.length, 'tracks');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
