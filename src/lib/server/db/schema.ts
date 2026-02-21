import {
	pgTable,
	text,
	integer,
	real,
	boolean,
	index,
	timestamp,
	uuid,
	PgColumn
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user, session, account } from './auth.schema';

export * from './auth.schema';

export const task = pgTable('task', {
	id: uuid('id').primaryKey().defaultRandom(),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

export const album = pgTable(
	'album',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		musicbrainzId: text('musicbrainz_id').unique(),
		spotifyId: text('spotify_id').unique(),
		discogsId: text('discogs_id').unique(),

		title: text('title').notNull(),
		artist: text('artist').notNull(),
		releaseDate: text('release_date'),
		coverArtUrl: text('cover_art_url'),

		genres: text('genres'),
		totalTracks: integer('total_tracks'),

		indexRetryCount: integer('index_retry_count').notNull().default(0),
		nextIndexAttempt: timestamp('next_index_attempt', { withTimezone: true }),

		musicbrainzUrl: text('musicbrainz_url'),
		spotifyUri: text('spotify_uri'),
		discogsUrl: text('discogs_url'),

		pinnedReviewId: uuid('pinned_review_id'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('album_musicbrainz_id_idx').on(table.musicbrainzId),
		index('album_spotify_id_idx').on(table.spotifyId),
		index('album_discogs_id_idx').on(table.discogsId),
		index('album_artist_idx').on(table.artist)
	]
);

export const artist = pgTable(
	'artist',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		musicbrainzId: text('musicbrainz_id').unique(),
		spotifyId: text('spotify_id').unique(),
		discogsId: text('discogs_id').unique(),
		name: text('name').notNull(),
		imageUrl: text('image_url'),

		genres: text('genres'),
		spotifyUri: text('spotify_uri'),
		musicbrainzUrl: text('musicbrainz_url'),
		discogsUrl: text('discogs_url'),

		pinnedReviewId: uuid('pinned_review_id'),

		indexRetryCount: integer('index_retry_count').notNull().default(0),
		nextIndexAttempt: timestamp('next_index_attempt', { withTimezone: true }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('artist_musicbrainz_id_idx').on(table.musicbrainzId),
		index('artist_spotify_id_idx').on(table.spotifyId),
		index('artist_discogs_id_idx').on(table.discogsId),
		index('artist_name_idx').on(table.name)
	]
);

export const searchCache = pgTable(
	'search_cache',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		queryHash: text('query_hash').notNull(), 
		query: text('query').notNull(),
		type: text('type').notNull(), 
		results: text('results').notNull(), 

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull() 
	},
	(table) => [
		index('search_cache_query_hash_type_idx').on(table.queryHash, table.type),
		index('search_cache_expires_at_idx').on(table.expiresAt)
	]
);

export const track = pgTable(
	'track',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		albumId: uuid('album_id')
			.notNull()
			.references((): PgColumn => album.id, { onDelete: 'cascade' }),

		musicbrainzId: text('musicbrainz_id').unique(),
		spotifyId: text('spotify_id').unique(),

		title: text('title').notNull(),
		trackNumber: integer('track_number').notNull(),
		durationMs: integer('duration_ms'),
		position: text('position'),

		spotifyUri: text('spotify_uri'),
		canvasUrl: text('canvas_url'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('track_album_id_idx').on(table.albumId),
		index('track_musicbrainz_id_idx').on(table.musicbrainzId),
		index('track_spotify_id_idx').on(table.spotifyId)
	]
);

export const albumReview = pgTable(
	'album_review',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		albumId: uuid('album_id')
			.notNull()
			.references((): PgColumn => album.id, { onDelete: 'cascade' }),

		rating: real('rating').notNull(),
		reviewText: text('review_text'),

		imageUrls: text('image_urls'),
		links: text('links'),

		isPartialReview: boolean('is_partial_review').default(false).notNull(),
		pointsAwarded: integer('points_awarded').notNull().default(0),
		likeCount: integer('like_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('album_review_user_id_idx').on(table.userId),
		index('album_review_album_id_idx').on(table.albumId),
		index('album_review_created_at_idx').on(table.createdAt)
	]
);

export const artistReview = pgTable(
	'artist_review',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		artistId: uuid('artist_id')
			.notNull()
			.references((): PgColumn => artist.id, { onDelete: 'cascade' }),

		rating: real('rating').notNull(),
		reviewText: text('review_text'),

		imageUrls: text('image_urls'),
		links: text('links'),

		pointsAwarded: integer('points_awarded').notNull().default(0),
		likeCount: integer('like_count').notNull().default(0),
		replyCount: integer('reply_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('artist_review_user_id_idx').on(table.userId),
		index('artist_review_artist_id_idx').on(table.artistId),
		index('artist_review_created_at_idx').on(table.createdAt)
	]
);

export const artistReviewLike = pgTable(
	'artist_review_like',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		artistReviewId: uuid('artist_review_id')
			.notNull()
			.references((): PgColumn => artistReview.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('artist_review_like_user_id_idx').on(table.userId),
		index('artist_review_like_artist_review_id_idx').on(table.artistReviewId)
	]
);

export const trackReview = pgTable(
	'track_review',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		albumReviewId: uuid('album_review_id')
			.notNull()
			.references((): PgColumn => albumReview.id, { onDelete: 'cascade' }),

		trackId: uuid('track_id')
			.notNull()
			.references((): PgColumn => track.id, { onDelete: 'cascade' }),

		rating: real('rating').notNull(),
		reviewText: text('review_text'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('track_review_album_review_id_idx').on(table.albumReviewId),
		index('track_review_track_id_idx').on(table.trackId)
	]
);

export const trackRanking = pgTable(
	'track_ranking',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		albumId: uuid('album_id')
			.notNull()
			.references((): PgColumn => album.id, { onDelete: 'cascade' }),

		trackId: uuid('track_id')
			.notNull()
			.references((): PgColumn => track.id, { onDelete: 'cascade' }),

		avgRating: real('avg_rating').notNull(),
		reviewCount: integer('review_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('track_ranking_album_id_idx').on(table.albumId),
		index('track_ranking_track_id_idx').on(table.trackId)
	]
);

export const userPoints = pgTable('user_points', {
	userId: text('user_id')
		.primaryKey()
		.references((): PgColumn => user.id, { onDelete: 'cascade' }),

	totalPoints: integer('total_points').notNull().default(0),
	level: integer('level').notNull().default(1),
	reviewCount: integer('review_count').notNull().default(0),
	trackReviewCount: integer('track_review_count').notNull().default(0),

	pinnedReviewId: uuid('pinned_review_id').references((): PgColumn => albumReview.id, {
		onDelete: 'set null'
	}),

	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const perk = pgTable('perk', {
	id: uuid('id').primaryKey().defaultRandom(),

	name: text('name').notNull(),
	description: text('description').notNull(),
	type: text('type').notNull(),

	imageUrl: text('image_url'),
	pointsRequired: integer('points_required').notNull(),

	config: text('config'),

	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const userPerk = pgTable(
	'user_perk',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		perkId: uuid('perk_id')
			.notNull()
			.references((): PgColumn => perk.id, { onDelete: 'cascade' }),

		customConfig: text('custom_config'),

		unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),

		isActive: boolean('is_active').default(false).notNull()
	},
	(table) => [
		index('user_perk_user_id_idx').on(table.userId),
		index('user_perk_perk_id_idx').on(table.perkId)
	]
);

export const userTheme = pgTable('user_theme', {
	userId: text('user_id')
		.primaryKey()
		.references((): PgColumn => user.id, { onDelete: 'cascade' }),

	primaryColor: text('primary_color').notNull(),
	secondaryColor: text('secondary_color').notNull(),
	accentColor: text('accent_color').notNull(),
	backgroundColor: text('background_color').notNull(),

	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const notification = pgTable(
	'notification',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		fromUserId: text('from_user_id').references((): PgColumn => user.id, { onDelete: 'set null' }),

		type: text('type').notNull(),
		title: text('title').notNull(),
		message: text('message').notNull(),
		linkUrl: text('link_url'),

		relatedPostId: uuid('related_post_id').references((): PgColumn => statusPost.id, {
			onDelete: 'set null'
		}),

		isRead: boolean('is_read').default(false).notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('notification_user_id_idx').on(table.userId),
		index('notification_created_at_idx').on(table.createdAt)
	]
);

export const lastfmScrobble = pgTable(
	'lastfm_scrobble',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		artist: text('artist').notNull(),
		track: text('track').notNull(),
		album: text('album'),
		albumArtUrl: text('album_art_url'),

		timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),

		nowPlaying: boolean('now_playing').default(false).notNull()
	},
	(table) => [
		index('lastfm_scrobble_user_id_idx').on(table.userId),
		index('lastfm_scrobble_timestamp_idx').on(table.timestamp)
	]
);

export const blockedUser = pgTable(
	'blocked_user',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		blockedUserId: text('blocked_user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('blocked_user_user_id_idx').on(table.userId),
		index('blocked_user_blocked_user_id_idx').on(table.blockedUserId)
	]
);

export const follow = pgTable(
	'follow',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		followerId: text('follower_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		followingId: text('following_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('follow_follower_id_idx').on(table.followerId),
		index('follow_following_id_idx').on(table.followingId)
	]
);

export const directMessage = pgTable(
	'direct_message',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		senderId: text('sender_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		recipientId: text('recipient_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		content: text('content').notNull(),
		imageUrls: text('image_urls'),

		isRead: boolean('is_read').default(false).notNull(),
		likeCount: integer('like_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('direct_message_sender_id_idx').on(table.senderId),
		index('direct_message_recipient_id_idx').on(table.recipientId),
		index('direct_message_created_at_idx').on(table.createdAt)
	]
);

export const directMessageLike = pgTable(
	'direct_message_like',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		messageId: uuid('message_id')
			.notNull()
			.references((): PgColumn => directMessage.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('direct_message_like_user_id_idx').on(table.userId),
		index('direct_message_like_message_id_idx').on(table.messageId)
	]
);

export const albumReviewLike = pgTable(
	'album_review_like',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		albumReviewId: uuid('album_review_id')
			.notNull()
			.references((): PgColumn => albumReview.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('album_review_like_user_id_idx').on(table.userId),
		index('album_review_like_album_review_id_idx').on(table.albumReviewId)
	]
);

export const reviewCollaborator = pgTable(
	'review_collaborator',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		reviewId: uuid('review_id')
			.notNull()
			.references((): PgColumn => albumReview.id, { onDelete: 'cascade' }),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		role: text('role').notNull().default('contributor'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('review_collaborator_review_id_idx').on(table.reviewId),
		index('review_collaborator_user_id_idx').on(table.userId)
	]
);

export const collection = pgTable(
	'collection',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		title: text('title').notNull(),
		description: text('description'),

		isOrdered: boolean('is_ordered').default(false).notNull(),
		isPublic: boolean('is_public').default(true).notNull(),

		coverImageUrl: text('cover_image_url'),
		coverImageType: text('cover_image_type'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('collection_user_id_idx').on(table.userId)]
);

export const collectionTrack = pgTable(
	'collection_track',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		collectionId: uuid('collection_id')
			.notNull()
			.references((): PgColumn => collection.id, { onDelete: 'cascade' }),

		trackId: uuid('track_id')
			.notNull()
			.references((): PgColumn => track.id, { onDelete: 'cascade' }),

		position: integer('position').notNull(),
		description: text('description'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('collection_track_collection_id_idx').on(table.collectionId),
		index('collection_track_track_id_idx').on(table.trackId)
	]
);

export const collectionCollaborator = pgTable(
	'collection_collaborator',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		collectionId: uuid('collection_id')
			.notNull()
			.references((): PgColumn => collection.id, { onDelete: 'cascade' }),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		role: text('role').notNull().default('contributor'),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('collection_collaborator_collection_id_idx').on(table.collectionId),
		index('collection_collaborator_user_id_idx').on(table.userId)
	]
);

export const statusPost = pgTable(
	'status_post',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		content: text('content').notNull(),
		imageUrls: text('image_urls'),

		parentPostId: uuid('parent_post_id').references((): PgColumn => statusPost.id, {
			onDelete: 'cascade'
		}),

		reviewId: uuid('review_id').references((): PgColumn => albumReview.id, { onDelete: 'cascade' }),

		albumId: uuid('album_id').references((): PgColumn => album.id, { onDelete: 'cascade' }),

		likeCount: integer('like_count').notNull().default(0),
		replyCount: integer('reply_count').notNull().default(0),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('status_post_user_id_idx').on(table.userId),
		index('status_post_created_at_idx').on(table.createdAt),
		index('status_post_parent_post_id_idx').on(table.parentPostId),
		index('status_post_review_id_idx').on(table.reviewId),
		index('status_post_album_id_idx').on(table.albumId)
	]
);

export const statusPostLike = pgTable(
	'status_post_like',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		statusPostId: uuid('status_post_id')
			.notNull()
			.references((): PgColumn => statusPost.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('status_post_like_user_id_idx').on(table.userId),
		index('status_post_like_status_post_id_idx').on(table.statusPostId)
	]
);

export const statusPostComment = pgTable(
	'status_post_comment',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		statusPostId: uuid('status_post_id')
			.notNull()
			.references((): PgColumn => statusPost.id, { onDelete: 'cascade' }),

		content: text('content').notNull(),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('status_post_comment_user_id_idx').on(table.userId),
		index('status_post_comment_status_post_id_idx').on(table.statusPostId)
	]
);

