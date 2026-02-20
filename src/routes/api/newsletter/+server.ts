import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { sendMail } from '$lib/server/mailer';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	const me = locals.user;
	if (
		!me ||
		(await db
			.select({ newsletterSubscribed: userTable.newsletterSubscribed })
			.from(userTable)
			.where(eq(userTable.id, me.id))
			.then((r) => r[0]?.newsletterSubscribed)) !== true
	) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { subject, body } = await request.json();
	if (!subject || !body) {
		return json({ error: 'missing_subject_or_body' }, { status: 400 });
	}

	const rows = await db
		.select({ email: userTable.email })
		.from(userTable)
		.where(eq(userTable.newsletterSubscribed, true));
	const emails = rows.map((r) => r.email).filter(Boolean) as string[];

	if (emails.length === 0) {
		return json({ status: 'no_subscribers' }, { status: 200 });
	}

	const chunkSize = 50;
	let sent = 0;
	const { unsubscribeUrlFor } = await import('$lib/server/newsletter');
	for (let i = 0; i < emails.length; i += chunkSize) {
		const chunk = emails.slice(i, i + chunkSize);
		await Promise.all(
			chunk.map(async (to) => {
				try {
					const unsubscribeUrl = unsubscribeUrlFor(to);
					const htmlWithUnsub = `${body}<hr/><p style="font-size:12px;color:#64748b;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}">unsubscribe</a>.</p>`;
					await sendMail({
						to,
						subject,
						html: htmlWithUnsub,
						text: `${body}\n\nTo unsubscribe: ${unsubscribeUrl}`
					});
					sent++;
				} catch (err) {
					const e = err instanceof Error ? err : new Error(String(err));
					console.error('Failed to send newsletter to', to, e.message || e);
					try {
						await db
							.update(userTable)
							.set({ newsletterSubscribed: false })
							.where(eq(userTable.email, to));
					} catch (e) {
						console.error('Failed to enqueue email for retry', e);
					}
				}
			})
		);
	}

	return json({ status: 'accepted', sent }, { status: 202 });
};
