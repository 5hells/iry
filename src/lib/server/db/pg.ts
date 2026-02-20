import { Client } from 'pg';

type PgRow = Record<string, unknown>;

export type PgNativeQueryClient = {
	query: <TRow extends PgRow = PgRow>(sql: string, params?: unknown[]) => Promise<TRow[]>;
	end: () => Promise<void>;
};

export function createPgNativeClient(connectionString: string): PgNativeQueryClient {
	const client = new Client({ connectionString });
	let connected = false;

	const ensureConnected = async () => {
		if (!connected) {
			await client.connect();
			connected = true;
		}
	};

	return {
		query: async <TRow extends PgRow = PgRow>(sql: string, params: unknown[] = []): Promise<TRow[]> => {
			await ensureConnected();
			const res = await client.query(sql, params as any[]);
			return (res.rows as unknown) as TRow[];
		},
		end: async () => {
			if (!connected) return;
			await client.end();
			connected = false;
		}
	};
}