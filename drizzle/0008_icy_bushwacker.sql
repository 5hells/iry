CREATE TABLE "artist_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"artist_id" uuid NOT NULL,
	"rating" real NOT NULL,
	"review_text" text,
	"image_urls" text,
	"links" text,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_review" ADD CONSTRAINT "artist_review_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_review" ADD CONSTRAINT "artist_review_artist_id_artist_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artist_review_user_id_idx" ON "artist_review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artist_review_artist_id_idx" ON "artist_review" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "artist_review_created_at_idx" ON "artist_review" USING btree ("created_at");