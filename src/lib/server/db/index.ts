import { drizzle } from 'drizzle-orm/pg-proxy';
import * as schema from './schema';
import { createPgNativeClient } from './pg';
import 'dotenv/config';

export * from './auth.schema';

const env = process.env as Record<string, string | undefined>;
if (!env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

const nativeClient = createPgNativeClient(env.DATABASE_URL);

export const db = drizzle(
	async (sql, params) => {
		const rows = await nativeClient.query(sql, params ?? []);
		return { rows };
	},
	{ schema }
);
