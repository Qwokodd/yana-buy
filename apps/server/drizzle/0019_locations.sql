ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lng" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "located_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rider_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "lng" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_lat" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_lng" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "offered_rider_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "offered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "declined_rider_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_offered_rider_idx" ON "orders" ("offered_rider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_rider_online_idx" ON "users" ("rider_online") WHERE "rider_online" = true;
