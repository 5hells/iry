import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';
import { spawn } from 'node:child_process';

type ReindexTarget = 'albums' | 'artists' | 'tracks';

const SCRIPT_BY_TARGET: Record<ReindexTarget, string> = {
	albums: 'albums:reindex-all',
	artists: 'artists:reindex-all',
	tracks: 'tracks:reindex-all'
};

async function requireAdmin(userId?: string) {
	if (!userId) throw error(401, 'Unauthorized');
	const me = await db.query.user.findFirst({
		where: eq(userTable.id, userId),
		columns: { role: true }
	});
	if (!me || me.role !== 'admin') throw error(403, 'Forbidden');
}

function runScript(scriptName: string) {
	return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
		const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
		const child = spawn(npmCommand, ['run', scriptName], {
			cwd: process.cwd(),
			env: process.env
		});

		let output = '';

		child.stdout.on('data', (chunk) => {
			output += String(chunk);
		});

		child.stderr.on('data', (chunk) => {
			output += String(chunk);
		});

		child.on('error', (err) => {
			reject(err);
		});

		child.on('close', (code) => {
			resolve({ code, output });
		});
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	await requireAdmin(locals.user?.id);

	const body = (await request.json().catch(() => ({}))) as { target?: ReindexTarget };
	const target = body.target;

	if (!target || !(target in SCRIPT_BY_TARGET)) {
		return json({ error: 'invalid target' }, { status: 400 });
	}

	try {
		const scriptName = SCRIPT_BY_TARGET[target];
		const result = await runScript(scriptName);
		const output = result.output.slice(-12000);

		if (result.code !== 0) {
			return json(
				{ error: `reindex ${target} failed`, code: result.code, output },
				{ status: 500 }
			);
		}

		return json({ success: true, target, output });
	} catch (err) {
		console.error('Admin reindex failed:', err);
		return json({ error: 'reindex failed' }, { status: 500 });
	}
};
