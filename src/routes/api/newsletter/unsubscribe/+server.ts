import type { RequestHandler } from './$types';
import { json, redirect } from '@sveltejs/kit';
import { verifyUnsubscribeToken, setUserUnsubscribed } from '$lib/server/newsletter';

export const GET: RequestHandler = async ({ url }) => {
	const email = url.searchParams.get('email') || '';
	const token = url.searchParams.get('token') || '';

	if (!email || !token) {
		return json({ error: 'missing_params' }, { status: 400 });
	}

	if (!verifyUnsubscribeToken(email, token)) {
		return json({ error: 'invalid_token' }, { status: 400 });
	}

	try {
		await setUserUnsubscribed(email);

		throw redirect(302, '/newsletter/unsubscribed');
	} catch (err) {
		console.error('Failed to unsubscribe user:', err);
		return json({ error: 'failed' }, { status: 500 });
	}
};
