import 'dotenv/config';
import { db } from '../src/lib/server/db';
import { album, track } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as musicbrainz from '../src/lib/server/music/musicbrainz';
import * as discogs from '../src/lib/server/music/discogs';
import * as spotify from '../src/lib/server/music/spotify';
import {
	indexAlbumFromMusicBrainz,
	indexAlbumFromDiscogs,
	indexAlbumFromSpotify
} from '../src/lib/server/music/indexer';
import { levenshteinDistance, normalizeString } from '../src/lib/utils/levenshtein';

type Source = 'musicbrainz' | 'discogs' | 'spotify';

type Candidate = {
	source: Source;
	id: string;
	title: string;
	artist: string;
	releaseDate?: string;
};

type MergedResult = Candidate & {
	sources: Partial<Record<Source, string>>;
};

function parseArg(name: string, fallback?: string): string | undefined {
	const pref = `--${name}=`;
	const hit = process.argv.find((arg) => arg.startsWith(pref));
	if (hit) return hit.slice(pref.length);
	return fallback;
}

function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

function score(a: string, b: string): number {
	const na = normalizeString(a);
	const nb = normalizeString(b);
	if (!na || !nb) return 0;
	if (na === nb) return 1;
	const distance = levenshteinDistance(na, nb);
	const maxLen = Math.max(na.length, nb.length);
	return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function isSameAlbum(
	a: Pick<Candidate, 'title' | 'artist'>,
	b: Pick<Candidate, 'title' | 'artist'>
): boolean {
	const titleScore = score(a.title, b.title);
	const artistScore = score(a.artist, b.artist);
	const aArtist = normalizeString(a.artist);
	const bArtist = normalizeString(b.artist);
	const contains = aArtist.includes(bArtist) || bArtist.includes(aArtist);
	return titleScore >= 0.82 && (artistScore >= 0.72 || contains);
}

function parseDiscogsArtistAndTitle(release: unknown): { artist: string; title: string } {
	const releaseObj = (release ?? {}) as Record<string, unknown>;
	const fallbackArtist = String(releaseObj.artist || '').trim();
	const rawTitle = String(releaseObj.title || '').trim();

	if (!rawTitle.includes(' - ')) {
		return {
			artist: fallbackArtist || 'Unknown',
			title: rawTitle
		};
	}

	const [left, ...rest] = rawTitle.split(' - ');
	const right = rest.join(' - ').trim();
	const leftArtist = left.trim();

	if (!right) {
		return {
			artist: fallbackArtist || leftArtist || 'Unknown',
			title: rawTitle
		};
	}

	const normalizedFallbackArtist = normalizeString(fallbackArtist);
	const normalizedLeftArtist = normalizeString(leftArtist);
	const useLeftArtist =
		!normalizedFallbackArtist || normalizedFallbackArtist === normalizedLeftArtist;

	return {
		artist: useLeftArtist
			? leftArtist || fallbackArtist || 'Unknown'
			: fallbackArtist || leftArtist || 'Unknown',
		title: right
	};
}

function mergeCandidates(candidates: Candidate[]): MergedResult[] {
	const merged: MergedResult[] = [];

	for (const candidate of candidates) {
		const idx = merged.findIndex((m) => isSameAlbum(m, candidate));
		if (idx === -1) {
			merged.push({
				...candidate,
				sources: { [candidate.source]: candidate.id }
			});
			continue;
		}

		const existing = merged[idx];
		const existingEnrichment =
			(existing.releaseDate ? 1 : 0) + Object.keys(existing.sources).length;
		const candidateEnrichment = (candidate.releaseDate ? 1 : 0) + 1;

		if (candidateEnrichment > existingEnrichment) {
			merged[idx] = {
				...candidate,
				sources: {
					...existing.sources,
					[candidate.source]: candidate.id
				}
			};
		} else {
			existing.sources[candidate.source] = candidate.id;
		}
	}

	return merged;
}

async function countTracks(albumId: string): Promise<number> {
	const rows = await db.query.track.findMany({
		where: eq(track.albumId, albumId)
	});
	return rows.length;
}

async function verifyDbAlbumByAnySource(sources: Partial<Record<Source, string>>) {
	if (sources.musicbrainz) {
		const a = await db.query.album.findFirst({
			where: eq(album.musicbrainzId, sources.musicbrainz)
		});
		if (a) return a;
	}
	if (sources.discogs) {
		const a = await db.query.album.findFirst({ where: eq(album.discogsId, sources.discogs) });
		if (a) return a;
	}
	if (sources.spotify) {
		const a = await db.query.album.findFirst({ where: eq(album.spotifyId, sources.spotify) });
		if (a) return a;
	}
	return null;
}

async function main() {
	const query = parseArg('query') || process.argv.slice(2).find((v) => !v.startsWith('--'));
	const limit = Number(parseArg('limit', '10'));
	const dryRun = hasFlag('dry-run');

	if (!query) {
		console.error(
			'Usage: bun run scripts/test-search-merge-index.ts --query="Lorde Pure Heroine" [--limit=10] [--dry-run]'
		);
		process.exit(1);
	}

	console.log(`🔎 Query: ${query}`);
	console.log(`📏 Limit/source: ${limit}`);
	if (dryRun) console.log('🧪 Dry run enabled (no indexing calls)');

	const candidates: Candidate[] = [];

	const mb = await musicbrainz.searchReleases(query, limit).catch(() => []);
	for (const r of mb) {
		candidates.push({
			source: 'musicbrainz',
			id: r.id,
			title: r.title,
			artist: musicbrainz.formatArtistCredit(r['artist-credit']),
			releaseDate: r.date
		});
	}

	const dg = await discogs.searchReleases(query).catch(() => []);
	for (const r of dg.slice(0, limit)) {
		const parsed = parseDiscogsArtistAndTitle(r);
		candidates.push({
			source: 'discogs',
			id: String(r.id),
			title: parsed.title,
			artist: parsed.artist,
			releaseDate: r.year
		});
	}

	const sp = await spotify.searchAlbums(query, limit).catch(() => []);
	for (const r of sp) {
		candidates.push({
			source: 'spotify',
			id: r.id,
			title: r.name,
			artist: r.artists.map((a) => a.name).join(', '),
			releaseDate: r.release_date
		});
	}

	console.log(`📦 Raw candidates: ${candidates.length}`);
	const merged = mergeCandidates(candidates);
	console.log(`🧩 Merged results: ${merged.length}`);

	let indexed = 0;
	let failures = 0;
	const report: Array<{
		title: string;
		artist: string;
		albumId?: string;
		tracks?: number;
		sources: string[];
		error?: string;
	}> = [];

	for (const item of merged) {
		try {
			if (dryRun) {
				report.push({
					title: item.title,
					artist: item.artist,
					sources: Object.keys(item.sources),
					tracks: undefined
				});
				indexed += 1;
				continue;
			}

			if (!dryRun) {
				if (item.sources.musicbrainz) await indexAlbumFromMusicBrainz(item.sources.musicbrainz);
				if (item.sources.discogs) await indexAlbumFromDiscogs(item.sources.discogs);
				if (item.sources.spotify) await indexAlbumFromSpotify(item.sources.spotify);
			}

			const dbAlbum = await verifyDbAlbumByAnySource(item.sources);
			if (!dbAlbum) {
				failures += 1;
				report.push({
					title: item.title,
					artist: item.artist,
					sources: Object.keys(item.sources),
					error: 'Album not found in DB after indexing'
				});
				continue;
			}

			const tracks = await countTracks(dbAlbum.id);
			indexed += 1;
			report.push({
				title: dbAlbum.title,
				artist: dbAlbum.artist,
				albumId: dbAlbum.id,
				tracks,
				sources: Object.keys(item.sources)
			});
		} catch (err) {
			failures += 1;
			report.push({
				title: item.title,
				artist: item.artist,
				sources: Object.keys(item.sources),
				error: err instanceof Error ? err.message : String(err)
			});
		}
	}

	console.log('\n=== Search + Merge + Index Report ===');
	for (const row of report) {
		if (row.error) {
			console.log(`❌ ${row.artist} - ${row.title} [${row.sources.join(', ')}] :: ${row.error}`);
		} else if (dryRun) {
			console.log(`🧪 ${row.artist} - ${row.title} [${row.sources.join(', ')}]`);
		} else {
			console.log(
				`✅ ${row.artist} - ${row.title} :: album=${row.albumId} tracks=${row.tracks} [${row.sources.join(', ')}]`
			);
		}
	}

	console.log('\n=== Summary ===');
	console.log(`Indexed/verified: ${indexed}`);
	console.log(`Failures: ${failures}`);

	process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error('Fatal error in test-search-merge-index:', err);
	process.exit(1);
});
