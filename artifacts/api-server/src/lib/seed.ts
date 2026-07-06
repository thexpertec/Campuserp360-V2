import { db, applicationsTable, applicationEventsTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { hashPasswordSync } from "./admin-auth.js";

const DEMO_REF_ID = "CCM-2026-DEMO01";
const DEFAULT_SLUG = (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase();

type AppInsert = typeof applicationsTable.$inferInsert;
type EventInsert = typeof applicationEventsTable.$inferInsert;

async function resolveCcmTenantId(): Promise<string | null> {
  const [row] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, DEFAULT_SLUG))
    .limit(1);
  return row?.id ?? null;
}

async function seedPortalAccount(account: AppInsert, events: Omit<EventInsert, "applicationId">[]): Promise<void> {
  const existing = await db
    .select({ id: applicationsTable.id })
    .from(applicationsTable)
    .where(eq(applicationsTable.referenceId, account.referenceId!))
    .limit(1);

  if (existing.length > 0) return;

  const rawPw = account.portalPassword ?? "12345";
  const portalPassword = rawPw.startsWith("$2") ? rawPw : hashPasswordSync(rawPw);

  const [inserted] = await db
    .insert(applicationsTable)
    .values({ ...account, portalPassword })
    .returning({ id: applicationsTable.id });

  if (inserted && events.length > 0) {
    await db.insert(applicationEventsTable).values(
      events.map((e) => ({ ...e, applicationId: inserted.id })),
    );
  }
  logger.info({ refId: account.referenceId }, "Portal demo account seeded");
}

