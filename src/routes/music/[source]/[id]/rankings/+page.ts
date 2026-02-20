import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params }) => {
	const { user } = await parent();
	return {
		user,
		albumId: params.id,
		source: params.source
	};
};
