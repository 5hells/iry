import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const error = url.searchParams.get('error');

	if (error) {
		console.error('Discord auth error:', error);
		throw redirect(302, '/auth/login?error=discord_failed');
	}

	throw redirect(302, '/');
};
