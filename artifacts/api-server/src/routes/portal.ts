import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import crypto from "node:crypto";
import { db, applicationsTable, applicationDocumentsTable, applicationEventsTable, PAYMENT_CONFIG_DEFAULTS, tenantsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { issuePortalToken, requirePortal } from "../lib/portal-auth";
import { putObject } from "../lib/storage";
import { resolvePaymentConfig } from "../lib/payment-config-cache.js";
import { hashPortalPassword, verifyPortalPassword } from "../lib/portal-password.js";
import { loadPrintSettings } from "../lib/print-settings.js";

const router: IRouter = Router();

const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts — please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

const APP_FEE_DUE_DAYS = 7; // days from application date

const STANDARD_DOCS = [
  "Birth Certificate",
  "B-Form (Child CNIC)",
  "School Leaving Cert",
  "Student Photo",
  "Medical Fitness Cert",
];

function challanNo(referenceId: string, year: number) {
  return `CCM-${year}-CH-${referenceId.slice(-6)}`;
}

function dueDateStr(createdAt: Date, daysAfter: number): string {
  const d = new Date(createdAt.getTime() + daysAfter * 86_400_000);
  return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
}

async function buildPortalUser(app: typeof applicationsTable.$inferSelect) {
  const [docs, payConfig, tenantRows, printSettings] = await Promise.all([
    db
      .select()
      .from(applicationDocumentsTable)
      .where(eq(applicationDocumentsTable.applicationId, app.id)),
    app.tenantId ? resolvePaymentConfig(app.tenantId) : Promise.resolve({ ...PAYMENT_CONFIG_DEFAULTS }),
    app.tenantId
      ? db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, app.tenantId))
      : Promise.resolve([] as { name: string }[]),
    loadPrintSettings(app.tenantId ?? undefined),
  ]);

  const docMap: Record<string, { uploaded: boolean; verified: boolean; rejected: boolean; rejection_reason?: string }> = {};
  for (const docType of STANDARD_DOCS) {
    const found = docs.find((d) => d.docType === docType);
    docMap[docType] = found
      ? {
          uploaded: true,
          verified: found.status === "verified",
          rejected: found.status === "rejected",
          rejection_reason: found.rejectionReason ?? undefined,
        }
      : { uploaded: false, verified: false, rejected: false };
  }

  const year = app.createdAt.getFullYear();

  const school_name = tenantRows[0]?.name ?? "";
  const show_institute_name = printSettings.showInstituteName ?? true;

  return {
    ref_id: app.referenceId,
    name: app.fullName,
    school_name,
    show_institute_name,
    fullName: app.fullName,
    full_name: app.fullName,
    email: app.studentEmail,
    phone: app.studentMobile,
    father_name: app.fatherName,
    mother_name: app.motherName ?? null,
    guardian_mobile: app.guardianMobile,
    guardian_email: app.guardianEmail ?? null,
    alternate_phone: app.alternatePhone ?? null,
    nationality: app.nationality ?? null,
    domicile: app.domicile ?? null,
    date_of_birth: app.dateOfBirth,
    blood_group: app.bloodGroup,
    class_applying: app.classApplying,
    session: app.session,
    address: app.presentAddress,
    city: app.city,
    state: app.state,
    exam_center: app.examCenter,
    status: app.status,
    roll_no: app.rollNumber ?? null,
    test_date: app.testDate ? app.testDate.toISOString() : null,
    test_time: app.testTime ?? null,
    test_venue: app.testVenue ?? null,
    test_center_address: app.testCenterAddress ?? null,
    test_focal_person: app.testFocalPerson ?? null,
    interview_date: app.interviewDate ? app.interviewDate.toISOString() : null,
    interview_time: app.interviewTime ?? null,
    interview_venue: app.interviewVenue ?? null,
    interview_marks: app.interviewMarks ?? null,
    marks: app.resultMarks ?? null,
    total_marks: 200,
    merit: app.meritRank ?? null,
    result_status: (app.resultStatus as "selected" | "wait_listed" | "not_selected" | null) ?? null,
    subjects: app.resultMarks
      ? {
          English:       { obtained: Math.round((app.resultMarks * 47) / 190), total: 50 },
          Mathematics:   { obtained: Math.round((app.resultMarks * 48) / 190), total: 50 },
          Urdu:          { obtained: Math.round((app.resultMarks * 28) / 190), total: 30 },
          Science:       { obtained: Math.round((app.resultMarks * 29) / 190), total: 30 },
          "IQ / Verbal": { obtained: Math.round((app.resultMarks * 38) / 190), total: 40 },
        }
      : null,
    fee: {
      challan_no:           challanNo(app.referenceId, year),
      amount:               payConfig.applicationFeeAmount,
      bank:                 payConfig.bankName,
      bank_branch:          payConfig.bankBranch || undefined,
      account_title:        payConfig.accountTitle || undefined,
      account:              payConfig.accountNumber,
      challan_instructions: payConfig.challanInstructions || undefined,
      due_date:             dueDateStr(app.createdAt, APP_FEE_DUE_DAYS),
      status:               app.feeStatus as "paid" | "pending",
      bank_reference:       app.feeBankRef ?? null,
    },
    admission_fee: {
      amount:         payConfig.admissionFeeAmount,
      status:         app.admissionFeeStatus as "paid" | "pending",
      bank_reference: app.admissionFeeBankRef ?? null,
    },
    application_fee_enabled: payConfig.applicationFeeEnabled,
    payment_methods: {
      enable_bank_deposit: payConfig.enableBankDeposit,
      enable_jazzcash:     payConfig.enableJazzcash,
      enable_payfast:      payConfig.enablePayfast,
    },
    docs: docMap,
    joining_date: app.joiningDate ?? null,
    fee_deadline: app.feeDeadline ?? null,
    offer_date: app.offerDate ?? null,
    candidate_accepted: app.candidateAcceptedAt !== null,
    submitted_at: app.createdAt ? app.createdAt.toISOString() : null,
    verified_at: null,
    result_announced_at: app.status === "result_announced" || app.status === "interview_scheduled" || app.status === "interview_taken" || app.status === "admitted"
      ? (app.updatedAt ?? app.createdAt).toISOString()
      : null,
  };
}