export const statusPostCommentLike = pgTable(
	'status_post_comment_like',
	{
		id: uuid('id').primaryKey().defaultRandom(),

		userId: text('user_id')
			.notNull()
			.references((): PgColumn => user.id, { onDelete: 'cascade' }),

		commentId: uuid('comment_id')
			.notNull()
			.references((): PgColumn => statusPostComment.id, { onDelete: 'cascade' }),

		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('status_post_comment_like_user_id_idx').on(table.userId),
		index('status_post_comment_like_comment_id_idx').on(table.commentId)
	]
);

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	albumReviews: many(albumReview),
	userPoints: one(userPoints),
	userPerks: many(userPerk),
	statusPosts: many(statusPost),
	statusPostLikes: many(statusPostLike),
	statusPostComments: many(statusPostComment),
	statusPostCommentLikes: many(statusPostCommentLike),
	userTheme: one(userTheme),
	notifications: many(notification, { relationName: 'notificationRecipient' }),
	fromNotifications: many(notification, { relationName: 'notificationSender' }),
	lastfmScrobbles: many(lastfmScrobble),
	collections: many(collection),
	blockedUsers: many(blockedUser, { relationName: 'blocker' }),
	blockedByUsers: many(blockedUser, { relationName: 'blocked' }),
	directMessagesSent: many(directMessage, { relationName: 'directMessageSender' }),
	directMessagesReceived: many(directMessage, { relationName: 'directMessageRecipient' }),
	directMessageLikes: many(directMessageLike)
}));

