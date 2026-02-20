import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

let env = process.env as Record<string, string | undefined>;

async function loadEnv() {
    try {
        const i = await import('$env/dynamic/private');
        env = { ...env, ...(i as { env?: Record<string, string | undefined> }).env };
    } catch {}
    if (!env.DISCOGS_CONSUMER_KEY || !env.DISCOGS_CONSUMER_SECRET) {
        throw new Error('Discogs API credentials not configured in .env');
    }
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, init: RequestInit = {}, maxRetries = 5) {
    const headers = { ...(init.headers || {}), Connection: 'keep-alive', Accept: 'application/json', "User-Agent": "Iry/1.0" } as Record<string, string>;
    let attempt = 0;
    let lastErr: any = null;
    while (attempt < maxRetries) {
        try {
            const res = await fetch(url, { ...init, headers });
            const text = await res.text();

            if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
                lastErr = new Error(`HTTP ${res.status}`);
                const retryAfter = res.headers.get('Retry-After');
                if (retryAfter) {
                    const waitMs = parseInt(retryAfter, 10) * 1000 || Math.pow(2, attempt) * 250;
                    await sleep(waitMs);
                } else {
                    const wait = Math.pow(2, attempt) * 250 + Math.random() * 100;
                    await sleep(wait);
                }
                attempt++;
                continue;
            }

            if (!text || text.trim().length === 0 || text.trim().startsWith('<!')) {
                lastErr = new Error('Empty or non-JSON response');
                const wait = Math.pow(2, attempt) * 250 + Math.random() * 100;
                await sleep(wait);
                attempt++;
                continue;
            }

            const remainingHeader = res.headers.get('X-Discogs-Ratelimit-Remaining') || res.headers.get('x-discogs-ratelimit-remaining');
            if (remainingHeader) {
                const remainingNum = parseInt(remainingHeader, 10);
                if (!isNaN(remainingNum)) {
                    if (remainingNum <= 0) {
                        lastErr = new Error('Discogs rate limit exhausted');
                        const retryAfter = res.headers.get('Retry-After');
                        if (retryAfter) {
                            const waitMs = parseInt(retryAfter, 10) * 1000 || 60000;
                            await sleep(waitMs);
                        } else {
                            await sleep(60000);
                        }
                        attempt++;
                        continue;
                    }
                }
            }

            try {
                return JSON.parse(text);
            } catch (parseErr) {
                lastErr = parseErr;
                const wait = Math.pow(2, attempt) * 250 + Math.random() * 100;
                await sleep(wait);
                attempt++;
                continue;
            }
        } catch (err) {
            lastErr = err;
            const wait = Math.pow(2, attempt) * 250 + Math.random() * 100;
            await sleep(wait);
            attempt++;
            continue;
        }
    }
    throw lastErr;
}

function makeAuthQuery() {
    const key = encodeURIComponent(env.DISCOGS_CONSUMER_KEY || '');
    const secret = encodeURIComponent(env.DISCOGS_CONSUMER_SECRET || '');
    return `key=${key}&secret=${secret}`;
}

export interface DiscogsRelease {
    id: number;
    title: string;
    artist: string;
    year?: string;
    thumb?: string;
    cover_image?: string;
    genre?: string[];
    style?: string[];
    uri?: string;
    resource_url?: string;
}

export interface DiscogsReleaseDetails extends DiscogsRelease {
    tracklist?: Array<{
        position: string;
        title: string;
        duration: string;
    }>;
    formats?: Array<{
        name: string;
        qty: string;
        descriptions?: string[];
    }>;
    community?: {
        rating?: {
            average?: number;
            count?: number;
        };
        have?: number;
        want?: number;
    };
}

export function cleanDiscogsArtistName(raw: string): string {
    if (!raw) return '';
    return raw.replace(/\s*\(\d+\)\s*$/g, '').trim();
}

export async function searchReleases(query: string, type = 'release'): Promise<DiscogsRelease[]> {
    try {
        await loadEnv();
        const q = encodeURIComponent(query);
        const perPage = 50;
        const url = `https://api.discogs.com/database/search?q=${q}&type=${encodeURIComponent(type)}&per_page=${perPage}&${makeAuthQuery()}`;
        const results = await fetchWithBackoff(url);
        return (results && results.results) || [];
    } catch (error) {
        console.error('Error searching Discogs:', error);
        return [];
    }
}

export async function getRelease(releaseId: number): Promise<DiscogsReleaseDetails | null> {
    try {
        await loadEnv();
        const url = `https://api.discogs.com/releases/${releaseId}?${makeAuthQuery()}`;
        const release = await fetchWithBackoff(url);
        return release;
    } catch (error) {
        console.error('Error fetching Discogs release:', error);
        return null;
    }
}

export async function getArtist(artistId: number) {
    try {
        await loadEnv();
        const url = `https://api.discogs.com/artists/${artistId}?${makeAuthQuery()}`;
        const artist = await fetchWithBackoff(url);
        return artist;
    } catch (error) {
        console.error('Error fetching Discogs artist:', error);
        return null;
    }
}

export async function searchArtists(query: string): Promise<any[]> {
    try {
        await loadEnv();
        const q = encodeURIComponent(query);
        const perPage = 50;
        const url = `https://api.discogs.com/database/search?q=${q}&type=artist&per_page=${perPage}&${makeAuthQuery()}`;
        const results = await fetchWithBackoff(url);
        return (results && results.results) || [];
    } catch (error) {
        console.error('Error searching Discogs artists:', error);
        return [];
    }
}
