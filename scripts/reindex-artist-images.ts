import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { db } from '../src/lib/server/db';
import { artist } from '../src/lib/server/db/schema';
import * as musicbrainz from '../src/lib/server/music/musicbrainz';
import * as discogs from '../src/lib/server/music/discogs';
import { eq } from 'drizzle-orm';

async function extractImageFromMbArtist(mb: any): Promise<string | null> {
	if (!mb) return null;
	const relations = mb.relations || mb['relation-list'] || mb['relations'] || [];

	for (const rel of relations) {
		try {
			if (rel?.type === 'image' && rel?.url?.resource) {
				return rel.url.resource;
			}
			if (rel?.type === 'thumbnail' && rel?.url?.resource) {
				return rel.url.resource;
			}
		} catch (e) {
			console.debug('relation parse error', e);
		}
	}

	const wikidataRel = relations.find((r: any) => r?.type === 'wikidata' && r?.url?.resource);
	if (wikidataRel && wikidataRel.url && wikidataRel.url.resource) {
		const wikidataUrl: string = wikidataRel.url.resource;
		const m = wikidataUrl.match(/\/(Q\d+)(?:$|\/)/i);
		const qid = m ? m[1] : null;
		if (qid) {
			try {
				const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
				if (!res.ok) return null;
				const data = await res.json();
				const entity = data.entities?.[qid];
				const claims = entity?.claims;
				const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
				if (p18) {
					return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}`;
				}
			} catch (err) {
				console.error('Error fetching Wikidata entity for image:', err);
			}
		}
	}

	return null;
}

async function reindex() {
	const rows = await db.query.artist.findMany();
	console.log(`Found ${rows.length} artists to check`);

	let updated = 0;

	for (const a of rows) {
		let image: string | null = null;
		try {
			if (a.musicbrainzId) {
				const mb = await musicbrainz.getArtist(a.musicbrainzId);
				image = await extractImageFromMbArtist(mb);
			}

			if (!image && a.discogsId) {
				try {
					const discogsArtist = await discogs.getArtist(parseInt(String(a.discogsId)));
					if (discogsArtist && discogsArtist.images && discogsArtist.images.length > 0) {
						image = discogsArtist.images[0].uri || discogsArtist.images[0].resource_url || null;
					}
				} catch (err) {
					console.error('Discogs fallback error for id', a.discogsId, err);
				}
			}

			if (!image && a.name) {
				try {
					const results = await discogs.searchArtists(a.name);
					if (results && results.length > 0) {
						const first = results[0];
						const artistId = first.id || first.resource_url?.match(/artist\/(\d+)/)?.[1];
						if (artistId) {
							const d = await discogs.getArtist(parseInt(String(artistId)));
							if (d && d.images && d.images.length > 0) {
								image = d.images[0].uri || d.images[0].resource_url || null;
							}
						}
					}
				} catch (err) {
					console.error('Discogs search fallback error for', a.name, err);
				}
			}

			if (image && image !== a.imageUrl) {
				await db.update(artist).set({ imageUrl: image }).where(eq(artist.id, a.id));
				updated++;
				console.log(`Updated artist ${a.name} (${a.id}) image`);
			}
		} catch (err) {
			console.error('Error reindexing artist', a.id, err);
		}
	}

	console.log(`Reindex complete, updated ${updated} artists`);
}

reindex().catch((err) => {
	console.error('Reindex script failed:', err);
	process.exit(1);
});
