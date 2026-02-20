import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userTheme } from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

interface GuestUser {
	id: string;
	name: string;
	image: string | null;
	email: string;
	isGuest: true;
	createdAt: Date;
	updatedAt: Date;
	emailVerified: boolean;
}

function createGuestUser(sessionId: string): GuestUser {
	return {
		id: sessionId,
		name: 'Guest User',
		image: null,
		email: `guest-${sessionId}@local`,
		isGuest: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		emailVerified: false
	};
}

function loadUserTheme(userId: string) {
	return db.query.userTheme.findFirst({
		where: eq(userTheme.userId, userId)
	});
}

async function enrichUserRole(user: any) {
	if (!user || user.isGuest) return user;

	const dbUser = await db.query.user.findFirst({
		where: eq(userTable.id, user.id),
		columns: {
			role: true
		}
	});

	return {
		...user,
		role: dbUser?.role ?? user.role ?? 'contributor'
	};
}

export const load: LayoutServerLoad = async (event) => {
	if (event.url.pathname.startsWith('/auth')) {
		if (event.locals.user) {
			throw redirect(302, '/');
		} else return;
	}

	if (!event.locals.user) {
		const guestSessionId = crypto.randomUUID();
		const guestUser = createGuestUser(guestSessionId);
		event.locals.user = guestUser;
		event.locals.session = {
			id: guestSessionId,
			userId: guestSessionId,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), 
			createdAt: new Date(),
			updatedAt: new Date(),
			token: crypto.randomUUID(),
			ipAddress: null,
			userAgent: null
		};
	}

	event.locals.user = await enrichUserRole(event.locals.user);

	return {
		user: event.locals.user,
		theme: event.locals.user ? await loadUserTheme(event.locals.user.id) : null
	};
};
