-- Baseline: mirrors the existing Supabase public schema.
-- On a FRESH database, `npm run db:migrate` applies this.
-- On the EXISTING production database, do NOT apply it: run `npm run db:baseline`
-- to record it as already applied (see docs/database.md).
--
-- Hand edits: the geography type is unquoted (drizzle-kit quotes types it does not
-- know), and the PostGIS extension is created first.
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."location_status" AS ENUM('stocked', 'out-of-stock', 'out-of-order');--> statement-breakpoint
CREATE TABLE "location_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "location_ratings_rating_range" CHECK ("location_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineID" text,
	"name" text,
	"description" text,
	"geog" geography(point, 4326),
	"is_official" boolean,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "locations_staging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineID" text,
	"name" text,
	"description" text,
	"geog" geography(point, 4326),
	"is_official" boolean,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"full_name" text,
	"is_verified" boolean,
	"onboarded" boolean DEFAULT false NOT NULL,
	"rating" double precision,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "status_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "location_status" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"price" numeric NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rated_user_id" uuid NOT NULL,
	"rater_user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "location_ratings" ADD CONSTRAINT "location_ratings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_ratings" ADD CONSTRAINT "location_ratings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations_staging" ADD CONSTRAINT "locations_staging_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_reports" ADD CONSTRAINT "status_reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ratings" ADD CONSTRAINT "trust_ratings_rated_user_id_profiles_id_fk" FOREIGN KEY ("rated_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ratings" ADD CONSTRAINT "trust_ratings_rater_user_id_profiles_id_fk" FOREIGN KEY ("rater_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_ratings_location_id_idx" ON "location_ratings" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "location_ratings_user_id_idx" ON "location_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_machine_id_key" ON "locations" USING btree ("machineID");--> statement-breakpoint
CREATE INDEX "locations_geog_gist" ON "locations" USING gist ("geog");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_staging_machine_id_key" ON "locations_staging" USING btree ("machineID");--> statement-breakpoint
CREATE INDEX "status_reports_location_created_idx" ON "status_reports" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");