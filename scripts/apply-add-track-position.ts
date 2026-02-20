import 'dotenv/config';
import { createPgNativeClient } from '../src/lib/server/db/pg';

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error('DATABASE_URL is not set');
	}

	const client = createPgNativeClient(connectionString);

	try {
		console.log('Adding position column to track (IF NOT EXISTS)');
		await client.query('ALTER TABLE track ADD COLUMN IF NOT EXISTS position TEXT;');
		console.log('Done');
	} catch (err) {
		console.error('Failed to add column:', err);
		process.exit(1);
	} finally {
		await client.end();
	}
}

main();
