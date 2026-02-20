import { db } from '$lib/server/db';
import { artist } from '$lib/server/db/schema';
import * as spotify from './spotify';
import * as discogs from './discogs';
import * as musicbrainz from './musicbrainz';
import { eq } from 'drizzle-orm';


function extractMusicBrainzArtistGenres(mbArtist: {
    tags?: { name: string }[];
    type?: string;
}): string[] {
	const genres: string[] = [];

	if (mbArtist.tags && Array.isArray(mbArtist.tags)) {
		genres.push(...mbArtist.tags.map((tag: { name: string }) => tag.name));
	}

	if (mbArtist.type) {
		genres.push(mbArtist.type);
	}

	return [...new Set(genres)]; 
}


function extractDiscogsArtistGenres(discogsArtist: {
    namevariations?: string[];
}): string[] {
	const genres: string[] = [];

	if (Array.isArray(discogsArtist.namevariations)) {
        genres.push(...discogsArtist.namevariations);
	}

	return [...new Set(genres)]; 
}


export async function indexArtistFromMusicBrainz(musicbrainzId: string) {
	
	const existing = await db.query.artist.findFirst({
		where: eq(artist.musicbrainzId, musicbrainzId)
	});

	if (existing) {
		return existing;
	}

	
	const mbArtist = await musicbrainz.getArtist(musicbrainzId);
	if (!mbArtist) {
		throw new Error('Artist not found on MusicBrainz');
	}

	const genres = extractMusicBrainzArtistGenres(mbArtist);

	async function extractImageFromMbArtist(mb: any): Promise<string | null> {
		if (!mb) return null;
		const relations = mb.relations || mb['relation-list'] || mb['relations'] || [];

		for (const rel of relations) {
			if (rel?.type === 'image' && rel?.url?.resource) {
				return rel.url.resource;
			}
			if (rel?.type === 'thumbnail' && rel?.url?.resource) {
				return rel.url.resource;
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

	
		let imageUrl = await extractImageFromMbArtist(mbArtist);

		if (!imageUrl) {
			try {
				const relations = mbArtist.relations || mbArtist['relation-list'] || [];
				const discogsRel = relations.find((r: any) => r?.type === 'discogs' && r?.url?.resource);
				let discogsId: string | null = null;
				if (discogsRel && discogsRel.url && discogsRel.url.resource) {
					const m = String(discogsRel.url.resource).match(/artist\/(\d+)/i);
					if (m) discogsId = m[1];
				}

				if (discogsId) {
					const d = await discogs.getArtist(parseInt(discogsId));
					if (d && d.images && d.images.length > 0) {
						imageUrl = d.images[0].uri || d.images[0].resource_url || null;
					}
				} else if (mbArtist.name) {
					const results = await discogs.searchArtists(mbArtist.name);
					if (results && results.length > 0) {
						const first = results[0];
						const id = first.id || (first.resource_url && String(first.resource_url).match(/artist\/(\d+)/)?.[1]);
						if (id) {
							const d = await discogs.getArtist(parseInt(String(id)));
							if (d && d.images && d.images.length > 0) {
								imageUrl = d.images[0].uri || d.images[0].resource_url || null;
							}
						}
					}
				}
			} catch (err) {
				console.error('Discogs fallback error while indexing MB artist:', err);
			}
		}

		const inserted = await db
		.insert(artist)
		.values({
			musicbrainzId: mbArtist.id,
			name: mbArtist.name,
				imageUrl: imageUrl || null,
			genres: JSON.stringify(genres),
			musicbrainzUrl: `https://musicbrainz.org/artist/${mbArtist.id}`
		})
		.onConflictDoNothing({ target: artist.musicbrainzId })
		.returning();

	const newArtist =
		inserted[0] ||
		(await db.query.artist.findFirst({
			where: eq(artist.musicbrainzId, musicbrainzId)
		}));

	return newArtist;
}


export async function indexArtistFromDiscogs(discogsId: number | string) {
	const discogsIdStr = String(discogsId);
	const discogsIdNum = parseInt(discogsIdStr);

	
	const existing = await db.query.artist.findFirst({
		where: eq(artist.discogsId, discogsIdStr)
	});

	if (existing) {
		return existing;
	}

	
	const discogsArtist = await discogs.getArtist(discogsIdNum);
	if (!discogsArtist) {
		throw new Error('Artist not found on Discogs');
	}

	const genres = extractDiscogsArtistGenres(discogsArtist);

	
	const inserted = await db
		.insert(artist)
		.values({
			discogsId: discogsIdStr,
			name: discogs.cleanDiscogsArtistName(discogsArtist.name) || discogsArtist.name,
			imageUrl: discogsArtist.images?.[0]?.uri || null,
			genres: JSON.stringify(genres),
			discogsUrl: discogsArtist.uri || discogsArtist.resource_url
		})
		.onConflictDoNothing({ target: artist.discogsId })
		.returning();

	const newArtist =
		inserted[0] ||
		(await db.query.artist.findFirst({
			where: eq(artist.discogsId, discogsIdStr)
		}));

	return newArtist;
}


export async function indexArtistFromSpotify(spotifyId: string) {
	
	const existing = await db.query.artist.findFirst({
		where: eq(artist.spotifyId, spotifyId)
	});

	if (existing) {
		return existing;
	}

	
	const spotifyArtist = await spotify.getArtist(spotifyId);
	if (!spotifyArtist) {
		throw new Error('Artist not found on Spotify');
	}

	const genres = spotifyArtist.genres || [];

	
	const inserted = await db
		.insert(artist)
		.values({
			spotifyId: spotifyArtist.id,
			name: spotifyArtist.name,
			imageUrl: spotifyArtist.images?.[0]?.url || null,
			genres: JSON.stringify(genres),
			spotifyUri: spotifyArtist.uri
		})
		.onConflictDoNothing({ target: artist.spotifyId })
		.returning();

	const newArtist =
		inserted[0] ||
		(await db.query.artist.findFirst({
			where: eq(artist.spotifyId, spotifyId)
		}));

	return newArtist;
}


export async function getOrCreateArtist(
	musicbrainzId?: string,
	spotifyId?: string,
	discogsId?: string | number
) {
	
	if (musicbrainzId) {
		return await indexArtistFromMusicBrainz(musicbrainzId);
	}

	
	if (discogsId) {
		return await indexArtistFromDiscogs(discogsId);
	}

	
	if (spotifyId) {
		return await indexArtistFromSpotify(spotifyId);
	}

	throw new Error('Either musicbrainzId, spotifyId, or discogsId must be provided');
}
