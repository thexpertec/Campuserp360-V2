import { pgTable, uuid, text, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { testCentresTable } from "./testCentres";


export const applicationsTable = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceId: text("reference_id").notNull(),

    // Academic
    session: text("session").notNull(),
    classApplying: text("class_applying").notNull(),
    previousMarks: text("previous_marks").notNull(),
    lastClass: text("last_class"),
    yearOfLastResult: text("year_of_last_result"),
    docVerificationStatus: text("doc_verification_status").notNull().default("not_verified"),

    // Student personal
    fullName: text("full_name").notNull().default(""),
    gender: text("gender"),                     // male | female | other | null
    dateOfBirth: text("date_of_birth").notNull(),
    bloodGroup: text("blood_group").notNull().default(""),
    religion: text("religion"),
    photoFilename: text("photo_filename"),

    // Student contact
    studentMobile: text("student_mobile").notNull().default(""),
    studentEmail: text("student_email").notNull().default(""),
    presentAddress: text("present_address").notNull(),
    state: text("state").notNull().default(""),
    city: text("city").notNull().default(""),
    examCenter: text("exam_center").notNull().default(""),

    // Student identity document
    studentBForm: text("student_b_form"),

    // Student — additional personal info
    nationality: text("nationality"),
    domicile: text("domicile"),
    motherName: text("mother_name"),

    // Guardian
    guardianName: text("guardian_name").notNull(),
    relation: text("relation").notNull().default(""),
    fatherName: text("father_name").notNull(),
    occupation: text("occupation"),
    guardianMobile: text("guardian_mobile").notNull(),
    guardianEmail: text("guardian_email"),
    alternatePhone: text("alternate_phone"),
    parentCnic: text("parent_cnic").notNull(),
    parentCnicLast4: text("parent_cnic_last4").notNull(),

    // Portal auth
    portalPassword: text("portal_password").notNull().default("12345"),

    // Lifecycle status
    status: text("status").notNull().default("received"),

    // Source: how the application was submitted
    source: text("source").notNull().default("online_admission"),

    // Test details
    rollNumber: text("roll_number"),
    testDate: timestamp("test_date", { withTimezone: true }),
    testTime: text("test_time"),
    testVenue: text("test_venue"),
    testCenterAddress: text("test_center_address"),
    testFocalPerson: text("test_focal_person"),
    testCentreId: uuid("test_centre_id").references(() => testCentresTable.id, { onDelete: "set null" }),

    // Result
    resultMarks: integer("result_marks"),
    resultStatus: text("result_status"),  // selected | wait_listed | not_selected
    meritScore: real("merit_score"),      // weighted composite score (decimal)
    meritRank: integer("merit_rank"),     // rank position in merit list

    // Interview
    interviewDate: timestamp("interview_date", { withTimezone: true }),
    interviewTime: text("interview_time"),
    interviewVenue: text("interview_venue"),
    interviewVenueId: uuid("interview_venue_id").references(() => testCentresTable.id, { onDelete: "set null" }),
    interviewMarks: integer("interview_marks"),
    interviewResult: text("interview_result"),   // pass | fail | pending | null
    interviewedBy: text("interviewed_by"),

    // Interview performa — per-criterion scores (10 marks each, 60 total)
    scoreAppearance:  integer("score_appearance"),
    scorePhysical:    integer("score_physical"),
    scoreConfidence:  integer("score_confidence"),
    scoreSpoken:      integer("score_spoken"),
    scoreEnglish:     integer("score_english"),
    scoreGenKnow:     integer("score_gen_know"),

    // Application fee (processing fee, paid before test)
    feeStatus: text("fee_status").notNull().default("pending"),
    paymentMethod: text("payment_method"),  // bank_deposit | jazzcash | payfast | simulate | free
    feeBankRef: text("fee_bank_ref"),
    feeReceiptUrl: text("fee_receipt_url"),
    feePaidAmount: integer("fee_paid_amount"),  // actual amount received (PKR), set on cash recording
    feeSubmittedAt: timestamp("fee_submitted_at", { withTimezone: true }),
    feeConfirmedAt: timestamp("fee_confirmed_at", { withTimezone: true }),

    // Admission fee (paid after offer accepted)
    admissionFeeStatus: text("admission_fee_status").notNull().default("pending"),
    admissionFeeBankRef: text("admission_fee_bank_ref"),
    admissionFeeConfirmedAt: timestamp("admission_fee_confirmed_at", { withTimezone: true }),

    // Admission fee verification audit (verify / reject / revert workflow)
    admissionFeeVerifiedById: text("admission_fee_verified_by_id"),
    admissionFeeVerifiedByName: text("admission_fee_verified_by_name"),
    admissionFeeActionAt: timestamp("admission_fee_action_at", { withTimezone: true }),
    admissionFeeRejectionReason: text("admission_fee_rejection_reason"),
    admissionFeeVerifiedAmount: integer("admission_fee_verified_amount"),

    // Offer & joining
    offerDate: text("offer_date"),
    feeDeadline: text("fee_deadline"),
    joiningDate: text("joining_date"),
    candidateAcceptedAt: timestamp("candidate_accepted_at", { withTimezone: true }),

    // Multi-tenancy: set when application belongs to a specific tenant (null = global/CCM)
    tenantId: uuid("tenant_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    refIdx: uniqueIndex("applications_reference_tenant_idx").on(t.tenantId, t.referenceId),
    tenantIdx: index("applications_tenant_idx").on(t.tenantId),
    rollNumberUnique: uniqueIndex("applications_roll_number_unique")
      .on(t.rollNumber)
      .where(sql`${t.rollNumber} is not null`),
    statusIdx: index("applications_status_idx").on(t.status),
    classIdx: index("applications_class_idx").on(t.classApplying),
    sessionIdx: index("applications_session_idx").on(t.session),
    statusClassIdx: index("applications_status_class_idx").on(t.status, t.classApplying),
    emailIdx: index("applications_email_idx").on(t.studentEmail),
    mobileIdx: index("applications_mobile_idx").on(t.studentMobile),
    bformIdx: index("applications_bform_idx").on(t.tenantId, t.studentBForm),
    cnicLast4Idx: index("applications_cnic_last4_idx").on(t.tenantId, t.parentCnicLast4),
    testCentreIdx: index("applications_test_centre_idx").on(t.testCentreId),
  }),
);

export const insertApplicationSchema = createInsertSchema(applicationsTable).omit({
  id: true,
  referenceId: true,
  parentCnicLast4: true,
  portalPassword: true,
  status: true,
  rollNumber: true,
  testDate: true,
  testTime: true,
  testVenue: true,
  testCenterAddress: true,
  testFocalPerson: true,
  testCentreId: true,
  resultMarks: true,
  resultStatus: true,
  meritScore: true,
  meritRank: true,
  interviewDate: true,
  interviewTime: true,
  interviewVenue: true,
  interviewVenueId: true,
  interviewMarks: true,
  scoreAppearance: true,
  scorePhysical: true,
  scoreConfidence: true,
  scoreSpoken: true,
  scoreEnglish: true,
  scoreGenKnow: true,
  feeStatus: true,
  feeBankRef: true,
  feeSubmittedAt: true,
  feeConfirmedAt: true,
  admissionFeeStatus: true,
  admissionFeeBankRef: true,
  admissionFeeConfirmedAt: true,
  admissionFeeVerifiedById: true,
  admissionFeeVerifiedByName: true,
  admissionFeeActionAt: true,
  admissionFeeRejectionReason: true,
  admissionFeeVerifiedAmount: true,
  offerDate: true,
  feeDeadline: true,
  joiningDate: true,
  candidateAcceptedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