export const albumRelations = relations(album, ({ many }) => ({
	tracks: many(track),
	reviews: many(albumReview),
	statusPosts: many(statusPost),
	trackRankings: many(trackRanking)
}));

export const artistRelations = relations(artist, () => ({}));

export const trackRelations = relations(track, ({ one, many }) => ({
	album: one(album, {
		fields: [track.albumId],
		references: [album.id]
	}),
	trackReviews: many(trackReview),
	trackRankings: many(trackRanking)
}));

export const albumReviewRelations = relations(albumReview, ({ one, many }) => ({
	user: one(user, {
		fields: [albumReview.userId],
		references: [user.id]
	}),
	album: one(album, {
		fields: [albumReview.albumId],
		references: [album.id]
	}),
	trackReviews: many(trackReview),
	statusPosts: many(statusPost),
	likes: many(albumReviewLike),
	collaborators: many(reviewCollaborator)
}));

export const trackReviewRelations = relations(trackReview, ({ one }) => ({
	albumReview: one(albumReview, {
		fields: [trackReview.albumReviewId],
		references: [albumReview.id]
	}),
	track: one(track, {
		fields: [trackReview.trackId],
		references: [track.id]
	})
}));

export const trackRankingRelations = relations(trackRanking, ({ one }) => ({
	album: one(album, {
		fields: [trackRanking.albumId],
		references: [album.id]
	}),
	track: one(track, {
		fields: [trackRanking.trackId],
		references: [track.id]
	})
}));

