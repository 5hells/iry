import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { album } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { indexAlbumFromSpotify, indexAlbumFromDiscogs, indexAlbumFromMusicBrainz } from '$lib/server/music/indexer';

export const GET: RequestHandler = async ({ params }) => {
    const id = params.id;
    if (!id) throw error(400, 'Missing id');

    
    let found = await db.query.album.findFirst({ where: eq(album.spotifyId, id) });
    if (!found) found = await db.query.album.findFirst({ where: eq(album.discogsId, id) });
    if (!found) found = await db.query.album.findFirst({ where: eq(album.id, id) });

    try {
        if (!found) {
            
            if (/^[A-Za-z0-9]{8,}$/.test(id)) {
                try {
                    const sp = await indexAlbumFromSpotify(id);
                    if (sp) found = sp;
                } catch (e) {}
            }
        }
    } catch (e) {
        console.warn('Indexing attempt failed', e);
    }

    if (!found) throw error(404, 'Album not found');

    
    throw redirect(307, `/music/unknown/${found.id}`);
};
