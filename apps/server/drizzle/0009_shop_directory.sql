ALTER TABLE "shops" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "hours" text;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Existing shops get the category most of their products are in, so the directory isn't empty on day one.
UPDATE "shops" s SET "category_id" = (
	SELECT p."category_id" FROM "products" p
	WHERE p."shop_id" = s."id" AND p."category_id" IS NOT NULL
	GROUP BY p."category_id" ORDER BY count(*) DESC LIMIT 1
) WHERE s."category_id" IS NULL;