// ── POST /portal/login ────────────────────────────────────────────────────────
router.post("/portal/login", portalLoginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const u = (username as string).trim().toLowerCase();

  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(
        eq(
          u.includes("@") ? applicationsTable.studentEmail : applicationsTable.studentMobile,
          u,
        ),
      )
      .limit(1);

    const app = apps[0];

    if (!app) {
      return res.status(401).json({ error: "Invalid credentials. Check your email/phone and password." });
    }

    const { valid } = await verifyPortalPassword(password as string, app.portalPassword);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials. Check your email/phone and password." });
    }

    const { token, expiresAt } = issuePortalToken({
      referenceId: app.referenceId,
      applicationId: app.id,
      email: app.studentEmail,
    });

    const user = await buildPortalUser(app);

    return res.json({ token, expiresAt: expiresAt.toISOString(), user });
  } catch (err) {
    req.log?.error?.({ err }, "Portal login error");
    return res.status(500).json({ error: "Login failed" });
  }
});

// ── GET /portal/me ────────────────────────────────────────────────────────────
router.get("/portal/me", requirePortal, async (req: Request, res: Response) => {
  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);

    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });

    return res.json(await buildPortalUser(app));
  } catch (err) {
    req.log?.error?.({ err }, "Portal /me error");
    return res.status(500).json({ error: "Failed to load your data" });
  }
});

// ── PATCH /portal/password ────────────────────────────────────────────────────
router.patch("/portal/password", requirePortal, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" });
  }
  if ((newPassword as string).length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });
    const { valid } = await verifyPortalPassword(currentPassword as string, app.portalPassword);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const newHash = await hashPortalPassword(newPassword as string);
    await db
      .update(applicationsTable)
      .set({ portalPassword: newHash })
      .where(eq(applicationsTable.id, app.id));
    return res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "Portal password change error");
    return res.status(500).json({ error: "Failed to update password" });
  }
});

