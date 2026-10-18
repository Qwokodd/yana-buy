ALTER TABLE "order_items" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_label" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "options" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "variants" jsonb DEFAULT '[]'::jsonb NOT NULL;