CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"musicbrainz_id" text,
	"spotify_id" text,
	"discogs_id" text,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"release_date" text,
	"cover_art_url" text,
	"genres" text,
	"total_tracks" integer,
	"musicbrainz_url" text,
	"spotify_uri" text,
	"discogs_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_musicbrainz_id_unique" UNIQUE("musicbrainz_id"),
	CONSTRAINT "album_spotify_id_unique" UNIQUE("spotify_id"),
	CONSTRAINT "album_discogs_id_unique" UNIQUE("discogs_id")
);
--> statement-breakpoint
CREATE TABLE "album_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"rating" real NOT NULL,
	"review_text" text,
	"image_urls" text,
	"links" text,
	"is_partial_review" boolean DEFAULT false NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_review_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"album_review_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spotify_id" text,
	"name" text NOT NULL,
	"image_url" text,
	"genres" text,
	"spotify_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artist_spotify_id_unique" UNIQUE("spotify_id")
);
--> statement-breakpoint
CREATE TABLE "blocked_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_ordered" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"cover_image_url" text,
	"cover_image_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_collaborator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_track" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"content" text NOT NULL,
	"image_urls" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direct_message_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lastfm_scrobble" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"artist" text NOT NULL,
	"track" text NOT NULL,
	"album" text,
	"album_art_url" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"now_playing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_user_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link_url" text,
	"related_post_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL,
	"image_url" text,
	"points_required" integer NOT NULL,
	"config" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_collaborator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "status_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"image_urls" text,
	"parent_post_id" uuid,
	"review_id" uuid,
	"album_id" uuid,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_post_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status_post_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_post_comment_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_post_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status_post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"musicbrainz_id" text,
	"spotify_id" text,
	"title" text NOT NULL,
	"track_number" integer NOT NULL,
	"duration_ms" integer,
	"spotify_uri" text,
	"canvas_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_musicbrainz_id_unique" UNIQUE("musicbrainz_id"),
	CONSTRAINT "track_spotify_id_unique" UNIQUE("spotify_id")
);
--> statement-breakpoint
CREATE TABLE "track_ranking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"avg_rating" real NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_review_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"rating" real NOT NULL,
	"review_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"pronouns" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"image_position" text,
	"bio" text,
	"banner_url" text,
	"banner_position" text,
	"lastfm_username" text,
	"discord_id" text,
	"discord_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "user_perk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"perk_id" uuid NOT NULL,
	"custom_config" text,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_points" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"track_review_count" integer DEFAULT 0 NOT NULL,
	"pinned_review_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_theme" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"primary_color" text NOT NULL,
	"secondary_color" text NOT NULL,
	"accent_color" text NOT NULL,
	"background_color" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_review" ADD CONSTRAINT "album_review_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_review" ADD CONSTRAINT "album_review_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_review_like" ADD CONSTRAINT "album_review_like_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_review_like" ADD CONSTRAINT "album_review_like_album_review_id_album_review_id_fk" FOREIGN KEY ("album_review_id") REFERENCES "public"."album_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_user" ADD CONSTRAINT "blocked_user_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_user" ADD CONSTRAINT "blocked_user_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_collaborator" ADD CONSTRAINT "collection_collaborator_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_collaborator" ADD CONSTRAINT "collection_collaborator_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_track" ADD CONSTRAINT "collection_track_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_track" ADD CONSTRAINT "collection_track_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message" ADD CONSTRAINT "direct_message_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message_like" ADD CONSTRAINT "direct_message_like_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_message_like" ADD CONSTRAINT "direct_message_like_message_id_direct_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."direct_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lastfm_scrobble" ADD CONSTRAINT "lastfm_scrobble_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_related_post_id_status_post_id_fk" FOREIGN KEY ("related_post_id") REFERENCES "public"."status_post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_collaborator" ADD CONSTRAINT "review_collaborator_review_id_album_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."album_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_collaborator" ADD CONSTRAINT "review_collaborator_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post" ADD CONSTRAINT "status_post_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post" ADD CONSTRAINT "status_post_parent_post_id_status_post_id_fk" FOREIGN KEY ("parent_post_id") REFERENCES "public"."status_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post" ADD CONSTRAINT "status_post_review_id_album_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."album_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post" ADD CONSTRAINT "status_post_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_comment" ADD CONSTRAINT "status_post_comment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_comment" ADD CONSTRAINT "status_post_comment_status_post_id_status_post_id_fk" FOREIGN KEY ("status_post_id") REFERENCES "public"."status_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_comment_like" ADD CONSTRAINT "status_post_comment_like_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_comment_like" ADD CONSTRAINT "status_post_comment_like_comment_id_status_post_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."status_post_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_like" ADD CONSTRAINT "status_post_like_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_post_like" ADD CONSTRAINT "status_post_like_status_post_id_status_post_id_fk" FOREIGN KEY ("status_post_id") REFERENCES "public"."status_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track" ADD CONSTRAINT "track_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_ranking" ADD CONSTRAINT "track_ranking_album_id_album_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."album"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_ranking" ADD CONSTRAINT "track_ranking_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_review" ADD CONSTRAINT "track_review_album_review_id_album_review_id_fk" FOREIGN KEY ("album_review_id") REFERENCES "public"."album_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_review" ADD CONSTRAINT "track_review_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_perk" ADD CONSTRAINT "user_perk_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_perk" ADD CONSTRAINT "user_perk_perk_id_perk_id_fk" FOREIGN KEY ("perk_id") REFERENCES "public"."perk"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_points" ADD CONSTRAINT "user_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_points" ADD CONSTRAINT "user_points_pinned_review_id_album_review_id_fk" FOREIGN KEY ("pinned_review_id") REFERENCES "public"."album_review"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_theme" ADD CONSTRAINT "user_theme_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "album_musicbrainz_id_idx" ON "album" USING btree ("musicbrainz_id");--> statement-breakpoint
