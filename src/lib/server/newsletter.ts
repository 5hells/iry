import crypto from 'crypto';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';
import { emailQueue } from './db/schema';

const env = process.env as Record<string, string | undefined>;
const SECRET = env.BETTER_AUTH_SECRET || env.SECRET || 'dev-fallback-secret';
const ORIGIN = (env.ORIGIN && env.ORIGIN.replace(/"/g, '')) || `http://127.0.0.1:6969`;

export function generateUnsubscribeToken(email: string) {
	return crypto.createHmac('sha256', SECRET).update(email).digest('hex');
}

export function verifyUnsubscribeToken(email: string, token: string) {
	try {
		const expected = generateUnsubscribeToken(email);
		const a = Buffer.from(expected, 'hex');
		const b = Buffer.from(token || '', 'hex');
		if (a.length !== b.length) return false;
		return crypto.timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

export function unsubscribeUrlFor(email: string) {
	const token = generateUnsubscribeToken(email);
	return `${ORIGIN.replace(/\/+$/, '')}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

export async function enqueueEmail(
	to: string,
	subject: string,
	html: string | null,
	body: string | null
) {
	await db.insert(emailQueue).values({
		to,
		subject,
		body: html || body || ''
	});
}

export async function setUserUnsubscribed(email: string) {
	return db
		.update(userTable)
		.set({ newsletterSubscribed: false })
		.where(eq(userTable.email, email));
}
