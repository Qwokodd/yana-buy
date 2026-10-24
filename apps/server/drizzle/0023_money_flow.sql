ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "seller_price" integer;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN IF NOT EXISTS "payout_schedule" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."rider_entry_type" AS ENUM('trip', 'payout', 'adjustment');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rider_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"type" "rider_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"order_id" uuid,
	"reference" text,
	"note" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rider_entries" ADD CONSTRAINT "rider_entries_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rider_entries" ADD CONSTRAINT "rider_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rider_entries" ADD CONSTRAINT "rider_entries_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rider_entries_rider_idx" ON "rider_entries" USING btree ("rider_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rider_entries_trip_key" ON "rider_entries" USING btree ("order_id","type");
