import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const activity = await request.json();

		if (!activity.type || !activity.actor) {
			return json({ error: 'Invalid activity' }, { status: 400 });
		}

		console.log(`[Shared Inbox] Received ${activity.type} from ${activity.actor}`);

		return json({ status: 'accepted' }, { status: 202 });
	} catch (err) {
		console.error('Shared inbox error:', err);
		return error(400, 'Invalid request');
	}
};
