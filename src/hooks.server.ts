import type { Handle } from '@sveltejs/kit';
import { startPolling } from '$lib/server/music/lastfm-poller';
import { startReindexer } from '$lib/server/music/reindexer';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

if (!building) {
	startPolling();
	startReindexer();
}

export const handle: Handle = async ({ event, resolve }) => {
	return svelteKitHandler({
		auth,
		event,
		building,
		resolve: async (resolvedEvent) => {
			const sessionData = await auth.api
				.getSession({
					headers: resolvedEvent.request.headers
				})
				.catch(() => null);

			if (sessionData) {
				resolvedEvent.locals.user = sessionData.user;
				resolvedEvent.locals.session = sessionData.session;
			} else {
				resolvedEvent.locals.user = undefined;
				resolvedEvent.locals.session = undefined;
			}

			return resolve(resolvedEvent);
		}
	});
};
