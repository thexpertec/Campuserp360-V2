CREATE TABLE "school_calendar_weekends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"mon" boolean DEFAULT false NOT NULL,
	"tue" boolean DEFAULT false NOT NULL,
	"wed" boolean DEFAULT false NOT NULL,
	"thu" boolean DEFAULT false NOT NULL,
	"fri" boolean DEFAULT false NOT NULL,
	"sat" boolean DEFAULT true NOT NULL,
	"sun" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "noticeboard_items" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "school_calendar_weekends" ADD CONSTRAINT "school_calendar_weekends_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_calendar_weekends_year_audience_uniq" ON "school_calendar_weekends" USING btree ("year_id","audience");--> statement-breakpoint
CREATE INDEX "school_calendar_weekends_year_idx" ON "school_calendar_weekends" USING btree ("year_id");--> statement-breakpoint
CREATE INDEX "school_holidays_year_audience_idx" ON "school_holidays" USING btree ("year_id","audience");--> statement-breakpoint
CREATE INDEX "school_holidays_date_idx" ON "school_holidays" USING btree ("date");--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "noticeboard_items" ADD CONSTRAINT "noticeboard_items_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_unique" UNIQUE("slug");