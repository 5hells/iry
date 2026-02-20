CREATE TABLE "artist_review_like" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artist_review_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album" ADD COLUMN "pinned_review_id" uuid;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "pinned_review_id" uuid;--> statement-breakpoint
ALTER TABLE "artist_review_like" ADD CONSTRAINT "artist_review_like_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_review_like" ADD CONSTRAINT "artist_review_like_artist_review_id_artist_review_id_fk" FOREIGN KEY ("artist_review_id") REFERENCES "public"."artist_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_review_like_user_id_idx" ON "artist_review_like" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artist_review_like_artist_review_id_idx" ON "artist_review_like" USING btree ("artist_review_id");