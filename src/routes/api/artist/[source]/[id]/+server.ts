import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { artist as artistTable } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getOrCreateArtist } from '$lib/server/music/artist-indexer';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import * as spotify from '$lib/server/music/spotify';

export const GET: RequestHandler = async ({ params }) => {
	const { source, id } = params;

	if (!source || !id) {
		return error(400, 'Source and ID are required');
	}

	try {
		let artist;
		let releases: {
            id: string;
            title: string;
            type: string;
        }[] = [];

		let images: string[] = [];

		
		if (source === 'musicbrainz') {
			artist = await getOrCreateArtist(id);

			
			const mbArtist = await musicbrainz.getArtist(id);
			if (mbArtist && mbArtist['release-groups']) {
				releases = mbArtist['release-groups'].map((rg: {
                    id: string;
                    title: string;
                    'primary-type': string;
                    'first-release-date': string;
				}) => ({
					id: rg.id,
					musicbrainzId: rg.id,
					source: 'musicbrainz',
					title: rg.title || rg['primary-type'],
					type: rg['primary-type'],
					releaseDate: rg['first-release-date'],
					coverArt: `/api/image-proxy?u=${encodeURIComponent(`https://coverartarchive.org/release-group/${rg.id}/front-250`)}`,
					externalUrl: `https://musicbrainz.org/release-group/${rg.id}`
				}));
			}

			try {
				if (mbArtist) {
					const rels = mbArtist.relations || mbArtist['relation-list'] || mbArtist.relations || [];
					for (const r of rels) {
						if (r?.type === 'image' || r?.type === 'thumbnail') {
							if (r?.url?.resource) images.push(r.url.resource);
						}
					}
				}
			} catch (e) {
				console.debug('Error extracting MB images', e);
			}
		} else if (source === 'discogs') {
			artist = await getOrCreateArtist(undefined, undefined, id);

			
			const discogsArtist = await discogs.getArtist(parseInt(id));
			if (discogsArtist) {
				try {
					if (discogsArtist.images && discogsArtist.images.length > 0) {
						for (const im of discogsArtist.images) {
							if (im?.uri) images.push(im.uri);
							else if (im?.resource_url) images.push(im.resource_url);
						}
					}
				} catch (e) {
					console.debug('Error extracting Discogs images', e);
				}

				try {
					const found = await discogs.searchReleases(discogsArtist.name || '', 'release');
					if (found && found.length > 0) {
						releases = found.map((r: any) => ({
							id: String(r.id || r.resource_url || r.uri || r.title),
							title: r.title || (r.id && String(r.id)) || '',
							type: r.type || (r.format || 'release'),
							coverArt: r.cover_image || r.thumb || null,
							externalUrl: r.resource_url || r.uri || (r.id ? `https://www.discogs.com/release/${r.id}` : undefined)
						}));
					}
				} catch (err) {
					console.error('Error fetching Discogs releases for artist', id, err);
				}
			}
		} else if (source === 'spotify') {
			artist = await getOrCreateArtist(undefined, id);

			
			const spotifyReleases = await spotify.getArtistReleases(id, 50, 0);
			releases = spotifyReleases.items.map((item: {
                id: string;
                name: string;
                album_type: string;
                release_date: string;
                images?: { url: string }[];
                total_tracks: number;
                external_urls?: { spotify: string };
			}) => ({
				id: item.id,
				spotifyId: item.id,
				source: 'spotify',
				title: item.name,
				type: item.album_type,
				releaseDate: item.release_date,
				coverArt: item.images?.[0]?.url || null,
				totalTracks: item.total_tracks,
				externalUrl: item.external_urls?.spotify
			}));

			try {
				const spArtist = await spotify.getArtist(id);
				if (spArtist && spArtist.images && spArtist.images.length > 0) {
					for (const im of spArtist.images) {
						if (im?.url) images.push(im.url);
					}
				}
			} catch (e) {
				console.debug('Error fetching Spotify artist images', e);
			}
		} else if (source === 'db') {
			artist = await db.query.artist.findFirst({ where: eq(artistTable.id, id) });

			if (artist?.musicbrainzId) {
				const mbArtist = await musicbrainz.getArtist(artist.musicbrainzId);
				if (mbArtist && mbArtist['release-groups']) {
					releases = mbArtist['release-groups'].map((rg: any) => ({
						id: rg.id,
						musicbrainzId: rg.id,
						source: 'musicbrainz',
						title: rg.title || rg['primary-type'],
						type: rg['primary-type'],
						releaseDate: rg['first-release-date'],
						coverArt: `/api/image-proxy?u=${encodeURIComponent(`https://coverartarchive.org/release-group/${rg.id}/front-250`)}`,
						externalUrl: `https://musicbrainz.org/release-group/${rg.id}`
					}));
				}
			}
		} else {
			return error(400, 'Invalid source. Must be musicbrainz, discogs, spotify, or db');
		}

		if (!artist) {
			return error(404, 'Artist not found');
		}

		
		let genres: string[] = [];
		if (artist.genres) {
			try {
				genres = JSON.parse(artist.genres);
			} catch {
				genres = [];
			}
		}

		const allowedHosts = new Set([
			'i.discogs.com',
			'coverartarchive.org',
			'images.unsplash.com',
			'upload.wikimedia.org',
			'commons.wikimedia.org',
			'i.scdn.co',
			'images-na.ssl-images-amazon.com',
			'www.gravatar.com',
			'avatars.githubusercontent.com'
		]);

		let returnedImageUrl = artist.imageUrl || null;
		try {
			if (returnedImageUrl) {
				const parsed = new URL(returnedImageUrl);
				if (allowedHosts.has(parsed.hostname)) {
					returnedImageUrl = `/api/image-proxy?u=${encodeURIComponent(returnedImageUrl)}`;
				}
			}
		} catch {}

		try {
			if (!images.length && artist.musicbrainzId) {
				const mbArtist = await musicbrainz.getArtist(artist.musicbrainzId);
				const rels = mbArtist?.relations || mbArtist?.['relation-list'] || [];
				const wikidataRel = rels?.find((r: any) => r?.type === 'wikidata' && r?.url?.resource);
				if (wikidataRel) {
					const wikidataUrl: string = wikidataRel.url.resource;
					const m = wikidataUrl.match(/\/(Q\d+)(?:$|\/)/i);
					const qid = m ? m[1] : null;
					if (qid) {
						try {
							const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
							if (res.ok) {
								const data = await res.json();
								const entity = data.entities?.[qid];
								const claims = entity?.claims;
								const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
								if (p18) {
									images.unshift(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p18)}`);
								}
							}
						} catch (err) {
							console.error('Error fetching Wikidata entity for image:', err);
						}
					}
				}
			}
		} catch {}

		let normalizedImages: string[] = [];
		try {
			const seen = new Set<string>();
			if (returnedImageUrl) {
				seen.add(returnedImageUrl);
				normalizedImages.push(returnedImageUrl);
			}
			for (const u of images) {
				if (!u) continue;
				const url = String(u);
				if (!seen.has(url)) {
					seen.add(url);
					try {
						const parsed = new URL(url);
						if (allowedHosts.has(parsed.hostname)) {
							normalizedImages.push(`/api/image-proxy?u=${encodeURIComponent(url)}`);
						} else {
							normalizedImages.push(url);
						}
					} catch (e) {
						normalizedImages.push(url);
					}
				}
			}
		} catch (e) {
			normalizedImages = returnedImageUrl ? [returnedImageUrl] : [];
		}

		return json({
			artist: {
				id: artist.id,
				source,
				musicbrainzId: artist.musicbrainzId,
				spotifyId: artist.spotifyId,
				discogsId: artist.discogsId,
				name: artist.name,
				imageUrl: returnedImageUrl,
				images: normalizedImages,
				genres,
				spotifyUri: artist.spotifyUri,
				musicbrainzUrl: artist.musicbrainzUrl,
				discogsUrl: artist.discogsUrl
			},
			releases
		});
	} catch (err) {
		console.error('Artist fetch error:', err);
		return error(500, 'Failed to fetch artist');
	}
};
