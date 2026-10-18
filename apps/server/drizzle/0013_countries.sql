ALTER TABLE "shops" ADD COLUMN "country" text DEFAULT 'LR' NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_country_check" CHECK ("country" in ('LR', 'US'));--> statement-breakpoint
CREATE INDEX "shops_country_idx" ON "shops" USING btree ("country");--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "country" text DEFAULT 'LR' NOT NULL;
