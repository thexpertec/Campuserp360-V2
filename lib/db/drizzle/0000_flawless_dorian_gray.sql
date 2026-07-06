CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_id" text NOT NULL,
	"session" text NOT NULL,
	"class_applying" text NOT NULL,
	"previous_marks" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text NOT NULL,
	"blood_group" text NOT NULL,
	"religion" text,
	"photo_filename" text,
	"student_mobile" text NOT NULL,
	"student_email" text NOT NULL,
	"present_address" text NOT NULL,
	"state" text NOT NULL,
	"city" text NOT NULL,
	"exam_center" text NOT NULL,
	"guardian_name" text NOT NULL,
	"relation" text NOT NULL,
	"father_name" text NOT NULL,
	"occupation" text,
	"guardian_mobile" text NOT NULL,
	"parent_cnic" text NOT NULL,
	"parent_cnic_last4" text NOT NULL,
	"portal_password" text DEFAULT '12345' NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"source" text DEFAULT 'online_admission' NOT NULL,
	"roll_number" text,
	"test_date" timestamp with time zone,
	"test_time" text,
	"test_venue" text,
	"test_center_address" text,
	"test_focal_person" text,
	"result_marks" integer,
	"result_status" text,
	"merit_score" integer,
	"merit_rank" integer,
	"interview_date" timestamp with time zone,
	"interview_time" text,
	"interview_venue" text,
	"interview_marks" integer,
	"fee_status" text DEFAULT 'pending' NOT NULL,
	"fee_bank_ref" text,
	"fee_submitted_at" timestamp with time zone,
	"fee_confirmed_at" timestamp with time zone,
	"admission_fee_status" text DEFAULT 'pending' NOT NULL,
	"admission_fee_bank_ref" text,
	"admission_fee_confirmed_at" timestamp with time zone,
	"offer_date" text,
	"fee_deadline" text,
	"joining_date" text,
	"candidate_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"original_name" text NOT NULL,
	"stored_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admissions_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissions_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "test_centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"centre_code" text,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"focal_person" text,
	"phone" text,
	"email" text,
	"contact" text,
	"venue_type" text DEFAULT 'test' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_centres_centre_code_unique" UNIQUE("centre_code"),
	CONSTRAINT "test_centres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_terms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "class_academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "class_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"periods_per_week" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"fee_type" text,
	"eligibility" text,
	"term_type" text,
	"term_count" integer,
	"seats" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "houses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "houses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "merit_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid,
	"class_code" text,
	"academic_weight" integer DEFAULT 20 NOT NULL,
	"test_weight" integer DEFAULT 50 NOT NULL,
	"interview_weight" integer DEFAULT 30 NOT NULL,
	"min_test_marks" integer DEFAULT 40 NOT NULL,
	"min_interview_marks" integer DEFAULT 12 NOT NULL,
	"min_merit_score" integer DEFAULT 50 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"class_code" text NOT NULL,
	"section_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'theory' NOT NULL,
	"is_elective" boolean DEFAULT false NOT NULL,
	"max_marks" integer DEFAULT 100 NOT NULL,
	"pass_marks" integer DEFAULT 33 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "terms_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_conditions_title_unique" UNIQUE("title")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_seq" serial NOT NULL,
	"name" text NOT NULL,
	"cnic" text,
	"phone" text,
	"city" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_date" text NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"class_code" text NOT NULL,
	"section_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gr_number" text NOT NULL,
	"application_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" text,
	"blood_group" text,
	"religion" text,
	"nationality" text DEFAULT 'Pakistani',
	"photo_filename" text,
	"mobile" text,
	"email" text,
	"address" text,
	"city" text,
	"province" text,
	"father_name" text,
	"guardian_name" text,
	"relation" text,
	"occupation" text,
	"guardian_mobile" text,
	"guardian_cnic" text,
	"guardian_id" uuid,
	"class_code" text NOT NULL,
	"section_id" uuid,
	"house_id" uuid,
	"academic_year_id" uuid,
	"enrollment_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_gr_number_unique" UNIQUE("gr_number")
);
--> statement-breakpoint
CREATE TABLE "fee_challans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"month" text,
	"issue_date" text NOT NULL,
	"due_date" text NOT NULL,
	"challan_number" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount" integer,
	"payment_method" text,
	"account_title" text,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_code" text NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fee_category" text DEFAULT 'non-tuition' NOT NULL,
	"fee_code" text NOT NULL,
	"duration" text DEFAULT 'monthly' NOT NULL,
	"months" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"coa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_types_fee_code_unique" UNIQUE("fee_code")
);
--> statement-breakpoint
CREATE TABLE "student_fee_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"branch_name" text,
	"account_title" text,
	"account_number" text NOT NULL,
	"iban" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"doc_label" text,
	"filename" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_salary_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"item_type" text DEFAULT 'incentive' NOT NULL,
	"name" text NOT NULL,
	"calculation_type" text DEFAULT 'fixed' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_salary_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_code" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"basic_salary" integer DEFAULT 0 NOT NULL,
	"effective_from" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"leave_deduct_enabled" boolean DEFAULT true NOT NULL,
	"leave_deduct_type" text DEFAULT 'per_day' NOT NULL,
	"leave_deduct_value" integer DEFAULT 0 NOT NULL,
	"short_leave_enabled" boolean DEFAULT false NOT NULL,
	"short_leave_threshold_minutes" integer DEFAULT 30 NOT NULL,
	"short_leave_deduct_type" text DEFAULT 'fixed' NOT NULL,
	"short_leave_deduct_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_salary_templates_template_code_unique" UNIQUE("template_code"),
	CONSTRAINT "employee_salary_templates_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "employee_salary_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" text NOT NULL,
	"basic_salary" integer DEFAULT 0 NOT NULL,
	"allowances" integer DEFAULT 0 NOT NULL,
	"deductions" integer DEFAULT 0 NOT NULL,
	"net_salary" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"father_name" text,
	"gender" text,
	"religion" text,
	"blood_group" text,
	"date_of_birth" text,
	"cnic" text,
	"nationality" text DEFAULT 'Pakistani',
	"photo_filename" text,
	"email" text,
	"phone" text,
	"present_address" text,
	"permanent_address" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"designation_id" uuid,
	"department_id" uuid,
	"salary_grade_id" uuid,
	"qualification" text,
	"experience" text,
	"joining_date" text,
	"contract_type" text DEFAULT 'permanent',
	"status" text DEFAULT 'active' NOT NULL,
	"username" text,
	"password_hash" text,
	"coa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_staff_id_unique" UNIQUE("staff_id"),
	CONSTRAINT "employees_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "hr_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"attendance_date" text NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"in_time" text,
	"out_time" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_deduction_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'tax' NOT NULL,
	"calculation_type" text DEFAULT 'fixed' NOT NULL,
	"default_value" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_deduction_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hr_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hr_designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department_id" uuid,
	"grade" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_designations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hr_incentive_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'allowance' NOT NULL,
	"calculation_type" text DEFAULT 'fixed' NOT NULL,
	"default_value" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_incentive_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hr_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type" text DEFAULT 'casual' NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_salary_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"basic_min" integer DEFAULT 0 NOT NULL,
	"basic_max" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_salary_grades_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hostel_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"student_name" text DEFAULT '' NOT NULL,
	"gr_number" text,
	"class_code" text,
	"room_id" uuid NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostel_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"block_type" text DEFAULT 'boys' NOT NULL,
	"floors" integer DEFAULT 1 NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_blocks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hostel_room_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_room_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"room_type_id" uuid,
	"floor" integer DEFAULT 1 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cnic" text,
	"license_number" text,
	"license_type" text DEFAULT 'LTV' NOT NULL,
	"license_expiry" text,
	"phone" text,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"destination" text DEFAULT '' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_routes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transport_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid,
	"vehicle_id" uuid,
	"driver_id" uuid,
	"trip_date" text NOT NULL,
	"departure_time" text,
	"arrival_time" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"passenger_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reg_no" text NOT NULL,
	"make" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"vehicle_type" text DEFAULT 'bus' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_vehicles_reg_no_unique" UNIQUE("reg_no")
);
--> statement-breakpoint
CREATE TABLE "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"isbn" text,
	"category_id" uuid,
	"publisher_id" uuid,
	"edition" text,
	"year_published" text,
	"total_copies" integer DEFAULT 1 NOT NULL,
	"available_copies" integer DEFAULT 1 NOT NULL,
	"shelf_location" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "library_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"student_id" uuid,
	"student_name" text,
	"gr_number" text,
	"issued_date" text NOT NULL,
	"due_date" text NOT NULL,
	"returned_date" text,
	"fine_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_publishers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "store_item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"coa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"image_url" text,
	"category_id" uuid,
	"unit_id" uuid,
	"department" text,
	"store_name" text,
	"current_stock" integer DEFAULT 0 NOT NULL,
	"reorder_level" integer DEFAULT 5 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "store_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" integer,
	"vendor_id" uuid,
	"transaction_date" text NOT NULL,
	"reference" text,
	"issued_to" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"symbol" text DEFAULT '' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_units_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "medical_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_conditions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "medical_medicine_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_medicine_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "medical_medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"unit" text DEFAULT 'tablet' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_medicines_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "medical_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"student_name" text DEFAULT '' NOT NULL,
	"gr_number" text,
	"class_code" text,
	"visit_date" text NOT NULL,
	"complaint" text DEFAULT '' NOT NULL,
	"condition_id" uuid,
	"diagnosis" text,
	"treatment_given" text,
	"medicines_given" text,
	"status" text DEFAULT 'outpatient' NOT NULL,
	"referred_to" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_subject_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"periods_per_week" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"end_time" text DEFAULT '' NOT NULL,
	"period_type" text DEFAULT 'lecture' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_periods_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_code" text NOT NULL,
	"section_name" text,
	"day_of_week" integer NOT NULL,
	"period_id" uuid NOT NULL,
	"subject_code" text,
	"subject_name" text,
	"teacher_name" text,
	"teacher_employee_id" uuid,
	"academic_year_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syllabus_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_code" text NOT NULL,
	"subject_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_scale_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"min_percent" integer DEFAULT 0 NOT NULL,
	"max_percent" integer DEFAULT 100 NOT NULL,
	"remarks" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_grading_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_grading_scales_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "exam_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"obtained_marks" integer,
	"is_absent" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_type_id" uuid,
	"class_code" text NOT NULL,
	"subject_code" text NOT NULL,
	"subject_name" text,
	"session_label" text NOT NULL,
	"exam_date" text,
	"total_marks" integer DEFAULT 100 NOT NULL,
	"pass_marks" integer DEFAULT 33 NOT NULL,
	"venue" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sports_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sports_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"sport" text,
	"venue_id" uuid,
	"scheduled_date" text NOT NULL,
	"scheduled_time" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"result" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sports_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport_category_id" uuid,
	"house" text,
	"coach_name" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sports_venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"venue_type" text DEFAULT 'outdoor' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sports_venues_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "print_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"margin_top" integer DEFAULT 20 NOT NULL,
	"margin_right" integer DEFAULT 15 NOT NULL,
	"margin_bottom" integer DEFAULT 20 NOT NULL,
	"margin_left" integer DEFAULT 15 NOT NULL,
	"page_size" text DEFAULT 'A4' NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"bg_image_path" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"alt_text" text,
	"tags" text,
	"url" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"page_size" text DEFAULT 'A4' NOT NULL,
	"orientation" text DEFAULT 'portrait' NOT NULL,
	"margin_top" integer DEFAULT 20 NOT NULL,
	"margin_right" integer DEFAULT 15 NOT NULL,
	"margin_bottom" integer DEFAULT 20 NOT NULL,
	"margin_left" integer DEFAULT 15 NOT NULL,
	"bg_image_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_templates_type_unique" UNIQUE("type")
);
--> statement-breakpoint
CREATE TABLE "gate_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_name" text NOT NULL,
	"person_type" text DEFAULT 'visitor' NOT NULL,
	"purpose" text,
	"vehicle_no" text,
	"phone" text,
	"in_time" text NOT NULL,
	"out_time" text,
	"gate_pass_no" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gate_outpass" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_name" text NOT NULL,
	"gr_number" text,
	"class_code" text,
	"purpose" text NOT NULL,
	"destination" text,
	"valid_from" text NOT NULL,
	"valid_until" text NOT NULL,
	"approved_by" text,
	"pass_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"target_audience" text DEFAULT 'all' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"published_at" text,
	"expires_at" text,
	"created_by" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noticeboard_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"category" text,
	"published_at" text,
	"expires_at" text,
	"attachment_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_type" text DEFAULT 'other' NOT NULL,
	"start_date" text NOT NULL,
	"start_time" text,
	"end_date" text,
	"end_time" text,
	"venue" text,
	"organizer" text,
	"target_audience" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"original_name" text NOT NULL,
	"stored_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_disciplinary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"incident_date" text NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"action_taken" text,
	"reported_by" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_module" text,
	"source_ref_id" uuid,
	"is_system_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_number" text NOT NULL,
	"date" text NOT NULL,
	"reference" text,
	"description" text NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reversal_of" uuid,
	"source_module" text,
	"source_ref_id" uuid,
	"total_debit" integer DEFAULT 0 NOT NULL,
	"total_credit" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"coa_id" uuid,
	"coa_code" text NOT NULL,
	"coa_name" text NOT NULL,
	"debit_amount" integer DEFAULT 0 NOT NULL,
	"credit_amount" integer DEFAULT 0 NOT NULL,
	"narration" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"bank_name" text,
	"account_title" text NOT NULL,
	"iban_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"coa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_code" text NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"address" text,
	"tax_no" text,
	"bank_name" text,
	"account_number" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"coa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_academic_years" ADD CONSTRAINT "class_academic_years_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_academic_years" ADD CONSTRAINT "class_academic_years_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_category_id_class_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."class_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_config" ADD CONSTRAINT "merit_config_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_allocations" ADD CONSTRAINT "section_allocations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_allocations" ADD CONSTRAINT "section_allocations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_allocations" ADD CONSTRAINT "section_allocations_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_attendance" ADD CONSTRAINT "student_attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_challans" ADD CONSTRAINT "fee_challans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_challans" ADD CONSTRAINT "fee_challans_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_challans" ADD CONSTRAINT "fee_challans_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_schedule" ADD CONSTRAINT "fee_schedule_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_schedule" ADD CONSTRAINT "fee_schedule_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_fee_overrides" ADD CONSTRAINT "student_fee_overrides_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_template_items" ADD CONSTRAINT "employee_salary_template_items_template_id_employee_salary_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."employee_salary_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_templates" ADD CONSTRAINT "employee_salary_templates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_transactions" ADD CONSTRAINT "employee_salary_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_hr_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."hr_designations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_hr_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_grade_id_hr_salary_grades_id_fk" FOREIGN KEY ("salary_grade_id") REFERENCES "public"."hr_salary_grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_attendance" ADD CONSTRAINT "hr_attendance_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_designations" ADD CONSTRAINT "hr_designations_department_id_hr_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."hr_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_block_id_hostel_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."hostel_blocks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_room_type_id_hostel_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."hostel_room_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_vehicle_id_transport_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_driver_id_transport_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."transport_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_category_id_library_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."library_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_publisher_id_library_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."library_publishers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_issues" ADD CONSTRAINT "library_issues_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_category_id_store_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."store_item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_unit_id_store_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."store_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_item_id_store_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."store_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_medicines" ADD CONSTRAINT "medical_medicines_category_id_medical_medicine_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."medical_medicine_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_visits" ADD CONSTRAINT "medical_visits_condition_id_medical_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."medical_conditions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_period_id_timetable_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."timetable_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_topics" ADD CONSTRAINT "syllabus_topics_unit_id_syllabus_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."syllabus_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_grade_bands" ADD CONSTRAINT "exam_grade_bands_grade_scale_id_exam_grading_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."exam_grading_scales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_schedule_id_exam_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."exam_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_type_id_exam_types_id_fk" FOREIGN KEY ("exam_type_id") REFERENCES "public"."exam_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_fixtures" ADD CONSTRAINT "sports_fixtures_venue_id_sports_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."sports_venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sports_teams" ADD CONSTRAINT "sports_teams_sport_category_id_sports_categories_id_fk" FOREIGN KEY ("sport_category_id") REFERENCES "public"."sports_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_disciplinary" ADD CONSTRAINT "student_disciplinary_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_reference_idx" ON "applications" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_roll_number_unique" ON "applications" USING btree ("roll_number") WHERE "applications"."roll_number" is not null;--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_email_idx" ON "applications" USING btree ("student_email");--> statement-breakpoint
