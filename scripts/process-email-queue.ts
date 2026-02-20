import { db } from '../src/lib/server/db';
import { sendMail } from '../src/lib/server/mailer';

async function processBatch() {
	try {
		const items = await db.execute(
			`SELECT id,to_email,subject,html,body,attempts FROM email_queue WHERE status = 'pending' AND next_try <= now() ORDER BY created_at LIMIT 100`
		);
		for (const item of items) {
			try {
				await db.execute(`UPDATE email_queue SET status='sending' WHERE id=$1`, [item.id]);
				await sendMail({ to: item.to_email, subject: item.subject, html: item.html || item.body });
				await db.execute(`UPDATE email_queue SET status='sent' WHERE id=$1`, [item.id]);
			} catch (err: any) {
				const attempts = (item.attempts || 0) + 1;
				const hours = Math.min(attempts, 24);
				await db.execute(
					`UPDATE email_queue SET attempts=$1, last_error=$2, next_try=now() + interval '${hours} hours', status='pending' WHERE id=$3`,
					[attempts, String(err?.message || err), item.id]
				);
			}
		}
	} catch (err) {
		console.error('Worker failed:', err);
	}
}

async function main() {
	while (true) {
		await processBatch();
		
		await new Promise((r) => setTimeout(r, 30_000));
	}
}

main().catch((e) => {
	console.error('Fatal worker error', e);
	process.exit(1);
});
