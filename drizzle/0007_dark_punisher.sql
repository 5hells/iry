CREATE TABLE "search_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_hash" text NOT NULL,
	"query" text NOT NULL,
	"type" text NOT NULL,
	"results" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "search_cache_query_hash_type_idx" ON "search_cache" USING btree ("query_hash","type");--> statement-breakpoint
CREATE INDEX "search_cache_expires_at_idx" ON "search_cache" USING btree ("expires_at");