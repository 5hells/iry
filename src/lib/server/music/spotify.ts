import SpotifyWebApi from 'spotify-web-api-node';

const env = process.env as Record<string, string | undefined>;

let spotifyApi: SpotifyWebApi | null = null;
let tokenExpirationTime = 0;

async function getSpotifyApi() {
	if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
		throw new Error('Spotify credentials not configured');
	}

	const now = Date.now();

	if (!spotifyApi || now >= tokenExpirationTime) {
		spotifyApi = new SpotifyWebApi({
			clientId: env.SPOTIFY_CLIENT_ID,
			clientSecret: env.SPOTIFY_CLIENT_SECRET
		});

		const data = await spotifyApi.clientCredentialsGrant();
		spotifyApi.setAccessToken(data.body.access_token);

		tokenExpirationTime = now + (data.body.expires_in - 300) * 1000;
	}

	return spotifyApi;
}

export interface SpotifyAlbum {
	id: string;
	name: string;
	artists: { name: string }[];
	release_date: string;
	images: { url: string }[];
	total_tracks: number;
	uri: string;
	external_urls: { spotify: string };
	genres?: string[];
}

export interface SpotifyTrack {
	id: string;
	name: string;
	track_number: number;
	disc_number?: number;
	duration_ms: number;
	uri: string;
}

export interface SpotifyTrackSearchResult extends SpotifyTrack {
	album: {
		id: string;
		name: string;
		artists: { name: string }[];
		images: { url: string }[];
	};
	artists: { name: string }[];
}

export async function searchAlbums(query: string, limit = 20): Promise<SpotifyAlbum[]> {
	const api = await getSpotifyApi();
	const results = await api.searchAlbums(query, { limit });
	return results.body.albums?.items || [];
}

export async function getAlbum(albumId: string): Promise<SpotifyAlbum | null> {
	try {
		const api = await getSpotifyApi();
		const result = await api.getAlbum(albumId);
		return result.body as SpotifyAlbum;
	} catch (error) {
		console.error('Error fetching Spotify album:', error);
		return null;
	}
}

export async function getAlbumTracks(albumId: string): Promise<SpotifyTrack[]> {
	try {
		const api = await getSpotifyApi();
		const result = await api.getAlbumTracks(albumId, { limit: 50 });
		return result.body.items as SpotifyTrack[];
	} catch (error) {
		console.error('Error fetching Spotify tracks:', error);
		return [];
	}
}

export async function searchTracks(query: string, limit = 20): Promise<SpotifyTrackSearchResult[]> {
	const api = await getSpotifyApi();
	const results = await api.searchTracks(query, { limit });
	return (results.body.tracks?.items || []) as SpotifyTrackSearchResult[];
}

export async function searchArtists(query: string, limit = 20) {
	const api = await getSpotifyApi();
	const results = await api.searchArtists(query, { limit });
	return results.body.artists?.items || [];
}

export async function getArtist(artistId: string) {
	try {
		const api = await getSpotifyApi();
		const result = await api.getArtist(artistId);
		return result.body;
	} catch (error) {
		console.error('Error fetching Spotify artist:', error);
		return null;
	}
}

export async function getArtistReleases(artistId: string, limit = 50, offset = 0) {
	try {
 		const api = await getSpotifyApi();
 		
 		const res = await api.getArtistAlbums(artistId, {
 			limit: Math.min(limit, 50),
 			offset,
 			include_groups: 'album,single'
 		});

 		
 		const items = res.body.items || [];
 		const seen = new Set<string>();
 		const unique: any[] = [];
 		for (const it of items) {
 			if (!seen.has(it.id)) {
 				seen.add(it.id);
 				unique.push(it);
 			}
 		}

 		return {
 			items: unique,
 			total: res.body.total || unique.length,
 			limit: res.body.limit,
 			offset: res.body.offset
 		};
 	} catch (error) {
 		console.error('Error fetching artist releases:', error);
 		return { items: [], total: 0, limit, offset };
 	}
}