export const userPointsRelations = relations(userPoints, ({ one }) => ({
	user: one(user, {
		fields: [userPoints.userId],
		references: [user.id]
	}),
	pinnedReview: one(albumReview, {
		fields: [userPoints.pinnedReviewId],
		references: [albumReview.id]
	})
}));

export const perkRelations = relations(perk, ({ many }) => ({
	userPerks: many(userPerk)
}));

export const userPerkRelations = relations(userPerk, ({ one }) => ({
	user: one(user, {
		fields: [userPerk.userId],
		references: [user.id]
	}),
	perk: one(perk, {
		fields: [userPerk.perkId],
		references: [perk.id]
	})
}));

export const statusPostRelations = relations(statusPost, ({ one, many }) => ({
	user: one(user, {
		fields: [statusPost.userId],
		references: [user.id]
	}),
	album: one(album, {
		fields: [statusPost.albumId],
		references: [album.id]
	}),
	review: one(albumReview, {
		fields: [statusPost.reviewId],
		references: [albumReview.id]
	}),
	parentPost: one(statusPost, {
		fields: [statusPost.parentPostId],
		references: [statusPost.id],
		relationName: 'statusPostReplies'
	}),
	replies: many(statusPost, {
		relationName: 'statusPostReplies'
	}),
	likes: many(statusPostLike, {
		relationName: 'statusPostLikes'
	}),
	comments: many(statusPostComment, {
		relationName: 'statusPostComments'
	})
}));

