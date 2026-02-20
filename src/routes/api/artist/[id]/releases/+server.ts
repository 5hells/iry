import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as spotify from '$lib/server/music/spotify';

export const GET: RequestHandler = async ({ params, url }) => {
  const artistId = params.id;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  if (!artistId) return error(400, 'artist id required');

  try {
    const data = await spotify.getArtistReleases(artistId, limit, offset);
    return json({
      items: (data.items || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.album_type,
        release_date: a.release_date,
        total_tracks: a.total_tracks,
        images: a.images || [],
        external_urls: a.external_urls || {}
      })),
      total: data.total,
      limit: data.limit,
      offset: data.offset
    });
  } catch (err) {
    console.error('Failed to fetch artist releases:', err);
    return error(500, 'Failed to fetch artist releases');
  }
};
