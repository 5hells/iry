import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { auth } from '$lib/server/auth';

function isRedirect(error: unknown): error is { status: number; location: string } {
	return (
		error !== null &&
		typeof error === 'object' &&
		'status' in error &&
		'location' in error &&
		typeof (error as Record<string, unknown>).status === 'number' &&
		typeof (error as Record<string, unknown>).location === 'string'
	);
}

export const actions: Actions = {
	linkDiscord: async (event) => {
		if (!event.locals.user) {
			return fail(401, { message: 'Unauthorized' });
		}

		let response: { url?: string } | undefined;

		try {
			const origin = event.url.origin;
			const callbackURL = `${origin}/settings?discord=success`;

			response = await auth.api.linkSocialAccount({
				body: { provider: 'discord', callbackURL },
				headers: event.request.headers
			});
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
			console.error('Discord link error:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return fail(500, {
				message: 'Failed to initiate Discord link',
				details: errorMessage
			});
		}

		if (response?.url) {
			throw redirect(302, response.url);
		}

		return fail(500, { message: 'Discord provider did not return a redirect URL' });
	},
	unlinkDiscord: async (event) => {
		if (!event.locals.user) {
			return fail(401, { message: 'Unauthorized' });
		}

		try {
			const { auth } = await import('$lib/server/auth');
			await auth.api.unlinkAccount({
				body: { providerId: 'discord' },
				headers: event.request.headers
			});

			return { success: true, message: 'Discord account unlinked successfully' };
		} catch (error) {
			console.error('Discord unlink error:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			return fail(500, {
				message: 'Failed to unlink Discord account',
				details: errorMessage
			});
		}
	}
};
