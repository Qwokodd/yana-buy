ALTER TYPE "public"."banner_placement" ADD VALUE IF NOT EXISTS 'promo';--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "video_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_ends_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_sale_ends_idx" ON "products" USING btree ("sale_ends_at");
