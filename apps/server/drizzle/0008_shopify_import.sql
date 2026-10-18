CREATE TABLE "shopify_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"city" text,
	"address" text,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"accepts_email" boolean DEFAULT false NOT NULL,
	"accepts_sms" boolean DEFAULT false NOT NULL,
	"tags" text,
	"note" text,
	"user_id" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"shopify_id" text,
	"buyer_name" text,
	"email" text,
	"phone" text,
	"user_id" uuid,
	"vendors" text,
	"financial_status" text,
	"fulfillment_status" text,
	"payment_method" text,
	"shipping_method" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"discount_code" text,
	"total" integer DEFAULT 0 NOT NULL,
	"refunded" integer DEFAULT 0 NOT NULL,
	"address" text,
	"city" text,
	"notes" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "imported_key" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "imported_from" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "imported_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "unclaimed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "imported_from" text;--> statement-breakpoint
ALTER TABLE "shopify_contacts" ADD CONSTRAINT "shopify_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_orders" ADD CONSTRAINT "shopify_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_contacts_shopify_id_key" ON "shopify_contacts" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "shopify_contacts_phone_idx" ON "shopify_contacts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_orders_name_key" ON "shopify_orders" USING btree ("name");--> statement-breakpoint
CREATE INDEX "shopify_orders_user_idx" ON "shopify_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopify_orders_phone_idx" ON "shopify_orders" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "shopify_orders_placed_idx" ON "shopify_orders" USING btree ("placed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_imported_key" ON "products" USING btree ("imported_key");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_imported_key" ON "shops" USING btree ("imported_key");