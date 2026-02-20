import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notification, user } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
	const limit = parseInt(url.searchParams.get('limit') || '50');

	try {
		const notifications = await db.query.notification.findMany({
			where: unreadOnly
				? (notif, { and, eq }) => and(eq(notif.userId, locals.user!.id), eq(notif.isRead, false))
				: eq(notification.userId, locals.user.id),
			limit,
			orderBy: [desc(notification.createdAt)],
			with: {
				fromUser: {
					columns: {
						id: true,
						name: true,
						displayName: true,
						image: true
					}
				}
			}
		});

		return json({
			notifications: notifications.map((n) => ({
				...n,
				createdAt: typeof n.createdAt === 'number' ? n.createdAt : (n.createdAt as any).getTime()
			}))
		});
	} catch (err) {
		console.error('Error fetching notifications:', err);
		return error(500, 'Failed to fetch notifications');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	let data;
	try {
		data = await request.json();
	} catch {
		return error(400, 'Invalid JSON');
	}

	const { notificationIds, markAll } = data || {};

	try {
		if (markAll) {
			await db
				.update(notification)
				.set({ isRead: true })
				.where(eq(notification.userId, locals.user.id));
		} else if (notificationIds && Array.isArray(notificationIds)) {
			for (const notifId of notificationIds) {
				await db.update(notification).set({ isRead: true }).where(eq(notification.id, notifId));
			}
		} else {
			return error(400, 'Invalid request');
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error marking notifications as read:', err);
		return error(500, 'Failed to update notifications');
	}
};
