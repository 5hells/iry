import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { eq, like, asc, and } from 'drizzle-orm';

async function run(artistQuery: string, titleQuery: string) {
	const rows = await db.query.album.findMany({
		where: and(eq(album.artist, artistQuery), eq(album.title, titleQuery))
	});
	if (rows.length === 0) {
		
		const fuzzy = await db.query.album.findMany({ where: like(album.artist, `%${artistQuery}%`) });
		console.log(
			'Fuzzy artist matches:',
			fuzzy.map((r) => ({ id: r.id, artist: r.artist, title: r.title }))
		);
	}

	const a = await db.query.album.findFirst({
		where: like(album.artist, `%${artistQuery}%`),
		orderBy: [asc(album.createdAt)]
	});
	if (!a) {
		console.log('Album not found');
		process.exit(0);
	}
	console.log(
		'Found album:',
		a.id,
		a.artist,
		a.title,
		'MBID=',
		a.musicbrainzId || null,
		'Discogs=',
		a.discogsId || null,
		'Spotify=',
		a.spotifyId || null
	);

	const tracks = await db.query.track.findMany({
		where: eq(track.albumId, a.id),
		orderBy: [asc(track.trackNumber), asc(track.title)]
	});
	console.log('Tracks:');
	for (const t of tracks) {
		console.log(
			t.trackNumber,
			t.position || '',
			t.title,
			t.durationMs,
			t.spotifyId ? `(spotify:${t.spotifyId})` : ''
		);
	}
}

const artist = process.argv[2] || 'Arca';
const title = process.argv[3] || '@@@@@';

run(artist, title)
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
