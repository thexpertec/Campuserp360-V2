/**
 * Full demo-data seed for CCM ERP.
 * Called automatically at server startup — idempotent (skip-if-exists per table).
 * Runs against whichever DATABASE_URL the process has (dev or prod).
 */
import {
  db,
  academicYearsTable, classCategoriesTable, classesTable, sectionsTable,
  housesTable, academicTermsTable, affiliationsTable,
  subjectsTable, classSectionsTable, classSubjectsTable, classAcademicYearsTable,
  feeTypesTable, feeScheduleTable, feeChallansTable,
  hrDepartmentsTable, hrDesignationsTable, hrSalaryGradesTable,
  hrIncentiveTypesTable, hrDeductionTypesTable,
  employeesTable, employeeBankAccountsTable, employeeSalaryTransactionsTable,
  hrAttendanceTable, hrLeaveRequestsTable,
  hostelBlocksTable, hostelRoomTypesTable, hostelRoomsTable, hostelAllocationsTable,
  libraryCategoriesTable, libraryPublishersTable, libraryBooksTable, libraryIssuesTable,
  medicalMedicineCategoriesTable, medicalMedicinesTable, medicalConditionsTable, medicalVisitsTable,
  sportsCategoriesTable, sportsVenuesTable, sportsTeamsTable, sportsFixturesTable,
  transportVehiclesTable, transportRoutesTable, transportDriversTable, transportTripsTable,
  storeItemCategoriesTable, storeUnitsTable, storeItemsTable, storeTransactionsTable,
  examTypesTable, examGradingScalesTable, examGradeBandsTable,
  examSchedulesTable, examResultsTable,
  syllabusUnitsTable, syllabusTopicsTable,
  timetablePeriodsTable, timetableSlotsTable,
  announcementsTable, noticeboardItemsTable,
  gateLogTable, gateOutpassTable,
  eventsTable,
  studentDisciplinaryTable, studentDocumentsTable,
  studentsTable,
  applicationsTable, applicationEventsTable,
  testCentresTable,
  vendorsTable,
  siteSettingsTable,
  siteAlumniTable,
  siteMenuItemsTable,
  tenantsTable,
  admissionsSettingsTable,
} from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { seedCalendarHolidays } from "./seed-calendar";
import { seedCoaForTenant } from "../routes/coa";
import { ensureFineFeeTypes } from "./fine-fee-types";

