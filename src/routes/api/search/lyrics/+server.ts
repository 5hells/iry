import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface LRCLIBSong {
	id: number;
	name: string;
	trackName: string;
	artistName: string;
	albumName: string;
	duration: number;
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

interface LyricsResult {
	id: string;
	title: string;
	artist: string;
	album?: string;
	excerpt?: string | null;
}

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q');
	const id = url.searchParams.get('id');

	if (!q && !id) {
		return json({ lyrics: [] });
	}

	if (q && q.length < 2) {
		return json({ lyrics: [] });
	}

	try {
		if (id) {
			try {
				const detailUrl = new URL(`https://lrclib.net/api/get/${id}`);
				const response = await fetch(detailUrl.toString(), {
					headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IRYBot/1.0)' }
				});

				if (response.ok) {
					const song = (await response.json()) as LRCLIBSong;
					const lyric: LyricsResult = {
						id: String(song.id),
						title: song.trackName || song.name,
						artist: song.artistName,
						album: song.albumName,
						excerpt: (song.plainLyrics || song.syncedLyrics)?.slice(0, 400) ?? null
					};
					return json({
						lyrics: [
							{
								...lyric,
								plainLyrics: song.plainLyrics ?? null,
								syncedLyrics: song.syncedLyrics ?? null
							}
						]
					});
				}
			} catch (err) {
				console.error('Failed to fetch lyric by id:', err);
			}
			return json({ lyrics: [] });
		}

		const lrcLibUrl = new URL('https://lrclib.net/api/search');
		lrcLibUrl.searchParams.set('q', q || '');

		const response = await fetch(lrcLibUrl.toString(), {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; IRYBot/1.0)'
			}
		});

		if (!response.ok) {
			return json({ lyrics: [] });
		}

		const results = (await response.json()) as LRCLIBSong[];

		function extractExcerpt(lyricsText: string | null, q: string) {
			if (!lyricsText || !q) return null;
			const lower = lyricsText.toLowerCase();
			const idx = lower.indexOf(q.toLowerCase());
			if (idx === -1) return null;
			const start = Math.max(0, idx - 80);
			const end = Math.min(lyricsText.length, idx + q.length + 80);
			let snippet = lyricsText.slice(start, end);

			snippet = snippet.replace(/\n+/g, ' \n ');
			return snippet.trim();
		}

		const lyrics: LyricsResult[] = results
			.slice(0, 10) 
			.map((song) => ({
				id: String(song.id),
				title: song.trackName || song.name,
				artist: song.artistName,
				album: song.albumName,
				excerpt: extractExcerpt(song.plainLyrics ?? song.syncedLyrics ?? null, q!)
			}));

		return json({ lyrics });
	} catch (error) {
		console.error('Lyrics search error:', error);
		return json({ lyrics: [] });
	}
};