// ── POST /portal/fee/submit ───────────────────────────────────────────────────
// Body: { bankReference: string, paymentDate?: string, receiptBase64?: string, receiptMime?: string, receiptName?: string }
router.post("/portal/fee/submit", requirePortal, async (req: Request, res: Response) => {
  const { bankReference, paymentDate, receiptBase64, receiptMime, receiptName } = req.body as {
    bankReference?: string;
    paymentDate?: string;
    receiptBase64?: string;
    receiptMime?: string;
    receiptName?: string;
  };

  if (!bankReference || !(bankReference as string).trim()) {
    return res.status(400).json({ error: "Bank reference number is required" });
  }

  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (app.feeStatus === "paid") {
      return res.status(400).json({ error: "Fee is already confirmed as paid" });
    }

    let storedReceiptName: string | undefined;
    if (receiptBase64 && receiptMime) {
      const ext = (receiptName as string)?.split(".").pop() ?? "bin";
      const key = `fee-receipt-${app.id}-${crypto.randomUUID()}.${ext}`;
      const buf = Buffer.from(receiptBase64 as string, "base64");
      if (buf.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "Receipt file exceeds 5 MB limit" });
      }
      storedReceiptName = await putObject(key, buf, receiptMime as string);
    }

    await db
      .update(applicationsTable)
      .set({
        feeBankRef: (bankReference as string).trim(),
        feeSubmittedAt: new Date(),
        ...(storedReceiptName ? { feeReceiptUrl: storedReceiptName } : {}),
      })
      .where(eq(applicationsTable.id, app.id));

    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "fee_submitted",
      title: "Fee Payment Reference Submitted",
      description: `Bank reference: ${(bankReference as string).trim()}. Awaiting confirmation from the admissions office.`,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "Portal fee submit error");
    return res.status(500).json({ error: "Failed to submit fee reference" });
  }
});

// ── POST /portal/documents/upload ────────────────────────────────────────────
// Body: { docType: string, fileBase64: string, mimeType: string, originalName: string }
router.post("/portal/documents/upload", requirePortal, async (req: Request, res: Response) => {
  const { docType, fileBase64, mimeType, originalName } = req.body as {
    docType?: string;
    fileBase64?: string;
    mimeType?: string;
    originalName?: string;
  };

  if (!docType || !STANDARD_DOCS.includes(docType as string)) {
    return res.status(400).json({ error: "Invalid document type" });
  }
  if (!fileBase64 || !mimeType || !originalName) {
    return res.status(400).json({ error: "File data is required" });
  }

  const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
  if (!allowed.includes(mimeType as string)) {
    return res.status(400).json({ error: "Only JPG, PNG, and PDF files are accepted" });
  }

  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });

    const buf = Buffer.from(fileBase64 as string, "base64");
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 5 MB limit" });
    }

    const ext = (originalName as string).split(".").pop() ?? "bin";
    const key = `portal-docs/doc-${app.id}-${crypto.randomUUID()}.${ext}`;
    const { putPrivateObject } = await import("../lib/storage");
    const storedName = await putPrivateObject(key, buf, mimeType as string);

    const existing = await db
      .select()
      .from(applicationDocumentsTable)
      .where(
        and(
          eq(applicationDocumentsTable.applicationId, app.id),
          eq(applicationDocumentsTable.docType, docType as string),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(applicationDocumentsTable)
        .set({
          originalName: originalName as string,
          storedName,
          mimeType: mimeType as string,
          fileSize: buf.length,
          status: "pending",
          rejectionReason: null,
          uploadedAt: new Date(),
        })
        .where(eq(applicationDocumentsTable.id, existing[0].id));
    } else {
      await db.insert(applicationDocumentsTable).values({
        applicationId: app.id,
        docType: docType as string,
        originalName: originalName as string,
        storedName,
        mimeType: mimeType as string,
        fileSize: buf.length,
        status: "pending",
      });
    }

    return res.json({ success: true, docType });
  } catch (err) {
    req.log?.error?.({ err }, "Portal doc upload error");
    return res.status(500).json({ error: "Failed to upload document" });
  }
});

