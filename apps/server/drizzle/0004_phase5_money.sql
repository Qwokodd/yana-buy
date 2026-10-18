CREATE TYPE "public"."payment_attempt_status" AS ENUM('pending', 'successful', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'paid', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."wallet_entry_type" AS ENUM('sale', 'payout', 'payout_returned', 'adjustment');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'awaiting_payment' BEFORE 'placed';--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"payer_phone" text NOT NULL,
	"provider_ref" text NOT NULL,
	"status" "payment_attempt_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"provider_txn_id" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "payouts_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 5001 CACHE 1),
	"shop_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"account_name" text NOT NULL,
	"account_phone" text NOT NULL,
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"reference" text,
	"reason" text,
	"requested_by_id" uuid,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"type" "wallet_entry_type" NOT NULL,
	"amount" integer NOT NULL,
	"order_id" uuid,
	"payout_id" uuid,
	"note" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "commission" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_earning" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cash_handed_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cash_received_by_id" uuid;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "payout_method" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "payout_name" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "payout_phone" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "payments_buyer_idx" ON "payments" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "payouts_shop_idx" ON "payouts" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wallet_entries_shop_idx" ON "wallet_entries" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_sale_key" ON "wallet_entries" USING btree ("order_id","type");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_received_by_id_users_id_fk" FOREIGN KEY ("cash_received_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;