export const statusPostLikeRelations = relations(statusPostLike, ({ one }) => ({
	user: one(user, {
		fields: [statusPostLike.userId],
		references: [user.id]
	}),
	statusPost: one(statusPost, {
		fields: [statusPostLike.statusPostId],
		references: [statusPost.id],
		relationName: 'statusPostLikes'
	})
}));

export const statusPostCommentRelations = relations(statusPostComment, ({ one, many }) => ({
	user: one(user, {
		fields: [statusPostComment.userId],
		references: [user.id]
	}),
	statusPost: one(statusPost, {
		fields: [statusPostComment.statusPostId],
		references: [statusPost.id],
		relationName: 'statusPostComments'
	}),
	likes: many(statusPostCommentLike, {
		relationName: 'statusPostCommentLikes'
	})
}));

export const statusPostCommentLikeRelations = relations(statusPostCommentLike, ({ one }) => ({
	user: one(user, {
		fields: [statusPostCommentLike.userId],
		references: [user.id]
	}),
	comment: one(statusPostComment, {
		fields: [statusPostCommentLike.commentId],
		references: [statusPostComment.id],
		relationName: 'statusPostCommentLikes'
	})
}));

export const userThemeRelations = relations(userTheme, ({ one }) => ({
	user: one(user, {
		fields: [userTheme.userId],
		references: [user.id]
	})
}));

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
		relationName: 'notificationRecipient'
	}),
	fromUser: one(user, {
		fields: [notification.fromUserId],
		references: [user.id],
		relationName: 'notificationSender'
	}),
	relatedPost: one(statusPost, {
		fields: [notification.relatedPostId],
		references: [statusPost.id]
	})
}));

export const albumReviewLikeRelations = relations(albumReviewLike, ({ one }) => ({
	user: one(user, {
		fields: [albumReviewLike.userId],
		references: [user.id]
	}),
	albumReview: one(albumReview, {
		fields: [albumReviewLike.albumReviewId],
		references: [albumReview.id]
	})
}));

