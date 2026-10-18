CREATE TYPE "public"."rider_app_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."rider_vehicle" AS ENUM('motorbike', 'keke', 'car', 'bicycle', 'on_foot');--> statement-breakpoint
CREATE TABLE "rider_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle" "rider_vehicle" NOT NULL,
	"plate_number" text,
	"city" text NOT NULL,
	"areas" text NOT NULL,
	"id_type" "id_document_type" NOT NULL,
	"id_front_key" text NOT NULL,
	"id_back_key" text,
	"selfie_key" text NOT NULL,
	"license_key" text,
	"emergency_name" text NOT NULL,
	"emergency_phone" text NOT NULL,
	"status" "rider_app_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rider_applications_user_key" ON "rider_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rider_applications_status_idx" ON "rider_applications" USING btree ("status");