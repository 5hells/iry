import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import 'dotenv/config';

export * from './auth.schema';

const env = process.env as Record<string, string | undefined>;
if (!env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
