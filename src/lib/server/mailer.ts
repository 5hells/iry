import nodemailer from 'nodemailer';
import Mailgun from 'mailgun-nodemailer-transport';

const env = process.env as Record<string, string | undefined>;

let transporter: nodemailer.Transporter | null = null;

function createTransporter() {
	if (transporter) return transporter;
	const dsn = env.MAILER_DSN || env.SMTP_URL || '';
	if (!dsn) {
		console.warn('MAILER_DSN not set; emails will be logged only');
		return null;
	}

	if (dsn.startsWith('smtp://') || dsn.startsWith('smtps://')) {
		transporter = nodemailer.createTransport(dsn);
	} else if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
		transporter = nodemailer.createTransport(
			new Mailgun({ auth: { domain: env.MAILGUN_DOMAIN, apiKey: env.MAILGUN_API_KEY } })
		);
	} else {
		console.warn('No valid mailer configuration found; emails will be logged only');
		return null;
	}
	transporter = nodemailer.createTransport(
		new Mailgun({ auth: { domain: env.MAILGUN_DOMAIN!, apiKey: env.MAILGUN_API_KEY! } })
	);
	return transporter;
}

function wrapTemplate({ title, body }: { title: string; body: string }) {
	return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#f6f8fa; margin:0; padding:20px; }
    .card { max-width:700px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 24px rgba(12,15,20,0.08); }
    .header { padding:20px; background:linear-gradient(90deg,#5b21b6,#2563eb); color:white; }
    .header h1 { margin:0; font-size:20px; }
    .content { padding:24px; color:#0f172a; line-height:1.5; }
    .footer { padding:16px; font-size:12px; color:#64748b; text-align:center; }
    a.button { display:inline-block; padding:10px 16px; border-radius:6px; background:#2563eb; color:white; text-decoration:none; }
  </style>
  </head>
  <body>
    <div class="card">
      <div class="header"><h1>${escapeHtml(title)}</h1></div>
      <div class="content">${body}</div>
      <div class="footer">You received this email because you're subscribed to the Iry newsletter.</div>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string) {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export async function sendMail(opts: {
	to: string | string[];
	subject: string;
	html?: string;
	text?: string;
	from?: string;
}) {
	const t = createTransporter();
	const from =
		opts.from ||
		env.MAIL_FROM ||
		`no-reply@${(env.COOKIE_DOMAIN || 'localhost').replace(/^\./, '')}`;

	const html = opts.html || wrapTemplate({ title: opts.subject, body: opts.text || '' });

	if (!t) {
		console.info('Email (logged):', { to: opts.to, subject: opts.subject });
		return { accepted: Array.isArray(opts.to) ? opts.to : [opts.to] };
	}

	const res = await t.sendMail({
		from,
		to: opts.to,
		subject: opts.subject,
		html,
		text: opts.text
	});

	return res;
}
