import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { indexAlbumFromDiscogs } from '../src/lib/server/music/indexer';

function parseArg(name: string): string | undefined {
	const pref = `--${name}=`;
	const hit = process.argv.find((arg) => arg.startsWith(pref));
	if (hit) return hit.slice(pref.length);
	return undefined;
}

async function main() {
	const dc = parseArg('dc');
	const albumId = parseArg('albumId');
	if (!dc && !albumId) {
		console.error('Provide --dc=DISCOGS_ID or --albumId=ALBUM_UUID');
		process.exit(1);
	}

	let targetAlbumId = albumId;
	if (dc && !targetAlbumId) {
		
		const a = await db.query.album.findFirst({ where: eq(album.discogsId, String(dc)) });
		if (!a) {
			console.error('No album found with discogsId', dc);
			process.exit(1);
		}
		targetAlbumId = a.id;
	}

	console.log('Target album id:', targetAlbumId);

	
	const deleted = await db.delete(track).where(eq(track.albumId, targetAlbumId));
	console.log('Deleted existing tracks result:', deleted);

	
	if (dc) {
		console.log('Reindexing from Discogs id', dc);
		await indexAlbumFromDiscogs(String(dc));
	} else if (albumId) {
		
		const a = await db.query.album.findFirst({ where: eq(album.id, targetAlbumId) });
		if (a && a.discogsId) {
			console.log('Reindexing from Discogs id', a.discogsId);
			await indexAlbumFromDiscogs(String(a.discogsId));
		} else {
			console.error('Album has no discogsId. Aborting.');
			process.exit(1);
		}
	}

	console.log('Done');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