export const artistReviewRelations = relations(artistReview, ({ one, many }) => ({
	user: one(user, {
		fields: [artistReview.userId],
		references: [user.id]
	}),
	artist: one(artist, {
		fields: [artistReview.artistId],
		references: [artist.id]
	}),
	likes: many(artistReviewLike)
}));

export const artistReviewLikeRelations = relations(artistReviewLike, ({ one }) => ({
	user: one(user, {
		fields: [artistReviewLike.userId],
		references: [user.id]
	}),
	review: one(artistReview, {
		fields: [artistReviewLike.artistReviewId],
		references: [artistReview.id],
		relationName: 'artistReviewLikes'
	})
}));

export const reviewCollaboratorRelations = relations(reviewCollaborator, ({ one }) => ({
	review: one(albumReview, {
		fields: [reviewCollaborator.reviewId],
		references: [albumReview.id]
	}),
	user: one(user, {
		fields: [reviewCollaborator.userId],
		references: [user.id]
	})
}));

export const collectionRelations = relations(collection, ({ one, many }) => ({
	user: one(user, {
		fields: [collection.userId],
		references: [user.id]
	}),
	tracks: many(collectionTrack),
	collaborators: many(collectionCollaborator)
}));

export const collectionTrackRelations = relations(collectionTrack, ({ one }) => ({
	collection: one(collection, {
		fields: [collectionTrack.collectionId],
		references: [collection.id]
	}),
	track: one(track, {
		fields: [collectionTrack.trackId],
		references: [track.id]
	})
}));

export const collectionCollaboratorRelations = relations(collectionCollaborator, ({ one }) => ({
	collection: one(collection, {
		fields: [collectionCollaborator.collectionId],
		references: [collection.id]
	}),
	user: one(user, {
		fields: [collectionCollaborator.userId],
		references: [user.id]
	})
}));

export const lastfmScrobbleRelations = relations(lastfmScrobble, ({ one }) => ({
	user: one(user, {
		fields: [lastfmScrobble.userId],
		references: [user.id]
	})
}));

export const blockedUserRelations = relations(blockedUser, ({ one }) => ({
	user: one(user, {
		fields: [blockedUser.userId],
		references: [user.id],
		relationName: 'blocker'
	}),
	blockedUser: one(user, {
		fields: [blockedUser.blockedUserId],
		references: [user.id],
		relationName: 'blocked'
	})
}));

export const followRelations = relations(follow, ({ one }) => ({
	follower: one(user, {
		fields: [follow.followerId],
		references: [user.id],
		relationName: 'followers'
	}),
	following: one(user, {
		fields: [follow.followingId],
		references: [user.id],
		relationName: 'following'
	})
}));

export const directMessageRelations = relations(directMessage, ({ one, many }) => ({
	sender: one(user, {
		fields: [directMessage.senderId],
		references: [user.id],
		relationName: 'directMessageSender'
	}),
	recipient: one(user, {
		fields: [directMessage.recipientId],
		references: [user.id],
		relationName: 'directMessageRecipient'
	}),
	likes: many(directMessageLike)
}));

export const directMessageLikeRelations = relations(directMessageLike, ({ one }) => ({
	user: one(user, {
		fields: [directMessageLike.userId],
		references: [user.id]
	}),
	message: one(directMessage, {
		fields: [directMessageLike.messageId],
		references: [directMessage.id]
	})
}));

export const emailQueue = pgTable('email_queue', {
	id: uuid('id').primaryKey().defaultRandom(),
	to: text('to').notNull(),
	subject: text('subject').notNull(),
	body: text('body').notNull(),
	sent: boolean('sent').default(false).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	sentAt: timestamp('sent_at', { withTimezone: true }),
	status: text('status'),
	error: text('error'),
	attempts: integer('attempts').notNull().default(0),
	lastError: text('last_error'),
	nextTry: timestamp('next_try', { withTimezone: true })
});
