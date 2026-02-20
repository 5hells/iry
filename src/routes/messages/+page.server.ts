import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || (locals.user as unknown as { isGuest: boolean }).isGuest) {
		throw redirect(302, '/auth/login');
	}

	return {};
};
