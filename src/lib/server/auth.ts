import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { account, session, user, verification } from '$lib/server/db/auth.schema';

const env = process.env as Record<string, string | undefined>;

const authSchema = { account, session, user, verification };

let origin = 'http://127.0.0.1:6969';
try {
	if (env.ORIGIN) {
		const u = new URL(env.ORIGIN);
		origin = u.origin;
	}
} catch {}

const requireEmailVerification = env.REQUIRE_EMAIL_VERIFICATION === 'true' || false;

export const auth = betterAuth({
	baseURL: origin,
	secret: env.BETTER_AUTH_SECRET || 'fallback-secret-for-build-time-only-change-in-production',
	database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
	emailAndPassword: {
		enabled: true,
		autoSignIn: true, 
		requireEmailVerification, 
		minPasswordLength: 8
	},
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID || '',
			clientSecret: env.GOOGLE_CLIENT_SECRET || '',
			enabled: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
		},
		discord: {
			clientId: env.DISCORD_CLIENT_ID || '',
			clientSecret: env.DISCORD_CLIENT_SECRET || '',
			enabled: !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)
		}
	},
	plugins: [sveltekitCookies(getRequestEvent)]
});

try {
	console.log('[auth] socialProviders enabled:', {
		google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
		discord: !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)
	});
} catch (e) {}
