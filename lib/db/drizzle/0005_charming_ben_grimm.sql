CREATE TABLE "interviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "last_class" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "year_of_last_result" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "doc_verification_status" text DEFAULT 'not_verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "interviewed_by" text;--> statement-breakpoint
ALTER TABLE "batch_print_jobs" ADD COLUMN "class_codes" text;--> statement-breakpoint
ALTER TABLE "batch_print_jobs" ADD COLUMN "section_ids" text;--> statement-breakpoint
CREATE INDEX "interviewers_tenant_idx" ON "interviewers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "interviewers_active_idx" ON "interviewers" USING btree ("active");