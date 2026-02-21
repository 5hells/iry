import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	album,
	albumReview,
	albumReviewLike,
	artist,
	artistReview,
	artistReviewLike,
	statusPost,
	statusPostLike,
	track,
	userPerk
} from '$lib/server/db/schema';
import { eq, desc, and, inArray, isNotNull, asc, sql } from 'drizzle-orm';
import * as musicbrainz from '$lib/server/music/musicbrainz';
import * as discogs from '$lib/server/music/discogs';
import * as spotify from '$lib/server/music/spotify';
import {
	indexAlbumFromMusicBrainz,
	indexAlbumFromDiscogs,
	indexAlbumFromSpotify
} from '$lib/server/music/indexer';

type AuthUser = { id: string; isGuest?: boolean } | undefined;

type DBReview = {
	id: string;
	userId?: string;
	rating?: number;
	reviewText?: string;
	imageUrls?: string | null;
	createdAt?: unknown;
	updatedAt?: unknown;
	replyCount?: number;
	likeCount?: number;
	artistId?: string;
	[k: string]: unknown;
};

type StatusPost = {
	id: string;
	reviewId?: string | null;
	parentPostId?: string | null;
	user?: { id?: string; name?: string; image?: string | null } | null;
	createdAt?: unknown;
	[k: string]: unknown;
};

type DBTrack = { trackNumber?: unknown; title?: string;[k: string]: unknown };