CREATE INDEX "album_spotify_id_idx" ON "album" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "album_discogs_id_idx" ON "album" USING btree ("discogs_id");--> statement-breakpoint
CREATE INDEX "album_artist_idx" ON "album" USING btree ("artist");--> statement-breakpoint
CREATE INDEX "album_review_user_id_idx" ON "album_review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "album_review_album_id_idx" ON "album_review" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "album_review_created_at_idx" ON "album_review" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "album_review_like_user_id_idx" ON "album_review_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "album_review_like_album_review_id_idx" ON "album_review_like" USING btree ("album_review_id");--> statement-breakpoint
CREATE INDEX "artist_spotify_id_idx" ON "artist" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "artist_name_idx" ON "artist" USING btree ("name");--> statement-breakpoint
CREATE INDEX "blocked_user_user_id_idx" ON "blocked_user" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "blocked_user_blocked_user_id_idx" ON "blocked_user" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "collection_user_id_idx" ON "collection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_collaborator_collection_id_idx" ON "collection_collaborator" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_collaborator_user_id_idx" ON "collection_collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_track_collection_id_idx" ON "collection_track" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_track_track_id_idx" ON "collection_track" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "direct_message_sender_id_idx" ON "direct_message" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "direct_message_recipient_id_idx" ON "direct_message" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "direct_message_created_at_idx" ON "direct_message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "direct_message_like_user_id_idx" ON "direct_message_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "direct_message_like_message_id_idx" ON "direct_message_like" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "lastfm_scrobble_user_id_idx" ON "lastfm_scrobble" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lastfm_scrobble_timestamp_idx" ON "lastfm_scrobble" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_created_at_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "review_collaborator_review_id_idx" ON "review_collaborator" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "review_collaborator_user_id_idx" ON "review_collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_post_user_id_idx" ON "status_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_post_created_at_idx" ON "status_post" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "status_post_parent_post_id_idx" ON "status_post" USING btree ("parent_post_id");--> statement-breakpoint
CREATE INDEX "status_post_review_id_idx" ON "status_post" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "status_post_album_id_idx" ON "status_post" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "status_post_comment_user_id_idx" ON "status_post_comment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_post_comment_status_post_id_idx" ON "status_post_comment" USING btree ("status_post_id");--> statement-breakpoint
CREATE INDEX "status_post_comment_like_user_id_idx" ON "status_post_comment_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_post_comment_like_comment_id_idx" ON "status_post_comment_like" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "status_post_like_user_id_idx" ON "status_post_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_post_like_status_post_id_idx" ON "status_post_like" USING btree ("status_post_id");--> statement-breakpoint
CREATE INDEX "track_album_id_idx" ON "track" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "track_musicbrainz_id_idx" ON "track" USING btree ("musicbrainz_id");--> statement-breakpoint
CREATE INDEX "track_spotify_id_idx" ON "track" USING btree ("spotify_id");--> statement-breakpoint
CREATE INDEX "track_ranking_album_id_idx" ON "track_ranking" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "track_ranking_track_id_idx" ON "track_ranking" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "track_review_album_review_id_idx" ON "track_review" USING btree ("album_review_id");--> statement-breakpoint
CREATE INDEX "track_review_track_id_idx" ON "track_review" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "user_perk_user_id_idx" ON "user_perk" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_perk_perk_id_idx" ON "user_perk" USING btree ("perk_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");