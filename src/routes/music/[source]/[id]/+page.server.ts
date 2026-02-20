import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	return {
		source: params.source,
		albumId: params.id,
		user: locals.user
	};
};
