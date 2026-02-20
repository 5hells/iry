import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track, artist } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as artistIndexer from '../src/lib/server/music/artist-indexer';
import * as musicbrainz from '../src/lib/server/music/musicbrainz';
import * as discogs from '../src/lib/server/music/discogs';
import * as spotify from '../src/lib/server/music/spotify';

function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

async function reindexArtists(dryRun = false, limit?: number) {
	console.log('Reindexing artists...');
	const q = limit ? db.query.artist.findMany({ limit }) : db.query.artist.findMany();
	const rows = await q;
	console.log(`Found ${rows.length} artists`);
	let updated = 0;
	for (const a of rows) {
		try {
			if (a.musicbrainzId) {
				const res = await artistIndexer.indexArtistFromMusicBrainz(a.musicbrainzId);
				if (res && !dryRun) updated++;
				continue;
			}
			if (a.discogsId) {
				const res = await artistIndexer.indexArtistFromDiscogs(a.discogsId);
				if (res && !dryRun) updated++;
				continue;
			}
			if (a.spotifyId) {
				const res = await artistIndexer.indexArtistFromSpotify(a.spotifyId);
				if (res && !dryRun) updated++;
				continue;
			}
		} catch (err) {
			console.error('Error reindexing artist', a.id, err);
		}
		await sleep(200);
	}
	console.log(`Artist reindex complete. Updated approximately ${updated} entries (dryRun=${dryRun})`);
}

async function reindexAlbumsAndTracks(dryRun = false, limit?: number) {
	console.log('Reindexing albums and tracks...');
	const albums = limit ? await db.query.album.findMany({ limit }) : await db.query.album.findMany();
	console.log(`Found ${albums.length} albums`);
	let updatedAlbums = 0;
	let updatedTracks = 0;

	for (const al of albums) {
		try {
			let mbInfo = null;
			if (al.musicbrainzId) mbInfo = await musicbrainz.getRelease(al.musicbrainzId) || await musicbrainz.getRelease(al.musicbrainzId);

			let cover = null;
			if (mbInfo && (mbInfo as any)['cover-art-archive']) {
				cover = await musicbrainz.getCoverArtUrl(al.musicbrainzId);
			}

			if (!cover && al.artist && al.title) {
				try {
					const found = await discogs.searchReleases(`${al.artist} ${al.title}`, 'release');
					if (found && found.length > 0) {
						cover = found[0].cover_image || found[0].thumb || null;
					}
				} catch (e) {
					console.debug('Discogs fetch failed for album', al.id, e);
				}
			}

			if (cover && cover !== al.coverArtUrl) {
				console.log('Album', al.id, 'cover changed ->', cover);
				if (!dryRun) {
					await db.update(album).set({ coverArtUrl: cover }).where(eq(album.id, al.id));
					updatedAlbums++;
				}
			}

			if (al.musicbrainzId) {
				try {
					const release = await musicbrainz.getRelease(al.musicbrainzId);
					const tracks = (release?.media || [])
						.flatMap((m: any) => m.tracks || [])
						.filter(Boolean);
					if (tracks && tracks.length > 0) {
						for (let i = 0; i < tracks.length; i++) {
							const t = tracks[i];
							let dbTrack = null as any;
							if (t.recording?.id) {
								dbTrack = await db.query.track.findFirst({ where: eq(track.musicbrainzId, t.recording.id) });
							}
							if (!dbTrack) {
								dbTrack = await db.query.track.findFirst({ where: eq(track.albumId, al.id) });
							}
							if (dbTrack) {
								const updates: any = {};
								if (dbTrack.trackNumber !== (i + 1)) updates.trackNumber = i + 1;
								if (t.length && dbTrack.durationMs !== t.length) updates.durationMs = t.length;
								if (Object.keys(updates).length > 0 && !dryRun) {
									await db.update(track).set(updates).where(eq(track.id, dbTrack.id));
									updatedTracks++;
								}
							}
						}
					}
				} catch (e) {
					console.debug('Error reindexing tracks for album', al.id, e);
				}
			}
		} catch (err) {
			console.error('Error processing album', al.id, err);
		}
		await sleep(300);
	}

	console.log(`Album reindex complete. Albums updated: ${updatedAlbums}, Tracks updated: ${updatedTracks} (dryRun=${dryRun})`);
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const artistsOnly = args.includes('--artists-only');
	const tracksOnly = args.includes('--tracks-only');
	const limitArg = args.find((a) => a.startsWith('--limit='));
	const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

	console.log(
		'Starting reindex (dryRun=',
		dryRun,
		', limit=',
		limit,
		', artistsOnly=',
		artistsOnly,
		', tracksOnly=',
		tracksOnly,
		')'
	);

	if (artistsOnly && tracksOnly) {
		throw new Error('Cannot use --artists-only and --tracks-only together');
	}

	if (artistsOnly) {
		await reindexArtists(dryRun, limit);
	} else if (tracksOnly) {
		await reindexAlbumsAndTracks(dryRun, limit);
	} else {
		await reindexArtists(dryRun, limit);
		await reindexAlbumsAndTracks(dryRun, limit);
	}

	console.log('Reindex finished');
}

main().catch((err) => {
	console.error('Reindex failed:', err);
	process.exit(1);
});
