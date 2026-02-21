import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { album } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { indexAlbumFromSpotify, indexAlbumFromDiscogs, indexAlbumFromMusicBrainz } from '$lib/server/music/indexer';

export const GET: RequestHandler = async ({ params }) => {
    const { source, id } = params;
    if (!source || !id) throw error(400, 'Missing params');

    let found = null;

    try {
        if (source === 'spotify') {
            found = await db.query.album.findFirst({ where: eq(album.spotifyId, id) });
            if (!found) found = await indexAlbumFromSpotify(id);
        } else if (source === 'discogs') {
            found = await db.query.album.findFirst({ where: eq(album.discogsId, id) });
            if (!found) found = await indexAlbumFromDiscogs(id);
        } else if (source === 'musicbrainz') {
            found = await db.query.album.findFirst({ where: eq(album.musicbrainzId, id) });
            const canonical = await indexAlbumFromMusicBrainz(id);
            if (canonical) {
                found = canonical;
            }
        } else {
            
            found = await db.query.album.findFirst({ where: eq(album.id, id) });
        }
    } catch (e) {
        console.warn('Error resolving album source/id', source, id, e);
    }

    if (!found) throw error(404, 'Album not found');

    
    throw redirect(307, `/music/unknown/${found.id}`);
};