function toMillis(value: unknown): number {
	if (typeof value === 'number') return value;
	if (value instanceof Date) return value.getTime();
	if (typeof value === 'string') {
		const asNum = Number(value);
		if (!Number.isNaN(asNum)) return asNum;
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return 0;
}


function uniqueHeads(users: Array<{ id?: string; name?: string; image?: string | null }>, max = 5) {
	const seen = new Set<string>();
	const heads: Array<{ id: string; name: string; image: string | null }> = [];

	for (const user of users) {
		if (!user?.id || seen.has(user.id)) continue;
		seen.add(user.id);
		heads.push({
			id: user.id,
			name: user.name || 'Anonymous',
			image: user.image || null
		});
		if (heads.length >= max) break;
	}

	return heads;
}

function normalizeTrackNumber(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
	if (typeof value === 'string') {
		const parsed = parseInt(value, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
		const match = value.match(/\d+/);
		if (match) {
			const n = parseInt(match[0], 10);
			if (Number.isFinite(n) && n > 0) return n;
		}
	}
	return fallback;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const currentUser: AuthUser = (locals.user as AuthUser) ?? undefined;
	const { source, id } = params;

	if (!source || !id) {
		return error(400, 'Missing source or id parameter');
	}

	try {
		const loadDiscogsFeedback = async (opts: {
			discogsId?: string | null;
			title?: string;
			artist?: string;
		}) => {
			try {
				if (opts.discogsId) {
					const release = await discogs.getRelease(parseInt(opts.discogsId));
					if (release?.community) {
						return {
							releaseId: release.id || parseInt(opts.discogsId),
							ratingAverage: release.community.rating?.average ?? null,
							ratingCount: release.community.rating?.count ?? 0,
							have: release.community.have ?? 0,
							want: release.community.want ?? 0,
							url: release.uri || release.resource_url
						};
					}
				}

				if (opts.title && opts.artist) {
					const searchTerm = `${opts.title} ${opts.artist}`.trim();
					const discogsMatches = await discogs.searchReleases(searchTerm);
					const bestMatch = discogsMatches[0];
					if (bestMatch) {
						const release = await discogs.getRelease(bestMatch.id);
						if (release?.community) {
							return {
								releaseId: bestMatch.id,
								ratingAverage: release.community.rating?.average ?? null,
								ratingCount: release.community.rating?.count ?? 0,
								have: release.community.have ?? 0,
								want: release.community.want ?? 0,
								url: release.uri || release.resource_url
							};
						}
					}
				}
			} catch (feedbackError) {
				console.warn('Failed to load Discogs feedback:', feedbackError);
			}

			return null;
		};

		let dbAlbum = null;
		let externalDetails = null;
		let discogsFeedback: {
			releaseId: number;
			ratingAverage: number | null;
			ratingCount: number;
			have: number;
			want: number;
			url?: string;
		} | null = null;

		if (source === 'musicbrainz') {
			dbAlbum = await db.query.album.findFirst({
				where: eq(album.musicbrainzId, id),
				with: {
					reviews: {
						with: {
							user: {
								columns: {
									id: true,
									name: true,
									image: true
								}
							},
							trackReviews: {
								with: {
									track: true
								}
							}
						},
						orderBy: [desc(albumReview.createdAt)]
					},
					tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
				}
			});

			if (!dbAlbum) {
				externalDetails = await musicbrainz.getRelease(id);

				if (!externalDetails) {
					const preferredRelease = await musicbrainz.getPreferredReleaseFromReleaseGroup(id);
					if (preferredRelease?.id) {
						dbAlbum = await db.query.album.findFirst({
							where: eq(album.musicbrainzId, preferredRelease.id),
							with: {
								reviews: {
									with: {
										user: {
											columns: {
												id: true,
												name: true,
												image: true
											}
										},
										trackReviews: {
											with: {
												track: true
											}
										}
									},
									orderBy: [desc(albumReview.createdAt)]
								},
								tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
							}
						});

						if (!dbAlbum) {
							externalDetails = await musicbrainz.getRelease(preferredRelease.id);
						}
					}
				}

				if (externalDetails) {
					const releaseId = externalDetails.id;
					const artistName = musicbrainz.formatArtistCredit(externalDetails['artist-credit']);
					const coverArtInfo = await musicbrainz.getCoverArtWithFallback(releaseId, {
						artist: artistName,
						album: externalDetails.title
					});
					const coverArtUrl = coverArtInfo?.image || null;

					const newAlbum = await db
						.insert(album)
						.values({
							musicbrainzId: releaseId,
							title: externalDetails.title,
							artist: artistName,
							releaseDate: externalDetails.date,
							coverArtUrl: coverArtUrl,
							genres: JSON.stringify([]),
							totalTracks: externalDetails['track-count'] || 0,
							musicbrainzUrl: `https://musicbrainz.org/release/${releaseId}`
						})
						.returning();

					const albumId = newAlbum[0].id;

					if (externalDetails.media && externalDetails.media.length > 0) {
						let globalIndex = 1;
						const values: any[] = [];
						for (const [mediaIndex, media] of externalDetails.media.entries()) {
							const mediaTracks = media.tracks || [];
							for (const t of mediaTracks) {
								const title = t.title || t.recording?.title;
								if (!title) {
									globalIndex++;
									continue;
								}

								let position: string | null = null;
								if (t.number && String(t.number).trim() !== '') {
									position = String(t.number);
								} else if (t.position && String(t.position).trim() !== '') {
									position = String(t.position).trim();
								} else {
									const sideLetter = String.fromCharCode(65 + mediaIndex);
									position = `${sideLetter}${globalIndex}`;
								}

								values.push({
									musicbrainzId: t.recording?.id || t.id,
									albumId,
									title,
									durationMs: t.length || t.recording?.length || null,
									trackNumber: globalIndex,
									position
								});
								globalIndex++;
							}
						}
						if (values.length > 0) {
							await db.insert(track).values(values).onConflictDoNothing({ target: track.musicbrainzId });
						}
					}

					dbAlbum = {
						...newAlbum[0],
						reviews: [],
						tracks: []
					};
				}
			}
		} else if (source === 'discogs') {
			dbAlbum = await db.query.album.findFirst({
				where: eq(album.discogsId, id),
				with: {
					reviews: {
						with: {
							user: {
								columns: {
									id: true,
									name: true,
									image: true
								}
							}
						},
						orderBy: [desc(albumReview.createdAt)]
					}
				}
			});

			if (!dbAlbum) {
				externalDetails = await discogs.getRelease(parseInt(id));
				if (externalDetails) {
						const normalizedDiscogsArtist =
							discogs.cleanDiscogsArtistName(
								externalDetails.artist || (externalDetails as any).artists?.[0]?.name || 'Unknown'
							) || 'Unknown';
					const newAlbum = await db
						.insert(album)
						.values({
							discogsId: id,
							title: externalDetails.title,
								artist: normalizedDiscogsArtist,
							releaseDate: externalDetails.year?.toString(),
							coverArtUrl: externalDetails.cover_image || externalDetails.thumb || null,
							genres: JSON.stringify(externalDetails.genre || []),
							discogsUrl: externalDetails.uri || externalDetails.resource_url
						})
						.returning();

					dbAlbum = {
						...newAlbum[0],
						...(await db.query.album.findFirst({
							where: eq(album.id, newAlbum[0].id),
							with: {
								reviews: {
									with: {
										user: {
											columns: {
												id: true,
												name: true,
												image: true
											}
										},
										trackReviews: true
									},
									orderBy: [desc(albumReview.createdAt)]
								},
								tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
							}
						}))
					};
				}
			}
		} else {
			const uuidLookup = await db.query.album.findFirst({
				where: eq(album.id, id),
				with: {
					reviews: {
						with: {
							user: {
								columns: {
									id: true,
									name: true,
									image: true
								}
							},
							trackReviews: {
								with: {
									track: true
								}
							}
						},
						orderBy: [desc(albumReview.createdAt)]
					},
					tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
				}
			});
			if (uuidLookup) {
				dbAlbum = uuidLookup;
			}
		}

		if (!dbAlbum) {
			return error(404, 'Album not found');
		}

		if (!dbAlbum.tracks || dbAlbum.tracks.length === 0) {
			try {
				let resolvedAlbumId = dbAlbum.id;
				if (dbAlbum && 'musicbrainzId' in dbAlbum && (dbAlbum as any).musicbrainzId) {
					const indexedAlbum = await indexAlbumFromMusicBrainz((dbAlbum as any).musicbrainzId);
					if (indexedAlbum?.id) {
						resolvedAlbumId = indexedAlbum.id;
					}
				} else if (dbAlbum && 'discogsId' in dbAlbum && (dbAlbum as any).discogsId) {
					await indexAlbumFromDiscogs((dbAlbum as any).discogsId);
				}

				let refreshed = await db.query.album.findFirst({
					where: eq(album.id, resolvedAlbumId),
					with: {
						reviews: {
							with: {
								user: { columns: { id: true, name: true, image: true } },
								trackReviews: { with: { track: true } }
							},
							orderBy: [desc(albumReview.createdAt)]
						},
						tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
					}
				});

				if (
					refreshed &&
					(!refreshed.tracks || refreshed.tracks.length === 0) &&
					refreshed.title &&
					refreshed.artist
				) {
					const spotifyMatches = await spotify.searchAlbums(
						`${refreshed.artist} ${refreshed.title}`,
						5
					);
					if (spotifyMatches.length > 0) {
						await indexAlbumFromSpotify(spotifyMatches[0].id);
						refreshed = await db.query.album.findFirst({
							where: eq(album.id, resolvedAlbumId),
							with: {
								reviews: {
									with: {
										user: { columns: { id: true, name: true, image: true } },
										trackReviews: { with: { track: true } }
									},
									orderBy: [desc(albumReview.createdAt)]
								},
								tracks: { orderBy: [asc(track.trackNumber), asc(track.title)] }
							}
						});
					}
				}

				if (refreshed) {
					dbAlbum = refreshed;
				}
			} catch (trackBackfillErr) {
				console.warn('Failed to backfill tracks for album', dbAlbum.id, trackBackfillErr);
			}
		}

		if (dbAlbum?.title && dbAlbum?.artist) {
			discogsFeedback = await loadDiscogsFeedback({
				discogsId: 'discogsId' in (dbAlbum as any) ? (dbAlbum as any).discogsId || (source === 'discogs' ? id : null) : (source === 'discogs' ? id : null),
				title: dbAlbum.title,
				artist: dbAlbum.artist
			});
		}

		const normalizedReviews = (dbAlbum.reviews || []).map((r: DBReview) => ({
			...r,
			createdAt: typeof r.createdAt === 'number' ? (r.createdAt as number) : toMillis(r.createdAt),
			updatedAt: typeof r.updatedAt === 'number' ? (r.updatedAt as number) : toMillis(r.updatedAt),
			imageUrls: r.imageUrls ? JSON.parse(String(r.imageUrls)) : []
		})) as DBReview[];

		const reviewComments: Record<string, unknown[]> = {};
		const commentLikeHeadsById = new Map<
			string,
			Array<{ id?: string; name?: string; image?: string | null }>
		>();
		if (normalizedReviews.length > 0) {
			const reviewIds = normalizedReviews.map((r: DBReview) => r.id);
			const comments: StatusPost[] = await db.query.statusPost.findMany({
				where: and(inArray(statusPost.reviewId, reviewIds), isNotNull(statusPost.parentPostId)),
				with: {
					user: { columns: { id: true, name: true, image: true } }
				},
				orderBy: [desc(statusPost.createdAt)]
			});

			if (comments.length > 0) {
				const commentLikeRows = await db.query.statusPostLike.findMany({
					where: inArray(
						statusPostLike.statusPostId,
						comments.map((comment) => comment.id)
					),
					with: {
						user: {
							columns: {
								id: true,
								name: true,
								image: true
							}
						}
					},
					orderBy: [desc(statusPostLike.createdAt)]
				});

				for (const like of commentLikeRows) {
					if (!commentLikeHeadsById.has(like.statusPostId)) commentLikeHeadsById.set(like.statusPostId, []);
					commentLikeHeadsById.get(like.statusPostId)!.push(like.user);
				}
			}

			let likedCommentIds = new Set<string>();
			if (currentUser && !currentUser.isGuest && comments.length > 0) {
				const commentLikes = await db.query.statusPostLike.findMany({
					where: and(
						eq(statusPostLike.userId, currentUser!.id),
						inArray(
							statusPostLike.statusPostId,
							comments.map((comment) => comment.id)
						)
					)
				});
				likedCommentIds = new Set(commentLikes.map((like) => like.statusPostId));
			}

			const userIds = Array.from(new Set(comments.map((c: StatusPost) => c.user?.id).filter(Boolean)));
			const perksByUser: Record<string, any[]> = {};
			if (userIds.length > 0) {
				const ups = await db.query.userPerk.findMany({
					where: inArray(userPerk.userId, userIds),
					with: { perk: true }
				});
				for (const up of ups) {
					if (!perksByUser[up.userId]) perksByUser[up.userId] = [];
					perksByUser[up.userId].push(up);
				}
			}

			for (const comment of comments) {
				const user = comment.user || {};
				const userPerks = (perksByUser[user.id] || []) as any[];
				let isPro = false;
				let customTag: string | null = null;
				for (const up of userPerks) {
					if (up.isActive && up.perk && up.perk.type === 'support') {
						try {
							const perkCfg = up.perk.config ? JSON.parse(up.perk.config) : {};
							const userCfg = up.customConfig ? JSON.parse(up.customConfig) : {};
							if (perkCfg.proTag || userCfg.subscriptionId) {
								isPro = true;
								customTag = userCfg.customTag || (perkCfg.customTag ?? null);
								break;
							}
						} catch {
							return;
						}
					}
				}

				const sanitizedUser = { id: user.id, name: user.name, image: user.image, isPro, customTag };
				const reviewKey = String(comment.reviewId || '');
				if (!reviewComments[reviewKey]) reviewComments[reviewKey] = [];
				reviewComments[reviewKey].push({
					...comment,
					user: sanitizedUser,
					isLiked: likedCommentIds.has(comment.id),
					likeHeads: uniqueHeads(commentLikeHeadsById.get(comment.id) || []),
					createdAt: typeof comment.createdAt === 'number' ? comment.createdAt : toMillis(comment.createdAt)
				});
			}

			for (const k of Object.keys(reviewComments)) {
				reviewComments[k].sort((a: any, b: any) => {
					if ((a.user?.isPro ? 1 : 0) !== (b.user?.isPro ? 1 : 0))
						return (b.user?.isPro ? 1 : 0) - (a.user?.isPro ? 1 : 0);
					return (b.createdAt || 0) - (a.createdAt || 0);
				});
			}
		}

		let likedReviewIds = new Set<string>();
		const reviewLikeHeadsById = new Map<
			string,
			Array<{ id?: string; name?: string; image?: string | null }>
		>();

		if (normalizedReviews.length > 0) {
			const reviewLikeRows = await db.query.albumReviewLike.findMany({
				where: inArray(
					albumReviewLike.albumReviewId,
					normalizedReviews.map((r: DBReview) => r.id)
				),
				with: {
					user: {
						columns: {
							id: true,
							name: true,
							image: true
						}
					}
				},
				orderBy: [desc(albumReviewLike.createdAt)]
			});

			for (const like of reviewLikeRows) {
				if (!reviewLikeHeadsById.has(like.albumReviewId)) reviewLikeHeadsById.set(like.albumReviewId, []);
				reviewLikeHeadsById.get(like.albumReviewId)!.push(like.user);
			}
		}

		if (currentUser && !currentUser.isGuest && normalizedReviews.length > 0) {
			const userLikes = await db.query.albumReviewLike.findMany({
				where: and(
					eq(albumReviewLike.userId, currentUser!.id),
					inArray(
						albumReviewLike.albumReviewId,
						normalizedReviews.map((r: any) => r.id)
					)
				)
			});
			likedReviewIds = new Set(userLikes.map((like) => like.albumReviewId));
		}

		const reviewsWithLike = normalizedReviews.map((review: DBReview) => ({
			...review,
			comments: reviewComments[review.id] || [],
			replyCount: (reviewComments[review.id] || []).length,
			replyHeads: uniqueHeads((reviewComments[review.id] || []).map((comment: any) => comment.user)),
			likeHeads: uniqueHeads(reviewLikeHeadsById.get(review.id) || []),
			isLiked: likedReviewIds.has(review.id),
			type: 'album'
		}));


		let artistReviews: {
			id: string;
			artistId: string;
			userId: string;
			rating: number;
			comment: string;
			imageUrls: string[];
			createdAt: number;
			updatedAt: number;
			likeCount?: number;
			isLiked?: boolean;
			likeHeads: Array<{ id?: string; name?: string; image?: string | null }>;
			type: 'artist';
		}[] = [];

		let albumArtistUrl: string | null = null;
		if (dbAlbum?.artist) {
			try {
				const toArtistUrl = (dbArtist: {
					id: string;
					musicbrainzId?: string | null;
					discogsId?: string | null;
					spotifyId?: string | null;
				}) => {
					if (dbArtist.musicbrainzId) return `/artist/musicbrainz/${dbArtist.musicbrainzId}`;
					if (dbArtist.discogsId) return `/artist/discogs/${dbArtist.discogsId}`;
					if (dbArtist.spotifyId) return `/artist/spotify/${dbArtist.spotifyId}`;
					return `/artist/${dbArtist.id}`;
				};

				const normalizedAlbumArtist = discogs.cleanDiscogsArtistName(dbAlbum.artist) || dbAlbum.artist;
				let dbArtist = null as any;

				if (source === 'discogs') {
					let discogsArtistId =
						String((externalDetails as any)?.artists?.[0]?.id || '') ||
						String((externalDetails as any)?.artists_sort?.[0]?.id || '');
					if (!discogsArtistId) {
						const discogsRelease = await discogs.getRelease(parseInt(id, 10));
						discogsArtistId = String((discogsRelease as any)?.artists?.[0]?.id || '');
					}
					if (discogsArtistId) {
						dbArtist = await db.query.artist.findFirst({
							where: eq(artist.discogsId, discogsArtistId)
						});
					}
				} else if (source === 'musicbrainz') {
					const mbArtistId =
						String((externalDetails as any)?.['artist-credit']?.[0]?.artist?.id || '') ||
						String((externalDetails as any)?.['artist-credit']?.[0]?.id || '');
					if (mbArtistId) {
						dbArtist = await db.query.artist.findFirst({
							where: eq(artist.musicbrainzId, mbArtistId)
						});
					}
				}

				if (!dbArtist) {
					dbArtist = await db.query.artist.findFirst({
						where: eq(sql`lower(${artist.name})`, normalizedAlbumArtist.toLowerCase())
					});
				}

				if (!dbArtist && dbAlbum.artist !== normalizedAlbumArtist) {
					dbArtist = await db.query.artist.findFirst({
						where: eq(sql`lower(${artist.name})`, dbAlbum.artist.toLowerCase())
					});
				}

				if (dbArtist) {
					albumArtistUrl = toArtistUrl(dbArtist);
					const artistRevs = await db.query.artistReview.findMany({
						where: eq(artistReview.artistId, dbArtist.id),
						with: {
							user: {
								columns: {
									id: true,
									name: true,
									image: true
								}
							}
						},
						orderBy: [desc(artistReview.createdAt)]
					});

					if (artistRevs.length > 0) {
						const artistRevLikeHeadsById = new Map<
							string,
							Array<{ id?: string; name?: string; image?: string | null }>
						>();

						const artistRevLikeRows = await db.query.artistReviewLike.findMany({
							where: inArray(
								artistReviewLike.artistReviewId,
								artistRevs.map((r) => r.id)
							),
							with: {
								user: {
									columns: {
										id: true,
										name: true,
										image: true
									}
								}
							},
							orderBy: [desc(artistReviewLike.createdAt)]
						});

						for (const like of artistRevLikeRows) {
							if (!artistRevLikeHeadsById.has(like.artistReviewId)) {
								artistRevLikeHeadsById.set(like.artistReviewId, []);
							}
							artistRevLikeHeadsById.get(like.artistReviewId)!.push(like.user);
						}

						let likedArtistRevIds = new Set<string>();
						if (currentUser && !currentUser.isGuest) {
							const userLikes = await db.query.artistReviewLike.findMany({
								where: and(
									eq(artistReviewLike.userId, currentUser!.id),
									inArray(
										artistReviewLike.artistReviewId,
										artistRevs.map((r) => r.id)
									)
								)
							});
							likedArtistRevIds = new Set(userLikes.map((like) => like.artistReviewId));
						}

						artistReviews = artistRevs.map((review: DBReview) => ({
							...review,
							createdAt: typeof review.createdAt === 'number' ? review.createdAt : toMillis(review.createdAt),
							updatedAt: typeof review.updatedAt === 'number' ? review.updatedAt : toMillis(review.updatedAt),
							imageUrls: review.imageUrls ? JSON.parse(String(review.imageUrls)) : [],
							comments: [],
							replyCount: review.replyCount || 0,
							replyHeads: [],
							likeHeads: uniqueHeads(artistRevLikeHeadsById.get(review.id) || []),
							isLiked: likedArtistRevIds.has(review.id),
							type: 'artist',
							comment: review.reviewText,
							rating: review.rating,
							artistId: review.artistId as string,
							userId: review.userId
						}));
					}
				}
			} catch (err) {
				console.warn('Failed to fetch artist reviews:', err);
			}
		}


		const allReviews = [...reviewsWithLike, ...artistReviews];

		allReviews.sort((a, b) => {
			const aPinned = dbAlbum?.pinnedReviewId === a.id ? 1 : 0;
			const bPinned = dbAlbum?.pinnedReviewId === b.id ? 1 : 0;
			if (aPinned !== bPinned) return bPinned - aPinned;
			if (a.likeCount !== b.likeCount) {
				return Number(b.likeCount ?? 0) - Number(a.likeCount ?? 0);
			}
			return Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0);
		});

		const discogsFeedbackData = discogsFeedback
			? {
				ratingAverage: discogsFeedback.ratingAverage,
				ratingCount: discogsFeedback.ratingCount,
				have: discogsFeedback.have,
				want: discogsFeedback.want,
				url: discogsFeedback.url
			}
			: null;

		const allowedHosts = new Set([
			'i.discogs.com',
			'coverartarchive.org',
			'images.unsplash.com',
			'upload.wikimedia.org',
			'commons.wikimedia.org',
			'i.scdn.co',
			'images-na.ssl-images-amazon.com',
			'www.gravatar.com',
			'avatars.githubusercontent.com',
			'graph.facebook.com',
			'pbs.twimg.com',
			'imgur.com',
			'i.imgur.com',
			'cdn.discordapp.com'
		]);

		let returnedCoverArt = (dbAlbum as any).coverArtUrl || null;
		try {
			if (returnedCoverArt) {
				const parsed = new URL(returnedCoverArt);
				if (allowedHosts.has(parsed.hostname)) {
					returnedCoverArt = `/api/image-proxy?u=${encodeURIComponent(returnedCoverArt)}`;
				}
			}
		} catch (e) {
			// ignore
		}

		return json({
			album: {
				...dbAlbum,
				artist: discogs.cleanDiscogsArtistName((dbAlbum as any).artist) || (dbAlbum as any).artist,
				coverArtUrl: returnedCoverArt,
				tracks: ((dbAlbum.tracks || []) as DBTrack[])
					.map((t: DBTrack, idx: number) => ({
						...t,
						trackNumber: normalizeTrackNumber(t.trackNumber, idx + 1)
					}))
					.sort((a: any, b: any) => {
						const aNum = normalizeTrackNumber(a.trackNumber, Number.MAX_SAFE_INTEGER);
						const bNum = normalizeTrackNumber(b.trackNumber, Number.MAX_SAFE_INTEGER);
						if (aNum !== bNum) return aNum - bNum;
						return String(a.title || '').localeCompare(String(b.title || ''));
					}),
				genres: dbAlbum.genres ? JSON.parse(dbAlbum.genres) : [],
				artistUrl: albumArtistUrl
			},
			reviews: allReviews,
			stats: {
				reviewCount: normalizedReviews.length || 0,
				avgRating:
					normalizedReviews.length > 0
						? normalizedReviews.reduce((sum: number, r: DBReview) => sum + (Number(r.rating) || 0), 0) /
							normalizedReviews.length
						: 0
			},
			userReview:
				currentUser && !currentUser.isGuest
					? reviewsWithLike.find((r: any) => r.userId === currentUser!.id)
					: null,
			discogsFeedback: discogsFeedbackData
		});
	} catch (err) {
		console.error('Failed to fetch album:', err);
		return error(500, 'Failed to fetch album');
	}
};