CREATE INDEX "applications_mobile_idx" ON "applications" USING btree ("student_mobile");--> statement-breakpoint
CREATE INDEX "application_events_app_idx" ON "application_events" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "app_docs_app_idx" ON "application_documents" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "app_docs_type_idx" ON "application_documents" USING btree ("application_id","doc_type");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_settings_key_unique" ON "admissions_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "test_centres_active_idx" ON "test_centres" USING btree ("active");--> statement-breakpoint
CREATE INDEX "academic_terms_active_idx" ON "academic_terms" USING btree ("active");--> statement-breakpoint
CREATE INDEX "academic_years_active_idx" ON "academic_years" USING btree ("active");--> statement-breakpoint
CREATE INDEX "affiliations_active_idx" ON "affiliations" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "class_academic_years_unique" ON "class_academic_years" USING btree ("class_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "class_academic_years_class_idx" ON "class_academic_years" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_categories_active_idx" ON "class_categories" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "class_sections_unique" ON "class_sections" USING btree ("class_id","section_id");--> statement-breakpoint
CREATE INDEX "class_sections_class_idx" ON "class_sections" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_subjects_unique" ON "class_subjects" USING btree ("class_id","subject_id");--> statement-breakpoint
CREATE INDEX "class_subjects_class_idx" ON "class_subjects" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "classes_active_idx" ON "classes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "classes_category_idx" ON "classes" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "houses_active_idx" ON "houses" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "merit_config_year_class_unique" ON "merit_config" USING btree ("academic_year_id","class_code");--> statement-breakpoint
CREATE INDEX "merit_config_year_idx" ON "merit_config" USING btree ("academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_allocations_app_year_unique" ON "section_allocations" USING btree ("application_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "section_allocations_section_idx" ON "section_allocations" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_allocations_year_idx" ON "section_allocations" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "sections_active_idx" ON "sections" USING btree ("active");--> statement-breakpoint
CREATE INDEX "subjects_active_idx" ON "subjects" USING btree ("active");--> statement-breakpoint
CREATE INDEX "terms_conditions_active_idx" ON "terms_conditions" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_cnic_idx" ON "guardians" USING btree ("cnic");--> statement-breakpoint
CREATE INDEX "guardians_name_idx" ON "guardians" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_att_student_date_idx" ON "student_attendance" USING btree ("student_id","attendance_date");--> statement-breakpoint
CREATE INDEX "student_att_date_idx" ON "student_attendance" USING btree ("attendance_date");--> statement-breakpoint
CREATE INDEX "student_att_class_idx" ON "student_attendance" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "student_att_status_idx" ON "student_attendance" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "students_gr_number_idx" ON "students" USING btree ("gr_number");--> statement-breakpoint
CREATE INDEX "students_application_idx" ON "students" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "students_class_idx" ON "students" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "students_section_idx" ON "students" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "students_house_idx" ON "students" USING btree ("house_id");--> statement-breakpoint
CREATE INDEX "students_year_idx" ON "students" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fee_challans_student_idx" ON "fee_challans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "fee_challans_year_idx" ON "fee_challans" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "fee_challans_status_idx" ON "fee_challans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fee_challans_month_idx" ON "fee_challans" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_schedule_unique" ON "fee_schedule" USING btree ("academic_year_id","class_code","fee_type_id");--> statement-breakpoint
CREATE INDEX "fee_schedule_year_idx" ON "fee_schedule" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "fee_schedule_class_idx" ON "fee_schedule" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "fee_schedule_fee_type_idx" ON "fee_schedule" USING btree ("fee_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_types_code_idx" ON "fee_types" USING btree ("fee_code");--> statement-breakpoint
CREATE INDEX "fee_types_active_idx" ON "fee_types" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "sfo_unique" ON "student_fee_overrides" USING btree ("student_id","fee_type_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "sfo_student_idx" ON "student_fee_overrides" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "sfo_year_idx" ON "student_fee_overrides" USING btree ("academic_year_id");--> statement-breakpoint
CREATE INDEX "emp_bank_emp_idx" ON "employee_bank_accounts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "emp_docs_emp_idx" ON "employee_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "emp_sal_tpl_items_tpl_idx" ON "employee_salary_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emp_sal_tpl_emp_idx" ON "employee_salary_templates" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "emp_sal_tpl_active_idx" ON "employee_salary_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "emp_sal_emp_idx" ON "employee_salary_transactions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "emp_sal_month_idx" ON "employee_salary_transactions" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_staff_id_idx" ON "employees" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "employees_role_idx" ON "employees" USING btree ("role");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_email_idx" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "hr_attendance_emp_idx" ON "hr_attendance" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "hr_attendance_date_idx" ON "hr_attendance" USING btree ("attendance_date");--> statement-breakpoint
CREATE INDEX "hr_attendance_status_idx" ON "hr_attendance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_deduction_types_active_idx" ON "hr_deduction_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hr_departments_active_idx" ON "hr_departments" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hr_designations_active_idx" ON "hr_designations" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hr_designations_dept_idx" ON "hr_designations" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "hr_incentive_types_active_idx" ON "hr_incentive_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hr_leave_emp_idx" ON "hr_leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "hr_leave_status_idx" ON "hr_leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hr_leave_date_idx" ON "hr_leave_requests" USING btree ("from_date");--> statement-breakpoint
CREATE INDEX "hr_salary_grades_active_idx" ON "hr_salary_grades" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hostel_allocations_room_idx" ON "hostel_allocations" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "hostel_allocations_student_idx" ON "hostel_allocations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "hostel_allocations_status_idx" ON "hostel_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hostel_blocks_active_idx" ON "hostel_blocks" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hostel_room_types_active_idx" ON "hostel_room_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "hostel_rooms_block_idx" ON "hostel_rooms" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "hostel_rooms_status_idx" ON "hostel_rooms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transport_drivers_status_idx" ON "transport_drivers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transport_routes_active_idx" ON "transport_routes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "transport_trips_date_idx" ON "transport_trips" USING btree ("trip_date");--> statement-breakpoint
CREATE INDEX "transport_trips_status_idx" ON "transport_trips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transport_trips_route_idx" ON "transport_trips" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "transport_vehicles_active_idx" ON "transport_vehicles" USING btree ("active");--> statement-breakpoint
CREATE INDEX "library_books_active_idx" ON "library_books" USING btree ("active");--> statement-breakpoint
CREATE INDEX "library_books_cat_idx" ON "library_books" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "library_books_pub_idx" ON "library_books" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "library_categories_active_idx" ON "library_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "library_issues_book_idx" ON "library_issues" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "library_issues_student_idx" ON "library_issues" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "library_issues_status_idx" ON "library_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "library_publishers_active_idx" ON "library_publishers" USING btree ("active");--> statement-breakpoint
CREATE INDEX "store_item_categories_active_idx" ON "store_item_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "store_item_categories_parent_idx" ON "store_item_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "store_items_active_idx" ON "store_items" USING btree ("active");--> statement-breakpoint
CREATE INDEX "store_items_cat_idx" ON "store_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "store_transactions_item_idx" ON "store_transactions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "store_transactions_type_idx" ON "store_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "store_transactions_date_idx" ON "store_transactions" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "store_tx_vendor_idx" ON "store_transactions" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "store_units_active_idx" ON "store_units" USING btree ("active");--> statement-breakpoint
CREATE INDEX "medical_conditions_active_idx" ON "medical_conditions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "medical_medicine_categories_active_idx" ON "medical_medicine_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "medical_medicines_active_idx" ON "medical_medicines" USING btree ("active");--> statement-breakpoint
CREATE INDEX "medical_medicines_cat_idx" ON "medical_medicines" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "medical_visits_student_idx" ON "medical_visits" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "medical_visits_date_idx" ON "medical_visits" USING btree ("visit_date");--> statement-breakpoint
CREATE INDEX "medical_visits_status_idx" ON "medical_visits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_subject_assignments_unique" ON "teacher_subject_assignments" USING btree ("employee_id","class_id","subject_id");--> statement-breakpoint
CREATE INDEX "teacher_subject_assignments_emp_idx" ON "teacher_subject_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "teacher_subject_assignments_class_idx" ON "teacher_subject_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "timetable_periods_active_idx" ON "timetable_periods" USING btree ("active");--> statement-breakpoint
CREATE INDEX "timetable_slots_class_idx" ON "timetable_slots" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "timetable_slots_day_idx" ON "timetable_slots" USING btree ("day_of_week");--> statement-breakpoint
CREATE INDEX "timetable_slots_period_idx" ON "timetable_slots" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "syllabus_topics_active_idx" ON "syllabus_topics" USING btree ("active");--> statement-breakpoint
CREATE INDEX "syllabus_topics_unit_idx" ON "syllabus_topics" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "syllabus_units_active_idx" ON "syllabus_units" USING btree ("active");--> statement-breakpoint
CREATE INDEX "syllabus_units_class_idx" ON "syllabus_units" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "syllabus_units_subject_idx" ON "syllabus_units" USING btree ("subject_code");--> statement-breakpoint
CREATE INDEX "exam_grade_bands_active_idx" ON "exam_grade_bands" USING btree ("active");--> statement-breakpoint
CREATE INDEX "exam_grade_bands_scale_idx" ON "exam_grade_bands" USING btree ("grade_scale_id");--> statement-breakpoint
CREATE INDEX "exam_grading_scales_active_idx" ON "exam_grading_scales" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_results_schedule_student_uniq" ON "exam_results" USING btree ("schedule_id","student_id");--> statement-breakpoint
CREATE INDEX "exam_results_schedule_idx" ON "exam_results" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "exam_results_student_idx" ON "exam_results" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "exam_schedules_class_idx" ON "exam_schedules" USING btree ("class_code");--> statement-breakpoint
CREATE INDEX "exam_schedules_session_idx" ON "exam_schedules" USING btree ("session_label");--> statement-breakpoint
CREATE INDEX "exam_types_active_idx" ON "exam_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "sports_categories_active_idx" ON "sports_categories" USING btree ("active");--> statement-breakpoint
CREATE INDEX "sports_fixtures_date_idx" ON "sports_fixtures" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "sports_fixtures_status_idx" ON "sports_fixtures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sports_teams_active_idx" ON "sports_teams" USING btree ("active");--> statement-breakpoint
CREATE INDEX "sports_teams_cat_idx" ON "sports_teams" USING btree ("sport_category_id");--> statement-breakpoint
CREATE INDEX "sports_venues_active_idx" ON "sports_venues" USING btree ("active");--> statement-breakpoint
CREATE INDEX "media_library_uploaded_at_idx" ON "media_library" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "gate_log_type_idx" ON "gate_log" USING btree ("person_type");--> statement-breakpoint
CREATE INDEX "gate_log_in_time_idx" ON "gate_log" USING btree ("in_time");--> statement-breakpoint
CREATE INDEX "gate_outpass_status_idx" ON "gate_outpass" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gate_outpass_gr_idx" ON "gate_outpass" USING btree ("gr_number");--> statement-breakpoint
CREATE INDEX "announcements_active_idx" ON "announcements" USING btree ("active");--> statement-breakpoint
CREATE INDEX "announcements_audience_idx" ON "announcements" USING btree ("target_audience");--> statement-breakpoint
CREATE INDEX "noticeboard_items_active_idx" ON "noticeboard_items" USING btree ("active");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "stu_docs_student_idx" ON "student_documents" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "stu_disc_student_idx" ON "student_disciplinary" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "stu_disc_date_idx" ON "student_disciplinary" USING btree ("student_id","incident_date");--> statement-breakpoint
CREATE UNIQUE INDEX "coa_code_unique" ON "chart_of_accounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coa_type_idx" ON "chart_of_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "coa_parent_idx" ON "chart_of_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "coa_source_module_idx" ON "chart_of_accounts" USING btree ("source_module");--> statement-breakpoint
CREATE INDEX "coa_source_ref_idx" ON "chart_of_accounts" USING btree ("source_ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "je_entry_number_unique" ON "journal_entries" USING btree ("entry_number");--> statement-breakpoint
CREATE INDEX "je_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "je_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "je_type_idx" ON "journal_entries" USING btree ("type");--> statement-breakpoint
CREATE INDEX "je_source_module_idx" ON "journal_entries" USING btree ("source_module");--> statement-breakpoint
CREATE INDEX "je_source_ref_idx" ON "journal_entries" USING btree ("source_ref_id");--> statement-breakpoint
CREATE INDEX "jl_entry_id_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "jl_coa_id_idx" ON "journal_lines" USING btree ("coa_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_type_idx" ON "bank_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "bank_accounts_coa_idx" ON "bank_accounts" USING btree ("coa_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_active_idx" ON "bank_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_code_unique" ON "vendors" USING btree ("vendor_code");--> statement-breakpoint
CREATE INDEX "vendors_name_idx" ON "vendors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vendors_active_idx" ON "vendors" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vendors_coa_idx" ON "vendors" USING btree ("coa_id");