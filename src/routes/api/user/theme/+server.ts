import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userTheme } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const theme = await db.query.userTheme.findFirst({
			where: eq(userTheme.userId, locals.user.id)
		});

		if (!theme) {
			return json({
				primaryColor: '#5c7cfa',
				secondaryColor: '#748ffc',
				accentColor: '#ff6b6b',
				backgroundColor: '#1a1b1e'
			});
		}

		return json({
			primaryColor: theme.primaryColor,
			secondaryColor: theme.secondaryColor,
			accentColor: theme.accentColor,
			backgroundColor: theme.backgroundColor
		});
	} catch (error) {
		console.error('Failed to fetch theme:', error);
		return json({ error: 'failed to load theme' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		console.log('[theme] incoming payload:', JSON.stringify(body));
		const { primaryColor, secondaryColor, accentColor, backgroundColor } = body;

		const rawColors = {
			primaryColor: primaryColor?.trim(),
			secondaryColor: secondaryColor?.trim(),
			accentColor: accentColor?.trim(),
			backgroundColor: backgroundColor?.trim()
		};

		function normalizeHex(val?: string | null) {
			if (!val) return null;
			const v = val.trim();
			const stripped = v.startsWith('#') ? v.slice(1) : v;

			if (!/^[0-9A-Fa-f]{3,}$/.test(stripped)) {
				return null;
			}

			if (stripped.length === 3) {
				const expanded = stripped
					.split('')
					.map((c) => c + c)
					.join('');
				return `#${expanded.toLowerCase()}`;
			}

			const normalized = stripped.slice(0, 6);
			return `#${normalized.toLowerCase()}`;
		}

		const primary = normalizeHex(rawColors.primaryColor);
		const secondary = normalizeHex(rawColors.secondaryColor);
		const accent = normalizeHex(rawColors.accentColor);
		const background = normalizeHex(rawColors.backgroundColor);

		console.log('[theme] normalized:', { primary, secondary, accent, background });

		const colors = {
			primaryColor: primary,
			secondaryColor: secondary,
			accentColor: accent,
			backgroundColor: background
		};

		for (const [key, value] of Object.entries(colors)) {
			if (!value) {
				return json({ error: `invalid color format: ${key}` }, { status: 400 });
			}
		}

		const {
			primaryColor: pColor,
			secondaryColor: sColor,
			accentColor: aColor,
			backgroundColor: bgColor
		} = colors;

		const existing = await db.query.userTheme.findFirst({
			where: eq(userTheme.userId, locals.user.id)
		});

		if (existing) {
			await db
				.update(userTheme)
				.set({
					primaryColor: pColor || undefined,
					secondaryColor: sColor || undefined,
					accentColor: aColor || undefined,
					backgroundColor: bgColor || undefined,
					updatedAt: new Date()
				})
				.where(eq(userTheme.userId, locals.user.id));
		} else {
			await db.insert(userTheme).values({
				userId: locals.user.id,
				primaryColor: pColor || '#5c7cfa',
				secondaryColor: sColor || '#748ffc',
				accentColor: aColor || '#ff6b6b',
				backgroundColor: bgColor || '#1a1b1e',
				updatedAt: new Date()
			});
		}

		try {
			const saved = await db.query.userTheme.findFirst({
				where: eq(userTheme.userId, locals.user.id)
			});
			console.log(
				'[theme] saved in DB:',
				saved
					? {
							primary: saved.primaryColor,
							secondary: saved.secondaryColor,
							accent: saved.accentColor,
							background: saved.backgroundColor
						}
					: null
			);
		} catch (err) {
			console.error('[theme] failed to read back saved theme:', err);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Failed to save theme:', error);
		return json({ error: 'failed to save theme' }, { status: 500 });
	}
};
