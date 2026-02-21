import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const env = process.env as Record<string, string | undefined>;
const BASE_URL = 'https://musicbrainz.org/ws/2';

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; 

async function rateLimit() {
	const now = Date.now();
	const timeSinceLastRequest = now - lastRequestTime;
	if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
		await new Promise((resolve) =>
			setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
		);
	}
	lastRequestTime = Date.now();
}

async function fetchMusicBrainz(endpoint: string, params: Record<string, string> = {}) {
	await rateLimit();

	const url = new URL(`${BASE_URL}/${endpoint}`);
	url.searchParams.set('fmt', 'json');

	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const headers: Record<string, string> = {
		'User-Agent': 'Iry/1.0 ( us@hellings.cc )',
		Accept: 'application/json'
	};

	if (env.MUSICBRAINZ_API_KEY) {
		headers['Authorization'] = `Bearer ${env.MUSICBRAINZ_API_KEY}`;
	}

	const response = await fetch(url.toString(), { headers });

	if (!response.ok) {
		throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

export interface MusicBrainzRelease {
	id: string; 
	title: string;
	'artist-credit'?: Array<{
		name: string;
		artist: {
			id: string;
			name: string;
		};
	}>;
	date?: string; 
	'cover-art-archive'?: {
		artwork: boolean;
		count: number;
		front: boolean;
		back: boolean;
	};
	'release-group'?: {
		id: string;
		'primary-type'?: string;
		'secondary-types'?: string[];
	};
	status?: string;
	country?: string;
	barcode?: string;
	'track-count'?: number;
	media?: Array<{
		format: string;
		'track-count': number;
		'track-offset'?: number;
		tracks?: MusicBrainzTrack[];
	}>;
}

export interface MusicBrainzReleaseListItem {
	id: string;
	title: string;
	date?: string;
	status?: string;
	country?: string;
	'track-count'?: number;
}

export interface MusicBrainzTrack {
	id: string; 
	position: number;
	title: string;
	length?: number; 
	recording?: {
		id: string;
		title: string;
		length?: number;
	};
}

export interface MusicBrainzRecording {
	id: string;
	title: string;
	length?: number;
	'artist-credit'?: Array<{
		name: string;
		artist: {
			id: string;
			name: string;
		};
	}>;
	releases?: Array<{
		id: string;
		title: string;
		date?: string;
	}>;
}

export interface MusicBrainzArtist {
	id: string;
	name: string;
	'sort-name'?: string;
	type?: string;
	country?: string;
	disambiguation?: string;
	'life-span'?: {
		begin?: string;
		end?: string;
	};
	relations?: any[];
	tags?: { name: string }[];
}

export async function searchReleases(query: string, limit = 20): Promise<MusicBrainzRelease[]> {
	try {
		const data = await fetchMusicBrainz('release', {
			query,
			limit: String(Math.min(limit, 100))
		});
		return data.releases || [];
	} catch (error) {
		console.error('Error searching MusicBrainz releases:', error);
		return [];
	}
}

export async function getRelease(mbid: string): Promise<MusicBrainzRelease | null> {
	try {
		const data = await fetchMusicBrainz(`release/${mbid}`, {
			inc: 'artists+recordings+release-groups+media'
		});
		return data;
	} catch (error) {
		console.error('Error fetching MusicBrainz release:', error);
		return null;
	}
}

export async function getReleasesByReleaseGroup(
	releaseGroupId: string,
	limit = 50
): Promise<MusicBrainzReleaseListItem[]> {
	try {
		const data = await fetchMusicBrainz('release', {
			query: `rgid:${releaseGroupId}`,
			limit: String(Math.min(limit, 100))
		});
		return data.releases || [];
	} catch (error) {
		console.error('Error fetching MusicBrainz release-group releases:', error);
		return [];
	}
}

export async function getPreferredReleaseFromReleaseGroup(
	releaseGroupId: string
): Promise<MusicBrainzReleaseListItem | null> {
	const releases = await getReleasesByReleaseGroup(releaseGroupId, 100);
	if (!releases.length) return null;

	const sorted = [...releases].sort((a, b) => {
		const aOfficial = String(a.status || '').toLowerCase() === 'official' ? 1 : 0;
		const bOfficial = String(b.status || '').toLowerCase() === 'official' ? 1 : 0;
		if (aOfficial !== bOfficial) return bOfficial - aOfficial;

		const aDate = a.date ? Date.parse(a.date) : Number.MAX_SAFE_INTEGER;
		const bDate = b.date ? Date.parse(b.date) : Number.MAX_SAFE_INTEGER;
		if (aDate !== bDate) return aDate - bDate;

		return String(a.id).localeCompare(String(b.id));
	});

	return sorted[0] || null;
}

export async function searchRecordings(query: string, limit = 20): Promise<MusicBrainzRecording[]> {
	try {
		const data = await fetchMusicBrainz('recording', {
			query,
			limit: String(Math.min(limit, 100))
		});
		return data.recordings || [];
	} catch (error) {
		console.error('Error searching MusicBrainz recordings:', error);
		return [];
	}
}

export async function getRecording(mbid: string): Promise<MusicBrainzRecording | null> {
	try {
		const data = await fetchMusicBrainz(`recording/${mbid}`, {
			inc: 'artists+releases'
		});
		return data;
	} catch (error) {
		console.error('Error fetching MusicBrainz recording:', error);
		return null;
	}
}

export async function searchArtists(query: string, limit = 20): Promise<MusicBrainzArtist[]> {
	try {
		const data = await fetchMusicBrainz('artist', {
			query,
			limit: String(Math.min(limit, 100))
		});
		return data.artists || [];
	} catch (error) {
		console.error('Error searching MusicBrainz artists:', error);
		return [];
	}
}

export async function getArtist(mbid: string): Promise<MusicBrainzArtist | null> {
	try {
		const data = await fetchMusicBrainz(`artist/${mbid}`, {
			inc: 'url-rels+releases+release-groups+tags'
		});
		return data;
	} catch (error) {
		console.error('Error fetching MusicBrainz artist:', error);
		return null;
	}
}

export interface CoverArtInfo {
	image: string; 
	front: boolean; 
	thumbnails?: {
		small?: string; 
		large?: string; 
		full?: string; 
	};
	source: 'musicbrainz' | 'discogs';
}

export async function getCoverArtWithFallback(
	mbid: string,
	artistAndAlbum?: { artist?: string; album?: string }
): Promise<CoverArtInfo | null> {
	console.debug(
		`Fetching cover art for MBID: ${mbid}, Artist: ${artistAndAlbum?.artist}, Album: ${artistAndAlbum?.album}`
	);

	const mbCoverArt = await getCoverArtFromMusicBrainz(mbid);
	if (mbCoverArt) {
		console.debug(`Found cover art from MusicBrainz for ${mbid}`);
		return mbCoverArt;
	}

	if (artistAndAlbum?.artist && artistAndAlbum?.album) {
		console.debug(`Falling back to Discogs for ${artistAndAlbum.artist} - ${artistAndAlbum.album}`);
		const discogsCoverArt = await getCoverArtFromDiscogs(
			artistAndAlbum.artist,
			artistAndAlbum.album
		);
		if (discogsCoverArt) {
			console.debug(
				`Found cover art from Discogs for ${artistAndAlbum.artist} - ${artistAndAlbum.album}`
			);
			return discogsCoverArt;
		}
	}

	console.debug(`No cover art found for MBID: ${mbid}`);
	return null;
}

async function getCoverArtFromMusicBrainz(mbid: string): Promise<CoverArtInfo | null> {
	try {
		const url = `https://coverartarchive.org/release/${mbid}`;
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			console.debug(`CoverArtArchive returned ${response.status} for ${mbid}`);
			return null;
		}

		const data = await response.json();

		const frontCover = data.images?.find((img: any) => img.front);
		const selectedImage = frontCover || (data.images?.[0] ?? null);

		if (!selectedImage) {
			console.debug(`No images found in CoverArtArchive for ${mbid}`);
			return null;
		}

		return {
			image: selectedImage.thumbnails?.large || selectedImage.image,
			front: selectedImage.front === true,
			thumbnails: {
				small: selectedImage.thumbnails?.['250'],
				large: selectedImage.thumbnails?.['500'],
				full: selectedImage.thumbnails?.['1200']
			},
			source: 'musicbrainz'
		};
	} catch (error) {
		console.error(`Error fetching cover art from MusicBrainz for ${mbid}:`, error);
		return null;
	}
}

async function getCoverArtFromDiscogs(artist: string, album: string): Promise<CoverArtInfo | null> {
	try {
		const discogsModule = await import('./discogs');

		const query = `${artist} ${album}`;
		console.debug(`Searching Discogs for: ${query}`);

		const releases = await discogsModule.searchReleases(query, 'release');

		if (!releases || releases.length === 0) {
			console.debug(`No Discogs releases found for: ${query}`);
			return null;
		}

		const release = releases[0];
		console.debug(`Found Discogs release: ${release.title}`);

		const coverUrl = release.cover_image || release.thumb;

		if (!coverUrl) {
			console.debug(`Discogs release ${release.title} has no cover image or thumb`);
			return null;
		}

		console.debug(`Using Discogs cover: ${coverUrl}`);
		return {
			image: coverUrl,
			front: true,
			source: 'discogs'
		};
	} catch (error) {
		console.error(`Error fetching cover art from Discogs for ${artist} - ${album}:`, error);
		return null;
	}
}

export async function getCoverArtUrl(mbid: string): Promise<string | null> {
	try {
		const response = await fetch(`https://coverartarchive.org/release/${mbid}`, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();

		const frontCover = data.images?.find((img: any) => img.front);
		if (frontCover) {
			return frontCover.thumbnails?.large || frontCover.image;
		}

		if (data.images && data.images.length > 0) {
			return data.images[0].thumbnails?.large || data.images[0].image;
		}

		return null;
	} catch (error) {
		console.error('Error fetching cover art:', error);
		return null;
	}
}

export function formatArtistCredit(
	artistCredit?: Array<{ name: string; artist: { id: string; name: string } }>
): string {
	if (!artistCredit || artistCredit.length === 0) {
		return 'Unknown Artist';
	}
	return artistCredit.map((credit) => credit.name).join('');
}
