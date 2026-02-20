import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexUserLastFM, updateNowPlaying, getLastFMUserInfo } from '$lib/server/music/lastfm';
import { db } from '$lib/server/db';
import { user, lastfmScrobble } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

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

	const { username, limit } = data;

	if (!username) {
		return error(400, 'username is required');
	}

	try {
		const userInfo = await getLastFMUserInfo(username);
		if (!userInfo) {
			return error(404, 'LastFM user not found');
		}

		await db.update(user).set({ lastfmUsername: username }).where(eq(user.id, locals.user.id));

		if (limit !== false) {
			await indexUserLastFM(locals.user.id, username, limit || 200);
		}

		const updatedUser = await db.query.user.findFirst({
			where: eq(user.id, locals.user.id)
		});

		return json({
			success: true,
			lastfmUsername: updatedUser?.lastfmUsername,
			message: 'LastFM account connected successfully'
		});
	} catch (err) {
		console.error('Error connecting LastFM:', err);
		return error(500, 'Failed to connect LastFM account');
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	try {
		const userData = await db.query.user.findFirst({
			where: eq(user.id, locals.user.id)
		});

		if (!userData?.lastfmUsername) {
			return json({ nowPlaying: null, lastfmUsername: null });
		}

		await updateNowPlaying(locals.user.id, userData.lastfmUsername);
		const nowPlaying = await db.query.lastfmScrobble.findFirst({
			where: and(eq(lastfmScrobble.userId, locals.user.id), eq(lastfmScrobble.nowPlaying, true))
		});

		return json({
			nowPlaying,
			lastfmUsername: userData.lastfmUsername
		});
	} catch (err) {
		console.error('Error fetching now playing:', err);
		return error(500, 'Failed to fetch now playing');
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return error(401, 'Unauthorized');
	}

	try {
		await db.update(user).set({ lastfmUsername: null }).where(eq(user.id, locals.user.id));

		return json({ success: true, message: 'LastFM account disconnected' });
	} catch (err) {
		console.error('Error disconnecting LastFM:', err);
		return error(500, 'Failed to disconnect LastFM account');
	}
};
