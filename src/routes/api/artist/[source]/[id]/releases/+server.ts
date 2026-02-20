import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as spotify from '$lib/server/music/spotify';

export const GET: RequestHandler = async ({ params, url }) => {
	const { source, id } = params;
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
	const offset = parseInt(url.searchParams.get('offset') || '0');

	if (!source || !id) {
		return error(400, 'Source and ID are required');
	}

	try {
		let releases: {
            id: string;
            title: string;
            type: string;
            releaseDate?: string;
            coverArt?: string | null;
            totalTracks?: number;
            externalUrl?: string;
        }[] = [];

        let total = 0;

		if (source === 'musicbrainz') {
			const mbArtist = await musicbrainz.getArtist(id);
			if (!mbArtist) {
				return error(404, 'Artist not found on MusicBrainz');
			}

			const allReleaseGroups = mbArtist['release-groups'] || [];
			total = allReleaseGroups.length;

			releases = allReleaseGroups.slice(offset, offset + limit).map((rg: {
                id: string;
                title: string;
                'primary-type': string;
                'first-release-date': string;
            }) => ({
				id: rg.id,
				title: rg.title || rg['primary-type'],
				type: rg['primary-type'],
				releaseDate: rg['first-release-date'],
				externalUrl: `https://musicbrainz.org/release-group/${rg.id}`
			}));
		} else if (source === 'discogs') {
			
			
			return json({
				items: [],
				total: 0,
				limit,
				offset
			});
		} else if (source === 'spotify') {
			const data = await spotify.getArtistReleases(id, limit, offset);

			releases = data.items.map((item: {
                id: string;
                name: string;
                album_type: string;
                release_date: string;
                images?: { url: string }[];
                total_tracks: number;
                external_urls?: { spotify: string };
            }) => ({
				id: item.id,
				title: item.name,
				type: item.album_type,
				releaseDate: item.release_date,
				coverArt: item.images?.[0]?.url || null,
				totalTracks: item.total_tracks,
				externalUrl: item.external_urls?.spotify
			}));

			total = data.total;
		} else {
			return error(400, 'Invalid source. Must be musicbrainz, discogs, or spotify');
		}

		return json({
			items: releases,
			total,
			limit,
			offset
		});
	} catch (err) {
		console.error('Error fetching artist releases:', err);
		return error(500, 'Failed to fetch artist releases');
	}
};
