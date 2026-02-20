import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { userPoints, albumReview, user, userTheme, account, follow, blockedUser } from '$lib/server/db/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { getUserPerks } from '$lib/server/points';
import { getUserListeningHistory, getUserNowPlaying } from '$lib/server/music/lastfm';
import { escapeHtml } from '$lib/utils/markdown';

const PROXYABLE_IMAGE_HOSTS = new Set([
	'i.discogs.com',
	'coverartarchive.org',
	'images.unsplash.com',
	'upload.wikimedia.org',
	'commons.wikimedia.org',
	'i.scdn.co',
	'images-na.ssl-images-amazon.com',
	'www.gravatar.com',
	'avatars.githubusercontent.com',
	'cdn.discordapp.com'
]);

function toProxiedImageUrl(rawUrl?: string | null) {
	if (!rawUrl) return rawUrl ?? null;
	try {
		const parsed = new URL(rawUrl);
		if (PROXYABLE_IMAGE_HOSTS.has(parsed.hostname)) {
			return `/api/image-proxy?u=${encodeURIComponent(rawUrl)}`;
		}
	} catch {
		return rawUrl;
	}
	return rawUrl;
}

function inferAlbumSource(albumData: {
	source?: string | null;
	musicbrainzId?: string | null;
	discogsId?: string | null;
	spotifyId?: string | null;
}) {
	return (
		albumData.source ||
		(albumData.musicbrainzId ? 'musicbrainz' : albumData.discogsId ? 'discogs' : albumData.spotifyId ? 'spotify' : 'db')
	);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const targetUserId = url.searchParams.get('userId');
	const userId = targetUserId || locals.user?.id;

	if (!userId) {
		return error(401, 'Unauthorized');
	}

	try {
		let userData = await db.query.user.findFirst({
			where: eq(user.id, userId)
		});

		if (!userData) {
			return error(404, 'User not found');
		}

		
		if (locals.user?.id && locals.user.id !== userId) {
			const isBlocked = await db.query.blockedUser.findFirst({
				where: and(eq(blockedUser.userId, userId), eq(blockedUser.blockedUserId, locals.user.id))
			});

			if (isBlocked) {
				return error(404, 'User not found');
			}
		}

		if (locals.user?.id === userId && !userData.discordId) {
			const discordAccount = await db.query.account.findFirst({
				where: and(eq(account.userId, userId), eq(account.providerId, 'discord'))
			});
			if (discordAccount) {
				await db
					.update(user)
					.set({ discordId: discordAccount.accountId })
					.where(eq(user.id, userId));
				userData.discordId = discordAccount.accountId;
			}
		}

		const points = await db.query.userPoints.findFirst({
			where: eq(userPoints.userId, userId)
		});

		const themeData = await db.query.userTheme.findFirst({
			where: eq(userTheme.userId, userId)
		});

		const reviews = await db.query.albumReview.findMany({
			where: eq(albumReview.userId, userId),
			limit: 10,
			orderBy: [desc(albumReview.createdAt)],
			with: {
				album: true,
				trackReviews: {
					with: {
						track: true
					}
				}
			}
		});

		const normalizedReviews = reviews.map((review) => ({
			...review,
			album: review.album
				? {
					...review.album,
					source: inferAlbumSource(review.album as any),
					coverArtUrl: toProxiedImageUrl((review.album as any).coverArtUrl)
				}
				: review.album,
			trackReviews: (review.trackReviews || []).map((trackReviewRow: any) => ({
				...trackReviewRow,
				trackName: trackReviewRow.track?.title || null
			}))
		}));

		let pinnedReview = null;
		if (points?.pinnedReviewId) {
			pinnedReview = await db.query.albumReview.findFirst({
				where: eq(albumReview.id, points.pinnedReviewId),
				with: {
					album: true,
					trackReviews: {
						with: {
							track: true
						}
					}
				}
			});

			if (pinnedReview?.album) {
				pinnedReview = {
					...pinnedReview,
					album: {
						...pinnedReview.album,
						source: inferAlbumSource(pinnedReview.album as any),
						coverArtUrl: toProxiedImageUrl((pinnedReview.album as any).coverArtUrl)
					},
					trackReviews: (pinnedReview.trackReviews || []).map((trackReviewRow: any) => ({
						...trackReviewRow,
						trackName: trackReviewRow.track?.title || null
					}))
				};
			}
		}

		const perks = await getUserPerks(userId);
		const activePerks = perks.filter((p) => p.isActive);

		let nowPlaying = null;
		let recentTracks: Array<{
			artist: string;
			track: string;
			album?: string | null;
			albumArtUrl?: string;
			timestamp: number;
		}> = [];

		if (userData.lastfmUsername) {
			try {
				nowPlaying = await getUserNowPlaying(userId);
				recentTracks = (await getUserListeningHistory(userId, 10)).map((track) => {
					const timestamp =
						typeof track.timestamp === 'number'
							? track.timestamp
							: (track.timestamp?.getTime?.() ?? null);
					return {
						artist: track.artist,
						track: track.track,
						album: track.album,
						albumArtUrl: track.albumArtUrl ?? undefined,
						timestamp
					};
				});
			} catch (lastfmError) {
				console.warn('Failed to load Last.fm profile data:', lastfmError);
				nowPlaying = null;
				recentTracks = [];
			}
		}

		
		const followersResult = await db
			.select({ count: count() })
			.from(follow)
			.where(eq(follow.followingId, userId));
		const followersCount = followersResult[0]?.count || 0;

		const followingResult = await db
			.select({ count: count() })
			.from(follow)
			.where(eq(follow.followerId, userId));
		const followingCount = followingResult[0]?.count || 0;

		
		let isFollowing = false;
		if (locals.user?.id && locals.user.id !== userId) {
			const followship = await db.query.follow.findFirst({
				where: and(
					eq(follow.followerId, locals.user.id),
					eq(follow.followingId, userId)
				)
			});
			isFollowing = !!followship;
		}

		return json({
			user: {
				id: userData.id,
				name: userData.name,
				displayName: userData.displayName,
				role: locals.user?.id === userId ? userData.role : undefined,
				email: locals.user?.id === userId ? userData.email : undefined,
				image: userData.image,
				imagePosition: userData.imagePosition,
				bio: userData.bio,
				bannerUrl: userData.bannerUrl,
				bannerPosition: userData.bannerPosition,
				lastfmUsername: userData.lastfmUsername,
				discordId: userData.discordId,
				discordUsername: userData.discordUsername,
				pronouns: userData.pronouns
			},
			stats: points || {
				totalPoints: 0,
				level: 1,
				reviewCount: 0,
				trackReviewCount: 0
			},
			follows: {
				followers: followersCount,
				following: followingCount,
				isFollowing
			},
			recentReviews: normalizedReviews,
			pinnedReview,
			perks,
			activePerks,
			theme: themeData
				? {
						primaryColor: themeData.primaryColor,
						secondaryColor: themeData.secondaryColor,
						accentColor: themeData.accentColor,
						backgroundColor: themeData.backgroundColor
					}
				: null,
			lastfm: {
				nowPlaying,
				recentTracks
			}
		});
	} catch (err) {
		console.error('Error fetching user profile:', err);
		return error(500, 'Failed to fetch profile');
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

	const { name, displayName, bio, bannerUrl, lastfmUsername, pronouns, discordUsername } = data;

	try {
		const updates: any = {};

		if (name) updates.name = escapeHtml(name.trim()).substring(0, 100);
		if (displayName !== undefined)
			updates.displayName = displayName ? escapeHtml(displayName.trim()).substring(0, 100) : null;
		if (bio !== undefined) updates.bio = bio ? escapeHtml(bio.trim()).substring(0, 500) : null;
		if (bannerUrl !== undefined) updates.bannerUrl = bannerUrl;
		if (lastfmUsername !== undefined)
			updates.lastfmUsername = lastfmUsername
				? escapeHtml(lastfmUsername.trim()).substring(0, 50)
				: null;
		if (discordUsername !== undefined)
			updates.discordUsername = discordUsername
				? escapeHtml(discordUsername.trim()).substring(0, 100)
				: null;
		if (pronouns !== undefined)
			updates.pronouns = pronouns ? escapeHtml(pronouns.trim()).substring(0, 50) : null;

		await db.update(user).set(updates).where(eq(user.id, locals.user.id));

		return json({ success: true });
	} catch (err) {
		console.error('Error updating profile:', err);
		return error(500, 'Failed to update profile');
	}
};
