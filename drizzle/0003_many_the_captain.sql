ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'contributor' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "newsletter_subscribed" boolean DEFAULT false NOT NULL;