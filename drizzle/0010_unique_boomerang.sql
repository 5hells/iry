ALTER TABLE "artist" ADD COLUMN "musicbrainz_id" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "discogs_id" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "musicbrainz_url" text;--> statement-breakpoint
ALTER TABLE "artist" ADD COLUMN "discogs_url" text;--> statement-breakpoint
CREATE INDEX "artist_musicbrainz_id_idx" ON "artist" USING btree ("musicbrainz_id");--> statement-breakpoint
CREATE INDEX "artist_discogs_id_idx" ON "artist" USING btree ("discogs_id");--> statement-breakpoint
ALTER TABLE "artist" ADD CONSTRAINT "artist_musicbrainz_id_unique" UNIQUE("musicbrainz_id");--> statement-breakpoint
ALTER TABLE "artist" ADD CONSTRAINT "artist_discogs_id_unique" UNIQUE("discogs_id");