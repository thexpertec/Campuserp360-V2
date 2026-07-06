CREATE TABLE "test_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"test_date" text NOT NULL,
	"test_time" text,
	"centre_id" uuid,
	"centre_name" text,
	"class_applying" text,
	"session" text,
	"total_seats" integer,
	"notes" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_schedules" ADD CONSTRAINT "test_schedules_centre_id_test_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "public"."test_centres"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_schedules_tenant_idx" ON "test_schedules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "test_schedules_status_idx" ON "test_schedules" USING btree ("status");