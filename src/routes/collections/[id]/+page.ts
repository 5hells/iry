import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent, params }) => {
	const { user } = await parent();
	return {
		user,
		collectionId: params.id
	};
};
