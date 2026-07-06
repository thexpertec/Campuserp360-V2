import {
  db,
  academicYearsTable,
  classCategoriesTable,
  classesTable,
  classAcademicYearsTable,
  sectionsTable,
  housesTable,
  academicTermsTable,
  affiliationsTable,
  termsConditionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Class codes here MUST match the stable strings stored in applications
// (applications.classApplying) and the public website / portal label maps.
const CLASS_SEED: {
  code: string;
  name: string;
  category: string;
  feeType: string;
  eligibility: string;
  seats: number;
}[] = [
  { code: "class-7", name: "Class VII", category: "Cadet Wing", feeType: "Boarding", eligibility: "Passed Class VI", seats: 60 },
  { code: "class-8", name: "Class VIII", category: "Cadet Wing", feeType: "Boarding", eligibility: "Passed Class VII", seats: 40 },
  { code: "class-9", name: "Class IX", category: "Cadet Wing", feeType: "Boarding", eligibility: "Passed Class VIII", seats: 100 },
  { code: "class-11-premedical", name: "Class XI (Pre-Medical)", category: "College Wing", feeType: "Boarding", eligibility: "Passed Matric (Science)", seats: 50 },
  { code: "class-11-preengineering", name: "Class XI (Pre-Engineering)", category: "College Wing", feeType: "Boarding", eligibility: "Passed Matric (Science)", seats: 50 },
  { code: "class-11-ics", name: "Class XI (ICS)", category: "College Wing", feeType: "Boarding", eligibility: "Passed Matric", seats: 30 },
];

export async function seedAcademic(): Promise<void> {
  try {
    // ── Academic years (current + next) ──────────────────────────────────────
    const existingYears = await db.select().from(academicYearsTable);
    let years = existingYears;
    if (existingYears.length === 0) {
      years = await db
        .insert(academicYearsTable)
        .values([
          { name: "2026-2027", active: true, isDefault: true,  sortOrder: 0 },
          { name: "2027-2028", active: true, isDefault: false, sortOrder: 1 },
        ])
        .returning();
      logger.info("Seeded academic years");
    } else {
      const hasDefault = (existingYears as any[]).some(y => y.isDefault);
      if (!hasDefault) {
        const first = [...existingYears].sort((a: any, b: any) => a.sortOrder - b.sortOrder)[0];
        if (first) {
          await db.update(academicYearsTable)
            .set({ isDefault: true } as any)
            .where(eq(academicYearsTable.id, first.id));
          logger.info({ id: first.id, name: (first as any).name }, "Backfilled default academic year");
        }
      }
    }

    // ── Class categories ─────────────────────────────────────────────────────
    const existingCategories = await db.select().from(classCategoriesTable);
    let categories = existingCategories;
    if (existingCategories.length === 0) {
      categories = await db
        .insert(classCategoriesTable)
        .values([
          { name: "Cadet Wing", active: true, sortOrder: 0 },
          { name: "College Wing", active: true, sortOrder: 1 },
        ])
        .returning();
      logger.info("Seeded class categories");
    }
    const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

    // ── Classes (+ link to the current academic year) ────────────────────────
    const existingClasses = await db.select().from(classesTable);
    if (existingClasses.length === 0) {
      const inserted = await db
        .insert(classesTable)
        .values(
          CLASS_SEED.map((c, i) => ({
            code: c.code,
            name: c.name,
            categoryId: categoryByName.get(c.category) ?? null,
            feeType: c.feeType,
            eligibility: c.eligibility,
            seats: c.seats,
            active: true,
            sortOrder: i,
          })),
        )
        .returning();
      logger.info("Seeded classes");

      // Offer every seeded class in both seeded academic years.
      if (years.length > 0) {
        await db.insert(classAcademicYearsTable).values(
          inserted.flatMap((cls) =>
            years.map((y) => ({ classId: cls.id, academicYearId: y.id })),
          ),
        );
        logger.info("Linked classes to academic years");
      }
    }

    // ── Sections ─────────────────────────────────────────────────────────────
    const existingSections = await db.select().from(sectionsTable);
    if (existingSections.length === 0) {
      await db.insert(sectionsTable).values([
        { name: "A", capacity: 40, active: true, sortOrder: 0 },
        { name: "B", capacity: 40, active: true, sortOrder: 1 },
        { name: "C", capacity: 40, active: true, sortOrder: 2 },
      ]);
      logger.info("Seeded sections");
    }

    // ── Houses ───────────────────────────────────────────────────────────────
    const existingHouses = await db.select().from(housesTable);
    if (existingHouses.length === 0) {
      await db.insert(housesTable).values([
        { name: "Jinnah House", color: "#0F7B3E", active: true, sortOrder: 0 },
        { name: "Iqbal House", color: "#1D4ED8", active: true, sortOrder: 1 },
        { name: "Liaquat House", color: "#B91C1C", active: true, sortOrder: 2 },
        { name: "Sir Syed House", color: "#CA8A04", active: true, sortOrder: 3 },
      ]);
      logger.info("Seeded houses");
    }

    // ── Academic terms (Annual / Semester) ───────────────────────────────────
    const existingTerms = await db.select().from(academicTermsTable);
    if (existingTerms.length === 0) {
      await db.insert(academicTermsTable).values([
        { name: "Annual", kind: "annual", active: true, sortOrder: 0 },
        { name: "First Semester", kind: "semester", active: true, sortOrder: 1 },
        { name: "Second Semester", kind: "semester", active: true, sortOrder: 2 },
      ]);
      logger.info("Seeded academic terms");
    }

    // ── Affiliations ─────────────────────────────────────────────────────────
    const existingAffiliations = await db.select().from(affiliationsTable);
    if (existingAffiliations.length === 0) {
      await db.insert(affiliationsTable).values([
        { name: "FBISE", body: "Federal Board of Intermediate & Secondary Education", active: true, sortOrder: 0 },
        { name: "BISE Rawalpindi", body: "Board of Intermediate & Secondary Education, Rawalpindi", active: true, sortOrder: 1 },
      ]);
      logger.info("Seeded affiliations");
    }

    // ── Terms & conditions ───────────────────────────────────────────────────
    const existingTC = await db.select().from(termsConditionsTable);
    if (existingTC.length === 0) {
      await db.insert(termsConditionsTable).values([
        {
          title: "Admission Eligibility",
          content:
            "Applicants must meet the age and academic eligibility criteria for the class applied for. Incomplete applications will not be processed.",
          active: true,
          sortOrder: 0,
        },
        {
          title: "Entry Test & Interview",
          content:
            "Shortlisted candidates must appear for the entry test and interview on the scheduled date. Admission is strictly on merit.",
          active: true,
          sortOrder: 1,
        },
      ]);
      logger.info("Seeded terms & conditions");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed academic data");
  }
}
