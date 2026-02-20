import { db } from './db';
import { searchCache } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import crypto from 'crypto';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; 

function hashQuery(query: string): string {
	return crypto.createHash('sha256').update(query.toLowerCase()).digest('hex');
}

export async function getCachedResults(query: string, type: 'album' | 'artist' | 'track') {
	const queryHash = hashQuery(query);

	try {
		const cached = await db.query.searchCache.findFirst({
			where: and(
				eq(searchCache.queryHash, queryHash),
				eq(searchCache.type, type),
				gt(searchCache.expiresAt, new Date())
			)
		});

		if (cached && cached.results) {
			try {
				return JSON.parse(cached.results);
			} catch {
				return null;
			}
		}
	} catch (error) {
		console.error('Error checking search cache:', error);
	}

	return null;
}

export async function setCachedResults(
	query: string,
	type: 'album' | 'artist' | 'track',
	results: {
        id: string;
    }[]
) {
	const queryHash = hashQuery(query);
	const expiresAt = new Date(Date.now() + CACHE_TTL_MS);

	try {
		
		await db
			.delete(searchCache)
			.where(and(eq(searchCache.queryHash, queryHash), eq(searchCache.type, type)));

		
		await db.insert(searchCache).values({
			queryHash,
			query,
			type,
			results: JSON.stringify(results),
			expiresAt
		});
	} catch (error) {
		console.error('Error setting search cache:', error);
	}
}

export async function clearExpiredCache() {
	try {
		await db.delete(searchCache).where(gt(searchCache.expiresAt, new Date()));
	} catch (error) {
		console.error('Error clearing expired cache:', error);
	}
}
