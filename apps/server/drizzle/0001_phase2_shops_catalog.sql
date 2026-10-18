CREATE TYPE "public"."banner_kind" AS ENUM('banner', 'ad');--> statement-breakpoint
CREATE TYPE "public"."banner_mode" AS ENUM('all', 'goods', 'food');--> statement-breakpoint
CREATE TYPE "public"."banner_placement" AS ENUM('hero', 'strip');--> statement-breakpoint
CREATE TYPE "public"."banner_platform" AS ENUM('all', 'web', 'app');--> statement-breakpoint
CREATE TYPE "public"."catalog_kind" AS ENUM('goods', 'food');--> statement-breakpoint
CREATE TYPE "public"."id_document_type" AS ENUM('national_id', 'passport', 'drivers_license', 'voter_card');--> statement-breakpoint
CREATE TYPE "public"."shop_kind" AS ENUM('store', 'restaurant');--> statement-breakpoint
CREATE TYPE "public"."shop_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "banner_kind" DEFAULT 'banner' NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"image_url" text NOT NULL,
	"link_url" text,
	"button_label" text,
	"advertiser" text,
	"placement" "banner_placement" DEFAULT 'hero' NOT NULL,
	"platform" "banner_platform" DEFAULT 'all' NOT NULL,
	"mode" "banner_mode" DEFAULT 'all' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "catalog_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "shop_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"cover_url" text,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"status" "shop_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"id_type" "id_document_type" NOT NULL,
	"id_front_key" text NOT NULL,
	"id_back_key" text,
	"selfie_key" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banners_placement_idx" ON "banners" USING btree ("placement","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_slug_key" ON "categories" USING btree ("kind","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_owner_key" ON "shops" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_slug_key" ON "shops" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "shops_status_idx" ON "shops" USING btree ("status");