// ── Alumni success stories (CMS-managed; story split on blank lines, ──────────
// achievements split on newlines by the public Alumni page). ──────────────────
const ALUMNI_SEED: Array<{
  name: string; batch: string; category: string; role: string; organization: string;
  location: string; quote: string; story: string; achievements: string;
  badge: string | null; featured: boolean;
}> = [
  {
    name: "Brig. Zafar Iqbal Khan, SI(M)",
    batch: "Class of 1998",
    category: "armed_forces",
    role: "Brigade Commander, 12 Inf Brigade",
    organization: "Pakistan Army",
    location: "Rawalpindi",
    quote: "Murree taught me that leadership is not a uniform you wear — it is a habit you carry into every room you ever enter.",
    story: [
      "Zafar Iqbal walked through the gates of Cadet College Murree as a quiet boy from Bhakkar in 1992. By the time he passed out six years later, he was the College Senior, captain of the cross-country team and a finalist in the inter-collegiate declamation contest. Few of his classmates were surprised when he secured a place at the Pakistan Military Academy on the first attempt — and even fewer were surprised when he walked out of Kakul holding the Sword of Honour.",
      "Commissioned into the Punjab Regiment, Zafar saw service in Siachen, the tribal areas during Operation Zarb-e-Azb, and as part of the UN peacekeeping contingent in Congo. He was awarded the Sitara-i-Imtiaz (Military) for an operation in North Waziristan that he still refuses to talk about in detail. 'The men who did the actual work,' he says, 'do not need the medal pinned on me.'",
      "Today, as a Brigade Commander, he visits the Murree campus every summer to address the senior class. He brings nothing but a single message: 'Whatever you are going to become — soldier, doctor, banker, father — start practising it here, on this hill, this term. You don't grow up the day you leave. You leave the day you grow up.'",
    ].join("\n\n"),
    achievements: [
      "Sword of Honour, PMA Long Course 102 (2001)",
      "Sitara-i-Imtiaz (Military) — 2017",
      "UN Medal — MONUSCO, Democratic Republic of Congo",
      "Commander, 12 Infantry Brigade since 2024",
    ].join("\n"),
    badge: "Sword of Honour, PMA",
    featured: true,
  },
  {
    name: "Dr. Amna Tariq, FRCS",
    batch: "Class of 2005",
    category: "medical",
    role: "Consultant Paediatric Cardiac Surgeon",
    organization: "Great Ormond Street Hospital, London",
    location: "London, United Kingdom",
    quote: "Every time I close a baby's chest after a successful repair, I think of the chapel hill at Murree where I first realised the world is much bigger than my doubts.",
    story: [
      "When Amna Tariq joined the first co-educational batch at Cadet College Murree in 1999, the system was still finding its feet. She often described herself as 'one of seventeen girls in a college built for boys'. By the time she finished her FSc in 2005, she had topped the Federal Board across both the Pre-Medical and Mathematics groups — a record that still stands at the college.",
      "She earned an MBBS from King Edward Medical University with a gold medal in surgery, completed her FCPS in Cardiothoracic Surgery from the Aga Khan University Hospital, and was selected for a paediatric cardiac fellowship at the University of Toronto. Today she leads the neonatal cardiac programme at Great Ormond Street, where she has performed over 1,400 open-heart procedures on infants under one year of age.",
      "Amna funds the 'Hill Top Scholarship' at her alma mater — a full ride for two girl cadets each year from underprivileged districts of Khyber Pakhtunkhwa. 'I want every girl who climbs that hill,' she says, 'to know there is somebody at the top waving her up.'",
    ].join("\n\n"),
    achievements: [
      "Federal Board topper, FSc Pre-Medical (2005)",
      "Gold Medal in Surgery, KEMU (2011)",
      "FCPS Cardiothoracic Surgery, AKUH (2018)",
      "Lead surgeon, Neonatal Cardiac Programme, GOSH London",
      "Founder, Hill Top Scholarship for Girl Cadets",
    ].join("\n"),
    badge: "King Edward Medical University Gold Medal",
    featured: true,
  },
  {
    name: "Engr. Bilal Hussain Awan",
    batch: "Class of 2008",
    category: "engineering",
    role: "Principal Engineer, Autonomy",
    organization: "Waymo (Alphabet)",
    location: "Mountain View, California",
    quote: "Discipline in Murree was about waking up at 5:30 for PT. Discipline in Silicon Valley is about waking up to the same problem every day for seven years until you solve it.",
    story: [
      "Bilal joined the college in Class 7th from a small village near Talagang. English, he later admitted, 'was a language I had only seen in books, never spoken in a room'. By Class 9th, he was the captain of the college Science Club and had built — using a microcontroller smuggled from his uncle's electronics shop — an automatic flag-pole that lowered the national flag at sunset by itself. The Principal kept it on display in the corridor for three years.",
      "He topped his FSc Pre-Engineering year, joined GIK Institute on a full merit scholarship, and went on to do an MS and PhD in Robotics from Carnegie Mellon University. At Waymo, he leads the perception team that has driven over 50 million autonomous miles on public roads.",
      "Every December, Bilal sends a Christmas-week shipment of Raspberry Pis, Arduino kits and soldering irons to the college science lab — addressed simply to 'The next boy from Talagang'.",
    ].join("\n\n"),
    achievements: [
      "Federal Board top 10, FSc Pre-Engineering (2008)",
      "Full merit scholarship, GIK Institute (2008-2012)",
      "PhD in Robotics, Carnegie Mellon University (2018)",
      "Principal Engineer, Waymo Autonomy team",
      "Co-inventor on 14 US patents in autonomous perception",
    ].join("\n"),
    badge: null,
    featured: false,
  },
  {
    name: "Sqn Ldr Fatima Zahra",
    batch: "Class of 2010",
    category: "armed_forces",
    role: "F-16 Fighter Pilot, No. 9 Squadron",
    organization: "Pakistan Air Force",
    location: "Sargodha",
    quote: "The first time I went supersonic, I caught myself smiling. Then I remembered the chapel hill — and I smiled wider.",
    story: [
      "Fatima was twelve years old when she watched a pair of F-7Ps from Mianwali break the sky above Murree during an Independence Day flypast. She turned to her hostel matron and said, very quietly, 'I am going to fly one of those.' Six years later she walked out of CCM with the Hockey Colours, three academic prizes, and a confirmed place at the PAF Academy Asghar Khan.",
      "She earned her wings in 2014, became one of the first women in the Pakistan Air Force to fly the F-16, and led the historic four-ship women's formation at the 2023 Pakistan Day parade. She has logged over 1,900 hours on type and is currently a Qualified Flying Instructor at the Combat Commanders' School.",
      "Fatima visits the college's Annual Sports Day every year — usually unannounced, always in flight overalls — to hand the cross-country trophy to the winning girl. 'There were no women fighter pilots when I was your age,' she tells them. 'There are now. Whatever does not exist yet — that is your job.'",
    ].join("\n\n"),
    achievements: [
      "First woman to fly solo on F-16 Block 52 from Sargodha Base",
      "Lead pilot, all-women F-16 formation, Pakistan Day 2023",
      "Best Pilot Trophy, Initial Fighter Conversion Course",
      "Qualified Flying Instructor, Combat Commanders' School",
    ].join("\n"),
    badge: "Best Pilot, Initial Fighter Conversion",
    featured: false,
  },
  {
    name: "Dr. Hamza Sheikh, PhD",
    batch: "Class of 2003",
    category: "academia",
    role: "Associate Professor of Theoretical Physics",
    organization: "Stanford University",
    location: "Palo Alto, California",
    quote: "Quantum field theory is hard. Surviving the Murree winter in a draughty dormitory with a leaky water tank was harder. I have always preferred the easier of the two.",
    story: [
      "Hamza was the boy other boys borrowed homework from — and the one who would patiently re-derive every step on the whiteboard at prep. He represented Pakistan at the International Physics Olympiad in 2003 (Bronze, Taipei) while still in his last term at CCM.",
      "After a BSc from LUMS and a Marshall Scholarship to Cambridge, he completed his PhD in Theoretical Physics at MIT, where his thesis on entanglement entropy in conformal field theories won the Buchsbaum Award. He has since published over sixty papers in Physical Review Letters and Nature Physics, and was awarded the Sloan Fellowship in 2022.",
      "He spends every June and July in Pakistan, running a free four-week 'Olympiad Bootcamp' at CCM and at three sister cadet colleges, training the next generation of mathematicians and physicists. Eleven of his bootcamp alumni have gone on to win international medals.",
    ].join("\n\n"),
    achievements: [
      "IPhO Bronze Medal, Taipei (2003)",
      "Marshall Scholar, University of Cambridge (2007)",
      "PhD in Theoretical Physics, MIT (2014)",
      "Sloan Research Fellowship (2022)",
      "Founder, CCM Olympiad Bootcamp",
    ].join("\n"),
    badge: null,
    featured: false,
  },
  {
    name: "Shazia Bibi, PAS",
    batch: "Class of 2007",
    category: "civil_services",
    role: "Deputy Commissioner, Hunza",
    organization: "Pakistan Administrative Service",
    location: "Aliabad, Gilgit-Baltistan",
    quote: "Public service is just student leadership with longer hours and harder problems. CCM gave me the rehearsal — Pakistan gave me the stage.",
    story: [
      "Shazia was the first girl from her village in Lower Dir to attend a residential cadet college. She struggled with English in her first year, was tutored every evening by a Class 12 senior — and by Class 10 was herself tutoring the new girls in essay writing. She passed out as the College Senior in 2007.",
      "After topping the CSS examination in 2014, she joined the Pakistan Administrative Service. As Assistant Commissioner Chitral she managed flood relief for over 40,000 displaced households in 2022. As Deputy Commissioner Hunza she has led district-wide initiatives on girls' enrolment in primary schools — taking it from 47% to 81% in three years.",
      "She funds the 'Lower Dir Daughters' fellowship — paying for ten girls each year to sit the CCM entry test and covering their tuition for the first two terms. 'I was given a ladder,' she says. 'It is unforgivable not to send the ladder back down.'",
    ].join("\n\n"),
    achievements: [
      "1st position, Combined Competitive Exam (CSS) 2014",
      "BSc Politics & Economics, LUMS (2011)",
      "Master in Public Administration, Harvard Kennedy School (2020)",
      "Flood Relief Coordinator, Chitral District (2022)",
      "Founder, Lower Dir Daughters Fellowship",
    ].join("\n"),
    badge: "Topper, CSS 2014",
    featured: false,
  },
  {
    name: "Dr. Junaid Iftikhar",
    batch: "Class of 2000",
    category: "medical",
    role: "Chief of Neurosurgery",
    organization: "Shaukat Khanum Memorial Cancer Hospital",
    location: "Lahore",
    quote: "Every brain on my operating table belongs to someone's father, daughter, teacher. You do not earn the right to open it twice — so you make sure you do it well the first time.",
    story: [
      "Junaid was a quiet, methodical boy who never finished in the top three of his class but never fell below the top ten either. He chaired the Hiking Society in his final year and once led a group of twenty cadets to Miranjani Peak in a single dawn-to-dusk push. 'That,' he likes to say, 'is when I learned how long six hours of concentration actually feels.'",
      "He completed his MBBS from Khyber Medical College, FCPS Neurosurgery from Lahore General Hospital and a fellowship in neuro-oncology from Massachusetts General Hospital. He returned to Pakistan in 2014 — turning down a faculty position at Harvard — to build the brain-tumour programme at Shaukat Khanum.",
      "Under his leadership the programme has performed over 4,000 cancer resections, ninety-three percent of them free of cost. He still hikes. Every Saturday at 6 am. Usually alone.",
    ].join("\n\n"),
    achievements: [
      "FCPS Neurosurgery, Lahore General Hospital (2011)",
      "Neuro-oncology fellowship, MGH Harvard (2013)",
      "Chief of Neurosurgery, SKMCH&RC since 2018",
      "Over 4,000 brain-tumour surgeries performed in Pakistan",
      "TWAS Young Scientist Award (2019)",
    ].join("\n"),
    badge: null,
    featured: false,
  },
  {
    name: "Captain Saad Mehmood, PN",
    batch: "Class of 2002",
    category: "armed_forces",
    role: "Commanding Officer, PNS Tariq",
    organization: "Pakistan Navy",
    location: "Karachi",
    quote: "I joined the Navy because in Murree we used to look at the clouds from above. I wanted to spend the rest of my life looking at the horizon from sea level.",
    story: [
      "Saad was the captain of the college swimming team in 2002 — the year CCM won the All-Pakistan Cadet Colleges' Aquatic Championship for the first time. He chose the Navy over the Army because, he said in his joining-day letter, 'mountains are where I grew up, but the sea is where I want to grow old.'",
      "Commissioned in 2006, he qualified as a Surface Warfare Officer, completed the Principal Warfare Officer course in Plymouth, and went on to command three ships of progressively larger displacement. He led the multinational anti-piracy task force CTF-151 in 2021 — the first Pakistani officer to do so for two consecutive rotations.",
      "He sends a hand-written letter to the Principal every year on the College Founders' Day. Always the same closing line: 'The boy from House Khalid still reports for duty.'",
    ].join("\n\n"),
    achievements: [
      "Sword of Honour, Pakistan Naval Academy (2006)",
      "Principal Warfare Officer, HMS Collingwood (2013)",
      "Commander, CTF-151 anti-piracy task force (2021-2022)",
      "Tamgha-i-Imtiaz (Military) — 2022",
    ].join("\n"),
    badge: null,
    featured: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function skip(label: string, table: any): Promise<boolean> {
  const rows = await db.select().from(table).limit(1);
  return rows.length > 0;
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function dateAt(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 10, 0, 0);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function seedAllData(): Promise<void> {
  try {
    logger.info("seedAllData: starting full data seed");

    // Tenant-scoped tables (fee types, HR) require a tenantId. Resolve the
    // default tenant (seeded before this runs). If absent, those sections skip.
    const [defaultTenantRow] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase()))
      .limit(1);
    const seedTenantId = defaultTenantRow?.id;

    // ── 1. Academic Years ──────────────────────────────────────────────────────
    if (!(await skip("academic_years", academicYearsTable))) {
      await db.insert(academicYearsTable).values([
        { name: "2024-2025", active: false, sortOrder: 1 },
        { name: "2025-2026", active: false, sortOrder: 2 },
        { name: "2026-2027", active: true,  sortOrder: 3 },
      ]);
      logger.info("seeded: academic years");
    }

    // ── 2. Class Categories ────────────────────────────────────────────────────
    if (!(await skip("class_categories", classCategoriesTable))) {
      await db.insert(classCategoriesTable).values([
        { name: "Middle", active: true, sortOrder: 1 },
        { name: "Matric", active: true, sortOrder: 2 },
        { name: "FSc",    active: true, sortOrder: 3 },
      ]);
      logger.info("seeded: class categories");
    }

    // ── 3. Classes ─────────────────────────────────────────────────────────────
    if (!(await skip("classes", classesTable))) {
      const cats = await db.select().from(classCategoriesTable);
      const mid  = cats.find(c => c.name === "Middle")!;
      const mat  = cats.find(c => c.name === "Matric")!;
      const fsc  = cats.find(c => c.name === "FSc")!;
      await db.insert(classesTable).values([
        { code: "class-7",                name: "Class VII",               categoryId: mid.id, seats: 40, active: true, sortOrder: 1 },
        { code: "class-8",                name: "Class VIII",              categoryId: mid.id, seats: 40, active: true, sortOrder: 2 },
        { code: "class-9",                name: "Class IX",                categoryId: mat.id, seats: 50, active: true, sortOrder: 3 },
        { code: "class-10",               name: "Class X",                 categoryId: mat.id, seats: 50, active: true, sortOrder: 4 },
        { code: "class-11-premedical",    name: "Class XI (Pre-Medical)",  categoryId: fsc.id, seats: 30, active: true, sortOrder: 5 },
        { code: "class-11-preengineering",name: "Class XI (Pre-Eng)",      categoryId: fsc.id, seats: 30, active: true, sortOrder: 6 },
        { code: "class-11-ics",           name: "Class XI (ICS)",          categoryId: fsc.id, seats: 25, active: true, sortOrder: 7 },
        { code: "class-12-premedical",    name: "Class XII (Pre-Medical)", categoryId: fsc.id, seats: 28, active: true, sortOrder: 8 },
        { code: "class-12-preengineering",name: "Class XII (Pre-Eng)",     categoryId: fsc.id, seats: 28, active: true, sortOrder: 9 },
      ]);
      logger.info("seeded: classes");
    }

    // ── 4. Sections ────────────────────────────────────────────────────────────
    if (!(await skip("sections", sectionsTable))) {
      await db.insert(sectionsTable).values([
        { name: "A", capacity: 40, active: true, sortOrder: 1 },
        { name: "B", capacity: 40, active: true, sortOrder: 2 },
        { name: "C", capacity: 40, active: true, sortOrder: 3 },
        { name: "D", capacity: 40, active: true, sortOrder: 4 },
      ]);
      logger.info("seeded: sections");
    }

    // ── 5. Houses ──────────────────────────────────────────────────────────────
    if (!(await skip("houses", housesTable))) {
      await db.insert(housesTable).values([
        { name: "Jinnah House",   color: "#006600", active: true, sortOrder: 1 },
        { name: "Iqbal House",    color: "#003366", active: true, sortOrder: 2 },
        { name: "Liaquat House",  color: "#8B0000", active: true, sortOrder: 3 },
        { name: "Sir Syed House", color: "#4B0082", active: true, sortOrder: 4 },
      ]);
      logger.info("seeded: houses");
    }

    // ── 6. Academic Terms ──────────────────────────────────────────────────────
    if (!(await skip("academic_terms", academicTermsTable))) {
      await db.insert(academicTermsTable).values([
        { name: "Term 1 (Sep–Dec)", kind: "term",   active: true, sortOrder: 1 },
        { name: "Term 2 (Jan–Mar)", kind: "term",   active: true, sortOrder: 2 },
        { name: "Term 3 (Apr–Jun)", kind: "term",   active: true, sortOrder: 3 },
        { name: "Annual",           kind: "annual", active: true, sortOrder: 4 },
      ]);
      logger.info("seeded: academic terms");
    }

    // ── 7. Affiliations ────────────────────────────────────────────────────────
    if (!(await skip("affiliations", affiliationsTable))) {
      await db.insert(affiliationsTable).values([
        { name: "FBISE",                   body: "Federal Board of Intermediate and Secondary Education, Islamabad", active: true, sortOrder: 1 },
        { name: "BISE Rawalpindi",         body: "Board of Intermediate and Secondary Education, Rawalpindi",       active: true, sortOrder: 2 },
        { name: "University of the Punjab",body: "University of the Punjab, Lahore",                                active: true, sortOrder: 3 },
      ]);
      logger.info("seeded: affiliations");
    }

    // ── 8. Subjects ────────────────────────────────────────────────────────────
    if (!(await skip("subjects", subjectsTable))) {
      await db.insert(subjectsTable).values([
        { code: "ENG",   name: "English",            type: "theory",    maxMarks: 100, passMarks: 33, active: true, sortOrder: 1 },
        { code: "URDU",  name: "Urdu",               type: "theory",    maxMarks: 100, passMarks: 33, active: true, sortOrder: 2 },
        { code: "MATH",  name: "Mathematics",        type: "theory",    maxMarks: 100, passMarks: 33, active: true, sortOrder: 3 },
        { code: "SCI",   name: "General Science",    type: "theory",    maxMarks: 100, passMarks: 33, active: true, sortOrder: 4 },
        { code: "SOC",   name: "Social Studies",     type: "theory",    maxMarks: 100, passMarks: 33, active: true, sortOrder: 5 },
        { code: "PHY",   name: "Physics",            type: "theory",    maxMarks: 75,  passMarks: 25, active: true, sortOrder: 6 },
        { code: "CHEM",  name: "Chemistry",          type: "theory",    maxMarks: 75,  passMarks: 25, active: true, sortOrder: 7 },
        { code: "BIO",   name: "Biology",            type: "theory",    maxMarks: 75,  passMarks: 25, active: true, sortOrder: 8 },
        { code: "COMP",  name: "Computer Science",   type: "theory",    maxMarks: 75,  passMarks: 25, active: true, sortOrder: 9 },
        { code: "ISL",   name: "Islamiat",           type: "theory",    maxMarks: 50,  passMarks: 17, active: true, sortOrder: 10 },
        { code: "PAK",   name: "Pakistan Studies",   type: "theory",    maxMarks: 50,  passMarks: 17, active: true, sortOrder: 11 },
        { code: "PHYED", name: "Physical Education", type: "practical", maxMarks: 50,  passMarks: 17, active: true, sortOrder: 12 },
      ]);
      logger.info("seeded: subjects");
    }

    // ── 9. Class ↔ Section links ──────────────────────────────────────────────
    if (!(await skip("class_sections", classSectionsTable))) {
      const classes  = await db.select().from(classesTable);
      const sections = await db.select().from(sectionsTable);
      const [sA, sB, sC] = ["A","B","C"].map(n => sections.find(s => s.name === n));
      const seen = new Set<string>();
      const links = classes.flatMap((cls, ci) =>
        [sA, sB, sC].slice(0, ci < 4 ? 3 : 2)
          .filter((s): s is NonNullable<typeof s> => s !== undefined)
          .map((s, si) => ({ classId: cls.id, sectionId: s.id, sortOrder: si + 1 }))
          .filter(l => {
            const key = `${l.classId}:${l.sectionId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
      );
      if (links.length > 0) {
        await db.insert(classSectionsTable).values(links).onConflictDoNothing();
        logger.info({ count: links.length }, "seeded: class sections");
      }
    }

    // ── 10. Class ↔ Subject links ─────────────────────────────────────────────
    if (!(await skip("class_subjects", classSubjectsTable))) {
      const classes  = await db.select().from(classesTable);
      const subjects = await db.select().from(subjectsTable);
      type SubjectRow = typeof subjects[number];
      const byCode = (c: string) => subjects.find(s => s.code === c);
      const pick = (...codes: string[]): SubjectRow[] =>
        codes.map(byCode).filter((s): s is SubjectRow => s !== undefined);
      const coreMiddle = pick("ENG","URDU","MATH","SCI","SOC","ISL","PHYED");
      const coreMatric = pick("ENG","URDU","MATH","PHY","CHEM","BIO","ISL","PAK","PHYED");
      const coreFscPre = pick("ENG","URDU","MATH","PHY","CHEM","BIO","ISL","PAK");
      const coreFscICS = pick("ENG","URDU","MATH","PHY","COMP","ISL","PAK");
      const byClass: Record<string, SubjectRow[]> = {
        "class-7": coreMiddle, "class-8": coreMiddle,
        "class-9": coreMatric, "class-10": coreMatric,
        "class-11-premedical": coreFscPre, "class-12-premedical": coreFscPre,
        "class-11-preengineering": coreFscPre, "class-12-preengineering": coreFscPre,
        "class-11-ics": coreFscICS,
      };
      const links = classes.flatMap(cls =>
        (byClass[cls.code] ?? coreMatric).map((s, si) => ({ classId: cls.id, subjectId: s.id, sortOrder: si + 1 }))
      );
      if (links.length > 0) {
        await db.insert(classSubjectsTable).values(links);
        logger.info({ count: links.length }, "seeded: class subjects");
      }
    }

    // ── 11. Class ↔ Academic Year links ──────────────────────────────────────
    if (!(await skip("class_academic_years", classAcademicYearsTable))) {
      const classes = await db.select().from(classesTable);
      const years   = await db.select().from(academicYearsTable);
      const y2627   = years.find(y => y.name === "2026-2027");
      if (y2627 && classes.length > 0) {
        await db.insert(classAcademicYearsTable)
          .values(classes.map(c => ({ classId: c.id, academicYearId: y2627.id })))
          .onConflictDoNothing();
        logger.info("seeded: class academic years");
      }
    }

    // ── 12. Fee Types ─────────────────────────────────────────────────────────
    // Note: fine-type rows may already exist (seeded elsewhere), so don't gate
    // on table emptiness — insert only the standard fee codes that are missing.
    if (seedTenantId) {
      const standardFeeTypes = [
        { name: "Tuition Fee",     feeCategory: "tuition",     feeCode: "tuition-fee",     duration: "monthly", description: "Monthly tuition fee",               active: true, sortOrder: 1 },
        { name: "Admission Fee",   feeCategory: "non-tuition", feeCode: "admission-fee",   duration: "once",    description: "One-time admission processing fee",  active: true, sortOrder: 2 },
        { name: "Hostel Fee",      feeCategory: "non-tuition", feeCode: "hostel-fee",      duration: "monthly", description: "Monthly hostel boarding fee",         active: true, sortOrder: 3 },
        { name: "Annual Fund",     feeCategory: "non-tuition", feeCode: "annual-fund",     duration: "annual",  description: "Annual development fund",             active: true, sortOrder: 4 },
        { name: "Uniform & Books", feeCategory: "non-tuition", feeCode: "uniform-books",   duration: "once",    description: "Uniform and textbook charges",        active: true, sortOrder: 5 },
        { name: "Sports Fee",      feeCategory: "non-tuition", feeCode: "sports-fee",      duration: "annual",  description: "Annual sports and games fee",         active: true, sortOrder: 6 },
        { name: "Medical Fee",     feeCategory: "non-tuition", feeCode: "medical-fee",     duration: "monthly", description: "Monthly medical/sick-bay fee",        active: true, sortOrder: 7 },
        { name: "Examination Fee", feeCategory: "non-tuition", feeCode: "examination-fee", duration: "once",    description: "Per-exam examination fee",            active: true, sortOrder: 8 },
      ];
      const existingFeeTypes = await db.select({ feeCode: feeTypesTable.feeCode }).from(feeTypesTable);
      const existingCodes = new Set(existingFeeTypes.map(f => f.feeCode));
      const missing = standardFeeTypes.filter(r => !existingCodes.has(r.feeCode));
      if (missing.length > 0) {
        await db.insert(feeTypesTable).values(missing.map(r => ({ ...r, tenantId: seedTenantId })));
        logger.info({ count: missing.length }, "seeded: fee types");
      }
    }

    // ── 13. Fee Schedule ──────────────────────────────────────────────────────
    if (!(await skip("fee_schedule", feeScheduleTable))) {
      const years    = await db.select().from(academicYearsTable);
      const feeTypes = await db.select().from(feeTypesTable);
      const classes  = await db.select().from(classesTable);
      const y2627    = years.find(y => y.name === "2026-2027");
      const byCode   = (c: string) => feeTypes.find(f => f.feeCode === c);
      const amountMap: Record<string, Record<string, number>> = {
        "tuition-fee":     { "class-7":4000,"class-8":4000,"class-9":5000,"class-10":5000,"class-11-premedical":6000,"class-11-preengineering":6000,"class-11-ics":6000,"class-12-premedical":6000,"class-12-preengineering":6000 },
        "hostel-fee":      { "class-7":3500,"class-8":3500,"class-9":4000,"class-10":4000,"class-11-premedical":4500,"class-11-preengineering":4500,"class-11-ics":4500,"class-12-premedical":4500,"class-12-preengineering":4500 },
        "medical-fee":     { "class-7":500,"class-8":500,"class-9":500,"class-10":500,"class-11-premedical":500,"class-11-preengineering":500,"class-11-ics":500,"class-12-premedical":500,"class-12-preengineering":500 },
        "admission-fee":   { "class-7":15000,"class-8":15000,"class-9":20000,"class-10":20000,"class-11-premedical":25000,"class-11-preengineering":25000,"class-11-ics":25000,"class-12-premedical":25000,"class-12-preengineering":25000 },
        "annual-fund":     { "class-7":5000,"class-8":5000,"class-9":6000,"class-10":6000,"class-11-premedical":7000,"class-11-preengineering":7000,"class-11-ics":7000,"class-12-premedical":7000,"class-12-preengineering":7000 },
        "sports-fee":      { "class-7":2000,"class-8":2000,"class-9":2500,"class-10":2500,"class-11-premedical":3000,"class-11-preengineering":3000,"class-11-ics":3000,"class-12-premedical":3000,"class-12-preengineering":3000 },
        "uniform-books":   { "class-7":8000,"class-8":8000,"class-9":10000,"class-10":10000,"class-11-premedical":12000,"class-11-preengineering":12000,"class-11-ics":12000,"class-12-premedical":12000,"class-12-preengineering":12000 },
        "examination-fee": { "class-7":1000,"class-8":1000,"class-9":1500,"class-10":1500,"class-11-premedical":2000,"class-11-preengineering":2000,"class-11-ics":2000,"class-12-premedical":2000,"class-12-preengineering":2000 },
      };
      const uniqueClassCodes = Array.from(new Set(classes.map(c => c.code)));
      const schedules = y2627
        ? uniqueClassCodes.flatMap(classCode =>
            Object.entries(amountMap).flatMap(([code, amounts]) => {
              const feeType = byCode(code);
              if (!feeType) return [];
              return [{
                academicYearId: y2627.id, classCode,
                feeTypeId: feeType.id, amount: amounts[classCode] ?? 0,
              }];
            })
          )
        : [];
      if (schedules.length > 0) {
        await db.insert(feeScheduleTable).values(schedules).onConflictDoNothing();
        logger.info({ count: schedules.length }, "seeded: fee schedule");
      } else {
        logger.warn("seed: fee schedule skipped — missing academic year or fee types");
      }
    }

    // ── 14. Test Centres ──────────────────────────────────────────────────────
    if (!(await skip("test_centres", testCentresTable))) {
      await db.insert(testCentresTable).values([
        { name: "Rawalpindi Centre",  city: "Rawalpindi", address: "Army Public School, Chaklala Scheme III",  contact: "051-5788001", active: true, sortOrder: 1 },
        { name: "Lahore Centre",      city: "Lahore",     address: "Aitchison College Campus, The Mall",       contact: "042-3573002", active: true, sortOrder: 2 },
        { name: "Karachi Centre",     city: "Karachi",    address: "Cadet College Petaro Admissions Office",   contact: "021-9920003", active: true, sortOrder: 3 },
        { name: "Peshawar Centre",    city: "Peshawar",   address: "Edwardes College, Peshawar",               contact: "091-9212004", active: true, sortOrder: 4 },
        { name: "Multan Centre",      city: "Multan",     address: "Army Burn Hall College, Multan",           contact: "061-4550005", active: true, sortOrder: 5 },
        { name: "Murree Main Centre", city: "Murree",     address: "Cadet College Murree Main Campus",         contact: "051-3410001", active: true, sortOrder: 6 },
      ]);
      logger.info("seeded: test centres");
    }

    // ── 15. Applications + Events ─────────────────────────────────────────────
    {
      const existing = await db.select({ ref: applicationsTable.referenceId }).from(applicationsTable);
      const existingRefs = new Set(existing.map(r => r.ref));

      const FIRST_NAMES = ["Bilal","Hamza","Saad","Usman","Faisal","Junaid","Talha","Anas","Zain","Ibrahim","Arslan","Mohsin","Osama","Rayyan","Rayan","Awais","Huzaifa","Moiz","Sufyan","Noman","Wasif","Adeel","Umair","Nabeel","Kamran","Danish","Asad","Waqar","Tariq","Imran","Salman","Zubair","Farhan","Kashif","Rizwan","Atif","Nauman","Waseem","Murad","Shoaib","Ahsan","Farrukh","Babar","Sajid","Irfan","Qasim","Yasir","Hammad","Shahid","Amjad"];
      const LAST_NAMES  = ["Khan","Ahmed","Ali","Malik","Siddiqui","Qureshi","Chaudhry","Hussain","Shah","Iqbal","Mirza","Baig","Butt","Nawaz","Sheikh","Abbasi","Farooq","Tariq","Javed","Mehmood","Raza","Naqvi","Hameed","Soomro","Manzoor","Tahir","Sattar","Rehman","Riaz","Ghouri","Latif","Aziz","Rana","Khokhar","Lodhi","Baloch","Niazi","Sethi","Bajwa","Bhatti","Qazi","Yousuf","Rashid","Nadeem","Asghar","Zafar","Anwar","Sarwar","Nawab","Mughal"];
      const CENTRES_A = [
        { name:"Rawalpindi Centre",city:"Rawalpindi",state:"Punjab",mobile:"0300-11" },
        { name:"Lahore Centre",    city:"Lahore",    state:"Punjab",mobile:"0312-22" },
        { name:"Karachi Centre",   city:"Karachi",   state:"Sindh", mobile:"0333-33" },
        { name:"Peshawar Centre",  city:"Peshawar",  state:"KPK",   mobile:"0345-44" },
        { name:"Multan Centre",    city:"Multan",    state:"Punjab",mobile:"0301-55" },
        { name:"Murree Main Centre",city:"Murree",   state:"Punjab",mobile:"0311-66" },
      ];
      const CLASSES_POOL = ["class-9","class-9","class-9","class-9","class-8","class-8","class-8","class-7","class-7","class-11-premedical","class-11-premedical","class-11-preengineering","class-11-preengineering","class-11-ics"];
      const BLOOD_GROUPS = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];
      const OCCUPATIONS  = ["Army Officer","Engineer","Doctor","Teacher","Banker","Businessman","Government Officer","Lawyer","Pilot","Police Officer","Accountant","Professor","IT Specialist","Contractor","Farmer"];
      const pick = <T>(arr: T[], i: number) => arr[i % arr.length];
      const randM = (min: number, max: number, seed: number) => min + ((seed * 37 + 13) % (max - min + 1));

      type AppSpec = { idx: number; status: string; createdAt: Date; testDate?: Date; resultMarks?: number; rollSuffix?: string };

      function makeApp(spec: AppSpec): Record<string, unknown> {
        const { idx, status, createdAt, testDate, resultMarks, rollSuffix } = spec;
        const fn = pick(FIRST_NAMES, idx); const ln = pick(LAST_NAMES, idx + 7);
        const centre = pick(CENTRES_A, idx + 3); const cls = pick(CLASSES_POOL, idx + 1);
        return {
          referenceId: `CCM-2026-${String(idx).padStart(4,"0")}`,
          session: "2026-2027", classApplying: cls,
          previousMarks: `${randM(60, 95, idx)}%`,
          fullName: (fn + " " + ln).trim(),
          dateOfBirth: `${2008 + (idx % 6)}-${String((idx % 12) + 1).padStart(2,"0")}-${String((idx % 28) + 1).padStart(2,"0")}`,
          bloodGroup: pick(BLOOD_GROUPS, idx + 2), religion: "Islam",
          studentMobile: `${centre.mobile}${String(idx).padStart(5,"0")}`,
          studentEmail: `${fn.toLowerCase()}.${ln.toLowerCase()}${idx}@example.com`,
          presentAddress: `House ${idx * 3}, Street ${idx % 10 + 1}, ${centre.city}`,
          state: centre.state, city: centre.city, examCenter: centre.name,
          guardianName: `${pick(FIRST_NAMES, idx + 20)} ${ln}`, relation: "Father",
          fatherName: `${pick(FIRST_NAMES, idx + 20)} ${ln}`,
          occupation: pick(OCCUPATIONS, idx + 5),
          guardianMobile: `${centre.mobile}${String(idx + 5000).padStart(5,"0")}`,
          parentCnic: `37405-${String(idx * 111).padStart(7,"0")}-${idx % 9}`,
          parentCnicLast4: String(idx).padStart(4,"0"),
          status, rollNumber: rollSuffix ? `CCM-2026-${rollSuffix}` : undefined,
          testDate: testDate ?? undefined, resultMarks: resultMarks ?? undefined, createdAt,
        };
      }

      const specs: AppSpec[] = [
        { idx:1,  status:"admitted",  createdAt:dateAt(2025,10,5),  testDate:dateAt(2026,1,15), resultMarks:88, rollSuffix:"A0001" },
        { idx:2,  status:"admitted",  createdAt:dateAt(2025,10,12), testDate:dateAt(2026,1,15), resultMarks:92, rollSuffix:"A0002" },
        { idx:3,  status:"admitted",  createdAt:dateAt(2025,10,20), testDate:dateAt(2026,1,15), resultMarks:81, rollSuffix:"A0003" },
        { idx:4,  status:"admitted",  createdAt:dateAt(2025,11,3),  testDate:dateAt(2026,1,22), resultMarks:95, rollSuffix:"A0004" },
        { idx:5,  status:"admitted",  createdAt:dateAt(2025,11,10), testDate:dateAt(2026,1,22), resultMarks:87, rollSuffix:"A0005" },
        { idx:6,  status:"admitted",  createdAt:dateAt(2025,11,18), testDate:dateAt(2026,1,22), resultMarks:90, rollSuffix:"A0006" },
        { idx:7,  status:"admitted",  createdAt:dateAt(2025,12,1),  testDate:dateAt(2026,2,5),  resultMarks:83, rollSuffix:"A0007" },
        { idx:8,  status:"admitted",  createdAt:dateAt(2025,12,8),  testDate:dateAt(2026,2,5),  resultMarks:91, rollSuffix:"A0008" },
        { idx:9,  status:"admitted",  createdAt:dateAt(2025,12,15), testDate:dateAt(2026,2,5),  resultMarks:86, rollSuffix:"A0009" },
        { idx:10, status:"admitted",  createdAt:dateAt(2025,12,22), testDate:dateAt(2026,2,12), resultMarks:79, rollSuffix:"A0010" },
        { idx:11, status:"admitted",  createdAt:dateAt(2025,12,29), testDate:dateAt(2026,2,12), resultMarks:94, rollSuffix:"A0011" },
        { idx:12, status:"admitted",  createdAt:dateAt(2025,10,28), testDate:dateAt(2026,1,29), resultMarks:88, rollSuffix:"A0012" },
        { idx:13, status:"on_hold",   createdAt:dateAt(2025,11,5),  testDate:dateAt(2026,1,15), resultMarks:66, rollSuffix:"H0001" },
        { idx:14, status:"on_hold",   createdAt:dateAt(2025,11,25), testDate:dateAt(2026,1,22), resultMarks:63, rollSuffix:"H0002" },
        { idx:15, status:"on_hold",   createdAt:dateAt(2025,12,5),  testDate:dateAt(2026,2,5),  resultMarks:68, rollSuffix:"H0003" },
        { idx:16, status:"on_hold",   createdAt:dateAt(2025,12,12), testDate:dateAt(2026,2,12), resultMarks:61, rollSuffix:"H0004" },
        { idx:17, status:"on_hold",   createdAt:dateAt(2025,12,20), testDate:dateAt(2026,2,12), resultMarks:70, rollSuffix:"H0005" },
        { idx:18, status:"rejected",  createdAt:dateAt(2025,10,15), testDate:dateAt(2026,1,15), resultMarks:38, rollSuffix:"J0001" },
        { idx:19, status:"rejected",  createdAt:dateAt(2025,10,22), testDate:dateAt(2026,1,15), resultMarks:42, rollSuffix:"J0002" },
        { idx:20, status:"rejected",  createdAt:dateAt(2025,11,8),  testDate:dateAt(2026,1,22), resultMarks:29, rollSuffix:"J0003" },
        { idx:21, status:"rejected",  createdAt:dateAt(2025,11,15), testDate:dateAt(2026,1,22), resultMarks:35, rollSuffix:"J0004" },
        { idx:22, status:"rejected",  createdAt:dateAt(2025,12,3),  testDate:dateAt(2026,2,5),  resultMarks:31, rollSuffix:"J0005" },
        { idx:23, status:"rejected",  createdAt:dateAt(2025,12,10), testDate:dateAt(2026,2,5),  resultMarks:45, rollSuffix:"J0006" },
        { idx:24, status:"rejected",  createdAt:dateAt(2025,12,18), testDate:dateAt(2026,2,12), resultMarks:27, rollSuffix:"J0007" },
        { idx:25, status:"rejected",  createdAt:dateAt(2025,12,26), testDate:dateAt(2026,2,12), resultMarks:33, rollSuffix:"J0008" },
        { idx:26, status:"result_announced", createdAt:dateAt(2025,11,20), testDate:dateAt(2026,2,20), resultMarks:74, rollSuffix:"R0001" },
        { idx:27, status:"result_announced", createdAt:dateAt(2025,12,2),  testDate:dateAt(2026,2,20), resultMarks:80, rollSuffix:"R0002" },
        { idx:28, status:"result_announced", createdAt:dateAt(2026,1,5),   testDate:dateAt(2026,3,10), resultMarks:71, rollSuffix:"R0003" },
        { idx:29, status:"result_announced", createdAt:dateAt(2026,1,12),  testDate:dateAt(2026,3,10), resultMarks:85, rollSuffix:"R0004" },
        { idx:30, status:"result_announced", createdAt:dateAt(2026,1,20),  testDate:dateAt(2026,3,17), resultMarks:77, rollSuffix:"R0005" },
        { idx:31, status:"result_announced", createdAt:dateAt(2026,1,28),  testDate:dateAt(2026,3,17), resultMarks:82, rollSuffix:"R0006" },
        { idx:32, status:"test_taken", createdAt:dateAt(2026,1,10), testDate:daysAgo(12), resultMarks:75, rollSuffix:"X0001" },
        { idx:33, status:"test_taken", createdAt:dateAt(2026,1,18), testDate:daysAgo(12), resultMarks:68, rollSuffix:"X0002" },
        { idx:34, status:"test_taken", createdAt:dateAt(2026,2,2),  testDate:daysAgo(9),  resultMarks:83, rollSuffix:"X0003" },
        { idx:35, status:"test_taken", createdAt:dateAt(2026,2,9),  testDate:daysAgo(9),  resultMarks:59, rollSuffix:"X0004" },
        { idx:36, status:"test_taken", createdAt:dateAt(2026,2,16), testDate:daysAgo(6),  resultMarks:91, rollSuffix:"X0005" },
        { idx:37, status:"test_taken", createdAt:dateAt(2026,2,22), testDate:daysAgo(6),  resultMarks:72, rollSuffix:"X0006" },
        { idx:38, status:"test_taken", createdAt:dateAt(2026,3,1),  testDate:daysAgo(4),  resultMarks:65, rollSuffix:"X0007" },
        { idx:39, status:"test_taken", createdAt:dateAt(2026,3,8),  testDate:daysAgo(4),  resultMarks:78, rollSuffix:"X0008" },
        { idx:40, status:"test_scheduled", createdAt:dateAt(2026,2,5),  testDate:daysFromNow(3),  rollSuffix:"T0001" },
        { idx:41, status:"test_scheduled", createdAt:dateAt(2026,2,12), testDate:daysFromNow(3),  rollSuffix:"T0002" },
        { idx:42, status:"test_scheduled", createdAt:dateAt(2026,2,19), testDate:daysFromNow(5),  rollSuffix:"T0003" },
        { idx:43, status:"test_scheduled", createdAt:dateAt(2026,3,3),  testDate:daysFromNow(5),  rollSuffix:"T0004" },
        { idx:44, status:"test_scheduled", createdAt:dateAt(2026,3,10), testDate:daysFromNow(7),  rollSuffix:"T0005" },
        { idx:45, status:"test_scheduled", createdAt:dateAt(2026,3,17), testDate:daysFromNow(7),  rollSuffix:"T0006" },
        { idx:46, status:"test_scheduled", createdAt:dateAt(2026,3,24), testDate:daysFromNow(10), rollSuffix:"T0007" },
        { idx:47, status:"test_scheduled", createdAt:dateAt(2026,4,1),  testDate:daysFromNow(10), rollSuffix:"T0008" },
        { idx:48, status:"test_scheduled", createdAt:dateAt(2026,4,7),  testDate:daysFromNow(12), rollSuffix:"T0009" },
        { idx:49, status:"test_scheduled", createdAt:dateAt(2026,4,14), testDate:daysFromNow(12), rollSuffix:"T0010" },
        { idx:50, status:"test_scheduled", createdAt:dateAt(2026,4,20), testDate:daysFromNow(14), rollSuffix:"T0011" },
        { idx:51, status:"test_scheduled", createdAt:dateAt(2026,4,27), testDate:daysFromNow(14), rollSuffix:"T0012" },
        { idx:52, status:"test_scheduled", createdAt:dateAt(2026,5,4),  testDate:daysFromNow(16), rollSuffix:"T0013" },
        { idx:53, status:"test_scheduled", createdAt:dateAt(2026,5,11), testDate:daysFromNow(16), rollSuffix:"T0014" },
        { idx:54, status:"test_scheduled", createdAt:dateAt(2026,5,18), testDate:daysFromNow(18), rollSuffix:"T0015" },
        { idx:55, status:"verified", createdAt:dateAt(2026,3,5)  },
        { idx:56, status:"verified", createdAt:dateAt(2026,3,12) },
        { idx:57, status:"verified", createdAt:dateAt(2026,3,20) },
        { idx:58, status:"verified", createdAt:dateAt(2026,4,2)  },
        { idx:59, status:"verified", createdAt:dateAt(2026,4,9)  },
        { idx:60, status:"verified", createdAt:dateAt(2026,4,16) },
        { idx:61, status:"verified", createdAt:dateAt(2026,4,23) },
        { idx:62, status:"verified", createdAt:dateAt(2026,4,30) },
        { idx:63, status:"pending_verification", createdAt:dateAt(2026,4,5)  },
        { idx:64, status:"pending_verification", createdAt:dateAt(2026,4,11) },
        { idx:65, status:"pending_verification", createdAt:dateAt(2026,4,18) },
        { idx:66, status:"pending_verification", createdAt:dateAt(2026,4,25) },
        { idx:67, status:"pending_verification", createdAt:dateAt(2026,5,2)  },
        { idx:68, status:"pending_verification", createdAt:dateAt(2026,5,8)  },
        { idx:69, status:"pending_verification", createdAt:dateAt(2026,5,15) },
        { idx:70, status:"pending_verification", createdAt:dateAt(2026,5,21) },
        { idx:71, status:"pending_verification", createdAt:dateAt(2026,5,27) },
        { idx:72, status:"pending_verification", createdAt:dateAt(2026,6,1)  },
        { idx:73, status:"under_review", createdAt:dateAt(2026,5,3)  },
        { idx:74, status:"under_review", createdAt:dateAt(2026,5,9)  },
        { idx:75, status:"under_review", createdAt:dateAt(2026,5,14) },
        { idx:76, status:"under_review", createdAt:dateAt(2026,5,19) },
        { idx:77, status:"under_review", createdAt:dateAt(2026,5,24) },
        { idx:78, status:"under_review", createdAt:dateAt(2026,5,28) },
        { idx:79, status:"under_review", createdAt:dateAt(2026,6,1)  },
        { idx:80, status:"under_review", createdAt:dateAt(2026,6,2)  },
        { idx:81, status:"received", createdAt:daysAgo(5) },
        { idx:82, status:"received", createdAt:daysAgo(4) },
        { idx:83, status:"received", createdAt:daysAgo(4) },
        { idx:84, status:"received", createdAt:daysAgo(3) },
        { idx:85, status:"received", createdAt:daysAgo(3) },
        { idx:86, status:"received", createdAt:daysAgo(2) },
        { idx:87, status:"received", createdAt:daysAgo(2) },
        { idx:88, status:"received", createdAt:daysAgo(1) },
        { idx:89, status:"received", createdAt:daysAgo(1) },
        { idx:90, status:"received", createdAt:daysAgo(0) },
      ];

      const toInsert = specs.map(makeApp).filter(a => !existingRefs.has(a.referenceId as string));
      if (toInsert.length > 0) {
        const inserted = await db.insert(applicationsTable).values(toInsert as any)
          .returning({ id: applicationsTable.id, referenceId: applicationsTable.referenceId, status: applicationsTable.status, createdAt: applicationsTable.createdAt });
        logger.info({ count: inserted.length }, "seeded: applications");

        const events: (typeof applicationEventsTable.$inferInsert)[] = [];
        const T = (base: Date, offsetDays: number) => { const d = new Date(base); d.setDate(d.getDate() + offsetDays); return d; };
        for (const app of inserted) {
          const { id, status, createdAt } = app;
          const b = new Date(createdAt);
          events.push({ applicationId: id, eventType: "received", title: "Application Received", description: "Application submitted via online portal.", occurredAt: b });
          if (["under_review","pending_verification","verified","test_scheduled","test_taken","result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "under_review", title: "Application Under Review", description: "Admissions team has started reviewing the application.", occurredAt: T(b,2) });
          if (["pending_verification","verified","test_scheduled","test_taken","result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "pending_verification", title: "Documents Requested", description: "Please submit attested academic certificates, CNIC, and photographs.", occurredAt: T(b,4) });
          if (["verified","test_scheduled","test_taken","result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "verified", title: "Documents Verified", description: "All documents verified by the admissions office.", occurredAt: T(b,7) });
          if (["test_scheduled","test_taken","result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "test_scheduled", title: "Entry Test Scheduled", description: "Roll number issued. Reporting time: 8:30 AM.", occurredAt: T(b,12) });
          if (["test_taken","result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "test_taken", title: "Entry Test Completed", description: "Candidate appeared in the written test.", occurredAt: T(b,20) });
          if (["result_announced","admitted","on_hold","rejected"].includes(status))
            events.push({ applicationId: id, eventType: "result_announced", title: "Result Announced", description: "Test results finalised. Merit list is being prepared.", occurredAt: T(b,28) });
          if (status === "admitted")
            events.push({ applicationId: id, eventType: "admitted", title: "Admission Confirmed", description: "Congratulations! Please complete enrollment formalities within 10 working days.", occurredAt: T(b,32) });
          if (status === "on_hold")
            events.push({ applicationId: id, eventType: "on_hold", title: "Application On Hold", description: "Your application is on the waiting list.", occurredAt: T(b,32) });
          if (status === "rejected")
            events.push({ applicationId: id, eventType: "rejected", title: "Application Unsuccessful", description: "We regret your application was not successful this time.", occurredAt: T(b,32) });
        }
        if (events.length > 0) {
          await db.insert(applicationEventsTable).values(events);
          logger.info({ count: events.length }, "seeded: application events");
        }
      }
    }

    // ── 16. Students ──────────────────────────────────────────────────────────
    if (!(await skip("students", studentsTable))) {
      const sections = await db.select().from(sectionsTable);
      const houses   = await db.select().from(housesTable);
      const years    = await db.select().from(academicYearsTable);
      const secA = sections.find(s => s.name === "A");
      const secB = sections.find(s => s.name === "B");
      const secC = sections.find(s => s.name === "C");
      const jinnah  = houses.find(h => h.name === "Jinnah House");
      const iqbal   = houses.find(h => h.name === "Iqbal House");
      const liaquat = houses.find(h => h.name === "Liaquat House");
      const sirSyed = houses.find(h => h.name === "Sir Syed House");
      const year2627 = years.find(y => y.name === "2026-2027");

      if (secA && secB && secC && jinnah && iqbal && liaquat && sirSyed && year2627) {
        const FN = ["Zaid","Asim","Basit","Ghazanfar","Haider","Imad","Jawad","Kazim","Luqman","Maaz","Nabil","Owais","Qaim","Rafay","Saim","Talal","Ujala","Vaqas","Waleed","Xaver","Yaqoob","Zaeem","Abuzar","Baqir","Chirag","Dawood","Essa","Firas","Ghassan","Hayan","Ilyas","Jibran","Karrar","Laith","Midhat","Nuh","Omar","Pasha","Qassim","Rauf"];
        const LN = ["Zaidi","Ansari","Hashmi","Bukhari","Gillani","Tirmizi","Kazmi","Jafri","Naqvi","Rizvi","Shirazi","Isfahani","Hamdani","Ashrafi","Qadri","Chishti","Suhrawardi","Mujaddidi","Sanai","Rumi"];
        const CLASSES_STU = ["class-9","class-9","class-9","class-9","class-9","class-9","class-9","class-9","class-9","class-9","class-8","class-8","class-8","class-8","class-8","class-8","class-8","class-8","class-7","class-7","class-7","class-7","class-7","class-7","class-11-premedical","class-11-premedical","class-11-premedical","class-11-premedical","class-11-premedical","class-11-preengineering","class-11-preengineering","class-11-preengineering","class-11-preengineering","class-11-preengineering","class-11-preengineering","class-11-ics","class-11-ics","class-11-ics","class-11-ics","class-11-ics"];
        const SECS = [secA,secB,secC];
        const HOUSES_S = [jinnah,iqbal,liaquat,sirSyed];
        const PROVINCES = ["Punjab","Punjab","Punjab","Sindh","KPK","Balochistan","Punjab","Punjab","Sindh","KPK"];
        const CITIES = ["Islamabad","Lahore","Rawalpindi","Karachi","Peshawar","Quetta","Multan","Faisalabad","Hyderabad","Sialkot"];
        const OCCS = ["Army Officer","Engineer","Doctor","Teacher","Banker","Businessman","Government Officer","Lawyer","Pilot","Police Officer","Accountant","Professor","IT Specialist","Contractor","Farmer"];
        const BG  = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];
        const pick = <T>(arr: T[], i: number) => arr[i % arr.length];
        const students: any[] = [];
        for (let i = 0; i < 40; i++) {
          const fn = pick(FN, i); const ln = pick(LN, i);
          const city = pick(CITIES, i); const prov = pick(PROVINCES, i);
          students.push({
            applicantId: `GR-2026-${String(i + 1).padStart(3,"0")}`,
            fullName: (fn + " " + ln).trim(),
            dateOfBirth: `${2008 + (i % 6)}-${String((i % 12) + 1).padStart(2,"0")}-${String((i % 28) + 1).padStart(2,"0")}`,
            bloodGroup: pick(BG, i), religion: "Islam",
            mobile: `0300-${String(2026000 + i).slice(1)}`,
            email: `${fn.toLowerCase()}.${ln.toLowerCase()}@ccm.edu.pk`,
            address: `House ${i + 1}, Block ${String.fromCharCode(65 + (i % 6))}, ${city}`,
            city, province: prov,
            fatherName: `${pick(FN, i + 10)} ${ln}`, guardianName: `${pick(FN, i + 10)} ${ln}`,
            relation: "Father", occupation: pick(OCCS, i),
            guardianMobile: `0321-${String(2026000 + i).slice(1)}`,
            guardianCnic: `35202-${String(2026001 + i).padStart(7,"0")}-${i % 9}`,
            classCode: pick(CLASSES_STU, i),
            sectionId: pick(SECS, i).id,
            houseId: pick(HOUSES_S, i).id,
            academicYearId: year2627.id,
            enrollmentDate: "2026-09-01",
            status: "active",
          });
        }
        await db.insert(studentsTable).values(students);
        logger.info({ count: students.length }, "seeded: students");
      }
    }

    // ── 17. Fee Challans ──────────────────────────────────────────────────────
    if (seedTenantId && !(await skip("fee_challans", feeChallansTable))) {
      const years    = await db.select().from(academicYearsTable);
      const y2627    = years.find(y => y.name === "2026-2027")!;
      const studs    = await db.select({ id: studentsTable.id, classCode: studentsTable.classCode }).from(studentsTable).limit(20);
      const feeTypes = await db.select().from(feeTypesTable);
      const schedule = await db.select().from(feeScheduleTable);
      const tuition  = feeTypes.find(f => f.feeCode === "tuition-fee")!;
      const hostel   = feeTypes.find(f => f.feeCode === "hostel-fee")!;
      const getAmt   = (classCode: string, feeTypeId: string) =>
        schedule.find(s => s.classCode === classCode && s.feeTypeId === feeTypeId)?.amount ?? 0;
      if (studs.length > 0 && tuition && hostel) {
        const challans: any[] = [];
        let n = 1;
        for (const stu of studs) {
          for (const month of ["2026-09","2026-10","2026-11"]) {
            const [y, m] = month.split("-").map(Number);
            const isPaid = month !== "2026-11";
            for (const ft of [tuition, hostel]) {
              challans.push({
                tenantId: seedTenantId,
                studentId: stu.id, feeTypeId: ft.id, academicYearId: y2627.id,
                amount: getAmt(stu.classCode, ft.id),
                month, issueDate: ymd(y, m, 1), dueDate: ymd(y, m, 10),
                challanNumber: `CCM-${month.replace("-","")}-${String(n++).padStart(4,"0")}`,
                status: isPaid ? "paid" : "pending",
                paidAt: isPaid ? new Date(`${month}-15T10:00:00Z`) : null,
              });
            }
          }
        }
        await db.insert(feeChallansTable).values(challans);
        logger.info({ count: challans.length }, "seeded: fee challans");
      }
    }

    // ── 18. HR Departments ────────────────────────────────────────────────────
    if (seedTenantId && !(await skip("hr_departments", hrDepartmentsTable))) {
      await db.insert(hrDepartmentsTable).values([
        { name: "Academics",      description: "Teaching and academic staff",              active: true, sortOrder: 1 },
        { name: "Administration", description: "Administrative and support staff",          active: true, sortOrder: 2 },
        { name: "Finance",        description: "Finance and accounts department",           active: true, sortOrder: 3 },
        { name: "Medical",        description: "Medical staff and sick bay",               active: true, sortOrder: 4 },
        { name: "Sports & PT",    description: "Physical education and sports staff",       active: true, sortOrder: 5 },
        { name: "Hostel",         description: "Hostel management and wardens",             active: true, sortOrder: 6 },
        { name: "IT & Library",   description: "IT support, library and resource centre",  active: true, sortOrder: 7 },
        { name: "Security",       description: "Gate and security staff",                  active: true, sortOrder: 8 },
      ].map(r => ({ ...r, tenantId: seedTenantId })));
      logger.info("seeded: HR departments");
    }

    // ── 19. HR Salary Grades ──────────────────────────────────────────────────
    if (seedTenantId && !(await skip("hr_salary_grades", hrSalaryGradesTable))) {
      await db.insert(hrSalaryGradesTable).values([
        { name: "BPS-14",  basicMin: 30000,  basicMax: 45000,  description: "Junior clerical",    active: true, sortOrder: 1 },
        { name: "BPS-16",  basicMin: 40000,  basicMax: 60000,  description: "Assistant officer",  active: true, sortOrder: 2 },
        { name: "BPS-17",  basicMin: 55000,  basicMax: 80000,  description: "Officer grade",      active: true, sortOrder: 3 },
        { name: "BPS-18",  basicMin: 75000,  basicMax: 110000, description: "Senior officer",     active: true, sortOrder: 4 },
        { name: "BPS-19",  basicMin: 100000, basicMax: 150000, description: "Director grade",     active: true, sortOrder: 5 },
        { name: "Visiting",basicMin: 15000,  basicMax: 30000,  description: "Visiting/contract",  active: true, sortOrder: 6 },
      ].map(r => ({ ...r, tenantId: seedTenantId })));
      logger.info("seeded: HR salary grades");
    }

    // ── 20. HR Designations ───────────────────────────────────────────────────
    if (seedTenantId && !(await skip("hr_designations", hrDesignationsTable))) {
      const depts = await db.select().from(hrDepartmentsTable);
      const d = (n: string) => depts.find(x => x.name === n)?.id;
      await db.insert(hrDesignationsTable).values([
        { name: "Principal",                departmentId: d("Administration"), grade: "BPS-19", active: true, sortOrder: 1 },
        { name: "Vice Principal",           departmentId: d("Administration"), grade: "BPS-18", active: true, sortOrder: 2 },
        { name: "Head of Department",       departmentId: d("Academics"),      grade: "BPS-18", active: true, sortOrder: 3 },
        { name: "Senior Lecturer",          departmentId: d("Academics"),      grade: "BPS-17", active: true, sortOrder: 4 },
        { name: "Lecturer",                 departmentId: d("Academics"),      grade: "BPS-17", active: true, sortOrder: 5 },
        { name: "Assistant Lecturer",       departmentId: d("Academics"),      grade: "BPS-16", active: true, sortOrder: 6 },
        { name: "Accountant",               departmentId: d("Finance"),        grade: "BPS-16", active: true, sortOrder: 7 },
        { name: "Chief Accountant",         departmentId: d("Finance"),        grade: "BPS-17", active: true, sortOrder: 8 },
        { name: "Medical Officer",          departmentId: d("Medical"),        grade: "BPS-17", active: true, sortOrder: 9 },
        { name: "Nurse",                    departmentId: d("Medical"),        grade: "BPS-14", active: true, sortOrder: 10 },
        { name: "PT Instructor",            departmentId: d("Sports & PT"),    grade: "BPS-16", active: true, sortOrder: 11 },
        { name: "Senior Warden",            departmentId: d("Hostel"),         grade: "BPS-16", active: true, sortOrder: 12 },
        { name: "Librarian",                departmentId: d("IT & Library"),   grade: "BPS-16", active: true, sortOrder: 13 },
        { name: "IT Administrator",         departmentId: d("IT & Library"),   grade: "BPS-16", active: true, sortOrder: 14 },
        { name: "Gate NCO / Security Guard",departmentId: d("Security"),       grade: "BPS-14", active: true, sortOrder: 15 },
        { name: "Administrative Officer",   departmentId: d("Administration"), grade: "BPS-17", active: true, sortOrder: 16 },
        { name: "Visiting",                 departmentId: d("Academics"),      grade: "Visiting",active: true, sortOrder: 17 },
      ].map(r => ({ ...r, tenantId: seedTenantId })));
      logger.info("seeded: HR designations");
    }

    // ── 21. HR Incentive / Deduction Types ────────────────────────────────────
    if (seedTenantId && !(await skip("hr_incentive_types", hrIncentiveTypesTable))) {
      await db.insert(hrIncentiveTypesTable).values([
        { name: "House Rent Allowance", category: "allowance", calculationType: "percentage", defaultValue: 45,    active: true, sortOrder: 1 },
        { name: "Medical Allowance",    category: "allowance", calculationType: "percentage", defaultValue: 15,    active: true, sortOrder: 2 },
        { name: "Conveyance Allowance", category: "allowance", calculationType: "fixed",      defaultValue: 2000,  active: true, sortOrder: 3 },
        { name: "Utility Allowance",    category: "allowance", calculationType: "percentage", defaultValue: 10,    active: true, sortOrder: 4 },
        { name: "Special Pay",          category: "allowance", calculationType: "fixed",      defaultValue: 5000,  active: true, sortOrder: 5 },
        { name: "Eid Bonus",            category: "bonus",     calculationType: "percentage", defaultValue: 100,   active: true, sortOrder: 6 },
        { name: "Performance Bonus",    category: "bonus",     calculationType: "fixed",      defaultValue: 10000, active: true, sortOrder: 7 },
        { name: "Overtime Pay",         category: "overtime",  calculationType: "fixed",      defaultValue: 0,     active: true, sortOrder: 8 },
      ].map(r => ({ ...r, tenantId: seedTenantId })));
      logger.info("seeded: HR incentive types");
    }
    if (seedTenantId && !(await skip("hr_deduction_types", hrDeductionTypesTable))) {
      await db.insert(hrDeductionTypesTable).values([
        { name: "Income Tax",        category: "tax",       calculationType: "percentage", defaultValue: 5,   active: true, sortOrder: 1 },
        { name: "EOBI Contribution", category: "insurance", calculationType: "fixed",      defaultValue: 370, active: true, sortOrder: 2 },
        { name: "GP Fund",           category: "insurance", calculationType: "percentage", defaultValue: 6,   active: true, sortOrder: 3 },
        { name: "Salary Advance",    category: "advance",   calculationType: "fixed",      defaultValue: 0,   active: true, sortOrder: 4 },
        { name: "Loan Recovery",     category: "loan",      calculationType: "fixed",      defaultValue: 0,   active: true, sortOrder: 5 },
        { name: "Absenteeism",       category: "other",     calculationType: "fixed",      defaultValue: 0,   active: true, sortOrder: 6 },
      ].map(r => ({ ...r, tenantId: seedTenantId })));
      logger.info("seeded: HR deduction types");
    }

    // ── 22. Employees ─────────────────────────────────────────────────────────
    if (seedTenantId && !(await skip("employees", employeesTable))) {
      const depts = await db.select().from(hrDepartmentsTable);
      const desig = await db.select().from(hrDesignationsTable);
      const grades= await db.select().from(hrSalaryGradesTable);
      const d = (n: string) => depts.find(x => x.name === n)?.id ?? null;
      const des=(n: string) => desig.find(x => x.name === n)?.id ?? null;
      const g = (n: string) => grades.find(x => x.name === n)?.id ?? null;
      await db.insert(employeesTable).values([
        { staffId:"CCM-ADM-001",fullName: "Khalid Mehmood", gender:"male",  role:"admin",          designationId:des("Principal"),           departmentId:d("Administration"),salaryGradeId:g("BPS-19"),joiningDate:"2015-09-01",contractType:"permanent",status:"active",email:"principal@ccm.edu.pk",  phone:"0321-5000001",qualification:"PhD Education",experience:"20 years" },
        { staffId:"CCM-ADM-002",fullName: "Tariq Hussain", gender:"male",  role:"admin",          designationId:des("Vice Principal"),       departmentId:d("Administration"),salaryGradeId:g("BPS-18"),joiningDate:"2018-03-15",contractType:"permanent",status:"active",email:"vp@ccm.edu.pk",         phone:"0321-5000002",qualification:"MSc",experience:"15 years" },
        { staffId:"CCM-ADM-003",fullName: "Amna Siddiqui",gender:"female",role:"admission_officer",designationId:des("Administrative Officer"),departmentId:d("Administration"),salaryGradeId:g("BPS-17"),joiningDate:"2020-07-01",contractType:"permanent",status:"active",email:"admissions@ccm.edu.pk",phone:"0321-5000003" },
        { staffId:"CCM-TCH-001",fullName: "Rizwan Ahmad",   gender:"male",  role:"teacher",        designationId:des("Head of Department"),   departmentId:d("Academics"),     salaryGradeId:g("BPS-18"),joiningDate:"2016-09-01",contractType:"permanent",status:"active",email:"rizwan.a@ccm.edu.pk",  phone:"0321-5000010",qualification:"MSc Physics" },
        { staffId:"CCM-TCH-002",fullName: "Sana Farooq",  gender:"female",role:"teacher",        designationId:des("Senior Lecturer"),      departmentId:d("Academics"),     salaryGradeId:g("BPS-17"),joiningDate:"2019-02-15",contractType:"permanent",status:"active",email:"sana.f@ccm.edu.pk",    phone:"0321-5000011",qualification:"MSc Chemistry" },
        { staffId:"CCM-TCH-003",fullName: "Asad Khan",    gender:"male",  role:"teacher",        designationId:des("Lecturer"),             departmentId:d("Academics"),     salaryGradeId:g("BPS-17"),joiningDate:"2021-09-01",contractType:"permanent",status:"active",email:"asad.k@ccm.edu.pk",    phone:"0321-5000012",qualification:"BSc Mathematics" },
        { staffId:"CCM-TCH-004",fullName: "Fatima Malik",   gender:"female",role:"teacher",        designationId:des("Lecturer"),             departmentId:d("Academics"),     salaryGradeId:g("BPS-17"),joiningDate:"2022-01-15",contractType:"permanent",status:"active",email:"fatima.m@ccm.edu.pk",  phone:"0321-5000013",qualification:"MSc English" },
        { staffId:"CCM-TCH-005",fullName: "Bilal Shah",    gender:"male",  role:"teacher",        designationId:des("Assistant Lecturer"),   departmentId:d("Academics"),     salaryGradeId:g("BPS-16"),joiningDate:"2023-09-01",contractType:"contract", status:"active",email:"bilal.s@ccm.edu.pk",    phone:"0321-5000014",qualification:"BS Biology" },
        { staffId:"CCM-TCH-006",fullName: "Rabia Qureshi", gender:"female",role:"teacher",        designationId:des("Lecturer"),             departmentId:d("Academics"),     salaryGradeId:g("BPS-17"),joiningDate:"2020-09-01",contractType:"permanent",status:"active",email:"rabia.q@ccm.edu.pk",   phone:"0321-5000015",qualification:"MCS Computer Science" },
        { staffId:"CCM-TCH-007",fullName: "Umar Farooq",  gender:"male",  role:"teacher",        designationId:des("Visiting"),             departmentId:d("Academics"),     salaryGradeId:g("Visiting"),joiningDate:"2024-09-01",contractType:"visiting", status:"active",email:"umar.f@ccm.edu.pk",    phone:"0321-5000016",qualification:"MA Urdu" },
        { staffId:"CCM-FIN-001",fullName: "Hafiz Iqbal",   gender:"male",  role:"accountant",     designationId:des("Chief Accountant"),     departmentId:d("Finance"),       salaryGradeId:g("BPS-17"),joiningDate:"2017-06-01",contractType:"permanent",status:"active",email:"accounts@ccm.edu.pk",  phone:"0321-5000020",qualification:"MBA Finance" },
        { staffId:"CCM-FIN-002",fullName: "Mehwish Baig",    gender:"female",role:"accountant",     designationId:des("Accountant"),           departmentId:d("Finance"),       salaryGradeId:g("BPS-16"),joiningDate:"2021-03-01",contractType:"permanent",status:"active",email:"mehwish.b@ccm.edu.pk", phone:"0321-5000021",qualification:"ACCA" },
        { staffId:"CCM-MED-001",fullName: "Dr. Sajid Nawaz",   gender:"male",  role:"medical_officer",designationId:des("Medical Officer"),      departmentId:d("Medical"),       salaryGradeId:g("BPS-17"),joiningDate:"2019-08-01",contractType:"permanent",status:"active",email:"medical@ccm.edu.pk",   phone:"0321-5000030",qualification:"MBBS" },
        { staffId:"CCM-MED-002",fullName: "Nadia Riaz",    gender:"female",role:"support",        designationId:des("Nurse"),                departmentId:d("Medical"),       salaryGradeId:g("BPS-14"),joiningDate:"2022-05-01",contractType:"permanent",status:"active",email:"nadia.r@ccm.edu.pk",   phone:"0321-5000031",qualification:"Nursing Diploma" },
        { staffId:"CCM-SPT-001",fullName: "Imran Butt",    gender:"male",  role:"support",        designationId:des("PT Instructor"),        departmentId:d("Sports & PT"),   salaryGradeId:g("BPS-16"),joiningDate:"2018-09-01",contractType:"permanent",status:"active",email:"pt@ccm.edu.pk",         phone:"0321-5000040" },
        { staffId:"CCM-HOT-001",fullName: "Tariq Abbasi",  gender:"male",  role:"support",        designationId:des("Senior Warden"),        departmentId:d("Hostel"),        salaryGradeId:g("BPS-16"),joiningDate:"2020-06-01",contractType:"permanent",status:"active",email:"warden@ccm.edu.pk",     phone:"0321-5000050" },
        { staffId:"CCM-LIB-001",fullName: "Asma Rehman",  gender:"female",role:"librarian",      designationId:des("Librarian"),            departmentId:d("IT & Library"),  salaryGradeId:g("BPS-16"),joiningDate:"2019-09-01",contractType:"permanent",status:"active",email:"library@ccm.edu.pk",    phone:"0321-5000060",qualification:"MLIS" },
        { staffId:"CCM-IT-001", fullName: "Zubair Ghafoor", gender:"male",  role:"support",        designationId:des("IT Administrator"),     departmentId:d("IT & Library"),  salaryGradeId:g("BPS-16"),joiningDate:"2021-01-01",contractType:"permanent",status:"active",email:"it@ccm.edu.pk",          phone:"0321-5000061",qualification:"BSCS" },
      ].map(r => ({ ...r, tenantId: seedTenantId })) as any[]);
      logger.info("seeded: employees");
    }

    // ── 23. Employee Bank Accounts ────────────────────────────────────────────
    if (!(await skip("employee_bank_accounts", employeeBankAccountsTable))) {
      const emps  = await db.select({ id: employeesTable.id, staffId: employeesTable.staffId }).from(employeesTable);
      const banks = ["HBL","NBP","UBL","MCB","ABL","Meezan Bank","Bank Alfalah","Allied Bank"];
      await db.insert(employeeBankAccountsTable).values(emps.map((e, i) => ({
        employeeId: e.id,
        bankName: banks[i % banks.length],
        branchName: "Main Branch, Murree",
        accountTitle: e.staffId,
        accountNumber: `${String(1000000000 + i * 123456)}`,
        iban: `PK${String(50 + i).padStart(2,"0")}${banks[i % banks.length].replace(/\s/g,"").toUpperCase().slice(0,4)}${String(1000000000 + i * 123456)}`,
        isPrimary: true,
      })));
      logger.info("seeded: employee bank accounts");
    }

    // ── 24. Salary Transactions ───────────────────────────────────────────────
    if (!(await skip("employee_salary_transactions", employeeSalaryTransactionsTable))) {
      const emps   = await db.select({ id: employeesTable.id }).from(employeesTable);
      const grades = await db.select().from(hrSalaryGradesTable);
      const txns: any[] = [];
      for (const [i, emp] of emps.entries()) {
        const gr = grades[i % grades.length];
        const basic = gr.basicMin + Math.floor((gr.basicMax - gr.basicMin) * 0.5);
        const allowances = Math.round(basic * 0.7);
        const deductions = Math.round(basic * 0.08);
        for (const month of ["2026-09","2026-10","2026-11"]) {
          const isPaid = month !== "2026-11";
          txns.push({ employeeId: emp.id, month, basicSalary: basic, allowances, deductions, netSalary: basic + allowances - deductions, status: isPaid ? "paid" : "pending", paidAt: isPaid ? new Date(`${month}-28T10:00:00Z`) : null });
        }
      }
      await db.insert(employeeSalaryTransactionsTable).values(txns);
      logger.info({ count: txns.length }, "seeded: salary transactions");
    }

    // ── 25. HR Attendance ─────────────────────────────────────────────────────
    if (!(await skip("hr_attendance", hrAttendanceTable))) {
      const emps = await db.select({ id: employeesTable.id }).from(employeesTable);
      const statuses = ["present","present","present","present","absent","late","present","present"];
      const records: any[] = [];
      for (const emp of emps) {
        for (let i = 0; i < 10; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const s = statuses[(emps.indexOf(emp) + i) % statuses.length];
          records.push({ employeeId: emp.id, attendanceDate: d.toISOString().split("T")[0], status: s, inTime: s !== "absent" ? "08:00" : undefined, outTime: s !== "absent" ? "16:00" : undefined });
        }
      }
      await db.insert(hrAttendanceTable).values(records);
      logger.info({ count: records.length }, "seeded: HR attendance");
    }

    // ── 26. HR Leave Requests ─────────────────────────────────────────────────
    if (!(await skip("hr_leave_requests", hrLeaveRequestsTable))) {
      const emps = await db.select({ id: employeesTable.id }).from(employeesTable);
      const leaveTypes  = ["casual","sick","earned","compensatory"];
      const leaveStatus = ["pending","approved","approved","rejected","pending"];
      const requests: any[] = [];
      for (const [i, emp] of emps.entries()) {
        if (i % 3 !== 0) continue;
        const from = new Date(); from.setDate(from.getDate() - 20 + i);
        const to = new Date(from); to.setDate(to.getDate() + 2);
        requests.push({ employeeId: emp.id, leaveType: leaveTypes[i % leaveTypes.length], fromDate: from.toISOString().split("T")[0], toDate: to.toISOString().split("T")[0], reason: ["Personal reasons","Medical checkup","Family function","Urgent work"][i % 4], status: leaveStatus[i % leaveStatus.length] });
      }
      await db.insert(hrLeaveRequestsTable).values(requests);
      logger.info({ count: requests.length }, "seeded: HR leave requests");
    }

    // ── 27. Hostel ────────────────────────────────────────────────────────────
    if (!(await skip("hostel_blocks", hostelBlocksTable))) {
      await db.insert(hostelBlocksTable).values([
        { name: "Block A (Junior)", blockType: "boys",  floors: 2, capacity: 80, description: "Classes VII–IX", active: true, sortOrder: 1 },
        { name: "Block B (Senior)", blockType: "boys",  floors: 2, capacity: 80, description: "Classes X–XII",  active: true, sortOrder: 2 },
        { name: "Staff Quarters",   blockType: "staff", floors: 1, capacity: 20, description: "Residential quarters for staff", active: true, sortOrder: 3 },
      ]);
      logger.info("seeded: hostel blocks");
    }
    if (!(await skip("hostel_room_types", hostelRoomTypesTable))) {
      await db.insert(hostelRoomTypesTable).values([
        { name: "4-Bed Dormitory", capacity: 4, description: "Shared dormitory for 4 cadets", active: true, sortOrder: 1 },
        { name: "2-Bed Room",      capacity: 2, description: "Double-occupancy room",          active: true, sortOrder: 2 },
        { name: "Single Room",     capacity: 1, description: "Single-occupancy staff room",    active: true, sortOrder: 3 },
      ]);
      logger.info("seeded: hostel room types");
    }
    if (!(await skip("hostel_rooms", hostelRoomsTable))) {
      const blocks    = await db.select().from(hostelBlocksTable);
      const roomTypes = await db.select().from(hostelRoomTypesTable);
      const blockA    = blocks.find(b => b.name.includes("Junior"))!;
      const blockB    = blocks.find(b => b.name.includes("Senior"))!;
      const dormType  = roomTypes.find(r => r.name === "4-Bed Dormitory")!;
      const dblType   = roomTypes.find(r => r.name === "2-Bed Room")!;
      const rooms: any[] = [];
      for (const [bk, blk] of [["A", blockA],["B", blockB]] as const) {
        for (let fl = 1; fl <= 2; fl++) for (let rm = 1; rm <= 8; rm++) {
          rooms.push({ blockId: (blk as any).id, roomNumber: `${bk}${fl}${String(rm).padStart(2,"0")}`, roomTypeId: rm <= 6 ? dormType.id : dblType.id, floor: fl, capacity: rm <= 6 ? 4 : 2, status: "available" });
        }
      }
      await db.insert(hostelRoomsTable).values(rooms);
      logger.info({ count: rooms.length }, "seeded: hostel rooms");
    }
    if (!(await skip("hostel_allocations", hostelAllocationsTable))) {
      const rooms    = await db.select().from(hostelRoomsTable).limit(10);
      const studs    = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode }).from(studentsTable).limit(20);
      if (studs.length > 0) {
        const allocs = studs.slice(0, Math.min(studs.length, rooms.length * 2)).map((s, i) => ({
          studentId: s.id, studentName: s.fullName, applicantId: s.applicantId, classCode: s.classCode, roomId: rooms[i % rooms.length].id, fromDate: "2026-09-01", toDate: "2027-06-30", status: "active",
        }));
        await db.insert(hostelAllocationsTable).values(allocs);
        logger.info({ count: allocs.length }, "seeded: hostel allocations");
      }
    }

    // ── 28. Library ───────────────────────────────────────────────────────────
    if (!(await skip("library_categories", libraryCategoriesTable))) {
      await db.insert(libraryCategoriesTable).values([
        { name: "Physics & Maths",     active: true, sortOrder: 1 },
        { name: "Chemistry & Biology", active: true, sortOrder: 2 },
        { name: "English Literature",  active: true, sortOrder: 3 },
        { name: "Urdu Literature",     active: true, sortOrder: 4 },
        { name: "History & Geography", active: true, sortOrder: 5 },
        { name: "Islamic Studies",     active: true, sortOrder: 6 },
        { name: "Reference & General", active: true, sortOrder: 7 },
        { name: "Computer Science",    active: true, sortOrder: 8 },
      ]);
      logger.info("seeded: library categories");
    }
    if (!(await skip("library_publishers", libraryPublishersTable))) {
      await db.insert(libraryPublishersTable).values([
        { name: "Oxford University Press", city: "Karachi",   active: true, sortOrder: 1 },
        { name: "Ilmi Kitab Khana",        city: "Lahore",    active: true, sortOrder: 2 },
        { name: "Caravan Book House",      city: "Lahore",    active: true, sortOrder: 3 },
        { name: "National Book Foundation",city: "Islamabad", active: true, sortOrder: 4 },
        { name: "Paramount Books",         city: "Karachi",   active: true, sortOrder: 5 },
      ]);
      logger.info("seeded: library publishers");
    }
    if (!(await skip("library_books", libraryBooksTable))) {
      const cats = await db.select().from(libraryCategoriesTable);
      const pubs = await db.select().from(libraryPublishersTable);
      const c = (n: string) => cats.find(x => x.name === n)?.id;
      const p = (n: string) => pubs.find(x => x.name === n)?.id;
      await db.insert(libraryBooksTable).values([
        { title:"Physics Part I (Class XI)",     author:"Halliday & Resnick",  categoryId:c("Physics & Maths"),    publisherId:p("Oxford University Press"), totalCopies:25,availableCopies:20,shelfLocation:"P-01",yearPublished:"2022" },
        { title:"Physics Part II (Class XI)",    author:"Halliday & Resnick",  categoryId:c("Physics & Maths"),    publisherId:p("Oxford University Press"), totalCopies:25,availableCopies:22,shelfLocation:"P-02",yearPublished:"2022" },
        { title:"Mathematics Class IX",          author:"Punjab Textbook Board",categoryId:c("Physics & Maths"),   publisherId:p("National Book Foundation"),totalCopies:40,availableCopies:35,shelfLocation:"M-01",yearPublished:"2023" },
        { title:"Chemistry Part I",              author:"Dr. Haroon ur Rashid",categoryId:c("Chemistry & Biology"),publisherId:p("Ilmi Kitab Khana"),        totalCopies:30,availableCopies:25,shelfLocation:"C-01",yearPublished:"2021" },
        { title:"Biology Class XI",              author:"FBISE",               categoryId:c("Chemistry & Biology"),publisherId:p("National Book Foundation"),totalCopies:30,availableCopies:28,shelfLocation:"C-02",yearPublished:"2022" },
        { title:"English Grammar & Composition", author:"Wren & Martin",       categoryId:c("English Literature"), publisherId:p("Oxford University Press"), totalCopies:20,availableCopies:18,shelfLocation:"E-01",yearPublished:"2020" },
        { title:"Oxford Advanced Learner's Dict",author:"Oxford",              categoryId:c("English Literature"), publisherId:p("Oxford University Press"), totalCopies:10,availableCopies:10,shelfLocation:"E-02",yearPublished:"2021" },
        { title:"Urdu Adab ki Mukhtasar Tarikh", author:"Dr. Anwar Sadeed",    categoryId:c("Urdu Literature"),    publisherId:p("Ilmi Kitab Khana"),        totalCopies:15,availableCopies:12,shelfLocation:"U-01",yearPublished:"2019" },
        { title:"Pakistan Studies (Class IX–X)", author:"FBISE",               categoryId:c("History & Geography"),publisherId:p("National Book Foundation"),totalCopies:45,availableCopies:40,shelfLocation:"H-01",yearPublished:"2023" },
        { title:"Islamiyat Lazmi",               author:"Dr. Ghulam Jilani",   categoryId:c("Islamic Studies"),    publisherId:p("Paramount Books"),         totalCopies:40,availableCopies:38,shelfLocation:"I-01",yearPublished:"2022" },
        { title:"Introduction to Computing",     author:"FBISE",               categoryId:c("Computer Science"),   publisherId:p("National Book Foundation"),totalCopies:20,availableCopies:17,shelfLocation:"IT-01",yearPublished:"2023" },
        { title:"Encyclopaedia Britannica Vol 1",author:"Various",             categoryId:c("Reference & General"),publisherId:p("Oxford University Press"), totalCopies:2, availableCopies:2, shelfLocation:"R-01",yearPublished:"2018" },
      ]);
      logger.info("seeded: library books");
    }
    if (!(await skip("library_issues", libraryIssuesTable))) {
      const books = await db.select().from(libraryBooksTable);
      const studs = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId }).from(studentsTable).limit(15);
      if (studs.length > 0) {
        const issues: any[] = [];
        studs.slice(0, 12).forEach((s, i) => {
          const book = books[i % books.length];
          const isReturned = i % 3 === 0;
          issues.push({ bookId: book.id, studentId: s.id, studentName: s.fullName, applicantId: s.applicantId, issuedDate: ymd(2026,10,1+i), dueDate: ymd(2026,10,15+i), returnedDate: isReturned ? ymd(2026,10,14+i) : undefined, fineAmount: 0, status: isReturned ? "returned" : "issued" });
        });
        await db.insert(libraryIssuesTable).values(issues);
        logger.info({ count: issues.length }, "seeded: library issues");
      }
    }

    // ── 29. Medical ───────────────────────────────────────────────────────────
    if (!(await skip("medical_medicine_categories", medicalMedicineCategoriesTable))) {
      await db.insert(medicalMedicineCategoriesTable).values([
        { name: "Analgesics & Antipyretics", active: true, sortOrder: 1 },
        { name: "Antibiotics",               active: true, sortOrder: 2 },
        { name: "Antihistamines",            active: true, sortOrder: 3 },
        { name: "Gastrointestinal",          active: true, sortOrder: 4 },
        { name: "Vitamins & Supplements",    active: true, sortOrder: 5 },
        { name: "Topical & First Aid",       active: true, sortOrder: 6 },
      ]);
      logger.info("seeded: medical medicine categories");
    }
    if (!(await skip("medical_medicines", medicalMedicinesTable))) {
      const cats = await db.select().from(medicalMedicineCategoriesTable);
      const c = (n: string) => cats.find(x => x.name === n)?.id;
      await db.insert(medicalMedicinesTable).values([
        { name:"Paracetamol 500mg", categoryId:c("Analgesics & Antipyretics"), unit:"tablet",  active:true,sortOrder:1 },
        { name:"Brufen 400mg",      categoryId:c("Analgesics & Antipyretics"), unit:"tablet",  active:true,sortOrder:2 },
        { name:"Augmentin 625mg",   categoryId:c("Antibiotics"),               unit:"tablet",  active:true,sortOrder:3 },
        { name:"Amoxicillin 500mg", categoryId:c("Antibiotics"),               unit:"capsule", active:true,sortOrder:4 },
        { name:"Cetirizine 10mg",   categoryId:c("Antihistamines"),            unit:"tablet",  active:true,sortOrder:5 },
        { name:"Flagyl 400mg",      categoryId:c("Gastrointestinal"),          unit:"tablet",  active:true,sortOrder:6 },
        { name:"ORS Sachet",        categoryId:c("Gastrointestinal"),          unit:"sachet",  active:true,sortOrder:7 },
        { name:"Vitamin C 500mg",   categoryId:c("Vitamins & Supplements"),    unit:"tablet",  active:true,sortOrder:8 },
        { name:"Betadine Solution", categoryId:c("Topical & First Aid"),       unit:"ml",      active:true,sortOrder:9 },
        { name:"Bandages (5cm)",    categoryId:c("Topical & First Aid"),       unit:"piece",   active:true,sortOrder:10 },
      ]);
      logger.info("seeded: medical medicines");
    }
    if (!(await skip("medical_conditions", medicalConditionsTable))) {
      await db.insert(medicalConditionsTable).values([
        { name:"Common Cold / Flu",   active:true,sortOrder:1 },
        { name:"Fever",               active:true,sortOrder:2 },
        { name:"Gastroenteritis",     active:true,sortOrder:3 },
        { name:"Headache",            active:true,sortOrder:4 },
        { name:"Skin Allergy",        active:true,sortOrder:5 },
        { name:"Sports Injury (Minor)",active:true,sortOrder:6},
        { name:"Dental Pain",         active:true,sortOrder:7 },
        { name:"Eye Infection",       active:true,sortOrder:8 },
      ]);
      logger.info("seeded: medical conditions");
    }
    if (!(await skip("medical_visits", medicalVisitsTable))) {
      const conds = await db.select().from(medicalConditionsTable);
      const studs = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode }).from(studentsTable).limit(20);
      if (studs.length > 0) {
        const visits: any[] = [];
        studs.slice(0, 15).forEach((s, i) => {
          const d = new Date(); d.setDate(d.getDate() - i * 2);
          visits.push({ studentId:s.id, studentName:s.fullName, applicantId:s.applicantId, classCode:s.classCode, visitDate:d.toISOString().split("T")[0], complaint:["Fever and cough","Stomach ache","Headache","Skin rash","Sprained ankle","Sore throat"][i%6], conditionId:conds[i%conds.length].id, diagnosis:["Viral URTI","Gastritis","Tension headache","Allergic dermatitis","Sprain","Pharyngitis"][i%6], treatmentGiven:"Symptomatic treatment given", medicinesGiven:"Paracetamol 500mg", status:["outpatient","outpatient","outpatient","admitted","outpatient"][i%5] });
        });
        await db.insert(medicalVisitsTable).values(visits);
        logger.info({ count: visits.length }, "seeded: medical visits");
      }
    }

    // ── 30. Sports ────────────────────────────────────────────────────────────
    if (!(await skip("sports_categories", sportsCategoriesTable))) {
      await db.insert(sportsCategoriesTable).values([
        { name:"Cricket",    active:true,sortOrder:1 },
        { name:"Football",   active:true,sortOrder:2 },
        { name:"Hockey",     active:true,sortOrder:3 },
        { name:"Basketball", active:true,sortOrder:4 },
        { name:"Volleyball", active:true,sortOrder:5 },
        { name:"Athletics",  active:true,sortOrder:6 },
        { name:"Squash",     active:true,sortOrder:7 },
      ]);
      logger.info("seeded: sports categories");
    }
    if (!(await skip("sports_venues", sportsVenuesTable))) {
      await db.insert(sportsVenuesTable).values([
        { name:"Main Cricket Ground",   venueType:"outdoor",capacity:500,description:"Full-size cricket ground with pavilion",   active:true,sortOrder:1 },
        { name:"Football Pitch",        venueType:"outdoor",capacity:300,description:"Full-size football field",                 active:true,sortOrder:2 },
        { name:"Hockey Ground",         venueType:"outdoor",capacity:300,description:"Astro-turf hockey ground",                 active:true,sortOrder:3 },
        { name:"Indoor Sports Complex", venueType:"indoor", capacity:200,description:"Basketball, Volleyball & Badminton courts",active:true,sortOrder:4 },
        { name:"Squash Courts",         venueType:"court",  capacity:30, description:"2 glass-backed squash courts",             active:true,sortOrder:5 },
        { name:"Athletics Track",       venueType:"outdoor",capacity:400,description:"400m running track with field area",       active:true,sortOrder:6 },
      ]);
      logger.info("seeded: sports venues");
    }
    if (!(await skip("sports_teams", sportsTeamsTable))) {
      const cats   = await db.select().from(sportsCategoriesTable);
      const c = (n: string) => cats.find(x => x.name === n)?.id;
      const houses = ["Jinnah House","Iqbal House","Liaquat House","Sir Syed House"];
      const teams: any[] = [];
      for (const sport of ["Cricket","Football","Hockey"]) {
        houses.forEach((house, i) => {
          teams.push({ name:`${house} ${sport} XI`, sportCategoryId:c(sport), house, coachName:["M. Imran Butt","A. Rashid","K. Ahmed","F. Hassan"][i], active:true });
        });
      }
      await db.insert(sportsTeamsTable).values(teams);
      logger.info({ count: teams.length }, "seeded: sports teams");
    }
    if (!(await skip("sports_fixtures", sportsFixturesTable))) {
      const venues  = await db.select().from(sportsVenuesTable);
      const cricket = venues.find(v => v.name.includes("Cricket"))!;
      const football= venues.find(v => v.name.includes("Football"))!;
      await db.insert(sportsFixturesTable).values([
        { homeTeam:"Jinnah House Cricket XI",   awayTeam:"Iqbal House Cricket XI",    sport:"Cricket", venueId:cricket.id,  scheduledDate:ymd(2026,10,5), scheduledTime:"10:00",status:"completed",homeScore:142,awayScore:138,result:"Jinnah House won by 4 runs" },
        { homeTeam:"Liaquat House Cricket XI",  awayTeam:"Sir Syed House Cricket XI", sport:"Cricket", venueId:cricket.id,  scheduledDate:ymd(2026,10,12),scheduledTime:"10:00",status:"completed",homeScore:156,awayScore:121,result:"Liaquat House won by 35 runs" },
        { homeTeam:"Jinnah House Football XI",  awayTeam:"Liaquat House Football XI", sport:"Football",venueId:football.id, scheduledDate:ymd(2026,10,19),scheduledTime:"15:00",status:"completed",homeScore:2,  awayScore:1,  result:"Jinnah House won 2-1" },
        { homeTeam:"Iqbal House Cricket XI",    awayTeam:"Liaquat House Cricket XI",  sport:"Cricket", venueId:cricket.id,  scheduledDate:ymd(2026,11,2), scheduledTime:"10:00",status:"scheduled" },
        { homeTeam:"Jinnah House Cricket XI",   awayTeam:"Sir Syed House Cricket XI", sport:"Cricket", venueId:cricket.id,  scheduledDate:ymd(2026,11,9), scheduledTime:"10:00",status:"scheduled" },
        { homeTeam:"Iqbal House Football XI",   awayTeam:"Sir Syed House Football XI",sport:"Football",venueId:football.id, scheduledDate:ymd(2026,11,16),scheduledTime:"15:00",status:"scheduled" },
      ]);
      logger.info("seeded: sports fixtures");
    }

    // ── 31. Transport ─────────────────────────────────────────────────────────
    if (!(await skip("transport_vehicles", transportVehiclesTable))) {
      await db.insert(transportVehiclesTable).values([
        { regNo:"RYK-001",vehicleType:"bus",make:"Hino",  model:"RG8J",  capacity:45,description:"Main school bus — Islamabad route",active:true,sortOrder:1 },
        { regNo:"RYK-002",vehicleType:"bus",make:"Hino",  model:"RG8J",  capacity:45,description:"School bus — Rawalpindi route",   active:true,sortOrder:2 },
        { regNo:"RYK-003",vehicleType:"van",make:"Toyota",model:"Hiace", capacity:14,description:"Staff van — daily duty",          active:true,sortOrder:3 },
        { regNo:"RYK-004",vehicleType:"van",make:"Toyota",model:"Hiace", capacity:14,description:"Reserve van",                    active:true,sortOrder:4 },
        { regNo:"RYK-005",vehicleType:"car",make:"Toyota",model:"Corolla",capacity:4,description:"Principal's official vehicle",   active:true,sortOrder:5 },
      ]);
      logger.info("seeded: transport vehicles");
    }
    if (!(await skip("transport_routes", transportRoutesTable))) {
      await db.insert(transportRoutesTable).values([
        { name:"Murree–Islamabad",  origin:"Murree Main Campus",destination:"Islamabad (F-10)",        description:"Daily run; departs 07:30",active:true,sortOrder:1 },
        { name:"Murree–Rawalpindi", origin:"Murree Main Campus",destination:"Rawalpindi (Saddar)",     description:"Daily run; departs 07:45",active:true,sortOrder:2 },
        { name:"Murree–Lahore",     origin:"Murree Main Campus",destination:"Lahore (Data Darbar Rd)", description:"Weekend run only",       active:true,sortOrder:3 },
      ]);
      logger.info("seeded: transport routes");
    }
    if (!(await skip("transport_drivers", transportDriversTable))) {
      await db.insert(transportDriversTable).values([
        { name:"Ghulam Rasool", licenseType:"HTV",licenseNumber:"PB-HTV-2021-001",licenseExpiry:"2027-06-30",phone:"0300-4010001",status:"active" },
        { name:"Muhammad Aslam",licenseType:"HTV",licenseNumber:"PB-HTV-2020-042",licenseExpiry:"2026-12-31",phone:"0300-4010002",status:"active" },
        { name:"Zulfiqar Ali",  licenseType:"LTV",licenseNumber:"PB-LTV-2022-019",licenseExpiry:"2028-03-31",phone:"0300-4010003",status:"active" },
        { name:"Pervez Khan",   licenseType:"LTV",licenseNumber:"PB-LTV-2019-088",licenseExpiry:"2025-09-30",phone:"0300-4010004",status:"inactive" },
      ]);
      logger.info("seeded: transport drivers");
    }
    if (!(await skip("transport_trips", transportTripsTable))) {
      const vehicles = await db.select().from(transportVehiclesTable);
      const routes   = await db.select().from(transportRoutesTable);
      const allDrivers = await db.select({ id: transportDriversTable.id, status: transportDriversTable.status }).from(transportDriversTable);
      const drivers  = allDrivers.filter(dr => dr.status === "active");
      const trips: any[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const dateStr = d.toISOString().split("T")[0];
        trips.push({ routeId:routes[0].id,vehicleId:vehicles[0].id,driverId:drivers[0].id,tripDate:dateStr,departureTime:"07:30",arrivalTime:i>0?"09:00":undefined,status:i>0?"completed":"scheduled",passengerCount:38+(i%5) });
        trips.push({ routeId:routes[1].id,vehicleId:vehicles[1].id,driverId:drivers[1].id,tripDate:dateStr,departureTime:"07:45",arrivalTime:i>0?"09:15":undefined,status:i>0?"completed":"scheduled",passengerCount:41+(i%4) });
      }
      if (trips.length > 0) {
        await db.insert(transportTripsTable).values(trips);
        logger.info({ count: trips.length }, "seeded: transport trips");
      }
    }

    // ── 32. Store ─────────────────────────────────────────────────────────────
    if (!(await skip("store_item_categories", storeItemCategoriesTable))) {
      await db.insert(storeItemCategoriesTable).values([
        { name:"Stationery",         active:true,sortOrder:1 },
        { name:"Uniform & Clothing", active:true,sortOrder:2 },
        { name:"Sports Equipment",   active:true,sortOrder:3 },
        { name:"Cleaning Supplies",  active:true,sortOrder:4 },
        { name:"Kitchen & Mess",     active:true,sortOrder:5 },
        { name:"IT & Electronics",   active:true,sortOrder:6 },
      ]);
      logger.info("seeded: store item categories");
    }
    if (!(await skip("store_units", storeUnitsTable))) {
      await db.insert(storeUnitsTable).values([
        { name:"Piece",    symbol:"Pc", active:true,sortOrder:1 },
        { name:"Box",      symbol:"Box",active:true,sortOrder:2 },
        { name:"Ream",     symbol:"Rm", active:true,sortOrder:3 },
        { name:"Litre",    symbol:"L",  active:true,sortOrder:4 },
        { name:"Kilogram", symbol:"Kg", active:true,sortOrder:5 },
        { name:"Dozen",    symbol:"Dz", active:true,sortOrder:6 },
      ]);
      logger.info("seeded: store units");
    }
    if (!(await skip("store_items", storeItemsTable))) {
      const cats  = await db.select().from(storeItemCategoriesTable);
      const units = await db.select().from(storeUnitsTable);
      const c = (n: string) => cats.find(x => x.name === n)?.id;
      const u = (n: string) => units.find(x => x.name === n)?.id;
      await db.insert(storeItemsTable).values([
        { name:"A4 Paper (70gsm)",      sku:"STA-001",categoryId:c("Stationery"),        unitId:u("Ream"),    currentStock:120,reorderLevel:20,active:true },
        { name:"Blue Ballpoint Pens",   sku:"STA-002",categoryId:c("Stationery"),        unitId:u("Box"),     currentStock:50, reorderLevel:10,active:true },
        { name:"Whiteboard Markers",    sku:"STA-003",categoryId:c("Stationery"),        unitId:u("Box"),     currentStock:30, reorderLevel:5, active:true },
        { name:"Cadet Uniform (Summer)",sku:"UNF-001",categoryId:c("Uniform & Clothing"),unitId:u("Piece"),   currentStock:80, reorderLevel:20,active:true },
        { name:"Cadet Uniform (Winter)",sku:"UNF-002",categoryId:c("Uniform & Clothing"),unitId:u("Piece"),   currentStock:75, reorderLevel:20,active:true },
        { name:"Cricket Bat",           sku:"SPT-001",categoryId:c("Sports Equipment"),  unitId:u("Piece"),   currentStock:12, reorderLevel:5, active:true },
        { name:"Football",              sku:"SPT-002",categoryId:c("Sports Equipment"),  unitId:u("Piece"),   currentStock:8,  reorderLevel:4, active:true },
        { name:"Volleyball",            sku:"SPT-003",categoryId:c("Sports Equipment"),  unitId:u("Piece"),   currentStock:6,  reorderLevel:3, active:true },
        { name:"Phenyl (Cleaning)",     sku:"CLN-001",categoryId:c("Cleaning Supplies"), unitId:u("Litre"),   currentStock:40, reorderLevel:10,active:true },
        { name:"Hand Soap (500ml)",     sku:"CLN-002",categoryId:c("Cleaning Supplies"), unitId:u("Piece"),   currentStock:60, reorderLevel:15,active:true },
        { name:"Flour (Wheat)",         sku:"KIT-001",categoryId:c("Kitchen & Mess"),    unitId:u("Kilogram"),currentStock:500,reorderLevel:100,active:true },
        { name:"Cooking Oil",           sku:"KIT-002",categoryId:c("Kitchen & Mess"),    unitId:u("Litre"),   currentStock:80, reorderLevel:20,active:true },
        { name:"USB Flash Drive 32GB",  sku:"IT-001", categoryId:c("IT & Electronics"),  unitId:u("Piece"),   currentStock:15, reorderLevel:5, active:true },
      ]);
      logger.info("seeded: store items");
    }
    if (!(await skip("store_transactions", storeTransactionsTable))) {
      const items = await db.select({ id: storeItemsTable.id }).from(storeItemsTable);
      const txns: any[] = [];
      items.forEach((item, i) => {
        txns.push({ itemId:item.id,transactionType:"in",  quantity:50+i*5, transactionDate:ymd(2026,9,1),  reference:"PO-2026-001",notes:"Opening stock received" });
        txns.push({ itemId:item.id,transactionType:"out", quantity:5+i,    transactionDate:ymd(2026,9,15), reference:"REQ-001",issuedTo:`Department ${i+1}`,notes:"Monthly issue" });
        txns.push({ itemId:item.id,transactionType:"out", quantity:3,      transactionDate:ymd(2026,10,5), reference:"REQ-002",issuedTo:"Hostel Block A",notes:"Hostel requirement" });
      });
      await db.insert(storeTransactionsTable).values(txns);
      logger.info({ count: txns.length }, "seeded: store transactions");
    }

    // ── 33. Exams ─────────────────────────────────────────────────────────────
    if (!(await skip("exam_types", examTypesTable))) {
      await db.insert(examTypesTable).values([
        { name:"Monthly Test",          description:"Monthly class test",             active:true,sortOrder:1 },
        { name:"Mid-Term Examination",  description:"Mid-term exam held in November", active:true,sortOrder:2 },
        { name:"Annual Examination",    description:"Year-end annual examinations",   active:true,sortOrder:3 },
        { name:"Mock Examination",      description:"Board examination mock test",    active:true,sortOrder:4 },
        { name:"Practical Exam",        description:"Lab / practical assessment",     active:true,sortOrder:5 },
      ]);
      logger.info("seeded: exam types");
    }
    if (!(await skip("exam_grading_scales", examGradingScalesTable))) {
      await db.insert(examGradingScalesTable).values([
        { name:"FBISE A1–F Scale",description:"Federal Board standard grading",  active:true,sortOrder:1 },
        { name:"Pass/Fail Scale", description:"Simple pass/fail for practicals", active:true,sortOrder:2 },
      ]);
      logger.info("seeded: exam grading scales");
    }
    if (!(await skip("exam_grade_bands", examGradeBandsTable))) {
      const scales = await db.select().from(examGradingScalesTable);
      const fbise  = scales.find(s => s.name.includes("FBISE"))!;
      const pf     = scales.find(s => s.name.includes("Pass"))!;
      await db.insert(examGradeBandsTable).values([
        { gradeScaleId:fbise.id,grade:"A1",minPercent:90,maxPercent:100,remarks:"Outstanding",    active:true,sortOrder:1 },
        { gradeScaleId:fbise.id,grade:"A", minPercent:80,maxPercent:89, remarks:"Excellent",      active:true,sortOrder:2 },
        { gradeScaleId:fbise.id,grade:"B", minPercent:70,maxPercent:79, remarks:"Good",           active:true,sortOrder:3 },
        { gradeScaleId:fbise.id,grade:"C", minPercent:60,maxPercent:69, remarks:"Satisfactory",   active:true,sortOrder:4 },
        { gradeScaleId:fbise.id,grade:"D", minPercent:50,maxPercent:59, remarks:"Pass",           active:true,sortOrder:5 },
        { gradeScaleId:fbise.id,grade:"E", minPercent:33,maxPercent:49, remarks:"Pass (Marginal)",active:true,sortOrder:6 },
        { gradeScaleId:fbise.id,grade:"F", minPercent:0, maxPercent:32, remarks:"Fail",           active:true,sortOrder:7 },
        { gradeScaleId:pf.id,   grade:"Pass",minPercent:40,maxPercent:100,remarks:"Pass",         active:true,sortOrder:1 },
        { gradeScaleId:pf.id,   grade:"Fail",minPercent:0, maxPercent:39, remarks:"Fail",         active:true,sortOrder:2 },
      ]);
      logger.info("seeded: exam grade bands");
    }

    // ── 34. Syllabus ──────────────────────────────────────────────────────────
    if (!(await skip("syllabus_units", syllabusUnitsTable))) {
      await db.insert(syllabusUnitsTable).values([
        { classCode:"class-9",subjectCode:"PHY", title:"Physical Quantities & Measurements",description:"SI units, measurements, significant figures",active:true,sortOrder:1 },
        { classCode:"class-9",subjectCode:"PHY", title:"Kinematics",                        description:"Motion, velocity, acceleration, graphs",       active:true,sortOrder:2 },
        { classCode:"class-9",subjectCode:"PHY", title:"Dynamics",                          description:"Newton's laws, friction, momentum",            active:true,sortOrder:3 },
        { classCode:"class-9",subjectCode:"CHEM",title:"Fundamentals of Chemistry",         description:"Atomic structure, periodic table basics",      active:true,sortOrder:1 },
        { classCode:"class-9",subjectCode:"CHEM",title:"Structure of Atoms",                description:"Atomic number, mass number, isotopes",         active:true,sortOrder:2 },
        { classCode:"class-9",subjectCode:"MATH",title:"Matrices & Determinants",           description:"Matrix operations, determinants",              active:true,sortOrder:1 },
        { classCode:"class-9",subjectCode:"MATH",title:"Real & Complex Numbers",            description:"Number systems, arithmetic, properties",       active:true,sortOrder:2 },
        { classCode:"class-11-premedical",subjectCode:"BIO",title:"Cell Biology",           description:"Cell structure, organelles, division",         active:true,sortOrder:1 },
        { classCode:"class-11-premedical",subjectCode:"BIO",title:"Biological Molecules",   description:"Proteins, carbohydrates, lipids, nucleic acids",active:true,sortOrder:2 },
      ]);
      logger.info("seeded: syllabus units");
    }
    if (!(await skip("syllabus_topics", syllabusTopicsTable))) {
      const units = await db.select().from(syllabusUnitsTable);
      const phyU1 = units.find(u => u.title === "Physical Quantities & Measurements")!;
      const phyU2 = units.find(u => u.title === "Kinematics")!;
      const chemU = units.find(u => u.title === "Fundamentals of Chemistry")!;
      await db.insert(syllabusTopicsTable).values([
        { unitId:phyU1.id,title:"Introduction to Physical Quantities",      active:true,sortOrder:1 },
        { unitId:phyU1.id,title:"International System of Units (SI)",        active:true,sortOrder:2 },
        { unitId:phyU1.id,title:"Measurement Instruments",                   active:true,sortOrder:3 },
        { unitId:phyU1.id,title:"Significant Figures and Precision",         active:true,sortOrder:4 },
        { unitId:phyU2.id,title:"Distance, Displacement and Speed",          active:true,sortOrder:1 },
        { unitId:phyU2.id,title:"Velocity and Acceleration",                 active:true,sortOrder:2 },
        { unitId:phyU2.id,title:"Equations of Uniformly Accelerated Motion", active:true,sortOrder:3 },
        { unitId:phyU2.id,title:"Motion Graphs",                             active:true,sortOrder:4 },
        { unitId:chemU.id,title:"Chemistry and Its Branches",                active:true,sortOrder:1 },
        { unitId:chemU.id,title:"Basic Definitions",                         active:true,sortOrder:2 },
        { unitId:chemU.id,title:"Chemical Formulae and Equations",           active:true,sortOrder:3 },
      ]);
      logger.info("seeded: syllabus topics");
    }

    // ── 35. Timetable ─────────────────────────────────────────────────────────
    if (!(await skip("timetable_periods", timetablePeriodsTable))) {
      await db.insert(timetablePeriodsTable).values([
        { name:"Assembly",startTime:"07:45",endTime:"08:00",periodType:"assembly",active:true,sortOrder:1 },
        { name:"Period 1",startTime:"08:00",endTime:"08:45",periodType:"lecture", active:true,sortOrder:2 },
        { name:"Period 2",startTime:"08:45",endTime:"09:30",periodType:"lecture", active:true,sortOrder:3 },
        { name:"Period 3",startTime:"09:30",endTime:"10:15",periodType:"lecture", active:true,sortOrder:4 },
        { name:"Break",   startTime:"10:15",endTime:"10:30",periodType:"break",   active:true,sortOrder:5 },
        { name:"Period 4",startTime:"10:30",endTime:"11:15",periodType:"lecture", active:true,sortOrder:6 },
        { name:"Period 5",startTime:"11:15",endTime:"12:00",periodType:"lecture", active:true,sortOrder:7 },
        { name:"Lunch",   startTime:"12:00",endTime:"12:45",periodType:"break",   active:true,sortOrder:8 },
        { name:"Period 6",startTime:"12:45",endTime:"13:30",periodType:"lecture", active:true,sortOrder:9 },
        { name:"Period 7",startTime:"13:30",endTime:"14:15",periodType:"lecture", active:true,sortOrder:10 },
      ]);
      logger.info("seeded: timetable periods");
    }
    if (!(await skip("timetable_slots", timetableSlotsTable))) {
      const periods = await db.select().from(timetablePeriodsTable);
      const years   = await db.select().from(academicYearsTable);
      const y2627   = years.find(y => y.name === "2026-2027")!;
      const lectures= periods.filter(p => p.periodType === "lecture");
      const subjectMap: Record<number, string[]> = {
        1: ["Urdu","English","Mathematics","Physics","Chemistry"],
        2: ["English","Mathematics","Biology","Urdu","Pakistan Studies"],
        3: ["Mathematics","Physics","Chemistry","Islamiat","English"],
        4: ["Physics","Chemistry","Biology","Mathematics","Urdu"],
        5: ["Biology","Pakistan Studies","Islamiat","English","Mathematics"],
      };
      const teacherMap: Record<string, string> = {
        "Physics":"Rizwan Ahmad","Chemistry":"Sana Farooq","Mathematics":"Asad Khan",
        "English":"Fatima Malik","Urdu":"Umar Farooq","Biology":"Bilal Shah",
        "Pakistan Studies":"Rabia Qureshi","Islamiat":"Rabia Qureshi",
      };
      const slots: any[] = [];
      for (let day = 1; day <= 5; day++) {
        const subs = subjectMap[day];
        lectures.forEach((period, pi) => {
          if (pi >= subs.length) return;
          slots.push({ classCode:"class-9", sectionName:"A", dayOfWeek:day, periodId:period.id, subjectName:subs[pi], teacherName:teacherMap[subs[pi]] ?? "", academicYearId:y2627.id });
        });
      }
      await db.insert(timetableSlotsTable).values(slots);
      logger.info({ count: slots.length }, "seeded: timetable slots");
    }

    // ── 36. Communication ─────────────────────────────────────────────────────
    if (!(await skip("announcements", announcementsTable))) {
      const today = new Date().toISOString().split("T")[0];
      await db.insert(announcementsTable).values([
        { title:"Welcome Back — Session 2026-2027",       body:"Welcome to a new academic session. Classes commence September 3, 2026. All cadets must report by 8:00 AM.",            targetAudience:"students",priority:"normal",publishedAt:ymd(2026,8,28),createdBy:"Principal",active:true },
        { title:"Eid-ul-Adha Holiday Notice",             body:"The institution will remain closed June 15–19 on account of Eid-ul-Adha. Caretaker duty roster is attached.",          targetAudience:"all",     priority:"normal",publishedAt:ymd(2026,6,10),createdBy:"Administration",active:true },
        { title:"Annual Sports Gala — Registrations Open",body:"Annual Sports Gala scheduled for November 22–23, 2026. All cadets encouraged to participate. Forms at PT office.",     targetAudience:"students",priority:"normal",publishedAt:today,          createdBy:"PT Office",active:true },
        { title:"Fee Submission Deadline — October 2026", body:"Please clear October fee challans by October 10. Late fee penalties will apply thereafter.",                            targetAudience:"all",     priority:"urgent",publishedAt:today,          createdBy:"Accounts",active:true },
        { title:"Staff Meeting — November 5",             body:"All teaching staff must attend the academic committee meeting on November 5 at 11:00 AM in the Conference Room.",       targetAudience:"staff",   priority:"normal",publishedAt:today,          createdBy:"Principal",active:true },
      ]);
      logger.info("seeded: announcements");
    }
    if (!(await skip("noticeboard_items", noticeboardItemsTable))) {
      const today = new Date().toISOString().split("T")[0];
      await db.insert(noticeboardItemsTable).values([
        { title:"Timetable for Class IX-A — Term 1",  content:"The finalised Term 1 timetable for Class IX-A is available below.",                                         category:"academic",publishedAt:ymd(2026,9,1), active:true },
        { title:"Cricket Trial Dates Announced",       content:"Trials for Inter-House Cricket Championship will be held on October 3 & 4. Report to Main Ground at 15:00.",category:"sports",  publishedAt:ymd(2026,9,25),active:true },
        { title:"Parents' Day — November 29, 2026",    content:"Annual Parents' Day is scheduled for November 29. Invitations will be sent home last week of October.",     category:"general", publishedAt:ymd(2026,10,1),active:true },
        { title:"Library Hours Extended",              content:"Library open until 20:00 on weekdays to support Term 1 examinations.",                                       category:"academic",publishedAt:today,          active:true },
        { title:"Dengue Prevention Advisory",          content:"Cadets are requested to use mosquito repellent after dusk. Report any symptoms to sick bay immediately.",    category:"general", publishedAt:today,          active:true },
      ]);
      logger.info("seeded: noticeboard items");
    }

    // ── 37. Gate ──────────────────────────────────────────────────────────────
    if (!(await skip("gate_log", gateLogTable))) {
      const names = ["Mr. Ahmed Raza (Parent)","DHL Courier","Capt. Naeem (Alumni)","Mr. Waseem (Electrician)","Mrs. Farida Khan (Parent)","Mr. Zafar Ali (Parent)","Col. Rashid (Visitor)","TCS Courier"];
      const types = ["visitor","delivery","staff","staff","visitor","visitor","staff","delivery"];
      const purps = ["Visiting student","Delivery of books","Alumni visit","Electrical maintenance","Visiting student","Meeting with Principal","Inspection","Document delivery"];
      const logs: any[] = [];
      const today = new Date();
      for (let i = 0; i < 15; i++) {
        const d = new Date(today); d.setDate(d.getDate() - Math.floor(i / 3));
        const hour = 8 + (i % 10);
        const inT  = `${d.toISOString().split("T")[0]} ${String(hour).padStart(2,"0")}:${String((i*7)%60).padStart(2,"0")}`;
        const outT = i % 4 !== 0 ? `${d.toISOString().split("T")[0]} ${String(hour+1+(i%2)).padStart(2,"0")}:${String((i*13)%60).padStart(2,"0")}` : undefined;
        logs.push({ personName:names[i%names.length], personType:types[i%types.length], purpose:purps[i%purps.length], vehicleNo:i%3===0?`LEA-${String(1000+i)}`:undefined, phone:`0300-${String(5000000+i)}`, inTime:inT, outTime:outT, gatePassNo:`GP-2026-${String(i+1).padStart(4,"0")}` });
      }
      await db.insert(gateLogTable).values(logs);
      logger.info({ count: logs.length }, "seeded: gate log");
    }
    if (!(await skip("gate_outpass", gateOutpassTable))) {
      const studs = await db.select({ fullName: studentsTable.fullName, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode }).from(studentsTable).limit(10);
      if (studs.length > 0) {
        const outpasses: any[] = [];
        studs.slice(0, 8).forEach((s, i) => {
          const d = new Date(); d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split("T")[0];
          outpasses.push({ studentName:s.fullName, applicantId:s.applicantId, classCode:s.classCode, purpose:["Medical appointment","Family function","Parents' request","Dental visit"][i%4], destination:["CMH Rawalpindi","Home","Murree Town","Rawalpindi"][i%4], validFrom:`${dateStr} 14:00`, validUntil:`${dateStr} 20:00`, approvedBy:"CCM-ADM-002", passNumber:`OP-2026-${String(i+1).padStart(4,"0")}`, status:i<5?"used":"active" });
        });
        await db.insert(gateOutpassTable).values(outpasses);
        logger.info({ count: outpasses.length }, "seeded: gate outpasses");
      }
    }

    // ── 38. Campus Events ─────────────────────────────────────────────────────
    if (!(await skip("events", eventsTable))) {
      await db.insert(eventsTable).values([
        { title:"Independence Day Ceremony",        description:"Flag hoisting and national anthem ceremony followed by a march past.",                                          eventType:"ceremony",  startDate:"2026-08-14",startTime:"08:00",endDate:"2026-08-14",endTime:"10:00",  venue:"Main Parade Ground",    organizer:"Principal Office",     targetAudience:"all",    status:"completed", isPublic:true  },
        { title:"Annual Sports Gala — Day 1",       description:"Track and field events, shot put, and inter-house relay races.",                                               eventType:"sports",    startDate:"2026-11-22",startTime:"09:00",endDate:"2026-11-22",endTime:"17:00",  venue:"Sports Complex",        organizer:"PT Department",        targetAudience:"all",    status:"published",isPublic:true  },
        { title:"Annual Sports Gala — Day 2",       description:"Cricket finals, football knockout, and prize distribution.",                                                   eventType:"sports",    startDate:"2026-11-23",startTime:"09:00",endDate:"2026-11-23",endTime:"17:00",  venue:"Sports Complex",        organizer:"PT Department",        targetAudience:"all",    status:"published",isPublic:true  },
        { title:"Annual Parents' Day 2026",         description:"Parents are invited to meet teachers, view academic results, and attend prize distribution.",                  eventType:"ceremony",  startDate:"2026-11-29",startTime:"10:00",endDate:"2026-11-29",endTime:"14:00",  venue:"Main Auditorium",       organizer:"Principal Office",     targetAudience:"parents",status:"published",isPublic:true  },
        { title:"Prize Distribution Ceremony",      description:"Annual prize distribution for academic and sports achievements by district civil authority.",                  eventType:"ceremony",  startDate:"2026-12-15",startTime:"11:00",endDate:"2026-12-15",endTime:"13:30",  venue:"Main Auditorium",       organizer:"Administration",       targetAudience:"all",    status:"published",isPublic:true  },
        { title:"Cultural Gala & Talent Show",      description:"Annual cultural gala showcasing cadets' talent in drama, poetry, nasheeds, and music.",                       eventType:"cultural",  startDate:"2026-10-15",startTime:"18:00",endDate:"2026-10-15",endTime:"21:00",  venue:"Open-Air Amphitheatre", organizer:"Student Council",      targetAudience:"all",    status:"completed",isPublic:true  },
        { title:"Inter-House Cricket Championship", description:"Knockout cricket tournament across the four cadet houses spanning two days.",                                  eventType:"sports",    startDate:"2026-10-03",startTime:"09:00",endDate:"2026-10-04",endTime:"17:00",  venue:"Cricket Ground",        organizer:"PT Department",        targetAudience:"cadets", status:"completed",isPublic:false },
        { title:"Term 1 Examinations",              description:"First term written examinations for all classes. Detailed schedule available from class teachers.",            eventType:"academic",  startDate:"2026-11-10",startTime:"08:00",endDate:"2026-11-20",endTime:"12:00",  venue:"Examination Halls",     organizer:"Examination Office",   targetAudience:"cadets", status:"published",isPublic:false },
        { title:"Quaid-e-Azam Day Holiday",         description:"Institution closed on December 25 in observance of Quaid-e-Azam Muhammad Ali Jinnah's birthday.",             eventType:"holiday",   startDate:"2026-12-25",startTime:undefined,endDate:"2026-12-25",             venue:undefined,               organizer:"Administration",       targetAudience:"all",    status:"published",isPublic:true  },
        { title:"Academic Committee Meeting",       description:"Monthly academic committee meeting for all heads of departments and senior teachers.",                         eventType:"meeting",   startDate:"2026-11-05",startTime:"11:00",endDate:"2026-11-05",endTime:"13:00",  venue:"Conference Room",       organizer:"Principal",            targetAudience:"staff",  status:"published",isPublic:false },
        { title:"New Session Commencement",         description:"Session 2026-2027 officially begins. All cadets must report by 8:00 AM in full uniform.",                     eventType:"academic",  startDate:"2026-09-03",startTime:"08:00",endDate:"2026-09-03",endTime:"09:00",  venue:"Main Parade Ground",    organizer:"Principal Office",     targetAudience:"cadets", status:"completed",isPublic:true  },
        { title:"Eid-ul-Adha Break",                description:"Institution closed for Eid holidays. Caretaker duty roster issued separately.",                               eventType:"holiday",   startDate:"2026-06-15",startTime:undefined,endDate:"2026-06-19",             venue:undefined,               organizer:"Administration",       targetAudience:"all",    status:"completed",isPublic:true  },
      ]);
      logger.info("seeded: events");
    }

    // ── 39. Exam Schedules & Results ──────────────────────────────────────────
    if (!(await skip("exam_schedules", examSchedulesTable))) {
      const examTypes = await db.select().from(examTypesTable);
      const monthly   = examTypes.find(t => t.name === "Monthly Test");
      const midterm   = examTypes.find(t => t.name === "Mid-Term Examination");
      const annual    = examTypes.find(t => t.name === "Annual Examination");
      const preboard  = examTypes.find(t => t.name === "Pre-Board Examination");

      const SUBJECTS_9  = [
        { code:"ENG",  name:"English",         total:100, pass:33 },
        { code:"URDU", name:"Urdu",            total:100, pass:33 },
        { code:"MATH", name:"Mathematics",     total:100, pass:33 },
        { code:"PHY",  name:"Physics",         total:75,  pass:25 },
        { code:"CHEM", name:"Chemistry",       total:75,  pass:25 },
        { code:"BIO",  name:"Biology",         total:75,  pass:25 },
        { code:"ISL",  name:"Islamiat",        total:50,  pass:17 },
        { code:"PAK",  name:"Pakistan Studies",total:50,  pass:17 },
      ];
      const SUBJECTS_10 = SUBJECTS_9;

      function schedRows(examTypeId: string | undefined, classCode: string, session: string, startDate: string, subs: typeof SUBJECTS_9) {
        return subs.map((s, i) => ({
          examTypeId,
          classCode,
          subjectCode: s.code,
          subjectName: s.name,
          sessionLabel: session,
          examDate: (() => { const d = new Date(startDate); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0]; })(),
          totalMarks: s.total,
          passMarks: s.pass,
          venue: "Examination Hall " + (Math.floor(i / 4) + 1),
          active: true,
        }));
      }

      const schedules = [
        ...schedRows(monthly?.id,  "class-9",  "2026-2027", "2026-09-20", SUBJECTS_9),
        ...schedRows(midterm?.id,  "class-9",  "2026-2027", "2026-11-10", SUBJECTS_9),
        ...schedRows(midterm?.id,  "class-10", "2026-2027", "2026-11-10", SUBJECTS_10),
        ...schedRows(annual?.id,   "class-9",  "2026-2027", "2027-03-01", SUBJECTS_9),
        ...schedRows(annual?.id,   "class-10", "2026-2027", "2027-03-01", SUBJECTS_10),
        ...schedRows(preboard?.id, "class-10", "2026-2027", "2026-12-01", SUBJECTS_10),
      ];
      await db.insert(examSchedulesTable).values(schedules);
      logger.info({ count: schedules.length }, "seeded: exam schedules");
    }

    if (!(await skip("exam_results", examResultsTable))) {
      const [allSchedules, class9Students] = await Promise.all([
        db.select().from(examSchedulesTable),
        db.select({ id: studentsTable.id }).from(studentsTable).limit(20),
      ]);
      const monthlyClass9 = allSchedules.filter(s => s.classCode === "class-9" && s.sessionLabel === "2026-2027" && s.examDate && s.examDate < "2026-10-01");

      const rand = (min: number, max: number, seed: number) => min + ((seed * 37 + 17) % (max - min + 1));
      const results: any[] = [];
      for (const schedule of monthlyClass9) {
        for (let si = 0; si < Math.min(class9Students.length, 15); si++) {
          const student = class9Students[si];
          const absent  = (si + schedule.totalMarks) % 11 === 0;
          const marks   = absent ? null : rand(schedule.passMarks, schedule.totalMarks, si + schedule.totalMarks);
          results.push({ scheduleId: schedule.id, studentId: student.id, obtainedMarks: marks, isAbsent: absent, remarks: absent ? "Medical leave" : undefined });
        }
      }
      if (results.length) await db.insert(examResultsTable).values(results);
      logger.info({ count: results.length }, "seeded: exam results");
    }

    // ── 40. Student Disciplinary Records ──────────────────────────────────────
    if (!(await skip("student_disciplinary", studentDisciplinaryTable))) {
      const studs = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, }).from(studentsTable).limit(12);
      if (studs.length) {
        const incidents = [
          { severity:"minor",    type:"warning",    description:"Late return from dinner — missed roll call by 10 minutes.",                 actionTaken:"Verbal warning issued by duty officer. Parents informed.",       reportedBy:"Duty Officer", status:"closed" },
          { severity:"minor",    type:"warning",    description:"Found using mobile phone during study hours in dormitory.",                 actionTaken:"Phone confiscated for 3 days. Written apology submitted.",        reportedBy:"House Master",  status:"closed" },
          { severity:"moderate", type:"detention",  description:"Absent from morning PT without valid excuse on two consecutive days.",      actionTaken:"Weekend detention assigned. PT extra duty for two weeks.",        reportedBy:"PT Instructor", status:"closed" },
          { severity:"minor",    type:"warning",    description:"Uniform found unkempt during assembly inspection.",                        actionTaken:"Counselled on dress code. Re-inspection scheduled next Monday.",   reportedBy:"House Captain", status:"closed" },
          { severity:"moderate", type:"fine",       description:"Caused damage to dormitory property — window pane broken during horseplay.",actionTaken:"Fine of Rs 500 imposed. Parents notified in writing.",            reportedBy:"House Master",  status:"closed" },
          { severity:"minor",    type:"warning",    description:"Submitting homework late on three occasions in the same week.",            actionTaken:"Subject teacher issued warning. Academic counsellor notified.",    reportedBy:"Class Teacher", status:"closed" },
          { severity:"severe",   type:"suspension", description:"Involved in fight with fellow cadet in the mess hall.",                   actionTaken:"Two-day in-school suspension. Parents called. Counselling ordered.",reportedBy:"Mess Supervisor",status:"closed" },
          { severity:"minor",    type:"warning",    description:"Failure to maintain personal hygiene — repeated offence.",                actionTaken:"Counselled by house master. Hygiene inspection weekly for 1 month.",reportedBy:"House Master",  status:"open"   },
        ];
        const baseDate = new Date();
        const records = studs.slice(0, incidents.length).map((s, i) => {
          const d = new Date(baseDate); d.setDate(d.getDate() - (i * 7 + 3));
          return { studentId: s.id, incidentDate: d.toISOString().split("T")[0], ...incidents[i] };
        });
        await db.insert(studentDisciplinaryTable).values(records);
        logger.info({ count: records.length }, "seeded: student disciplinary");
      }
    }

    // ── 41. Student Documents ─────────────────────────────────────────────────
    if (!(await skip("student_documents", studentDocumentsTable))) {
      const studs = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, }).from(studentsTable).limit(8);
      if (studs.length) {
        const docs: any[] = [];
        studs.forEach((s, i) => {
          docs.push(
            { studentId: s.id, docType: "birth_certificate", originalName: `birth-cert-${s.fullName.split(" ")[0].toLowerCase()}.pdf`, storedName: `bc_${s.id}.pdf`, mimeType: "application/pdf", fileSize: 124_000 + i * 3_200 },
            { studentId: s.id, docType: "cnic",              originalName: `cnic-formb-${s.fullName.split(" ")[0].toLowerCase()}.jpg`, storedName: `cnic_${s.id}.jpg`,mimeType: "image/jpeg",       fileSize:  87_000 + i * 1_800 },
          );
          if (i % 2 === 0) {
            docs.push(
              { studentId: s.id, docType: "photo",           originalName: `passport-photo-${s.fullName.split(" ")[0].toLowerCase()}.jpg`, storedName: `photo_${s.id}.jpg`, mimeType: "image/jpeg", fileSize: 45_000 + i * 900 },
            );
          }
        });
        await db.insert(studentDocumentsTable).values(docs);
        logger.info({ count: docs.length }, "seeded: student documents");
      }
    }

    if (!(await skip("vendors", vendorsTable))) {
      await db.insert(vendorsTable).values([
        { vendorCode: "VND-001", name: "National Book Foundation",      contactPerson: "Muhammad Hafiz",  phone: "051-2345678", email: "nbf@example.com",          address: "Murree Road, Rawalpindi",  notes: "Stationery and textbooks supplier",    sortOrder: 1 },
        { vendorCode: "VND-002", name: "M/s Shafiq Stationers",         contactPerson: "Shafiq Ahmed",    phone: "051-3456789", email: "shafiq@example.com",       address: "Saddar, Rawalpindi",       notes: "Office stationery and supplies",       sortOrder: 2 },
        { vendorCode: "VND-003", name: "Crescent Sports",               contactPerson: "Imran Ahmed",     phone: "051-4567890", email: "crescent@example.com",     address: "Raja Bazar, Rawalpindi",   notes: "Sports equipment and gear",            sortOrder: 3 },
        { vendorCode: "VND-004", name: "Al-Hamd Uniform House",         contactPerson: "Tariq Hussain",   phone: "051-5678901", email: "alhamd@example.com",       address: "Westridge, Rawalpindi",    notes: "Cadet uniforms and kit",               sortOrder: 4 },
        { vendorCode: "VND-005", name: "Pakistan Medical Depot",        contactPerson: "Dr. Asif Iqbal",  phone: "051-6789012", email: "pkmed@example.com",        address: "Murree Cantt",             notes: "Medicines and medical equipment",       sortOrder: 5 },
        { vendorCode: "VND-006", name: "Pak Mess Suppliers",            contactPerson: "Khalid Mehmood",  phone: "051-7890123", email: "pakmess@example.com",      address: "Committee Chowk, RWP",     notes: "Rations, cleaning and kitchen supplies", sortOrder: 6 },
      ]);
      logger.info({ count: 6 }, "seeded: vendors");
    }

    // ── 42. Account Payments ──────────────────────────────────────────────────
    {
      const tableCheck = await db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'account_payments' LIMIT 1
      `);
      if (tableCheck.rows.length === 0) {
        logger.info("seedAllData: account_payments table not yet created — skipping seed");
      } else {
      const existing = await db.execute(sql`SELECT COUNT(*) AS n FROM account_payments`);
      const cnt = Number((existing.rows[0] as any)?.n ?? 0);
      if (cnt === 0) {
        const bankRow = await db.execute(sql`SELECT id FROM bank_accounts LIMIT 1`);
        const bankId  = (bankRow.rows[0] as any)?.id ?? null;
        const coaRow  = await db.execute(sql`SELECT id FROM chart_of_accounts WHERE code = '2100' LIMIT 1`);
        const coaId   = (coaRow.rows[0] as any)?.id ?? null;
        if (bankId && coaId) {
          await db.execute(sql`
            INSERT INTO account_payments
              (date, voucher_number, payee, description, amount, bank_account_id, coa_account_id, status)
            VALUES
              ('2026-09-05', 'CPV-2026-001', 'M/s Shafiq Stationers',     'Stationery supply — A4 paper, pens, markers (Sep 2026)',       62500,  ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-09-10', 'CPV-2026-002', 'Al-Hamd Uniform House',      'Cadet uniform supply — 65 summer + 60 winter sets (Sep 2026)', 527500, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-09-15', 'CPV-2026-003', 'Crescent Sports',            'Sports equipment — cricket bats, footballs, volleyballs',      191400, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-09-20', 'CPV-2026-004', 'Pak Mess Suppliers',         'Rations & cleaning supplies — Sep 2026',                        88000, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-09-28', 'CPV-2026-005', 'National Book Foundation',   'Textbooks and reference material — 2026–27 session',           145000, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-10-05', 'CPV-2026-006', 'Pakistan Medical Depot',     'Medicines restocking — sick bay Oct 2026',                      38500, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-10-12', 'CPV-2026-007', 'Rawalpindi Electric & Hdw', 'Electrical maintenance & hardware — Oct 2026',                  52000, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-10-20', 'CPV-2026-008', 'Pak Mess Suppliers',         'Rations & cleaning supplies — Oct 2026',                        91000, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-11-03', 'CPV-2026-009', 'Al-Hamd Uniform House',      'Sports kit replacement & winter wear supplement',               73500, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-11-15', 'CPV-2026-010', 'M/s Shafiq Stationers',      'Exam stationery — answer sheets, pens, pencils (Nov 2026)',     44800, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-11-25', 'CPV-2026-011', 'Pakistan Medical Depot',     'First-aid supplies & medicines restock — Nov 2026',             27600, ${bankId}::uuid, ${coaId}::uuid, 'recorded'),
              ('2026-12-01', 'CPV-2026-012', 'Rawalpindi Electric & Hdw', 'Generator servicing & maintenance supplies — Dec 2026',         68000, ${bankId}::uuid, ${coaId}::uuid, 'recorded')
          `);
          logger.info({ count: 12 }, "seeded: account payments");
        }
      }
      } // end else (table exists)
    }

    // ── 43. School Calendar Holidays ──────────────────────────────────────────
    await seedCalendarHolidays();

    // ── 44. Site Settings (CMS defaults, per-tenant) ──────────────────────────
    const siteSettingsDefaults: Array<{ key: string; value: string; label: string; category: string; sortOrder: number }> = [
      { key: "contact_address",           value: "Main Company Baag - Burgraan Road, Murree Hills, Punjab, Pakistan", label: "College Address",        category: "contact",  sortOrder: 1 },
      { key: "contact_uan",               value: "03041111024",                                                         label: "UAN / Main Number",      category: "contact",  sortOrder: 2 },
      { key: "contact_landline",          value: "0519269181",                                                           label: "Landline",               category: "contact",  sortOrder: 3 },
      { key: "contact_email",             value: "burdiwaheed@gmail.com",                                                label: "Email Address",          category: "contact",  sortOrder: 4 },
      { key: "contact_whatsapp",          value: "923041111024",                                                          label: "WhatsApp Number",        category: "contact",  sortOrder: 5 },
      { key: "contact_hours",             value: "9:00 AM – 5:00 PM, Mon–Sat",                                           label: "Office Hours",           category: "contact",  sortOrder: 6 },
      { key: "contact_maps_url",          value: "https://maps.google.com/?q=Cadet+College+Murree+Murree+Hills",         label: "Google Maps URL",        category: "contact",  sortOrder: 7 },
      { key: "topbar_phone",              value: "+923009543823",                                                          label: "Top Bar Phone",          category: "contact",  sortOrder: 8 },
      { key: "college_tagline",           value: "Proud To Be HILLIANS",                                                  label: "College Tagline",        category: "general",  sortOrder: 10 },
      { key: "college_motto",             value: "Soldiers Are Born To Fight",                                            label: "College Motto",          category: "general",  sortOrder: 11 },
      { key: "college_established",       value: "August 2002",                                                           label: "Established Date",       category: "general",  sortOrder: 12 },
      { key: "college_description",       value: "A premier military educational institution producing educated, motivated and spirited cadets — following the noble traditions of the Pakistan Army.", label: "College Description", category: "general", sortOrder: 13 },
      { key: "link_fee_pdf",              value: "https://cadetcollegemurree.edu.pk/uploads/documents/fee-structure.pdf",           label: "Fee Structure PDF URL",     category: "links",   sortOrder: 20 },
      { key: "link_application_form",     value: "https://cadetcollegemurree.edu.pk/uploads/frontend/downloads/download-photo1711182991.jpg", label: "Application Form URL", category: "links", sortOrder: 21 },
      { key: "admissions_deadline",       value: "2026-10-31",                                                             label: "Admissions Deadline",    category: "admissions", sortOrder: 30 },
      { key: "social_facebook",           value: "",                                                                       label: "Facebook URL",           category: "social",   sortOrder: 40 },
      { key: "social_youtube",            value: "",                                                                       label: "YouTube URL",            category: "social",   sortOrder: 41 },
      { key: "social_instagram",          value: "",                                                                       label: "Instagram URL",          category: "social",   sortOrder: 42 },
      { key: "social_twitter",            value: "",                                                                       label: "X (Twitter) URL",        category: "social",   sortOrder: 43 },
      { key: "alumni_stat_founded",           value: "2002",   label: "Year Founded",             category: "alumni_stats", sortOrder: 60 },
      { key: "alumni_stat_graduates",         value: "1000+",  label: "Cadets Graduated",         category: "alumni_stats", sortOrder: 61 },
      { key: "alumni_stat_years",             value: "24+",    label: "Years of Excellence",      category: "alumni_stats", sortOrder: 62 },
      { key: "alumni_stat_armed_forces",      value: "350+",   label: "Alumni in Armed Forces",   category: "alumni_stats", sortOrder: 63 },
      { key: "alumni_stat_graduates_total",   value: "1700",   label: "Total Alumni Worldwide",   category: "alumni_stats", sortOrder: 64 },
      { key: "alumni_stat_doctors",           value: "180",    label: "Doctors & Surgeons",       category: "alumni_stats", sortOrder: 65 },
      { key: "alumni_stat_engineers",         value: "95",     label: "Engineers & Researchers",  category: "alumni_stats", sortOrder: 66 },
      { key: "alumni_stat_civil_services",    value: "35",     label: "Civil Service Officers",   category: "alumni_stats", sortOrder: 67 },
      { key: "alumni_stat_international",     value: "22",     label: "Countries Represented",    category: "alumni_stats", sortOrder: 68 },
      { key: "site_base_url",                value: "",       label: "Site Base URL (for SEO canonical / sitemap)", category: "seo", sortOrder: 80 },
    ];
    // Seed defaults for every tenant. The visual theme is NOT stored here — it is
    // derived from tenants.site_theme by the public settings endpoint, so it can
    // never drift out of sync with the tenant record.
    const allTenants = await db.select({ id: tenantsTable.id }).from(tenantsTable);
    for (const t of allTenants) {
      await db.insert(siteSettingsTable).values(
        siteSettingsDefaults.map((s) => ({ ...s, tenantId: t.id })),
      ).onConflictDoNothing();
    }
    logger.info({ tenants: allTenants.length }, "seeded: site settings (CMS defaults, per-tenant)");

    // ── 45. Alumni Stories (CMS-managed, per-tenant) ──────────────────────────
    for (const t of allTenants) {
      const existing = await db.select({ id: siteAlumniTable.id }).from(siteAlumniTable)
        .where(eq(siteAlumniTable.tenantId, t.id)).limit(1);
      if (existing.length > 0) continue;
      await db.insert(siteAlumniTable).values(
        ALUMNI_SEED.map((a, i) => ({ ...a, tenantId: t.id, isPublished: true, sortOrder: i })),
      );
    }
    logger.info({ tenants: allTenants.length }, "seeded: alumni stories (per-tenant)");

    // ── 46. Website Navigation Menu (CMS-managed, per-tenant) ──────────────────
    // Mirrors the navbar's previously-hardcoded navigation so live sites are
    // unchanged after launch. One level of dropdown children under "About Us",
    // plus the "Result" CTA button.
    for (const t of allTenants) {
      const existing = await db.select({ id: siteMenuItemsTable.id }).from(siteMenuItemsTable)
        .where(eq(siteMenuItemsTable.tenantId, t.id)).limit(1);
      if (existing.length > 0) continue;
      let order = 0;
      const addTop = (label: string, target: string, extra: Record<string, unknown> = {}) =>
        db.insert(siteMenuItemsTable).values({
          tenantId: t.id, label, linkType: "page", target, isPublished: true, sortOrder: order++, ...extra,
        }).returning();

      const addChildren = (parentId: string, items: Array<{ label: string; target: string }>) =>
        db.insert(siteMenuItemsTable).values(
          items.map((c, i) => ({
            tenantId: t.id, parentId, label: c.label, linkType: "page" as const,
            target: c.target, isPublished: true, sortOrder: i,
          })),
        );

      await addTop("Home", "/");

      const [admission] = await addTop("Online Admission", "/admissions");
      await addChildren(admission.id, [
        { label: "Apply Now",    target: "/admissions" },
        { label: "Check Status", target: "/status" },
      ]);

      const [media] = await addTop("Events & Gallery", "/events");
      await addChildren(media.id, [
        { label: "Events",  target: "/events" },
        { label: "Gallery", target: "/gallery" },
      ]);

      const [about] = await addTop("About Us", "/about");
      await addChildren(about.id, [
        { label: "About Us",       target: "/about" },
        { label: "Alumni Stories", target: "/alumni" },
        { label: "Contact Us",     target: "/contact" },
      ]);

      const [academics] = await addTop("Academics", "/teachers");
      await addChildren(academics.id, [
        { label: "Teachers",  target: "/teachers" },
        { label: "Downloads", target: "/downloads" },
      ]);

      await addTop("Careers", "/careers");
      await addTop("Student Portal", "/portal", { linkType: "url" as const });
      await addTop("Result", "/results", { isCta: true });
    }
    logger.info({ tenants: allTenants.length }, "seeded: website menu (per-tenant)");

    // ── 47. Website Footer Links (CMS-managed, per-tenant) ─────────────────────
    // Mirrors the footer's previously-hardcoded "Quick Links" and "Downloads"
    // columns as editable footer link groups (location = "footer"). A top-level
    // row is a column heading; its children are the links shown under it.
    for (const t of allTenants) {
      const existing = await db.select({ id: siteMenuItemsTable.id }).from(siteMenuItemsTable)
        .where(and(eq(siteMenuItemsTable.tenantId, t.id), eq(siteMenuItemsTable.location, "footer"))).limit(1);
      if (existing.length > 0) continue;

      // Use the tenant's configured fee-structure PDF link if present.
      const [feePdf] = await db.select({ value: siteSettingsTable.value }).from(siteSettingsTable)
        .where(and(eq(siteSettingsTable.tenantId, t.id), eq(siteSettingsTable.key, "link_fee_pdf"))).limit(1);

      let groupOrder = 0;
      const addGroup = (label: string) =>
        db.insert(siteMenuItemsTable).values({
          tenantId: t.id, location: "footer", label, linkType: "page", target: "/",
          isPublished: true, sortOrder: groupOrder++,
        }).returning();

      const addChildren = (parentId: string, links: { label: string; target: string; linkType?: "page" | "url"; openInNewTab?: boolean }[]) =>
        db.insert(siteMenuItemsTable).values(
          links.map((l, i) => ({
            tenantId: t.id, parentId, location: "footer", label: l.label,
            linkType: l.linkType ?? "page", target: l.target,
            openInNewTab: l.openInNewTab ?? false, isPublished: true, sortOrder: i,
          })),
        );

      const [quick] = await addGroup("Quick Links");
      await addChildren(quick.id, [
        { label: "Home",             target: "/" },
        { label: "About Us",         target: "/about" },
        { label: "Online Admission", target: "/admissions" },
        { label: "Gallery Corner",   target: "/gallery" },
        { label: "Events",           target: "/events" },
        { label: "Contact Us",       target: "/contact" },
      ]);

      const [downloads] = await addGroup("Downloads");
      await addChildren(downloads.id, [
        feePdf?.value
          ? { label: "Fee Structure (PDF)", target: feePdf.value, linkType: "url" as const, openInNewTab: true }
          : { label: "Fee Structure (PDF)", target: "/downloads" },
        { label: "Admission Form",     target: "/admissions" },
        { label: "Entry Test Syllabus", target: "/admissions" },
      ]);
    }
    logger.info({ tenants: allTenants.length }, "seeded: website footer links (per-tenant)");

    logger.info("seedAllData: complete");
  } catch (err) {
    logger.error({ err }, "seedAllData: failed");
  }
}

// ── Seed a single newly-created tenant ────────────────────────────────────────
// Called immediately after INSERT into tenantsTable so the tenant's website
// has default (blank) content and a navigation structure from the moment it
// is created — without waiting for the next server restart.
// All writes use onConflictDoNothing so re-running is always safe.
export async function seedNewTenant(tenantId: string): Promise<void> {
  // ── Site settings (generic blank defaults) ─────────────────────────────────
  const settings: Array<{ key: string; value: string; label: string; category: string; sortOrder: number }> = [
    { key: "college_tagline",      value: "",                        label: "College Tagline",        category: "general",    sortOrder: 10 },
    { key: "college_motto",        value: "",                        label: "College Motto",           category: "general",    sortOrder: 11 },
    { key: "college_established",  value: "",                        label: "Established Date",        category: "general",    sortOrder: 12 },
    { key: "college_description",  value: "",                        label: "College Description",     category: "general",    sortOrder: 13 },
    { key: "contact_address",      value: "",                        label: "College Address",         category: "contact",    sortOrder: 1  },
    { key: "contact_uan",          value: "",                        label: "UAN / Main Number",       category: "contact",    sortOrder: 2  },
    { key: "contact_landline",     value: "",                        label: "Landline",                category: "contact",    sortOrder: 3  },
    { key: "contact_email",        value: "",                        label: "Email Address",           category: "contact",    sortOrder: 4  },
    { key: "contact_whatsapp",     value: "",                        label: "WhatsApp Number",         category: "contact",    sortOrder: 5  },
    { key: "contact_hours",        value: "9:00 AM – 5:00 PM, Mon–Sat", label: "Office Hours",        category: "contact",    sortOrder: 6  },
    { key: "contact_maps_url",     value: "",                        label: "Google Maps URL",         category: "contact",    sortOrder: 7  },
    { key: "topbar_phone",         value: "",                        label: "Top Bar Phone",           category: "contact",    sortOrder: 8  },
    { key: "link_fee_pdf",         value: "",                        label: "Fee Structure PDF URL",   category: "links",      sortOrder: 20 },
    { key: "link_application_form",value: "",                        label: "Application Form URL",    category: "links",      sortOrder: 21 },
    { key: "admissions_deadline",  value: "",                        label: "Admissions Deadline",     category: "admissions", sortOrder: 30 },
    { key: "social_facebook",      value: "",                        label: "Facebook URL",            category: "social",     sortOrder: 40 },
    { key: "social_youtube",       value: "",                        label: "YouTube URL",             category: "social",     sortOrder: 41 },
    { key: "social_instagram",     value: "",                        label: "Instagram URL",           category: "social",     sortOrder: 42 },
    { key: "social_twitter",       value: "",                        label: "X (Twitter) URL",         category: "social",     sortOrder: 43 },
    { key: "alumni_stat_founded",         value: "", label: "Year Founded",            category: "alumni_stats", sortOrder: 60 },
    { key: "alumni_stat_graduates",       value: "", label: "Cadets Graduated",        category: "alumni_stats", sortOrder: 61 },
    { key: "alumni_stat_years",           value: "", label: "Years of Excellence",     category: "alumni_stats", sortOrder: 62 },
    { key: "alumni_stat_armed_forces",    value: "", label: "Alumni in Armed Forces",  category: "alumni_stats", sortOrder: 63 },
    { key: "alumni_stat_graduates_total", value: "", label: "Total Alumni Worldwide",  category: "alumni_stats", sortOrder: 64 },
    { key: "alumni_stat_doctors",         value: "", label: "Doctors & Surgeons",      category: "alumni_stats", sortOrder: 65 },
    { key: "alumni_stat_engineers",       value: "", label: "Engineers & Researchers", category: "alumni_stats", sortOrder: 66 },
    { key: "alumni_stat_civil_services",  value: "", label: "Civil Service Officers",  category: "alumni_stats", sortOrder: 67 },
    { key: "site_base_url",        value: "",                        label: "Site Base URL (for SEO)", category: "seo",        sortOrder: 80 },
  ];
  await db.insert(siteSettingsTable)
    .values(settings.map((s) => ({ ...s, tenantId })))
    .onConflictDoNothing();

  // ── Navigation menu ────────────────────────────────────────────────────────
  const [existingNav] = await db
    .select({ id: siteMenuItemsTable.id })
    .from(siteMenuItemsTable)
    .where(eq(siteMenuItemsTable.tenantId, tenantId))
    .limit(1);

  if (!existingNav) {
    let order = 0;
    const addTop = (label: string, target: string, extra: Record<string, unknown> = {}) =>
      db.insert(siteMenuItemsTable)
        .values({ tenantId, label, linkType: "page", target, isPublished: true, sortOrder: order++, ...extra })
        .returning();
    const addChildren = (parentId: string, items: Array<{ label: string; target: string }>) =>
      db.insert(siteMenuItemsTable).values(
        items.map((c, i) => ({
          tenantId, parentId, label: c.label, linkType: "page" as const,
          target: c.target, isPublished: true, sortOrder: i,
        })),
      );

    await addTop("Home", "/");
    const [adm] = await addTop("Online Admission", "/admissions");
    await addChildren(adm.id, [
      { label: "Apply Now",    target: "/admissions" },
      { label: "Check Status", target: "/status"     },
    ]);
    const [media] = await addTop("Events & Gallery", "/events");
    await addChildren(media.id, [
      { label: "Events",  target: "/events"  },
      { label: "Gallery", target: "/gallery" },
    ]);
    const [about] = await addTop("About Us", "/about");
    await addChildren(about.id, [
      { label: "About Us",       target: "/about"   },
      { label: "Alumni Stories", target: "/alumni"  },
      { label: "Contact Us",     target: "/contact" },
    ]);
    const [academics] = await addTop("Academics", "/teachers");
    await addChildren(academics.id, [
      { label: "Teachers",  target: "/teachers"  },
      { label: "Downloads", target: "/downloads" },
    ]);
    await addTop("Student Portal", "/portal", { linkType: "url" as const });
    await addTop("Result", "/results", { isCta: true });
  }

  // ── Footer links ───────────────────────────────────────────────────────────
  const [existingFooter] = await db
    .select({ id: siteMenuItemsTable.id })
    .from(siteMenuItemsTable)
    .where(and(eq(siteMenuItemsTable.tenantId, tenantId), eq(siteMenuItemsTable.location, "footer")))
    .limit(1);

  if (!existingFooter) {
    let groupOrder = 0;
    const addGroup = (label: string) =>
      db.insert(siteMenuItemsTable)
        .values({ tenantId, location: "footer", label, linkType: "page", target: "/", isPublished: true, sortOrder: groupOrder++ })
        .returning();
    const addFooterLinks = (parentId: string, links: Array<{ label: string; target: string }>) =>
      db.insert(siteMenuItemsTable).values(
        links.map((l, i) => ({
          tenantId, parentId, location: "footer", label: l.label,
          linkType: "page" as const, target: l.target, isPublished: true, sortOrder: i,
        })),
      );

    const [quick] = await addGroup("Quick Links");
    await addFooterLinks(quick.id, [
      { label: "Home",             target: "/"           },
      { label: "About Us",         target: "/about"      },
      { label: "Online Admission", target: "/admissions" },
      { label: "Gallery",          target: "/gallery"    },
      { label: "Events",           target: "/events"     },
      { label: "Contact Us",       target: "/contact"    },
    ]);
    const [downloads] = await addGroup("Downloads");
    await addFooterLinks(downloads.id, [
      { label: "Fee Structure (PDF)",   target: "/downloads"  },
      { label: "Admission Form",         target: "/admissions" },
      { label: "Entry Test Syllabus",    target: "/admissions" },
    ]);
  }

  // ── GR format: claim a unique prefix from day one so the global unique index
  //    on students.gr_number never collides with another tenant. Prefix is
  //    derived from the tenant's slug (uppercased, max 10 chars).
  //    If the slug-derived prefix is already taken by another tenant (possible
  //    when distinct slugs share the same first 10 uppercase chars), we try
  //    progressively shorter prefixes (drop one char at a time down to 2),
  //    then append a 1- or 2-digit counter as a last resort.
  const [tenantRow] = await db
    .select({ slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);
  if (tenantRow) {
    // Fetch all already-claimed GR prefixes (excluding this tenant's own row
    // in case we are re-running the seed idempotently).
    const existingRows = await db
      .select({ key: admissionsSettingsTable.key, value: admissionsSettingsTable.value })
      .from(admissionsSettingsTable)
      .where(sql`${admissionsSettingsTable.key} LIKE ${"gr_format:%"}`);

    const claimedPrefixes = new Set<string>();
    for (const row of existingRows) {
      const rowTenantId = row.key.replace("gr_format:", "");
      if (rowTenantId === tenantId) continue;
      try {
        const fmt = JSON.parse(row.value);
        if (fmt.prefix) claimedPrefixes.add(String(fmt.prefix).toUpperCase());
      } catch {}
    }

    const baseSlug = tenantRow.slug.toUpperCase();

    // Build a list of candidates to try (in priority order):
    // 1. Full 10-char prefix, then progressively shorter (down to 2 chars).
    // 2. Short prefix + numeric suffix (e.g. "CCM2", "CCM3" … "CCM9", "CC10"…).
    let chosenPrefix: string | null = null;
    const base = baseSlug.slice(0, 10);

    // Try shorter and shorter slices first
    for (let len = 10; len >= 2; len--) {
      const candidate = baseSlug.slice(0, len);
      if (!claimedPrefixes.has(candidate)) {
        chosenPrefix = candidate;
        break;
      }
    }

    // If all plain-slug variants are taken, append a counter
    if (!chosenPrefix) {
      for (let n = 2; n <= 99; n++) {
        const suffix = String(n);
        const stem = base.slice(0, 10 - suffix.length);
        const candidate = stem + suffix;
        if (!claimedPrefixes.has(candidate)) {
          chosenPrefix = candidate;
          break;
        }
      }
    }

    if (!chosenPrefix) {
      logger.error({ tenantId, slug: tenantRow.slug }, "seedNewTenant: could not find a unique GR prefix — skipping gr_format seed");
    } else {
      const warnedCollision = chosenPrefix !== baseSlug.slice(0, 10);
      if (warnedCollision) {
        logger.warn(
          { tenantId, slug: tenantRow.slug, desired: baseSlug.slice(0, 10), chosen: chosenPrefix },
          "seedNewTenant: slug-derived GR prefix was taken; using fallback prefix",
        );
      }
      const grFormatKey = `gr_format:${tenantId}`;
      await db
        .insert(admissionsSettingsTable)
        .values({
          key: grFormatKey,
          value: JSON.stringify({
            prefix: chosenPrefix,
            separator: "-",
            includeYear: true,
            paddingDigits: "3",
            startingNumber: "1",
          }),
        })
        .onConflictDoNothing();
      logger.info({ tenantId, prefix: chosenPrefix }, "seedNewTenant: seeded gr_format prefix");
    }
  }

  // ── Chart of Accounts (full default hierarchy, Cash in Hand non-deletable) ──
  await seedCoaForTenant(tenantId);

  // ── System fine fee types (Attendance Fine, Late Fee Fine) + their COA income
  //    accounts. These are non-deletable and required by the fine-calc / COA wiring.
  await ensureFineFeeTypes(tenantId);

  // ── HR bootstrap: one department + one designation ──────────────────────────
  const [existingDept] = await db
    .select({ id: hrDepartmentsTable.id })
    .from(hrDepartmentsTable)
    .where(eq(hrDepartmentsTable.tenantId, tenantId))
    .limit(1);

  if (!existingDept) {
    const [adminDept] = await db
      .insert(hrDepartmentsTable)
      .values({ tenantId, name: "Administration", description: "Administrative and support staff", active: true, sortOrder: 1 })
      .returning();

    await db
      .insert(hrDesignationsTable)
      .values({ tenantId, name: "Director", departmentId: adminDept.id, active: true, sortOrder: 1 });
  }
}
