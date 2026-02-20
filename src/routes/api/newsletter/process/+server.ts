import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sendMail } from '$lib/server/mailer';
import { emailQueue } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ locals }) => {
	const me = locals.user as unknown as { role: string } | null;
	if (!me || me.role !== 'admin') {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const items = await db
			.select()
			.from(emailQueue)
			.where(eq(emailQueue.status, 'pending'))
			.limit(10);

		for (const item of items) {
			try {
				await sendMail({ to: item.to, subject: item.subject, html: item.body, text: item.body });
				await db
					.update(emailQueue)
					.set({ status: 'sent', sentAt: new Date() })
					.where(eq(emailQueue.id, item.id));
			} catch (err) {
				const e = err instanceof Error ? err : new Error(String(err));
				const attempts = (item.attempts || 0) + 1;
				const nextTryHours = Math.min(attempts, 24);
				await db
					.update(emailQueue)
					.set({
						attempts,
						lastError: String(e.message || e),
						nextTry: new Date(Date.now() + nextTryHours * 60 * 60 * 1000),
						status: 'pending'
					})
					.where(eq(emailQueue.id, item.id));
			}
		}

		return json({ processed: items.length });
	} catch (err) {
		console.error('Failed processing email queue:', err);
		return json({ error: 'failed' }, { status: 500 });
	}
};
