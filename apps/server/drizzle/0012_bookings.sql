CREATE TYPE "public"."booking_kind" AS ENUM('table', 'service');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "bookings_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 5001 CACHE 1),
	"shop_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text,
	"kind" "booking_kind" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"party_size" integer,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"note" text,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"status_note" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "bookable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "booking_settings" jsonb;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_number_key" ON "bookings" USING btree ("number");--> statement-breakpoint
CREATE INDEX "bookings_shop_starts_idx" ON "bookings" USING btree ("shop_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_buyer_idx" ON "bookings" USING btree ("buyer_id");