export async function seedDemoApplication(): Promise<void> {
  try {
    const now = new Date();
    const d = (n: number) => new Date(now.getTime() - n * 86_400_000);

    const tenantId = await resolveCcmTenantId();

    // ── Portal demo account: Hamza — admitted / selected / merit #1 ──────
    await seedPortalAccount(
      {
        referenceId: "CCM-2026-HMZ001",
        tenantId: tenantId ?? undefined,
        session: "2026-27", classApplying: "Class VI", previousMarks: "95",
        fullName: "Muhammad Hamza Iqbal",
        dateOfBirth: "15 March 2012", bloodGroup: "B+", religion: "Islam",
        studentMobile: "03001234567", studentEmail: "hamza@example.com",
        presentAddress: "House 45, Street 7, G-10/2, Islamabad",
        state: "Islamabad Capital Territory", city: "Islamabad", examCenter: "Islamabad",
        guardianName: "Mr. Iqbal Ahmed", relation: "Father", fatherName: "Iqbal Ahmed",
        occupation: "Engineer", guardianMobile: "0300-1234567",
        parentCnic: "61101-1234567-1230", parentCnicLast4: "1230",
        portalPassword: "12345",
        status: "admitted",
        rollNumber: "CCM-VI-001",
        testDate: new Date("2026-05-12T08:00:00Z"),
        testTime: "08:00 AM",
        testVenue: "Government College, Islamabad",
        testCenterAddress: "Sector G-9/4, Islamabad",
        testFocalPerson: "0300-9543823",
        resultMarks: 190, resultStatus: "selected", meritRank: 1, meritScore: 95,
        interviewDate: new Date("2026-05-20T09:00:00Z"),
        interviewTime: "09:00 AM",
        interviewVenue: "CCM Main Campus, Murree",
        interviewMarks: 28,
        feeStatus: "paid", feeBankRef: "TXN-20260428-00101",
        feeConfirmedAt: d(34),
        offerDate: "28 May 2026", feeDeadline: "10 June 2026", joiningDate: "15 June 2026",
        candidateAcceptedAt: d(3),
        createdAt: d(45),
      },
      [
        { eventType: "received", title: "Application Received", description: "Application submitted via the online portal.", occurredAt: d(45) },
        { eventType: "verified", title: "Documents Verified", description: "Admissions office reviewed and verified submitted documents.", occurredAt: d(40) },
        { eventType: "test_scheduled", title: "Entry Test Scheduled", description: "Roll number CCM-VI-001 issued. Test on 12 May 2026 at 08:00 AM — Government College, Islamabad.", occurredAt: d(38) },
        { eventType: "result_announced", title: "Result Announced", description: "Entry test marks: 190/200. Merit rank: 1. You have been selected!", occurredAt: d(22) },
        { eventType: "interview_scheduled", title: "Interview Scheduled", description: "Interview scheduled for 20 May 2026 at 09:00 AM at CCM Main Campus, Murree.", occurredAt: d(20) },
        { eventType: "interview_taken", title: "Interview Conducted", description: "Interview completed. Marks obtained: 28/30.", occurredAt: d(13) },
        { eventType: "admitted", title: "Offer Letter Issued", description: "Congratulations! You have been provisionally selected as a Cadet. Please confirm acceptance and pay the admission fee.", occurredAt: d(5) },
        { eventType: "offer_accepted", title: "Offer Letter Accepted", description: "Candidate confirmed acceptance of the offer of admission.", occurredAt: d(3) },
      ],
    );

    // ── Portal demo account: Ali — test scheduled ─────────────────────────
    await seedPortalAccount(
      {
        referenceId: "CCM-2026-ALI002",
        tenantId: tenantId ?? undefined,
        session: "2026-27", classApplying: "Class VI", previousMarks: "82",
        fullName: "Ali Abdullah Khan",
        dateOfBirth: "22 July 2012", bloodGroup: "A+", religion: "Islam",
        studentMobile: "03009876543", studentEmail: "ali@example.com",
        presentAddress: "Flat 12, Block C, DHA Phase 2, Lahore",
        state: "Punjab", city: "Lahore", examCenter: "Lahore",
        guardianName: "Mr. Tariq Mehmood Khan", relation: "Father", fatherName: "Tariq Mehmood Khan",
        occupation: "Businessman", guardianMobile: "0301-9876543",
        parentCnic: "35202-9876543-2", parentCnicLast4: "9876",
        portalPassword: "12345",
        status: "test_scheduled",
        rollNumber: "CCM-VI-002",
        testDate: new Date("2026-05-12T08:00:00Z"),
        testTime: "08:00 AM",
        testVenue: "Government College, Lahore",
        testCenterAddress: "Phase 2, DHA, Lahore Cantt, Lahore",
        testFocalPerson: "0304-1111024",
        feeStatus: "pending",
        createdAt: d(35),
      },
      [
        { eventType: "received", title: "Application Received", description: "Application submitted via the online portal.", occurredAt: d(35) },
        { eventType: "verified", title: "Documents Verified", description: "Admissions office reviewed and verified submitted documents.", occurredAt: d(28) },
        { eventType: "test_scheduled", title: "Entry Test Scheduled", description: "Roll number CCM-VI-002 issued. Test on 12 May 2026 at 08:00 AM — Government College, Lahore.", occurredAt: d(25) },
      ],
    );

    // ── Portal demo account: Fawad — not selected ─────────────────────────
    await seedPortalAccount(
      {
        referenceId: "CCM-2026-FAW015",
        tenantId: tenantId ?? undefined,
        session: "2026-27", classApplying: "Class IX", previousMarks: "58",
        fullName: "Fawad Kashmiri",
        dateOfBirth: "5 November 2011", bloodGroup: "O-", religion: "Islam",
        studentMobile: "03121112233", studentEmail: "fawad@example.com",
        presentAddress: "Chak 22, Rahim Yar Khan",
        state: "Punjab", city: "Rahim Yar Khan", examCenter: "Multan",
        guardianName: "Mr. Saleem Kashmiri", relation: "Father", fatherName: "Saleem Kashmiri",
        occupation: "Farmer", guardianMobile: "0313-1112233",
        parentCnic: "36302-1112233-9", parentCnicLast4: "1122",
        portalPassword: "12345",
        status: "result_announced",
        rollNumber: "CCM-IX-015",
        testDate: new Date("2026-05-12T08:00:00Z"),
        testTime: "08:00 AM",
        testVenue: "Bahauddin Zakariya University, Multan",
        testCenterAddress: "Bosan Road, Multan",
        testFocalPerson: "0304-1111024",
        resultMarks: 92, resultStatus: "not_selected", meritRank: 15, meritScore: 46,
        feeStatus: "paid", feeBankRef: "TXN-20260428-00215",
        feeConfirmedAt: d(34),
        createdAt: d(40),
      },
      [
        { eventType: "received", title: "Application Received", description: "Application submitted via the online portal.", occurredAt: d(40) },
        { eventType: "verified", title: "Documents Verified", description: "Admissions office reviewed and verified submitted documents.", occurredAt: d(35) },
        { eventType: "test_scheduled", title: "Entry Test Scheduled", description: "Roll number CCM-IX-015 issued. Test on 12 May 2026 at 08:00 AM — BZU, Multan.", occurredAt: d(30) },
        { eventType: "result_announced", title: "Result Announced", description: "Entry test marks: 92/200. Merit rank: 15. We regret to inform you that you have not been selected in this round.", occurredAt: d(10) },
      ],
    );

    // ── Original CCM-2026-DEMO01 admin demo account ───────────────────────
    const existing = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, DEMO_REF_ID))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ refId: DEMO_REF_ID }, "Demo application already seeded");
      return;
    }

    const inThreeWeeks = new Date(now.getTime() + 21 * 86_400_000);
    inThreeWeeks.setHours(9, 0, 0, 0);

    const [app] = await db
      .insert(applicationsTable)
      .values({
        referenceId: DEMO_REF_ID,
        tenantId: tenantId ?? undefined,
        session: "Active 2026", classApplying: "class-9", previousMarks: "87",
        fullName: "Ahmed Khan",
        dateOfBirth: "2011-04-18", bloodGroup: "B+", religion: "Islam",
        studentMobile: "0300-1234567", studentEmail: "ahmed.khan.demo@example.com",
        presentAddress: "House 14, Street 8, F-10/2, Islamabad",
        state: "Islamabad Capital Territory", city: "Islamabad", examCenter: "Islamabad",
        guardianName: "Mr. Asif Khan", relation: "Father", fatherName: "Mr. Asif Khan",
        occupation: "Civil Engineer", guardianMobile: "0321-9876543",
        parentCnic: "61101-1234567-1234", parentCnicLast4: "1234",
        portalPassword: "demo123",
        status: "test_scheduled",
        rollNumber: "CCM-2026-0421",
        testDate: inThreeWeeks,
        testTime: "08:30 AM",
        testVenue: "Government College, Islamabad",
        testCenterAddress: "G-9/4, Islamabad",
        feeStatus: "paid",
        createdAt: d(10),
      })
      .returning({ id: applicationsTable.id });

    if (!app) throw new Error("Failed to insert demo application");

    await db.insert(applicationEventsTable).values([
      { applicationId: app.id, eventType: "received", title: "Application Received", description: "Your application was submitted successfully via the online portal.", occurredAt: d(10) },
      { applicationId: app.id, eventType: "verified", title: "Documents Verified", description: "Admissions office reviewed and verified your submitted documents.", occurredAt: d(5) },
      { applicationId: app.id, eventType: "test_scheduled", title: "Entry Test Scheduled", description: "Roll number CCM-2026-0421 has been issued. Reporting time: 8:30 AM at Islamabad Exam Centre.", occurredAt: d(2) },
    ]);

    logger.info({ refId: DEMO_REF_ID }, "Demo application seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed demo application");
  }
}
