CREATE TYPE "public"."dispute_outcome" AS ENUM('refund_full', 'refund_partial', 'no_refund');--> statement-breakpoint
CREATE TYPE "public"."dispute_reason" AS ENUM('not_received', 'wrong_item', 'damaged', 'not_as_described', 'missing_items', 'other');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."message_sender" AS ENUM('buyer', 'shop', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sourcing_status" AS ENUM('pending', 'quoted', 'accepted', 'ordered', 'shipped', 'arrived', 'delivered', 'rejected', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."wallet_entry_type" ADD VALUE 'refund';--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"buyer_read_at" timestamp with time zone,
	"shop_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "disputes_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 7001 CACHE 1),
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"reason" "dispute_reason" NOT NULL,
	"description" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"seller_response" text,
	"seller_responded_at" timestamp with time zone,
	"outcome" "dispute_outcome",
	"refund_amount" integer,
	"seller_charge" integer,
	"refund_reference" text,
	"decision_note" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"sender" "message_sender" NOT NULL,
	"body" text,
	"image_url" text,
	"product_id" uuid,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"seller_reply" text,
	"seller_replied_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "sourcing_requests_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 3001 CACHE 1),
	"buyer_id" uuid NOT NULL,
	"link" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"budget" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "sourcing_status" DEFAULT 'pending' NOT NULL,
	"quote_price" integer,
	"quote_days" integer,
	"quote_note" text,
	"quoted_at" timestamp with time zone,
	"reject_reason" text,
	"payment_method" "payment_method",
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"delivery_name" text,
	"delivery_phone" text,
	"delivery_city" text,
	"delivery_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sourcing_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ships_from_china" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "delivery_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "rating_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "rating_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_events" ADD CONSTRAINT "sourcing_events_request_id_sourcing_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sourcing_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_events" ADD CONSTRAINT "sourcing_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_requests" ADD CONSTRAINT "sourcing_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_key" ON "conversations" USING btree ("buyer_id","shop_id");--> statement-breakpoint
CREATE INDEX "conversations_shop_idx" ON "conversations" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "conversations_last_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_order_key" ON "disputes" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_number_key" ON "disputes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_order_product_key" ON "reviews" USING btree ("order_id","product_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reviews_shop_idx" ON "reviews" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "sourcing_events_request_idx" ON "sourcing_events" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sourcing_number_key" ON "sourcing_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sourcing_buyer_idx" ON "sourcing_requests" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "sourcing_status_idx" ON "sourcing_requests" USING btree ("status");