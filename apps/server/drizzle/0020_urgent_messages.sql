ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "urgent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "user_ids" jsonb;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "near" jsonb;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "sms_failed" integer DEFAULT 0 NOT NULL;