// ── GET /portal/documents/:docType/download ───────────────────────────────────
// Returns a short-lived signed URL redirect so the candidate can view their
// own uploaded document without exposing the object key publicly.
router.get("/portal/documents/:docType/download", requirePortal, async (req: Request, res: Response) => {
  try {
    const docType = String(req.params.docType);
    const [app] = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    if (!app) return res.status(404).json({ error: "Application not found" });
    const [doc] = await db
      .select()
      .from(applicationDocumentsTable)
      .where(and(eq(applicationDocumentsTable.applicationId, app.id), eq(applicationDocumentsTable.docType, docType)))
      .limit(1);
    if (!doc?.storedName) return res.status(404).json({ error: "Document not found" });
    const { resolvePrivateDownloadUrl } = await import("../lib/storage");
    // legacyPrefix="" because old portal docs lived at /uploads/<filename> (no subdir)
    let url = await resolvePrivateDownloadUrl(doc.storedName, "", 300);
    if (!url) return res.status(404).json({ error: "Document not found" });
    if (url.startsWith("/uploads/")) {
      const token = (req.query["token"] as string | undefined) ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (token) url = `${url}?token=${encodeURIComponent(token)}`;
    }
    return res.redirect(302, url);
  } catch (err) {
    req.log?.error?.({ err }, "Portal document download error");
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
});

// ── POST /portal/admission-fee/submit ────────────────────────────────────────
router.post("/portal/admission-fee/submit", requirePortal, async (req: Request, res: Response) => {
  const { bankReference, paymentDate } = req.body as { bankReference?: string; paymentDate?: string };
  if (!bankReference || !(bankReference as string).trim()) {
    return res.status(400).json({ error: "Bank reference number is required" });
  }
  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (!app.candidateAcceptedAt) {
      return res.status(400).json({ error: "You must accept the offer before submitting the admission fee" });
    }
    if (app.admissionFeeStatus === "paid") {
      return res.status(400).json({ error: "Admission fee is already confirmed as paid" });
    }

    await db
      .update(applicationsTable)
      .set({ admissionFeeBankRef: (bankReference as string).trim() })
      .where(eq(applicationsTable.id, app.id));

    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "admission_fee_submitted",
      title: "Admission Fee Reference Submitted",
      description: `Bank reference: ${(bankReference as string).trim()}. Awaiting confirmation from the admissions office.`,
    });

    return res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "Portal admission fee submit error");
    return res.status(500).json({ error: "Failed to submit admission fee reference" });
  }
});

// ── POST /portal/accept ───────────────────────────────────────────────────────
router.post("/portal/accept", requirePortal, async (req: Request, res: Response) => {
  try {
    const apps = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, req.portalUser!.referenceId))
      .limit(1);
    const app = apps[0];
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (app.status !== "admitted") {
      return res.status(400).json({ error: "Acceptance is only available for admitted candidates" });
    }
    if (app.candidateAcceptedAt) {
      return res.status(400).json({ error: "You have already accepted the offer" });
    }

    const now = new Date();
    await db
      .update(applicationsTable)
      .set({ candidateAcceptedAt: now })
      .where(eq(applicationsTable.id, app.id));

    await db.insert(applicationEventsTable).values({
      applicationId: app.id,
      eventType: "offer_accepted",
      title: "Offer Letter Accepted",
      description: "Candidate confirmed acceptance of the offer of admission. Admission fee challan will be issued shortly.",
      occurredAt: now,
    });

    return res.json({ success: true, acceptedAt: now.toISOString() });
  } catch (err) {
    req.log?.error?.({ err }, "Portal accept error");
    return res.status(500).json({ error: "Failed to record acceptance" });
  }
});

export default router;
