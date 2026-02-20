import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user || (locals.user as any).isGuest) {
		throw redirect(302, `/artist/${params.source}/${params.id}`);
	}

	return {
		source: params.source,
		artistId: params.id,
		user: locals.user
	};
};
