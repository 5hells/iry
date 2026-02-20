import { Client } from 'pg';
import type { QueryResult, QueryConfig, QueryConfigValues, QueryResultRow } from 'pg';

export function createPgNativeClient(connectionString: string) {
	const client = new Client({ connectionString });
	let connected = false;

	async function connect() {
		if (!connected) {
			await client.connect();
			connected = true;
		}
	}

	client.query = (async <R extends QueryResultRow = unknown, I extends unknown[] = unknown[]>(
		query: string | QueryConfig<I>,
		params?: QueryConfigValues<I>
	): Promise<QueryResult<R>> => {
		await connect();
		return client.query(query, params);
	}) as unknown as typeof client.query;

	return client;
}