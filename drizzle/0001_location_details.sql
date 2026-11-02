-- Hand edit: IF [NOT] EXISTS so this is safe on a production database that may
-- not have locations_staging yet, or already has some of these columns.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "retailer" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "state" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "postal_code" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "retailer" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "state" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "postal_code" text;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE IF EXISTS "locations_staging" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "locations_active_idx" ON "locations" USING btree ("is_active");