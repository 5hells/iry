import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { APIError } from 'better-auth';
import { env } from '$env/dynamic/private';

function isRedirect(error: unknown): error is { status: number; location: string } {
	return (
		error !== null &&
		typeof error === 'object' &&
		'status' in error &&
		'location' in error &&
		typeof (error as Record<string, unknown>).status === 'number' &&
		typeof (error as Record<string, unknown>).location === 'string' &&
		[
			(error as Record<string, unknown>).status === 302,
			(error as Record<string, unknown>).status === 303,
			(error as Record<string, unknown>).status === 307,
			(error as Record<string, unknown>).status === 308
		].some(Boolean)
	);
}

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		throw redirect(302, '/');
	}

	const hasGoogle = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
	const hasDiscord = !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);

	return {
		oauth: {
			google: hasGoogle,
			discord: hasDiscord
		}
	};
};

export const actions: Actions = {
	signInEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		try {
			await auth.api.signInEmail({
				body: { email, password },
				headers: event.request.headers
			});

			throw redirect(302, '/');
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}

			if (error instanceof APIError) {
				if (error.status === 401 || error.status === 400) {
					return fail(401, { message: 'Invalid email or password' });
				}
				const statusCode = Number(error.status);
				return fail(Number.isFinite(statusCode) ? statusCode : 500, {
					message: error.message || 'Failed to sign in with email'
				});
			}

			if (error instanceof Error) {
				console.error('Email sign in error:', error.message);
				return fail(500, { message: 'Failed to sign in with email' });
			}

			console.error('Email sign in error:', error);
			return fail(500, { message: 'Failed to sign in with email' });
		}
	},
	signUpEmail: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const name = formData.get('name')?.toString() ?? '';

		if (!name) {
			return fail(400, { message: 'Name is required' });
		}

		if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters' });
		}

		try {
			await auth.api.signUpEmail({
				body: { email, password, name },
				headers: event.request.headers
			});

			throw redirect(302, '/');
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}

			if (error instanceof APIError) {
				if (error.status === 409) {
					return fail(409, { message: 'Email already in use' });
				}
				const statusCode = Number(error.status);
				return fail(Number.isFinite(statusCode) ? statusCode : 500, {
					message: error.message || 'Failed to sign up with email'
				});
			}

			if (error instanceof Error) {
				console.error('Email sign up error:', error.message);
				return fail(500, { message: 'Failed to sign up with email' });
			}

			console.error('Email sign up error:', error);
			return fail(500, { message: 'Failed to sign up with email' });
		}
	},
	signInGoogle: async (event) => {
		let response;
		try {
			response = await auth.api.signInSocial({
				body: {
					provider: 'google',
					callbackURL: '/auth/callback'
				},
				headers: event.request.headers
			});
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
			console.error('Google sign in error:', error);
			return fail(500, { message: 'Failed to initiate Google sign in' });
		}

		if (response.url) {
			throw redirect(302, response.url);
		}
	},
	signInDiscord: async (event) => {
		let response;

		try {
			response = await auth.api.signInSocial({
				body: {
					provider: 'discord',
					callbackURL: '/auth/callback'
				},
				headers: event.request.headers
			});
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
			console.error('Discord sign in error:', error);
			return fail(500, { message: 'Failed to initiate Discord sign in' });
		}

		if (response.url) {
			throw redirect(302, response.url);
		}
	}
};
