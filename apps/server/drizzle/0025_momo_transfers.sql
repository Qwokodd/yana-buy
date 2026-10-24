CREATE TABLE IF NOT EXISTS "momo_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"shop_id" uuid,
	"rider_id" uuid,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"phone" text NOT NULL,
	"name" text NOT NULL,
	"provider_ref" text NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"provider_txn_id" text,
	"failure_reason" text,
	"payout_id" uuid,
	"rider_entry_id" uuid,
	"by_user_id" uuid,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "momo_transfers" ADD CONSTRAINT "momo_transfers_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "momo_transfers" ADD CONSTRAINT "momo_transfers_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "momo_transfers" ADD CONSTRAINT "momo_transfers_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "momo_transfers" ADD CONSTRAINT "momo_transfers_rider_entry_id_rider_entries_id_fk" FOREIGN KEY ("rider_entry_id") REFERENCES "public"."rider_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "momo_transfers" ADD CONSTRAINT "momo_transfers_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "momo_transfers_provider_ref_key" ON "momo_transfers" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "momo_transfers_status_idx" ON "momo_transfers" USING btree ("status");
