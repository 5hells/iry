import 'dotenv/config';
import {
	indexAlbumFromMusicBrainz,
	indexAlbumFromDiscogs,
	indexAlbumFromSpotify
} from '../src/lib/server/music/indexer';

function parseArg(name: string): string | undefined {
	const pref = `--${name}=`;
	const hit = process.argv.find((arg) => arg.startsWith(pref));
	if (hit) return hit.slice(pref.length);
	return undefined;
}

async function main() {
	const mb = parseArg('mb');
	const dc = parseArg('dc');
	const sp = parseArg('sp');

	if (mb) {
		console.log('Indexing MusicBrainz release', mb);
		await indexAlbumFromMusicBrainz(mb);
		console.log('Done');
		return;
	}
	if (dc) {
		console.log('Indexing Discogs release', dc);
		await indexAlbumFromDiscogs(dc);
		console.log('Done');
		return;
	}
	if (sp) {
		console.log('Indexing Spotify album', sp);
		await indexAlbumFromSpotify(sp);
		console.log('Done');
		return;
	}

	console.error('Provide --mb=MBID or --dc=DISCOGS_ID or --sp=SPOTIFY_ID');
	process.exit(1);
}

main().catch((err) => {
	console.error('Reindex album failed:', err);
	process.exit(1);
});
