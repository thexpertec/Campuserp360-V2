import { db } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

const DEFAULT_SLUG = (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase();
async function resolveCcmTenantId(): Promise<string | null> {
  const [row] = await db.select({ id: tenantsTable.id }).from(tenantsTable)
    .where(eq(tenantsTable.slug, DEFAULT_SLUG)).limit(1);
  return row?.id ?? null;
}
import {
  academicYearsTable, classCategoriesTable, classesTable, sectionsTable,
  housesTable, subjectsTable, classSubjectsTable, classSectionsTable,
  classAcademicYearsTable, academicTermsTable, affiliationsTable,
  termsConditionsTable, meritConfigTable, sectionAllocationsTable,
  testCentresTable, applicationsTable, applicationEventsTable,
  guardiansTable, studentsTable, studentAttendanceTable, studentDisciplinaryTable,
  hrDepartmentsTable, hrDesignationsTable, hrSalaryGradesTable, hrIncentiveTypesTable,
  hrDeductionTypesTable, employeesTable, employeeBankAccountsTable,
  employeeSalaryTemplatesTable, employeeSalaryTemplateItemsTable,
  employeeSalaryTransactionsTable, hrAttendanceTable, hrLeaveRequestsTable,
  bankAccountsTable, chartOfAccountsTable, feeTypesTable, feeScheduleTable,
  feeChallansTable, vendorsTable,
  hostelBlocksTable, hostelRoomTypesTable, hostelRoomsTable, hostelAllocationsTable,
  transportVehiclesTable, transportRoutesTable, transportDriversTable, transportTripsTable,
  libraryCategoriesTable, libraryPublishersTable, libraryBooksTable, libraryIssuesTable,
  storeItemCategoriesTable, storeUnitsTable, storeItemsTable, storeTransactionsTable,
  examTypesTable, examGradingScalesTable, examGradeBandsTable, examSchedulesTable, examResultsTable,
  timetablePeriodsTable, timetableSlotsTable, teacherSubjectAssignmentsTable,
  sportsCategoriesTable, sportsVenuesTable, sportsTeamsTable, sportsFixturesTable,
  medicalMedicineCategoriesTable, medicalMedicinesTable, medicalConditionsTable, medicalVisitsTable,
  gateLogTable, gateOutpassTable, eventsTable, announcementsTable, noticeboardItemsTable,
  syllabusUnitsTable, syllabusTopicsTable, tenantsTable,
} from "@workspace/db";

// ── helpers ───────────────────────────────────────────────────────────────────

async function hasRows(table: any): Promise<boolean> {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(table);
  return (r[0]?.c ?? 0) > 0;
}

function pad(n: number, len = 3) { return String(n).padStart(len, "0"); }
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function dateBack(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}
function dateAhead(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function monthStr(back: number) {
  const d = new Date(); d.setMonth(d.getMonth() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── name pools ────────────────────────────────────────────────────────────────

const MALE_FIRST  = ["Mohammad","Ahmed","Ali","Hassan","Usman","Hamza","Omar","Bilal","Tariq","Imran","Adnan","Rizwan","Sajid","Naveed","Waseem","Fawad","Zubair","Khalid","Zahid","Asif","Aamir","Babar","Danyal","Ehsan","Farhan"];
const FEMALE_FIRST = ["Fatima","Ayesha","Zainab","Sara","Maryam","Sana","Asma","Nadia","Farah","Rabia","Iqra","Sobia","Hina","Amna","Sidra","Noor","Kiran","Bushra","Rida","Mahrukh"];
const LAST_NAMES  = ["Khan","Ahmed","Ali","Hassan","Hussain","Shah","Malik","Qureshi","Siddiqui","Aslam","Akhtar","Baig","Cheema","Chaudhry","Mirza","Raza","Saleem","Iqbal","Butt","Nawaz","Abbasi","Farooq","Javed","Latif","Niazi"];
const CITIES = ["Rawalpindi","Islamabad","Lahore","Karachi","Peshawar","Multan","Faisalabad","Quetta","Sialkot","Gujranwala"];
const PROVINCES = ["Punjab","KPK","Sindh","Balochistan","Punjab","Punjab","KPK","Balochistan","Punjab","Punjab"];
const BLOOD = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const BANKS = ["HBL","UBL","MCB","Allied Bank","Bank Alfalah","Meezan Bank"];
const CLASS_CODES = ["class-7","class-8","class-9","class-10","class-11","class-12"];
const SECTION_NAMES = ["A","B","C","D"];

// ── result type ───────────────────────────────────────────────────────────────

export type TableLog = { table: string; rows: number; skipped: boolean };
export type SeedResult = { tables: TableLog[]; totalRows: number; totalSkipped: number };

// ═════════════════════════════════════════════════════════════════════════════
// MODULE SEEDS
// ═════════════════════════════════════════════════════════════════════════════

async function seedAcademic(t: TableLog[]) {
  // Academic Years
  if (await hasRows(academicYearsTable)) {
    t.push({ table: "academic_years", rows: 0, skipped: true });
  } else {
    await db.insert(academicYearsTable).values([
      { name: "2024-2025", active: true, isDefault: false, sortOrder: 1 },
      { name: "2025-2026", active: true, isDefault: true,  sortOrder: 2 },
      { name: "2026-2027", active: false, isDefault: false, sortOrder: 3 },
    ]);
    t.push({ table: "academic_years", rows: 3, skipped: false });
  }

  // Class Categories
  if (await hasRows(classCategoriesTable)) {
    t.push({ table: "class_categories", rows: 0, skipped: true });
  } else {
    await db.insert(classCategoriesTable).values([
      { name: "Middle",            active: true, sortOrder: 1 },
      { name: "Higher Secondary",  active: true, sortOrder: 2 },
    ]);
    t.push({ table: "class_categories", rows: 2, skipped: false });
  }

  // Classes
  if (await hasRows(classesTable)) {
    t.push({ table: "classes", rows: 0, skipped: true });
  } else {
    const cats = await db.select().from(classCategoriesTable);
    const midId = cats.find(c => c.name === "Middle")?.id;
    const hsId  = cats.find(c => c.name === "Higher Secondary")?.id;
    await db.insert(classesTable).values([
      { code: "class-7",  name: "Class 7",  categoryId: midId, seats: 60, active: true, sortOrder: 1, termType: "annual", termCount: 1 },
      { code: "class-8",  name: "Class 8",  categoryId: midId, seats: 60, active: true, sortOrder: 2, termType: "annual", termCount: 1 },
      { code: "class-9",  name: "Class 9",  categoryId: hsId,  seats: 60, active: true, sortOrder: 3, termType: "annual", termCount: 1 },
      { code: "class-10", name: "Class 10", categoryId: hsId,  seats: 60, active: true, sortOrder: 4, termType: "annual", termCount: 1 },
      { code: "class-11", name: "Class 11", categoryId: hsId,  seats: 60, active: true, sortOrder: 5, termType: "annual", termCount: 1 },
      { code: "class-12", name: "Class 12", categoryId: hsId,  seats: 60, active: true, sortOrder: 6, termType: "annual", termCount: 1 },
    ]);
    t.push({ table: "classes", rows: 6, skipped: false });
  }

  // Sections
  if (await hasRows(sectionsTable)) {
    t.push({ table: "sections", rows: 0, skipped: true });
  } else {
    await db.insert(sectionsTable).values(
      SECTION_NAMES.map((name, i) => ({ name, capacity: 30, active: true, sortOrder: i + 1 }))
    );
    t.push({ table: "sections", rows: 4, skipped: false });
  }

  // Houses
  if (await hasRows(housesTable)) {
    t.push({ table: "houses", rows: 0, skipped: true });
  } else {
    await db.insert(housesTable).values([
      { name: "Iqbal House",   color: "#ef4444", active: true, sortOrder: 1 },
      { name: "Jinnah House",  color: "#22c55e", active: true, sortOrder: 2 },
      { name: "Liaquat House", color: "#3b82f6", active: true, sortOrder: 3 },
      { name: "Fatima House",  color: "#f59e0b", active: true, sortOrder: 4 },
    ]);
    t.push({ table: "houses", rows: 4, skipped: false });
  }

  // Subjects
  if (await hasRows(subjectsTable)) {
    t.push({ table: "subjects", rows: 0, skipped: true });
  } else {
    await db.insert(subjectsTable).values([
      { code: "ENG-01", name: "English",          type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 1 },
      { code: "URD-01", name: "Urdu",             type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 2 },
      { code: "MAT-01", name: "Mathematics",      type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 3 },
      { code: "PHY-01", name: "Physics",          type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 4 },
      { code: "CHE-01", name: "Chemistry",        type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 5 },
      { code: "BIO-01", name: "Biology",          type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 6 },
      { code: "PST-01", name: "Pakistan Studies", type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 7 },
      { code: "ISL-01", name: "Islamiat",         type: "theory",    maxMarks: 100, passMarks: 40, active: true, sortOrder: 8 },
      { code: "CS-01",  name: "Computer Science", type: "practical", maxMarks: 100, passMarks: 40, active: true, sortOrder: 9 },
      { code: "PHE-01", name: "Physical Education", type: "practical", maxMarks: 50, passMarks: 20, active: true, sortOrder: 10 },
    ]);
    t.push({ table: "subjects", rows: 10, skipped: false });
  }

  // Class ↔ Sections (all 24 combos)
  if (await hasRows(classSectionsTable)) {
    t.push({ table: "class_sections", rows: 0, skipped: true });
  } else {
    const classes  = await db.select().from(classesTable);
    const sections = await db.select().from(sectionsTable);
    const rows = classes.flatMap(cl =>
      sections.map((sec, i) => ({ classId: cl.id, sectionId: sec.id, sortOrder: i + 1 }))
    );
    await db.insert(classSectionsTable).values(rows);
    t.push({ table: "class_sections", rows: rows.length, skipped: false });
  }

  // Class ↔ Subjects
  if (await hasRows(classSubjectsTable)) {
    t.push({ table: "class_subjects", rows: 0, skipped: true });
  } else {
    const classes  = await db.select().from(classesTable);
    const subjects = await db.select().from(subjectsTable);
    const middleCodes = new Set(["ENG-01","URD-01","MAT-01","PST-01","ISL-01","PHE-01"]);
    const rows = classes.flatMap(cl => {
      const isMiddle = cl.code === "class-7" || cl.code === "class-8";
      return subjects
        .filter(s => isMiddle ? middleCodes.has(s.code) : true)
        .map((s, i) => ({ classId: cl.id, subjectId: s.id, periodsPerWeek: 6, sortOrder: i + 1 }));
    });
    await db.insert(classSubjectsTable).values(rows);
    t.push({ table: "class_subjects", rows: rows.length, skipped: false });
  }

  // Class ↔ Academic Years (all 18 combos)
  if (await hasRows(classAcademicYearsTable)) {
    t.push({ table: "class_academic_years", rows: 0, skipped: true });
  } else {
    const classes = await db.select().from(classesTable);
    const years   = await db.select().from(academicYearsTable);
    const rows = classes.flatMap(cl => years.map(yr => ({ classId: cl.id, academicYearId: yr.id })));
    await db.insert(classAcademicYearsTable).values(rows);
    t.push({ table: "class_academic_years", rows: rows.length, skipped: false });
  }

  // Academic Terms
  if (await hasRows(academicTermsTable)) {
    t.push({ table: "academic_terms", rows: 0, skipped: true });
  } else {
    await db.insert(academicTermsTable).values([
      { name: "Annual Term",   kind: "annual",   active: true, sortOrder: 1 },
      { name: "First Semester", kind: "semester", active: true, sortOrder: 2 },
      { name: "Second Semester", kind: "semester", active: true, sortOrder: 3 },
    ]);
    t.push({ table: "academic_terms", rows: 3, skipped: false });
  }

  // Affiliations
  if (await hasRows(affiliationsTable)) {
    t.push({ table: "affiliations", rows: 0, skipped: true });
  } else {
    await db.insert(affiliationsTable).values([
      { name: "FBISE",             body: "Federal Board of Intermediate & Secondary Education", active: true, sortOrder: 1 },
      { name: "BISE Rawalpindi",   body: "Board of Intermediate & Secondary Education Rawalpindi", active: true, sortOrder: 2 },
    ]);
    t.push({ table: "affiliations", rows: 2, skipped: false });
  }

  // Terms & Conditions
  if (await hasRows(termsConditionsTable)) {
    t.push({ table: "terms_conditions", rows: 0, skipped: true });
  } else {
    await db.insert(termsConditionsTable).values([{
      title: "Admission Terms & Conditions",
      content: "By submitting this application, the candidate and guardian confirm that all information provided is accurate. The college reserves the right to withdraw admission if any information is found to be false. Fee once paid is non-refundable. The candidate must abide by all college rules and regulations.",
      active: true, sortOrder: 1,
    }]);
    t.push({ table: "terms_conditions", rows: 1, skipped: false });
  }

  // Merit Config
  if (await hasRows(meritConfigTable)) {
    t.push({ table: "merit_config", rows: 0, skipped: true });
  } else {
    await db.insert(meritConfigTable).values([{
      academicYearId: null, classCode: null,
      academicWeight: 20, testWeight: 50, interviewWeight: 30,
      minMeritScore: 50,
      notes: "Global default merit formula",
    }]);
    t.push({ table: "merit_config", rows: 1, skipped: false });
  }
}

// ── Test Centres ──────────────────────────────────────────────────────────────

async function seedTestCentres(t: TableLog[]) {
  if (await hasRows(testCentresTable)) {
    t.push({ table: "test_centres", rows: 0, skipped: true }); return;
  }
  await db.insert(testCentresTable).values([
    { centreCode: "CCM-MRR", name: "Cadet College Murree",           city: "Murree",     address: "GPO Box 1, Murree Hills",         focalPerson: "Col (R) Asad Iqbal", phone: "051-3410001", venueType: "both", active: true, sortOrder: 1 },
    { centreCode: "CCM-RWP", name: "Gordon College Rawalpindi",      city: "Rawalpindi", address: "College Road, Rawalpindi",        focalPerson: "Lt Col (R) Tariq Ahmed", phone: "051-5551234", venueType: "test", active: true, sortOrder: 2 },
    { centreCode: "CCM-ISB", name: "Islamabad Model College",        city: "Islamabad",  address: "G-10/4, Islamabad",              focalPerson: "Major (R) Usman Khan",  phone: "051-2345678", venueType: "test", active: true, sortOrder: 3 },
    { centreCode: "CCM-LHR", name: "Aitchison College Lahore",       city: "Lahore",     address: "The Mall, Lahore",               focalPerson: "Brig (R) Hamid Shah",   phone: "042-9921100", venueType: "test", active: true, sortOrder: 4 },
    { centreCode: "CCM-KHI", name: "Cadet College Petaro Exam Hall", city: "Karachi",    address: "II Chundrigar Road, Karachi",    focalPerson: "Col (R) Aslam Nawaz",   phone: "021-3215000", venueType: "test", active: true, sortOrder: 5 },
    { centreCode: "CCM-PSH", name: "Edwardes College Peshawar",      city: "Peshawar",   address: "University Road, Peshawar",      focalPerson: "Major (R) Bilal Afridi", phone: "091-9213100", venueType: "test", active: true, sortOrder: 6 },
  ]);
  t.push({ table: "test_centres", rows: 6, skipped: false });
}

// ── HR Module ─────────────────────────────────────────────────────────────────

async function seedHR(t: TableLog[]) {
  if (await hasRows(hrDepartmentsTable)) {
    t.push({ table: "hr_departments", rows: 0, skipped: true });
    t.push({ table: "hr_designations", rows: 0, skipped: true });
    t.push({ table: "hr_salary_grades", rows: 0, skipped: true });
    t.push({ table: "hr_incentive_types", rows: 0, skipped: true });
    t.push({ table: "hr_deduction_types", rows: 0, skipped: true });
    t.push({ table: "employees", rows: 0, skipped: true });
    t.push({ table: "employee_bank_accounts", rows: 0, skipped: true });
    t.push({ table: "employee_salary_templates", rows: 0, skipped: true });
    t.push({ table: "employee_salary_template_items", rows: 0, skipped: true });
    t.push({ table: "employee_salary_transactions", rows: 0, skipped: true });
    t.push({ table: "hr_attendance", rows: 0, skipped: true });
    t.push({ table: "hr_leave_requests", rows: 0, skipped: true });
    return;
  }

  const tenantId = await resolveCcmTenantId();
  if (!tenantId) {
    t.push({ table: "hr_departments", rows: 0, skipped: true });
    return;
  }

  // Departments
  const deptRows = await db.insert(hrDepartmentsTable).values([
    { name: "Academic",        description: "Teaching and academic affairs",     active: true, sortOrder: 1 },
    { name: "Administration",  description: "Administrative operations",          active: true, sortOrder: 2 },
    { name: "Finance",         description: "Accounts and financial management",  active: true, sortOrder: 3 },
    { name: "Medical",         description: "Health and medical services",        active: true, sortOrder: 4 },
    { name: "Sports",          description: "Physical education and sports",      active: true, sortOrder: 5 },
    { name: "Support Services", description: "Maintenance and support staff",     active: true, sortOrder: 6 },
  ].map(r => ({ ...r, tenantId }))).returning();
  t.push({ table: "hr_departments", rows: deptRows.length, skipped: false });

  const deptId = (name: string) => deptRows.find(d => d.name === name)!.id;

  // Designations
  const desgRows = await db.insert(hrDesignationsTable).values([
    { name: "Principal",         departmentId: deptId("Academic"),       grade: "5", active: true, sortOrder: 1 },
    { name: "Vice Principal",    departmentId: deptId("Academic"),       grade: "4", active: true, sortOrder: 2 },
    { name: "Subject Teacher",   departmentId: deptId("Academic"),       grade: "3", active: true, sortOrder: 3 },
    { name: "Admin Officer",     departmentId: deptId("Administration"), grade: "3", active: true, sortOrder: 4 },
    { name: "IT Officer",        departmentId: deptId("Administration"), grade: "2", active: true, sortOrder: 5 },
    { name: "Accountant",        departmentId: deptId("Finance"),        grade: "3", active: true, sortOrder: 6 },
    { name: "Senior Accountant", departmentId: deptId("Finance"),        grade: "4", active: true, sortOrder: 7 },
    { name: "Librarian",         departmentId: deptId("Academic"),       grade: "2", active: true, sortOrder: 8 },
    { name: "Medical Officer",   departmentId: deptId("Medical"),        grade: "4", active: true, sortOrder: 9 },
    { name: "Sports Coach",      departmentId: deptId("Sports"),         grade: "2", active: true, sortOrder: 10 },
    { name: "Support Staff",     departmentId: deptId("Support Services"), grade: "1", active: true, sortOrder: 11 },
  ].map(r => ({ ...r, tenantId }))).returning();
  t.push({ table: "hr_designations", rows: desgRows.length, skipped: false });

  const desgId = (name: string) => desgRows.find(d => d.name === name)!.id;

  // Salary Grades
  const gradeRows = await db.insert(hrSalaryGradesTable).values([
    { name: "Grade-1", basicMin: 25000, basicMax: 35000, description: "Support staff entry level", active: true, sortOrder: 1 },
    { name: "Grade-2", basicMin: 35000, basicMax: 50000, description: "Junior officers and teachers", active: true, sortOrder: 2 },
    { name: "Grade-3", basicMin: 50000, basicMax: 75000, description: "Senior teachers and executives", active: true, sortOrder: 3 },
    { name: "Grade-4", basicMin: 75000, basicMax: 100000, description: "Senior management", active: true, sortOrder: 4 },
    { name: "Grade-5", basicMin: 100000, basicMax: 150000, description: "Top management", active: true, sortOrder: 5 },
  ].map(r => ({ ...r, tenantId }))).returning();
  t.push({ table: "hr_salary_grades", rows: gradeRows.length, skipped: false });

  const gradeId = (name: string) => gradeRows.find(g => g.name === name)!.id;

  // Incentive types
  await db.insert(hrIncentiveTypesTable).values([
    { name: "House Rent Allowance",  category: "allowance", calculationType: "percentage", defaultValue: 40, active: true, sortOrder: 1 },
    { name: "Medical Allowance",     category: "allowance", calculationType: "percentage", defaultValue: 10, active: true, sortOrder: 2 },
    { name: "Conveyance Allowance",  category: "allowance", calculationType: "fixed",      defaultValue: 3000, active: true, sortOrder: 3 },
    { name: "Performance Bonus",     category: "bonus",     calculationType: "fixed",      defaultValue: 5000, active: true, sortOrder: 4 },
  ].map(r => ({ ...r, tenantId })));
  t.push({ table: "hr_incentive_types", rows: 4, skipped: false });

  // Deduction types
  await db.insert(hrDeductionTypesTable).values([
    { name: "Income Tax",   category: "tax",     calculationType: "percentage", defaultValue: 5,   active: true, sortOrder: 1 },
    { name: "EOBI",         category: "other",   calculationType: "fixed",      defaultValue: 370, active: true, sortOrder: 2 },
    { name: "Loan Recovery", category: "loan",   calculationType: "fixed",      defaultValue: 0,   active: true, sortOrder: 3 },
  ].map(r => ({ ...r, tenantId })));
  t.push({ table: "hr_deduction_types", rows: 3, skipped: false });

  // Employees — 30 staff
  const empDefs: Array<{ fullName: string; role: string; desgName: string; deptName: string; gradeName: string; basic: number; gender: string }> = [
    { fullName: "Rana Tahir Iqbal",  role: "admin",          desgName: "Principal",         deptName: "Academic",       gradeName: "Grade-5", basic: 120000, gender: "male" },
    { fullName: "Imran Hassan Shah",  role: "admin",          desgName: "Vice Principal",    deptName: "Academic",       gradeName: "Grade-4", basic: 85000,  gender: "male" },
    { fullName: "Fareeha Malik",        role: "admin",          desgName: "Vice Principal",    deptName: "Academic",       gradeName: "Grade-4", basic: 82000,  gender: "female" },
    { fullName: "Mohammad Bilal Khan",   role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-3", basic: 65000,  gender: "male" },
    { fullName: "Sadia Qureshi",      role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-3", basic: 62000,  gender: "female" },
    { fullName: "Ahmed Raza",         role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-3", basic: 60000,  gender: "male" },
    { fullName: "Nadia Hussain",      role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-3", basic: 60000,  gender: "female" },
    { fullName: "Tariq Mahmood",      role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-3", basic: 58000,  gender: "male" },
    { fullName: "Hira Baig",         role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 45000,  gender: "female" },
    { fullName: "Usman Aslam",        role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 43000,  gender: "male" },
    { fullName: "Sana Mirza",        role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 42000,  gender: "female" },
    { fullName: "Khalid Butt",         role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 42000,  gender: "male" },
    { fullName: "Asma Chaudhry",     role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 40000,  gender: "female" },
    { fullName: "Naveed Akhtar",       role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 40000,  gender: "male" },
    { fullName: "Rizwan Cheema",       role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 38000,  gender: "male" },
    { fullName: "Zara Saleem",       role: "teacher",        desgName: "Subject Teacher",   deptName: "Academic",       gradeName: "Grade-2", basic: 38000,  gender: "female" },
    { fullName: "Sara Nawaz",        role: "admin",          desgName: "Librarian",         deptName: "Academic",       gradeName: "Grade-2", basic: 40000,  gender: "female" },
    { fullName: "Sajid Farooq",       role: "admin",          desgName: "Admin Officer",     deptName: "Administration", gradeName: "Grade-3", basic: 55000,  gender: "male" },
    { fullName: "Amna Siddiqui",     role: "admin",          desgName: "Admin Officer",     deptName: "Administration", gradeName: "Grade-3", basic: 52000,  gender: "female" },
    { fullName: "Fawad Abbasi",       role: "admin",          desgName: "IT Officer",        deptName: "Administration", gradeName: "Grade-2", basic: 45000,  gender: "male" },
    { fullName: "Hassan Niazi",        role: "accountant",     desgName: "Senior Accountant", deptName: "Finance",        gradeName: "Grade-4", basic: 80000,  gender: "male" },
    { fullName: "Rabia Javed",        role: "accountant",     desgName: "Accountant",        deptName: "Finance",        gradeName: "Grade-3", basic: 55000,  gender: "female" },
    { fullName: "Adnan Latif",        role: "accountant",     desgName: "Accountant",        deptName: "Finance",        gradeName: "Grade-3", basic: 52000,  gender: "male" },
    { fullName: "Dr. Amjad Iqbal",        role: "medical_officer", desgName: "Medical Officer",  deptName: "Medical",        gradeName: "Grade-4", basic: 90000,  gender: "male" },
    { fullName: "Omar Shah",         role: "admin",          desgName: "Sports Coach",      deptName: "Sports",         gradeName: "Grade-2", basic: 42000,  gender: "male" },
    { fullName: "Zubair Ahmed",        role: "admin",          desgName: "Sports Coach",      deptName: "Sports",         gradeName: "Grade-2", basic: 40000,  gender: "male" },
    { fullName: "Ghulam Mustafa",      role: "support",        desgName: "Support Staff",     deptName: "Support Services", gradeName: "Grade-1", basic: 28000,  gender: "male" },
    { fullName: "Rashid Ali",          role: "support",        desgName: "Support Staff",     deptName: "Support Services", gradeName: "Grade-1", basic: 27000,  gender: "male" },
    { fullName: "Akbar Khan",         role: "support",        desgName: "Support Staff",     deptName: "Support Services", gradeName: "Grade-1", basic: 27000,  gender: "male" },
    { fullName: "Shaukat Hussain",      role: "support",        desgName: "Support Staff",     deptName: "Support Services", gradeName: "Grade-1", basic: 26000,  gender: "male" },
  ];

  const empInserts = empDefs.map((e, i) => ({
    staffId:       `${e.role === "teacher" ? "TCH" : e.role === "accountant" ? "ACC" : e.role === "support" ? "SUP" : "ADM"}-26-${pad(i + 1)}`,
    fullName:      e.fullName,
    gender:        e.gender, religion: "Islam", nationality: "Pakistani",
    role:          e.role as any,
    designationId: desgId(e.desgName),
    departmentId:  deptId(e.deptName),
    salaryGradeId: gradeId(e.gradeName),
    phone:         `030${pad(i + 1, 8)}`,
    email:         `${e.fullName.toLowerCase().replace(/[^a-z ]/g, "").replace(/ .*/,"")}.${e.fullName.toLowerCase().split(" ").pop()?.replace(/[^a-z]/g,"")}@ccmurree.edu.pk`,
    joiningDate:   dateBack(365 + i * 30),
    contractType:  i < 3 ? "permanent" : i < 20 ? "permanent" : "contract",
    status:        "active",
    cnic:          `3520${pad(i + 1, 8)}-${i % 2 === 0 ? "3" : "1"}`,
    dateOfBirth:   `${1960 + (i % 25)}-${pad((i % 12) + 1, 2)}-${pad((i % 28) + 1, 2)}`,
    presentAddress: `House ${i + 1}, Street ${(i % 10) + 1}, ${pick(CITIES, i)}`,
    bloodGroup:    pick(BLOOD, i),
    qualification: e.role === "teacher" ? pick(["M.Sc.", "M.Phil.", "B.Ed.", "M.Ed."], i) : "Graduate",
  }));
  const empRows = await db.insert(employeesTable).values(empInserts.map(r => ({ ...r, tenantId }))).returning();
  t.push({ table: "employees", rows: empRows.length, skipped: false });

  // Employee bank accounts
  await db.insert(employeeBankAccountsTable).values(
    empRows.map((emp, i) => ({
      employeeId:    emp.id,
      bankName:      pick(BANKS, i),
      branchName:    `${pick(CITIES, i)} Main Branch`,
      accountTitle:  emp.fullName,
      accountNumber: `${1000000000 + i * 13 + 7}`,
      isPrimary:     true,
    }))
  );
  t.push({ table: "employee_bank_accounts", rows: empRows.length, skipped: false });

  // Salary templates (1 per employee)
  const tplRows = await db.insert(employeeSalaryTemplatesTable).values(
    empRows.map((emp, i) => ({
      templateCode:        `EST-${pad(i + 1)}`,
      employeeId:          emp.id,
      basicSalary:         empDefs[i].basic,
      effectiveFrom:       "2025-01-01",
      active:              true,
      leaveDeductEnabled:  true,
      leaveDeductType:     "per_day" as const,
      leaveDeductValue:    0,
      shortLeaveEnabled:   false,
      shortLeaveThresholdMinutes: 30,
      shortLeaveDeductType: "fixed" as const,
      shortLeaveDeductValue: 0,
    }))
  ).returning();
  t.push({ table: "employee_salary_templates", rows: tplRows.length, skipped: false });

  // Salary template items (HRA + MA for everyone, CA for senior staff)
  const tplItems = tplRows.flatMap((tpl, i) => {
    const basic = empDefs[i].basic;
    const items = [
      { templateId: tpl.id, itemType: "incentive" as const, name: "House Rent Allowance", calculationType: "fixed" as const, value: Math.round(basic * 0.4), sortOrder: 1 },
      { templateId: tpl.id, itemType: "incentive" as const, name: "Medical Allowance",    calculationType: "fixed" as const, value: Math.round(basic * 0.1), sortOrder: 2 },
      { templateId: tpl.id, itemType: "deduction" as const, name: "EOBI",                 calculationType: "fixed" as const, value: 370,  sortOrder: 3 },
    ];
    if (i < 20) items.push({ templateId: tpl.id, itemType: "incentive" as const, name: "Conveyance Allowance", calculationType: "fixed" as const, value: 3000, sortOrder: 4 });
    return items;
  });
  await db.insert(employeeSalaryTemplateItemsTable).values(tplItems);
  t.push({ table: "employee_salary_template_items", rows: tplItems.length, skipped: false });

  // Salary transactions — 6 months
  const MONTHS = [0,1,2,3,4,5].map(m => monthStr(m)).reverse();
  const salaryTxs = empRows.flatMap((emp, i) => {
    const basic = empDefs[i].basic;
    const allowances = Math.round(basic * 0.5) + 3000;
    const deductions = Math.round((basic + allowances) * 0.05) + 370;
    return MONTHS.map(month => ({
      employeeId:  emp.id,
      month,
      basicSalary: basic,
      allowances,
      deductions,
      netSalary:   basic + allowances - deductions,
      status:      month < monthStr(1) ? "paid" : "pending" as "paid"|"pending",
      paidAt:      month < monthStr(1) ? new Date(month + "-28") : null,
    }));
  });
  await db.insert(employeeSalaryTransactionsTable).values(salaryTxs);
  t.push({ table: "employee_salary_transactions", rows: salaryTxs.length, skipped: false });

  // HR Attendance — 20 working days per employee
  const attStatuses = ["present","present","present","present","absent","present","present","present","leave","present","present","present","present","present","present","present","half-day","present","present","present"] as const;
  const hrAtt = empRows.flatMap(emp =>
    Array.from({ length: 20 }, (_, d) => ({
      employeeId:     emp.id,
      attendanceDate: dateBack(20 - d),
      status:         attStatuses[d],
      inTime:         attStatuses[d] === "present" || attStatuses[d] === "half-day" ? "08:00" : undefined,
      outTime:        attStatuses[d] === "present" ? "16:00" : undefined,
    }))
  );
  await db.insert(hrAttendanceTable).values(hrAtt);
  t.push({ table: "hr_attendance", rows: hrAtt.length, skipped: false });

  // Leave Requests — 20 requests
  const leaveTypes = ["casual","sick","annual","casual","sick"] as const;
  const leaveStatuses = ["approved","approved","pending","rejected","approved"] as const;
  const leaveReqs = Array.from({ length: 20 }, (_, i) => ({
    employeeId: empRows[i % empRows.length].id,
    leaveType:  leaveTypes[i % leaveTypes.length],
    fromDate:   dateBack(30 - i),
    toDate:     dateBack(28 - i),
    reason:     pick(["Personal matter","Medical appointment","Family emergency","Annual leave","Sick leave"], i),
    status:     leaveStatuses[i % leaveStatuses.length],
    approvedBy: i % 3 === 0 ? "Principal" : "Vice Principal",
  }));
  await db.insert(hrLeaveRequestsTable).values(leaveReqs);
  t.push({ table: "hr_leave_requests", rows: leaveReqs.length, skipped: false });
}

// ── Applications ──────────────────────────────────────────────────────────────

async function seedApplications(t: TableLog[]): Promise<string[]> {
  if (await hasRows(applicationsTable)) {
    t.push({ table: "applications", rows: 0, skipped: true });
    t.push({ table: "application_events", rows: 0, skipped: true });
    // Return existing admitted IDs
    const admitted = await db.select({ id: applicationsTable.id }).from(applicationsTable);
    return admitted.slice(0, 120).map(a => a.id);
  }

  const tenantId = await resolveCcmTenantId();
  const centres = await db.select().from(testCentresTable);
  const centreNames = centres.map(c => c.name);

  // 120 admitted + 30 pipeline applications
  const allApps: any[] = [];

  for (let i = 0; i < 150; i++) {
    const classCode = pick(CLASS_CODES, i);
    const firstName = pick(MALE_FIRST, i * 3 + 1);
    const lastName  = pick(LAST_NAMES, i * 7 + 2);
    const fullName  = `${firstName} ${lastName}`;
    const city      = pick(CITIES, i);
    const province  = PROVINCES[i % PROVINCES.length];
    const isAdmitted = i < 120;
    const pipelineStage = ["received","fee_paid","test_scheduled","test_appeared","result_announced","merit_listed","offer_sent","rejected"][i % 8];

    const rollNum   = isAdmitted ? `CCM-R-${pad(i + 1, 4)}` : null;
    const testDate  = isAdmitted ? new Date(dateBack(90 - (i % 30))) : null;
    const resultMks = isAdmitted ? 60 + (i % 40) : null;
    const meritSc   = isAdmitted ? 65 + (i % 30) : null;
    const offerDt   = isAdmitted ? dateBack(60 - (i % 20)) : null;
    const joiningDt = isAdmitted ? dateBack(30 - (i % 10)) : null;

    allApps.push({
      referenceId:   `CCM-2026-${pad(i + 1, 4)}`,
      tenantId:      tenantId ?? null,
      session:       "2026-2027",
      classApplying: classCode,
      previousMarks: `${70 + (i % 25)}%`,
      fullName,
      dateOfBirth:   `${2006 + (i % 6)}-${pad((i % 12) + 1, 2)}-${pad((i % 28) + 1, 2)}`,
      bloodGroup:    pick(BLOOD, i),
      religion:      "Islam",
      studentMobile: `03${pad(i + 1, 9)}`,
      studentEmail:  `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, "")}${i}@gmail.com`,
      presentAddress: `House ${(i % 50) + 1}, Street ${(i % 20) + 1}, ${city}`,
      state:         province,
      city,
      examCenter:    pick(centreNames.length ? centreNames : ["Murree"], i),
      guardianName:  `${pick(MALE_FIRST, i + 5)} ${lastName}`,
      relation:      i % 3 === 0 ? "Father" : "Guardian",
      fatherName:    `${pick(MALE_FIRST, i + 5)} ${lastName}`,
      occupation:    pick(["Businessman","Government Officer","Army Officer","Doctor","Engineer","Teacher","Farmer"], i),
      guardianMobile: `03${pad(i + 100, 9)}`,
      parentCnic:    `3520${pad(i + 200, 8)}-${i % 2 === 0 ? "3" : "1"}`,
      parentCnicLast4: pad(i % 9999, 4),
      portalPassword: "12345",
      status:        isAdmitted ? "admitted" : pipelineStage,
      source:        "online_admission",
      rollNumber:    rollNum,
      testDate,
      testTime:      isAdmitted ? "09:00 AM" : null,
      testVenue:     isAdmitted ? pick(centreNames.length ? centreNames : ["CCM"], i) : null,
      resultMarks:   resultMks,
      resultStatus:  isAdmitted ? "selected" : null,
      meritScore:    meritSc,
      meritRank:     isAdmitted ? i + 1 : null,
      feeStatus:     isAdmitted ? "confirmed" : i < 130 ? "confirmed" : "pending",
      feeConfirmedAt: isAdmitted ? new Date(dateBack(100 - (i % 30))) : null,
      admissionFeeStatus: isAdmitted ? "confirmed" : "pending",
      admissionFeeConfirmedAt: isAdmitted ? new Date(dateBack(55 - (i % 15))) : null,
      offerDate:     offerDt,
      feeDeadline:   isAdmitted ? dateAhead(30) : null,
      joiningDate:   joiningDt,
    });
  }

  const appRows = await db.insert(applicationsTable).values(allApps).returning();
  t.push({ table: "applications", rows: appRows.length, skipped: false });

  // Application events
  const evtStatuses = ["received","fee_paid","test_scheduled","test_appeared","result_announced","merit_listed","offer_sent","admitted"];
  const evtTitles: Record<string,string> = {
    received: "Application Received", fee_paid: "Application Fee Confirmed",
    test_scheduled: "Entry Test Scheduled", test_appeared: "Test Appeared",
    result_announced: "Result Announced", merit_listed: "Placed on Merit List",
    offer_sent: "Offer Letter Issued", admitted: "Admission Confirmed",
    rejected: "Application Rejected",
  };

  const events: any[] = appRows.flatMap(app => {
    const status = app.status;
    const stIdx  = evtStatuses.indexOf(status);
    const stages = stIdx >= 0 ? evtStatuses.slice(0, stIdx + 1) : ["received","rejected"];
    return stages.map((s, si) => ({
      applicationId: app.id,
      eventType:     s,
      title:         evtTitles[s] ?? s,
      description:   `Status updated to ${s}`,
      occurredAt:    new Date(Date.now() - (stages.length - si) * 7 * 24 * 3600 * 1000),
    }));
  });

  await db.insert(applicationEventsTable).values(events);
  t.push({ table: "application_events", rows: events.length, skipped: false });

  return appRows.filter(a => a.status === "admitted").map(a => a.id);
}

// ── Students ──────────────────────────────────────────────────────────────────

async function seedStudents(t: TableLog[], admittedAppIds: string[]): Promise<string[]> {
  if (await hasRows(studentsTable)) {
    t.push({ table: "guardians", rows: 0, skipped: true });
    t.push({ table: "students", rows: 0, skipped: true });
    t.push({ table: "section_allocations", rows: 0, skipped: true });
    t.push({ table: "student_attendance", rows: 0, skipped: true });
    t.push({ table: "student_disciplinary", rows: 0, skipped: true });
    const existing = await db.select({ id: studentsTable.id }).from(studentsTable);
    return existing.map(s => s.id);
  }

  const years    = await db.select().from(academicYearsTable);
  const sections = await db.select().from(sectionsTable);
  const houses   = await db.select().from(housesTable);

  const defaultYear = years.find(y => y.isDefault) ?? years[0];

  // 60 guardians (2 students each)
  const guardianInserts = Array.from({ length: 60 }, (_, i) => ({
    name:    `${pick(MALE_FIRST, i + 10)} ${pick(LAST_NAMES, i + 5)}`,
    cnic:    `3730${pad(i + 1, 8)}-${i % 2 === 0 ? "3" : "7"}`,
    phone:   `031${pad(i + 1, 8)}`,
    city:    pick(CITIES, i),
    address: `House ${(i % 60) + 1}, Block ${String.fromCharCode(65 + (i % 6))}, ${pick(CITIES, i)}`,
  }));
  const guardianRows = await db.insert(guardiansTable).values(guardianInserts).returning();
  t.push({ table: "guardians", rows: guardianRows.length, skipped: false });

  // 120 students — 20 per class
  const studentInserts = Array.from({ length: 120 }, (_, i) => {
    const classIdx    = Math.floor(i / 20);
    const classCode   = CLASS_CODES[classIdx];
    const sectionId   = sections[i % sections.length]?.id;
    const houseId     = houses[i % houses.length]?.id;
    const guardianId  = guardianRows[Math.floor(i / 2)]?.id;
    const appId       = admittedAppIds[i] ?? null;
    const firstName   = pick(MALE_FIRST, i * 3);
    const lastName    = pick(LAST_NAMES, i * 7 + 3);
    const fullName2   = `${firstName} ${lastName}`;
    return {
      applicantId:      `GR-2025-${pad(i + 1)}`,
      applicationId: appId,
      fullName: fullName2,
      dateOfBirth:   `${2006 + (i % 6)}-${pad((i % 12) + 1, 2)}-${pad((i % 28) + 1, 2)}`,
      bloodGroup:    pick(BLOOD, i),
      religion:      "Islam", nationality: "Pakistani",
      mobile:        `032${pad(i + 1, 8)}`,
      email:         `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.ccmurree.edu.pk`,
      address:       `House ${(i % 50) + 1}, ${pick(CITIES, i)}`,
      city:          pick(CITIES, i),
      province:      PROVINCES[i % PROVINCES.length],
      fatherName:    `${pick(MALE_FIRST, i + 50)} ${lastName}`,
      guardianName:  `${pick(MALE_FIRST, i + 50)} ${lastName}`,
      relation:      "Father",
      occupation:    pick(["Businessman","Army Officer","Doctor","Engineer","Government Officer"], i),
      guardianMobile: `033${pad(i + 200, 8)}`,
      guardianCnic:   `3720${pad(i + 300, 8)}-${i % 2 === 0 ? "3" : "1"}`,
      guardianId,
      classCode, sectionId, houseId,
      academicYearId: defaultYear.id,
      enrollmentDate: dateBack(30 - (i % 20)),
      status: "active" as const,
    };
  });

  const studentRows = await db.insert(studentsTable).values(studentInserts).returning();
  t.push({ table: "students", rows: studentRows.length, skipped: false });

  // Section allocations for admitted applications
  const secAllocRows = studentRows
    .filter(s => s.applicationId)
    .map(s => ({
      applicationId:  s.applicationId!,
      classCode:      s.classCode,
      sectionId:      s.sectionId!,
      academicYearId: defaultYear.id,
    }));
  if (secAllocRows.length) {
    await db.insert(sectionAllocationsTable).values(secAllocRows);
  }
  t.push({ table: "section_allocations", rows: secAllocRows.length, skipped: false });

  // Student attendance — 15 days per student
  const attSt = ["present","present","present","present","present","absent","present","present","leave","present","present","present","present","present","present"] as const;
  const stuAtt = studentRows.flatMap(stu =>
    Array.from({ length: 15 }, (_, d) => ({
      studentId:      stu.id,
      attendanceDate: dateBack(15 - d),
      status:         attSt[d],
      classCode:      stu.classCode,
      sectionId:      stu.sectionId ?? undefined,
    }))
  );
  await db.insert(studentAttendanceTable).values(stuAtt);
  t.push({ table: "student_attendance", rows: stuAtt.length, skipped: false });

  // Student disciplinary records
  const discTypes = ["warning","detention","suspension","warning","detention"] as const;
  const discSev   = ["minor","minor","moderate","minor","moderate"] as const;
  const discDesc  = [
    "Late arrival to class on multiple occasions",
    "Failure to complete assigned homework",
    "Disruptive behaviour during assembly",
    "Dress code violation",
    "Mobile phone found during study hours",
  ];
  const discRecs = Array.from({ length: 15 }, (_, i) => ({
    studentId:    studentRows[(i * 8) % studentRows.length].id,
    incidentDate: dateBack(60 - i * 3),
    severity:     discSev[i % discSev.length],
    type:         discTypes[i % discTypes.length],
    description:  discDesc[i % discDesc.length],
    actionTaken:  pick(["Warning issued","Parents notified","Detention served","Counselling session conducted"], i),
    reportedBy:   pick(["Class Teacher","Head Prefect","Vice Principal","Sports Teacher"], i),
    status:       i < 10 ? "closed" : "open" as "open"|"closed",
  }));
  await db.insert(studentDisciplinaryTable).values(discRecs);
  t.push({ table: "student_disciplinary", rows: discRecs.length, skipped: false });

  return studentRows.map(s => s.id);
}

// ── Finance ───────────────────────────────────────────────────────────────────

async function seedFinance(t: TableLog[], studentIds: string[]) {
  const tenantId = await resolveCcmTenantId();
  if (!tenantId) {
    t.push({ table: "chart_of_accounts", rows: 0, skipped: true });
    return;
  }

  // Bank Accounts
  if (await hasRows(bankAccountsTable)) {
    t.push({ table: "bank_accounts", rows: 0, skipped: true });
  } else {
    await db.insert(bankAccountsTable).values([
      { type: "cash",  accountTitle: "Main Cash Box",             isActive: true, sortOrder: 1 },
      { type: "bank",  bankName: "HBL",  accountTitle: "HBL College Account",   ibanNumber: "PK36HABB0000014170025300", isActive: true, sortOrder: 2 },
      { type: "bank",  bankName: "UBL",  accountTitle: "UBL Development Account", ibanNumber: "PK24UNIL0100000100034660", isActive: true, sortOrder: 3 },
    ]);
    t.push({ table: "bank_accounts", rows: 3, skipped: false });
  }

  // Chart of Accounts
  if (await hasRows(chartOfAccountsTable)) {
    t.push({ table: "chart_of_accounts", rows: 0, skipped: true });
  } else {
    // Insert top-level parents first — all are group accounts
    const parents = await db.insert(chartOfAccountsTable).values([
      { code: "1000", name: "Assets",      type: "asset",     kind: "group", normalBalance: "dr", parentId: null, sortOrder: 1, isActive: true },
      { code: "2000", name: "Liabilities", type: "liability", kind: "group", normalBalance: "cr", parentId: null, sortOrder: 2, isActive: true },
      { code: "3000", name: "Equity",      type: "equity",    kind: "group", normalBalance: "cr", parentId: null, sortOrder: 3, isActive: true },
      { code: "4000", name: "Income",      type: "income",    kind: "group", normalBalance: "cr", parentId: null, sortOrder: 4, isActive: true },
      { code: "5000", name: "Expenses",    type: "expense",   kind: "group", normalBalance: "dr", parentId: null, sortOrder: 5, isActive: true },
    ].map(r => ({ ...r, tenantId }))).returning();
    const pid = (code: string) => parents.find(p => p.code === code)!.id;

    // Sub-accounts — "group" if they have children below, "ledger" otherwise
    const subs = await db.insert(chartOfAccountsTable).values([
      { code: "1001", name: "Current Assets",           type: "asset",     kind: "group",  normalBalance: "dr", parentId: pid("1000"), sortOrder: 1, isActive: true },
      { code: "1100", name: "Fee Receivable",            type: "asset",     kind: "ledger", normalBalance: "dr", parentId: pid("1000"), sortOrder: 2, isActive: true },
      { code: "2001", name: "Accounts Payable",          type: "liability", kind: "ledger", normalBalance: "cr", parentId: pid("2000"), sortOrder: 1, isActive: true },
      { code: "2100", name: "Accrued Liabilities",       type: "liability", kind: "ledger", normalBalance: "cr", parentId: pid("2000"), sortOrder: 2, isActive: true },
      { code: "3001", name: "College Development Fund",  type: "equity",    kind: "ledger", normalBalance: "cr", parentId: pid("3000"), sortOrder: 1, isActive: true },
      { code: "4001", name: "Fee Income",                type: "income",    kind: "group",  normalBalance: "cr", parentId: pid("4000"), sortOrder: 1, isActive: true },
      { code: "5001", name: "Staff Salaries",            type: "expense",   kind: "group",  normalBalance: "dr", parentId: pid("5000"), sortOrder: 1, isActive: true },
      { code: "5002", name: "Utilities",                 type: "expense",   kind: "ledger", normalBalance: "dr", parentId: pid("5000"), sortOrder: 2, isActive: true },
      { code: "5003", name: "Maintenance",               type: "expense",   kind: "ledger", normalBalance: "dr", parentId: pid("5000"), sortOrder: 3, isActive: true },
      { code: "5004", name: "Stationery & Supplies",     type: "expense",   kind: "ledger", normalBalance: "dr", parentId: pid("5000"), sortOrder: 4, isActive: true },
    ].map(r => ({ ...r, tenantId }))).returning();
    const sid = (code: string) => subs.find(s => s.code === code)!.id;

    // Leaf accounts — all ledger
    await db.insert(chartOfAccountsTable).values([
      { code: "1001-001", name: "Main Cash Box",           type: "asset",   kind: "ledger", normalBalance: "dr", parentId: sid("1001"), sortOrder: 1, isActive: true, isSystemAccount: true, sourceModule: "bank" },
      { code: "1001-002", name: "HBL College Account",     type: "asset",   kind: "ledger", normalBalance: "dr", parentId: sid("1001"), sortOrder: 2, isActive: true, isSystemAccount: true, sourceModule: "bank" },
      { code: "1001-003", name: "UBL Development Account", type: "asset",   kind: "ledger", normalBalance: "dr", parentId: sid("1001"), sortOrder: 3, isActive: true, isSystemAccount: true, sourceModule: "bank" },
      { code: "4001-001", name: "Tuition Fee Income",      type: "income",  kind: "ledger", normalBalance: "cr", parentId: sid("4001"), sortOrder: 1, isActive: true, isSystemAccount: true, sourceModule: "fee" },
      { code: "4001-002", name: "Hostel Fee Income",       type: "income",  kind: "ledger", normalBalance: "cr", parentId: sid("4001"), sortOrder: 2, isActive: true, isSystemAccount: true, sourceModule: "fee" },
      { code: "4001-003", name: "Transport Fee Income",    type: "income",  kind: "ledger", normalBalance: "cr", parentId: sid("4001"), sortOrder: 3, isActive: true, isSystemAccount: true, sourceModule: "fee" },
      { code: "4001-004", name: "Admission Fee Income",    type: "income",  kind: "ledger", normalBalance: "cr", parentId: sid("4001"), sortOrder: 4, isActive: true, isSystemAccount: true, sourceModule: "fee" },
      { code: "4001-005", name: "Annual Fund Income",      type: "income",  kind: "ledger", normalBalance: "cr", parentId: sid("4001"), sortOrder: 5, isActive: true, isSystemAccount: true, sourceModule: "fee" },
      { code: "5001-001", name: "Academic Staff Salaries", type: "expense", kind: "ledger", normalBalance: "dr", parentId: sid("5001"), sortOrder: 1, isActive: true },
      { code: "5001-002", name: "Admin Staff Salaries",    type: "expense", kind: "ledger", normalBalance: "dr", parentId: sid("5001"), sortOrder: 2, isActive: true },
    ].map(r => ({ ...r, tenantId })));
    t.push({ table: "chart_of_accounts", rows: parents.length + subs.length + 10, skipped: false });
  }

  // Fee Types
  if (await hasRows(feeTypesTable)) {
    t.push({ table: "fee_types", rows: 0, skipped: true });
    t.push({ table: "fee_schedule", rows: 0, skipped: true });
    t.push({ table: "fee_challans", rows: 0, skipped: true });
  } else {
    const ftRows = await db.insert(feeTypesTable).values([
      { name: "Tuition Fee",    feeCategory: "tuition",     feeCode: "tuition-fee",    duration: "monthly", active: true, sortOrder: 1 },
      { name: "Hostel Fee",     feeCategory: "non-tuition", feeCode: "hostel-fee",     duration: "monthly", active: true, sortOrder: 2 },
      { name: "Transport Fee",  feeCategory: "non-tuition", feeCode: "transport-fee",  duration: "monthly", active: true, sortOrder: 3 },
      { name: "Admission Fee",  feeCategory: "non-tuition", feeCode: "admission-fee",  duration: "once",    active: true, sortOrder: 4 },
      { name: "Annual Fund",    feeCategory: "non-tuition", feeCode: "annual-fund",    duration: "annual",  active: true, sortOrder: 5 },
      { name: "Library Fee",    feeCategory: "non-tuition", feeCode: "library-fee",    duration: "annual",  active: true, sortOrder: 6 },
    ].map(r => ({ ...r, tenantId }))).returning();
    t.push({ table: "fee_types", rows: ftRows.length, skipped: false });

    const years    = await db.select().from(academicYearsTable);
    const defaultYear = years.find(y => y.isDefault) ?? years[0];
    const tuitionFt = ftRows.find(f => f.feeCode === "tuition-fee")!;

    // Fee schedule
    const tuitionAmounts: Record<string, number> = {
      "class-7": 15000, "class-8": 15000,
      "class-9": 18000, "class-10": 18000,
      "class-11": 20000, "class-12": 20000,
    };
    const scheduleRows = CLASS_CODES.flatMap(code =>
      ftRows.map(ft => ({
        academicYearId: defaultYear.id,
        classCode:      code,
        feeTypeId:      ft.id,
        amount:         ft.feeCode === "tuition-fee" ? tuitionAmounts[code] :
                        ft.feeCode === "hostel-fee"  ? 12000 :
                        ft.feeCode === "transport-fee" ? 3000 :
                        ft.feeCode === "admission-fee" ? 5000 :
                        ft.feeCode === "annual-fund"   ? 10000 : 2000,
      }))
    );
    await db.insert(feeScheduleTable).values(scheduleRows);
    t.push({ table: "fee_schedule", rows: scheduleRows.length, skipped: false });

    // Fee challans — 2 months for all students (tuition only)
    const students = await db.select({ id: studentsTable.id, classCode: studentsTable.classCode }).from(studentsTable);
    const challanMonths = [monthStr(2), monthStr(1)];
    const challanStatuses = ["paid","paid","paid","paid","paid","paid","paid","paid","pending","overdue"] as const;
    const challans = students.flatMap((stu, si) =>
      challanMonths.map((month, mi) => ({
        studentId:      stu.id,
        feeTypeId:      tuitionFt.id,
        academicYearId: defaultYear.id,
        amount:         tuitionAmounts[stu.classCode] ?? 15000,
        month,
        issueDate:      month + "-01",
        dueDate:        month + "-15",
        challanNumber:  `CCM-${month.replace("-", "")}-${pad(si * 2 + mi + 1, 4)}`,
        status:         challanStatuses[(si + mi) % challanStatuses.length],
        paidAt:         challanStatuses[(si + mi) % challanStatuses.length] === "paid" ? new Date(month + "-10") : null,
        paidAmount:     challanStatuses[(si + mi) % challanStatuses.length] === "paid" ? (tuitionAmounts[stu.classCode] ?? 15000) : null,
        paymentMethod:  "bank" as const,
      }))
    );
    await db.insert(feeChallansTable).values(challans.map(r => ({ ...r, tenantId })));
    t.push({ table: "fee_challans", rows: challans.length, skipped: false });
  }

  // Vendors
  if (await hasRows(vendorsTable)) {
    t.push({ table: "vendors", rows: 0, skipped: true });
  } else {
    await db.insert(vendorsTable).values([
      { vendorCode: "VND-001", name: "Al-Khidmat Stationery",     contactPerson: "Abdul Rehman",   phone: "051-1234567", address: "Raja Bazar, Rawalpindi",  active: true, sortOrder: 1 },
      { vendorCode: "VND-002", name: "National Uniform House",     contactPerson: "Mohammad Yousuf", phone: "051-9876543", address: "Saddar, Rawalpindi",      active: true, sortOrder: 2 },
      { vendorCode: "VND-003", name: "Bright IT Solutions",        contactPerson: "Zafar Iqbal",    phone: "051-5554433", address: "F-7, Islamabad",           active: true, sortOrder: 3 },
      { vendorCode: "VND-004", name: "Green Valley Catering",      contactPerson: "Jamil Ahmed",    phone: "051-3339900", address: "Murree Road, Rawalpindi",  active: true, sortOrder: 4 },
      { vendorCode: "VND-005", name: "Punjab Textbooks Pvt Ltd",   contactPerson: "Arshad Mehmood", phone: "042-3571100", address: "Ferozpur Road, Lahore",   active: true, sortOrder: 5 },
      { vendorCode: "VND-006", name: "Sports World Pakistan",      contactPerson: "Tariq Bashir",   phone: "051-7778899", address: "Liaquat Road, Rawalpindi", active: true, sortOrder: 6 },
      { vendorCode: "VND-007", name: "Clean Zone Services",        contactPerson: "Riaz Hussain",   phone: "051-6665544", address: "Chaklala, Rawalpindi",    active: true, sortOrder: 7 },
      { vendorCode: "VND-008", name: "Medico Pharma Supplies",     contactPerson: "Dr. Khalid",     phone: "051-2221110", address: "Committee Chowk, Rwp",    active: true, sortOrder: 8 },
    ]);
    t.push({ table: "vendors", rows: 8, skipped: false });
  }

}

// ── Hostel ────────────────────────────────────────────────────────────────────

async function seedHostel(t: TableLog[], studentIds: string[]) {
  if (await hasRows(hostelBlocksTable)) {
    t.push({ table: "hostel_blocks", rows: 0, skipped: true });
    t.push({ table: "hostel_room_types", rows: 0, skipped: true });
    t.push({ table: "hostel_rooms", rows: 0, skipped: true });
    t.push({ table: "hostel_allocations", rows: 0, skipped: true });
    return;
  }

  const blockRows = await db.insert(hostelBlocksTable).values([
    { name: "Block A",    blockType: "boys",  floors: 3, capacity: 120, description: "Main cadet dormitory block", active: true, sortOrder: 1 },
    { name: "Block B",    blockType: "boys",  floors: 2, capacity: 80,  description: "Junior cadets dormitory",    active: true, sortOrder: 2 },
    { name: "Staff Block", blockType: "staff", floors: 1, capacity: 20,  description: "Staff quarters",            active: true, sortOrder: 3 },
  ]).returning();
  t.push({ table: "hostel_blocks", rows: blockRows.length, skipped: false });

  const rtRows = await db.insert(hostelRoomTypesTable).values([
    { name: "4-Bed Dormitory", capacity: 4, description: "Standard cadet dormitory room",  active: true, sortOrder: 1 },
    { name: "2-Bed Room",      capacity: 2, description: "Double occupancy room",           active: true, sortOrder: 2 },
    { name: "Single Room",     capacity: 1, description: "Single occupancy room for staff", active: true, sortOrder: 3 },
  ]).returning();
  t.push({ table: "hostel_room_types", rows: rtRows.length, skipped: false });

  const dormId   = rtRows.find(r => r.name === "4-Bed Dormitory")!.id;
  const doubleId = rtRows.find(r => r.name === "2-Bed Room")!.id;
  const singleId = rtRows.find(r => r.name === "Single Room")!.id;

  const roomInserts: any[] = [];
  blockRows.forEach((block, bi) => {
    const count = bi === 0 ? 15 : bi === 1 ? 10 : 5;
    for (let r = 0; r < count; r++) {
      roomInserts.push({
        blockId:    block.id,
        roomNumber: `${block.name.charAt(6)}-${pad(r + 1)}`,
        roomTypeId: bi === 2 ? singleId : r % 3 === 0 ? doubleId : dormId,
        floor:      Math.floor(r / 5) + 1,
        capacity:   bi === 2 ? 1 : r % 3 === 0 ? 2 : 4,
        status:     r < count - 2 ? "occupied" : "available" as "available"|"occupied"|"maintenance",
      });
    }
  });
  const roomRows = await db.insert(hostelRoomsTable).values(roomInserts).returning();
  t.push({ table: "hostel_rooms", rows: roomRows.length, skipped: false });

  // Allocate 60 students to hostel rooms
  const occupiedRooms = roomRows.filter(r => r.status === "occupied").slice(0, 20);
  const students = await db.select({ id: studentsTable.id, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode, fullName: studentsTable.fullName }).from(studentsTable);
  const hostelStudents = students.slice(0, 60);

  const allocRows = hostelStudents.map((stu, i) => ({
    studentId:   stu.id,
    studentName: stu.fullName,
    applicantId:    stu.applicantId,
    classCode:   stu.classCode,
    roomId:      roomRows[i % roomRows.length].id,
    fromDate:    dateBack(90),
    status:      "active" as const,
  }));
  await db.insert(hostelAllocationsTable).values(allocRows);
  t.push({ table: "hostel_allocations", rows: allocRows.length, skipped: false });
}

// ── Transport ─────────────────────────────────────────────────────────────────

async function seedTransport(t: TableLog[]) {
  if (await hasRows(transportVehiclesTable)) {
    t.push({ table: "transport_vehicles", rows: 0, skipped: true });
    t.push({ table: "transport_routes", rows: 0, skipped: true });
    t.push({ table: "transport_drivers", rows: 0, skipped: true });
    t.push({ table: "transport_trips", rows: 0, skipped: true });
    return;
  }

  const vehRows = await db.insert(transportVehiclesTable).values([
    { regNo: "RWP-3456", make: "Hino",   model: "AK1J",   vehicleType: "bus", capacity: 45, description: "Main school bus",    active: true, sortOrder: 1 },
    { regNo: "ISB-7890", make: "Hino",   model: "AK1J",   vehicleType: "bus", capacity: 45, description: "Secondary school bus", active: true, sortOrder: 2 },
    { regNo: "RWP-1122", make: "Toyota", model: "Hiace",   vehicleType: "van", capacity: 14, description: "Staff van",           active: true, sortOrder: 3 },
    { regNo: "MRR-0055", make: "Toyota", model: "Corolla", vehicleType: "car", capacity: 5,  description: "Admin car",           active: true, sortOrder: 4 },
  ]).returning();
  t.push({ table: "transport_vehicles", rows: vehRows.length, skipped: false });

  const routeRows = await db.insert(transportRoutesTable).values([
    { name: "Rawalpindi–Murree",  origin: "Committee Chowk, Rawalpindi", destination: "CCM Main Gate, Murree", description: "Main route via Murree Road", active: true, sortOrder: 1 },
    { name: "Islamabad–Murree",   origin: "Zero Point, Islamabad",       destination: "CCM Main Gate, Murree", description: "Via Kashmir Highway",       active: true, sortOrder: 2 },
    { name: "City Shuttle",       origin: "CCM Main Gate",               destination: "Murree City Centre",   description: "Local city shuttle",        active: true, sortOrder: 3 },
  ]).returning();
  t.push({ table: "transport_routes", rows: routeRows.length, skipped: false });

  const driverRows = await db.insert(transportDriversTable).values([
    { name: "Ghulam Hassan",  cnic: "3730110001-5", licenseNumber: "LHR-2019-54321", licenseType: "HTV", licenseExpiry: "2027-06-30", phone: "0300-1111111", status: "active" },
    { name: "Rashid Ali",     cnic: "3730110002-3", licenseNumber: "RWP-2020-65432", licenseType: "HTV", licenseExpiry: "2026-12-31", phone: "0300-2222222", status: "active" },
    { name: "Akbar Khan",     cnic: "3730110003-1", licenseNumber: "ISB-2021-76543", licenseType: "LTV", licenseExpiry: "2027-03-15", phone: "0300-3333333", status: "active" },
    { name: "Jameel Ahmed",   cnic: "3730110004-9", licenseNumber: "RWP-2018-87654", licenseType: "LTV", licenseExpiry: "2026-09-30", phone: "0300-4444444", status: "active" },
  ]).returning();
  t.push({ table: "transport_drivers", rows: driverRows.length, skipped: false });

  const tripRows: any[] = [];
  for (let d = 20; d >= 1; d--) {
    [0, 1, 2].forEach((ri) => {
      tripRows.push({
        routeId:       routeRows[ri].id,
        vehicleId:     vehRows[ri % vehRows.length].id,
        driverId:      driverRows[ri % driverRows.length].id,
        tripDate:      dateBack(d),
        departureTime: "07:00",
        arrivalTime:   "09:30",
        status:        d > 2 ? "completed" : "scheduled" as "scheduled"|"completed",
        passengerCount: 30 + (ri * 5),
      });
    });
  }
  await db.insert(transportTripsTable).values(tripRows);
  t.push({ table: "transport_trips", rows: tripRows.length, skipped: false });
}

// ── Library ───────────────────────────────────────────────────────────────────

async function seedLibrary(t: TableLog[]) {
  if (await hasRows(libraryCategoriesTable)) {
    t.push({ table: "library_categories", rows: 0, skipped: true });
    t.push({ table: "library_publishers", rows: 0, skipped: true });
    t.push({ table: "library_books", rows: 0, skipped: true });
    t.push({ table: "library_issues", rows: 0, skipped: true });
    return;
  }

  const catRows = await db.insert(libraryCategoriesTable).values([
    { name: "Science & Technology", active: true, sortOrder: 1 },
    { name: "Mathematics",          active: true, sortOrder: 2 },
    { name: "Literature & Language", active: true, sortOrder: 3 },
    { name: "Islamic Studies",       active: true, sortOrder: 4 },
    { name: "History & Geography",   active: true, sortOrder: 5 },
    { name: "Reference & General",   active: true, sortOrder: 6 },
  ]).returning();
  t.push({ table: "library_categories", rows: catRows.length, skipped: false });

  const pubRows = await db.insert(libraryPublishersTable).values([
    { name: "Oxford University Press",      city: "Karachi",    active: true, sortOrder: 1 },
    { name: "National Book Foundation",     city: "Islamabad",  active: true, sortOrder: 2 },
    { name: "Ilmi Kitab Khana",             city: "Lahore",     active: true, sortOrder: 3 },
    { name: "Punjab Textbook Board",        city: "Lahore",     active: true, sortOrder: 4 },
    { name: "Cambridge University Press",   city: "Cambridge",  active: true, sortOrder: 5 },
  ]).returning();
  t.push({ table: "library_publishers", rows: pubRows.length, skipped: false });

  const bookData = [
    ["Fundamentals of Physics", "Halliday & Resnick", "978-0-470-04618-0", "Science & Technology", "Oxford University Press", "2021", 5],
    ["Chemistry for A-Level",   "E.N. Ramsden",       "978-0-748-73330-3", "Science & Technology", "Cambridge University Press", "2020", 4],
    ["Biology: The Core",       "Eric Simon",         "978-0-134-42233-8", "Science & Technology", "Oxford University Press", "2019", 3],
    ["Computer Science Illuminated", "Nell Dale",    "978-1-284-15561-4", "Science & Technology", "National Book Foundation", "2022", 2],
    ["Advanced Mathematics",    "C.J. Tranter",       "978-0-340-01284-5", "Mathematics", "Oxford University Press", "2020", 6],
    ["Pure Mathematics",        "A. Backhouse",       "978-0-582-44387-9", "Mathematics", "Cambridge University Press", "2019", 4],
    ["Mathematical Statistics", "Wackerly",           "978-0-495-11081-7", "Mathematics", "National Book Foundation", "2021", 3],
    ["Complete English",        "Robert Allen",       "978-0-750-03165-9", "Literature & Language", "Oxford University Press", "2020", 5],
    ["Urdu Adab",               "Shafique Tauseef",   "URD-2021-001",      "Literature & Language", "Ilmi Kitab Khana", "2021", 4],
    ["English Literature",      "Robert Liddell",     "978-0-571-08060-2", "Literature & Language", "Cambridge University Press", "2018", 3],
    ["Quran and Modern Science","Dr. Maurice Bucaille","978-0-915957-04-4","Islamic Studies", "National Book Foundation", "2019", 8],
    ["Seerat-un-Nabi",          "Shibli Nomani",      "ISL-2020-001",      "Islamic Studies", "Ilmi Kitab Khana", "2020", 6],
    ["Fiqh-ul-Ibadaat",         "Mufti Taqi Usmani",  "ISL-2022-001",      "Islamic Studies", "Ilmi Kitab Khana", "2022", 4],
    ["History of Pakistan",     "I.H. Qureshi",       "978-0-231-08805-4", "History & Geography", "Oxford University Press", "2020", 5],
    ["Pakistan Studies",        "J.D. Dossani",       "978-0-521-59827-2", "History & Geography", "Cambridge University Press", "2021", 7],
    ["World Geography",         "James M. Rubenstein","978-0-134-37034-1", "History & Geography", "Oxford University Press", "2019", 3],
    ["Encyclopedia Britannica", "Various",            "978-1-593-39292-5", "Reference & General", "Oxford University Press", "2022", 2],
    ["Pakistan Year Book",      "APP Editors",        "PYB-2025-001",      "Reference & General", "National Book Foundation", "2025", 2],
    ["Oxford English Dictionary","Various",            "978-0-198-61209-5", "Reference & General", "Oxford University Press", "2020", 3],
    ["Atlas of the World",      "National Geographic", "978-1-426-22081-8", "Reference & General", "Oxford University Press", "2021", 2],
  ];

  const bookInserts = bookData.map(([title, author, isbn, catName, pubName, year, copies]) => ({
    title: title as string, author: author as string, isbn: isbn as string,
    categoryId: catRows.find(c => c.name === catName as string)?.id ?? catRows[0].id,
    publisherId: pubRows.find(p => p.name === pubName as string)?.id ?? pubRows[0].id,
    yearPublished: year as string,
    totalCopies:     copies as number,
    availableCopies: Math.max(1, (copies as number) - 1),
    shelfLocation:   `Shelf ${String.fromCharCode(65 + bookData.indexOf([title, author, isbn, catName, pubName, year, copies] as any) % 6)}-${pad(bookData.indexOf([title, author, isbn, catName, pubName, year, copies] as any) + 1, 2)}`,
    active: true,
  }));
  const bookRows = await db.insert(libraryBooksTable).values(bookInserts).returning();
  t.push({ table: "library_books", rows: bookRows.length, skipped: false });

  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId }).from(studentsTable);
  const issueStatuses = ["returned","returned","returned","returned","issued","issued","overdue"] as const;
  const issueRows = Array.from({ length: 30 }, (_, i) => {
    const st = students[i % students.length];
    const bk = bookRows[i % bookRows.length];
    const issued = dateBack(20 - (i % 15));
    const due    = dateBack(7 - (i % 14));
    const status = issueStatuses[i % issueStatuses.length];
    return {
      bookId:       bk.id,
      studentId:    st.id,
      studentName:  st.fullName,
      applicantId:     st.applicantId,
      issuedDate:   issued,
      dueDate:      due,
      returnedDate: status === "returned" ? dateBack(i % 5) : null,
      fineAmount:   status === "overdue" ? 50 * (i % 5 + 1) : 0,
      status,
    };
  });
  await db.insert(libraryIssuesTable).values(issueRows);
  t.push({ table: "library_issues", rows: issueRows.length, skipped: false });
}

// ── Store ─────────────────────────────────────────────────────────────────────

async function seedStore(t: TableLog[]) {
  if (await hasRows(storeItemCategoriesTable)) {
    t.push({ table: "store_item_categories", rows: 0, skipped: true });
    t.push({ table: "store_units", rows: 0, skipped: true });
    t.push({ table: "store_items", rows: 0, skipped: true });
    t.push({ table: "store_transactions", rows: 0, skipped: true });
    return;
  }

  const catRows = await db.insert(storeItemCategoriesTable).values([
    { name: "Stationery",        active: true, sortOrder: 1 },
    { name: "Cleaning Supplies", active: true, sortOrder: 2 },
    { name: "Sports Equipment",  active: true, sortOrder: 3 },
    { name: "IT Equipment",      active: true, sortOrder: 4 },
    { name: "Uniform",           active: true, sortOrder: 5 },
    { name: "Furniture",         active: true, sortOrder: 6 },
    { name: "Medical Supplies",  active: true, sortOrder: 7 },
    { name: "Kitchen Items",     active: true, sortOrder: 8 },
  ]).returning();
  t.push({ table: "store_item_categories", rows: catRows.length, skipped: false });

  const unitRows = await db.insert(storeUnitsTable).values([
    { name: "Piece",  symbol: "pcs",  active: true, sortOrder: 1 },
    { name: "Dozen",  symbol: "doz",  active: true, sortOrder: 2 },
    { name: "Litre",  symbol: "L",    active: true, sortOrder: 3 },
    { name: "Kilogram", symbol: "kg", active: true, sortOrder: 4 },
    { name: "Pack",   symbol: "pk",   active: true, sortOrder: 5 },
    { name: "Box",    symbol: "box",  active: true, sortOrder: 6 },
  ]).returning();
  t.push({ table: "store_units", rows: unitRows.length, skipped: false });

  const catId = (name: string) => catRows.find(c => c.name === name)!.id;
  const unitId = (name: string) => unitRows.find(u => u.name === name)!.id;

  const itemData = [
    ["A4 Copy Paper (Ream)", "Stationery", "Pack", 50, 10, "450.00"],
    ["Ball Point Pens",       "Stationery", "Box",  200, 20, "150.00"],
    ["Whiteboard Markers",    "Stationery", "Box",  30, 5,  "350.00"],
    ["Notebooks (Register)",  "Stationery", "Dozen", 15, 5,  "1200.00"],
    ["Floor Cleaner",         "Cleaning Supplies", "Litre", 20, 5, "180.00"],
    ["Toilet Cleaner",        "Cleaning Supplies", "Litre", 15, 5, "200.00"],
    ["Disinfectant Spray",    "Cleaning Supplies", "Piece", 10, 3, "350.00"],
    ["Brooms",                "Cleaning Supplies", "Piece", 25, 5, "120.00"],
    ["Cricket Bat",           "Sports Equipment", "Piece", 8, 2, "3500.00"],
    ["Cricket Ball (Leather)","Sports Equipment", "Box", 5, 2, "1200.00"],
    ["Football",              "Sports Equipment", "Piece", 6, 2, "2500.00"],
    ["Hockey Stick",          "Sports Equipment", "Piece", 10, 3, "1800.00"],
    ["Laptop Computer",       "IT Equipment", "Piece", 15, 3, "85000.00"],
    ["Printer Cartridge",     "IT Equipment", "Piece", 8, 3, "2500.00"],
    ["USB Flash Drives",      "IT Equipment", "Piece", 20, 5, "800.00"],
    ["Projector",             "IT Equipment", "Piece", 3, 1, "45000.00"],
    ["Summer Uniform Set",    "Uniform", "Piece", 50, 10, "2500.00"],
    ["Winter Uniform Set",    "Uniform", "Piece", 40, 10, "4500.00"],
    ["Cadet Boots",           "Uniform", "Piece", 30, 5, "3500.00"],
    ["Study Chair",           "Furniture", "Piece", 5, 2, "3500.00"],
    ["Examination Table",     "Furniture", "Piece", 3, 1, "2500.00"],
    ["Paracetamol 500mg",     "Medical Supplies", "Pack", 50, 10, "35.00"],
    ["ORS Sachets",           "Medical Supplies", "Box", 20, 5, "80.00"],
    ["Bandages (Roll)",       "Medical Supplies", "Pack", 30, 5, "120.00"],
    ["Antiseptic Solution",   "Medical Supplies", "Litre", 10, 3, "250.00"],
    ["Rice (Basmati)",        "Kitchen Items", "Kilogram", 100, 20, "280.00"],
    ["Cooking Oil",           "Kitchen Items", "Litre", 50, 10, "380.00"],
    ["Dal Lentils",           "Kitchen Items", "Kilogram", 80, 15, "180.00"],
    ["Sugar",                 "Kitchen Items", "Kilogram", 60, 10, "120.00"],
    ["Tea Leaves",            "Kitchen Items", "Kilogram", 10, 3, "950.00"],
  ];

  const itemRows = await db.insert(storeItemsTable).values(
    itemData.map(([name, cat, unit, stock, reorder, price]) => ({
      name: name as string,
      categoryId: catId(cat as string),
      unitId: unitId(unit as string),
      currentStock: stock as number,
      reorderLevel: reorder as number,
      unitPrice: price as string,
      active: true,
    }))
  ).returning();
  t.push({ table: "store_items", rows: itemRows.length, skipped: false });

  // Stock transactions (in + out over past 2 months)
  const txRows: any[] = [];
  itemRows.forEach((item, i) => {
    txRows.push({ itemId: item.id, transactionType: "in",  quantity: (i % 5 + 2) * 10, transactionDate: dateBack(45), reference: `GRN-${pad(i + 1)}`, notes: "Initial stock received" });
    txRows.push({ itemId: item.id, transactionType: "out", quantity: (i % 3 + 1) * 5,  transactionDate: dateBack(20), issuedTo: pick(["Admin Office","Sports Department","Academic Block","Medical Room"], i), notes: "Issued for departmental use" });
  });
  await db.insert(storeTransactionsTable).values(txRows);
  t.push({ table: "store_transactions", rows: txRows.length, skipped: false });
}

// ── Exams ─────────────────────────────────────────────────────────────────────

async function seedExams(t: TableLog[]) {
  if (await hasRows(examTypesTable)) {
    t.push({ table: "exam_types", rows: 0, skipped: true });
    t.push({ table: "exam_grading_scales", rows: 0, skipped: true });
    t.push({ table: "exam_grade_bands", rows: 0, skipped: true });
    t.push({ table: "exam_schedules", rows: 0, skipped: true });
    t.push({ table: "exam_results", rows: 0, skipped: true });
    return;
  }

  const etRows = await db.insert(examTypesTable).values([
    { name: "Unit Test",  description: "Monthly unit assessment",    active: true, sortOrder: 1 },
    { name: "Mid-Term",   description: "Mid-semester examination",   active: true, sortOrder: 2 },
    { name: "Final Term", description: "End-of-year final exam",     active: true, sortOrder: 3 },
    { name: "Mock Exam",  description: "Practice board examination", active: true, sortOrder: 4 },
  ]).returning();
  t.push({ table: "exam_types", rows: etRows.length, skipped: false });

  const gsRows = await db.insert(examGradingScalesTable).values([
    { name: "FBISE Standard Scale", description: "Based on Federal Board grading criteria", active: true, sortOrder: 1 },
  ]).returning();
  t.push({ table: "exam_grading_scales", rows: 1, skipped: false });

  await db.insert(examGradeBandsTable).values([
    { gradeScaleId: gsRows[0].id, grade: "A+", minPercent: 90, maxPercent: 100, remarks: "Outstanding",  active: true, sortOrder: 1 },
    { gradeScaleId: gsRows[0].id, grade: "A",  minPercent: 80, maxPercent: 89,  remarks: "Excellent",    active: true, sortOrder: 2 },
    { gradeScaleId: gsRows[0].id, grade: "B",  minPercent: 70, maxPercent: 79,  remarks: "Very Good",    active: true, sortOrder: 3 },
    { gradeScaleId: gsRows[0].id, grade: "C",  minPercent: 60, maxPercent: 69,  remarks: "Good",         active: true, sortOrder: 4 },
    { gradeScaleId: gsRows[0].id, grade: "D",  minPercent: 40, maxPercent: 59,  remarks: "Satisfactory", active: true, sortOrder: 5 },
    { gradeScaleId: gsRows[0].id, grade: "F",  minPercent: 0,  maxPercent: 39,  remarks: "Fail",         active: true, sortOrder: 6 },
  ]);
  t.push({ table: "exam_grade_bands", rows: 6, skipped: false });

  const finalTermId = etRows.find(e => e.name === "Final Term")!.id;
  const subjects = [
    { code: "ENG-01", name: "English" },
    { code: "URD-01", name: "Urdu" },
    { code: "MAT-01", name: "Mathematics" },
    { code: "PHY-01", name: "Physics" },
    { code: "CHE-01", name: "Chemistry" },
  ];

  // Final term schedules for classes 9 & 10 × 5 subjects = 10 schedules
  const schedData: any[] = [];
  ["class-9","class-10"].forEach((cls, ci) => {
    subjects.forEach((sub, si) => {
      schedData.push({
        examTypeId:   finalTermId,
        classCode:    cls,
        subjectCode:  sub.code,
        subjectName:  sub.name,
        sessionLabel: "2025-2026",
        examDate:     dateAhead(30 + si * 2 + ci * 12),
        totalMarks:   100, passMarks: 40,
        venue:        "Examination Hall",
        active: true,
      });
    });
  });
  const schedRows = await db.insert(examSchedulesTable).values(schedData).returning();
  t.push({ table: "exam_schedules", rows: schedRows.length, skipped: false });

  // Exam results for those students
  const students9  = await db.select({ id: studentsTable.id }).from(studentsTable).where(sql`${studentsTable.classCode} = 'class-9'`);
  const students10 = await db.select({ id: studentsTable.id }).from(studentsTable).where(sql`${studentsTable.classCode} = 'class-10'`);

  const resultRows: any[] = [];
  const classStudentMap: Record<string, string[]> = {
    "class-9":  students9.map(s => s.id),
    "class-10": students10.map(s => s.id),
  };

  schedRows.forEach((sched, si) => {
    const stuIds = classStudentMap[sched.classCode] ?? [];
    stuIds.forEach((stuId, i) => {
      const base  = 50 + (si * 3 + i * 7) % 45;
      const marks = Math.min(100, Math.max(30, base));
      resultRows.push({
        scheduleId:    sched.id,
        studentId:     stuId,
        obtainedMarks: marks,
        isAbsent:      marks === 30,
        remarks:       marks >= 80 ? "Excellent" : marks >= 60 ? "Good" : marks >= 40 ? "Pass" : "Needs improvement",
      });
    });
  });
  if (resultRows.length) {
    await db.insert(examResultsTable).values(resultRows);
  }
  t.push({ table: "exam_results", rows: resultRows.length, skipped: false });
}

// ── Timetable ─────────────────────────────────────────────────────────────────

async function seedTimetable(t: TableLog[]) {
  if (await hasRows(timetablePeriodsTable)) {
    t.push({ table: "timetable_periods", rows: 0, skipped: true });
    t.push({ table: "timetable_slots", rows: 0, skipped: true });
    t.push({ table: "teacher_subject_assignments", rows: 0, skipped: true });
    return;
  }

  const periodRows = await db.insert(timetablePeriodsTable).values([
    { name: "Assembly",  startTime: "07:45", endTime: "08:00", periodType: "assembly", active: true, sortOrder: 1 },
    { name: "Period 1",  startTime: "08:00", endTime: "08:45", periodType: "lecture",  active: true, sortOrder: 2 },
    { name: "Period 2",  startTime: "08:45", endTime: "09:30", periodType: "lecture",  active: true, sortOrder: 3 },
    { name: "Period 3",  startTime: "09:30", endTime: "10:15", periodType: "lecture",  active: true, sortOrder: 4 },
    { name: "Break",     startTime: "10:15", endTime: "10:45", periodType: "break",    active: true, sortOrder: 5 },
    { name: "Period 4",  startTime: "10:45", endTime: "11:30", periodType: "lecture",  active: true, sortOrder: 6 },
    { name: "Period 5",  startTime: "11:30", endTime: "12:15", periodType: "lecture",  active: true, sortOrder: 7 },
    { name: "Period 6",  startTime: "12:15", endTime: "13:00", periodType: "lecture",  active: true, sortOrder: 8 },
    { name: "Games",     startTime: "15:00", endTime: "16:00", periodType: "other",    active: true, sortOrder: 9 },
  ]).returning();
  t.push({ table: "timetable_periods", rows: periodRows.length, skipped: false });

  // Timetable for Class 9 × 5 weekdays × 6 lecture periods
  const subjectCycle = ["ENG-01","URD-01","MAT-01","PHY-01","CHE-01","CS-01"] as const;
  const teachers = ["Mr. Bilal Khan","Ms. Sadia Qureshi","Mr. Ahmed Raza","Ms. Nadia Hussain","Mr. Tariq Mahmood","Ms. Hira Baig"];
  const lecturePeriods = periodRows.filter(p => p.periodType === "lecture");
  const years = await db.select().from(academicYearsTable);
  const defaultYear = years.find(y => y.isDefault) ?? years[0];

  const slotRows: any[] = [];
  CLASS_CODES.forEach(classCode => {
    [1,2,3,4,5].forEach(day => {
      lecturePeriods.forEach((period, pi) => {
        const subIdx = (day + pi) % subjectCycle.length;
        slotRows.push({
          classCode, sectionName: "A",
          dayOfWeek:    day,
          periodId:     period.id,
          subjectCode:  subjectCycle[subIdx],
          subjectName:  ["English","Urdu","Mathematics","Physics","Chemistry","Computer Science"][subIdx],
          teacherName:  teachers[subIdx % teachers.length],
          academicYearId: defaultYear.id,
        });
      });
    });
  });
  await db.insert(timetableSlotsTable).values(slotRows);
  t.push({ table: "timetable_slots", rows: slotRows.length, skipped: false });

  // Teacher subject assignments
  const classes   = await db.select().from(classesTable);
  const subjects  = await db.select().from(subjectsTable);
  const employees = await db.select({ id: employeesTable.id, role: employeesTable.role }).from(employeesTable);
  const teacherEmpIds = employees.filter(e => e.role === "teacher").map(e => e.id);

  const assignRows = teacherEmpIds.flatMap((empId, ti) =>
    classes.slice(0, 3).map(cls => ({
      employeeId:     empId,
      classId:        cls.id,
      subjectId:      subjects[ti % subjects.length].id,
      periodsPerWeek: 6,
    }))
  );
  if (assignRows.length) {
    // Deduplicate (could violate unique constraint if same emp+class+subject)
    const seen = new Set<string>();
    const unique = assignRows.filter(r => {
      const key = `${r.employeeId}-${r.classId}-${r.subjectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await db.insert(teacherSubjectAssignmentsTable).values(unique);
    t.push({ table: "teacher_subject_assignments", rows: unique.length, skipped: false });
  } else {
    t.push({ table: "teacher_subject_assignments", rows: 0, skipped: false });
  }
}

// ── Sports ────────────────────────────────────────────────────────────────────

async function seedSports(t: TableLog[]) {
  if (await hasRows(sportsCategoriesTable)) {
    t.push({ table: "sports_categories", rows: 0, skipped: true });
    t.push({ table: "sports_venues", rows: 0, skipped: true });
    t.push({ table: "sports_teams", rows: 0, skipped: true });
    t.push({ table: "sports_fixtures", rows: 0, skipped: true });
    return;
  }

  const catRows = await db.insert(sportsCategoriesTable).values([
    { name: "Cricket",   active: true, sortOrder: 1 },
    { name: "Football",  active: true, sortOrder: 2 },
    { name: "Hockey",    active: true, sortOrder: 3 },
    { name: "Athletics", active: true, sortOrder: 4 },
    { name: "Badminton", active: true, sortOrder: 5 },
  ]).returning();
  t.push({ table: "sports_categories", rows: catRows.length, skipped: false });

  const venueRows = await db.insert(sportsVenuesTable).values([
    { name: "Main Ground",        venueType: "outdoor", capacity: 500,  description: "Main cricket and football ground", active: true, sortOrder: 1 },
    { name: "Hockey Pitch",       venueType: "outdoor", capacity: 300,  description: "AstroTurf hockey pitch",           active: true, sortOrder: 2 },
    { name: "Indoor Gymnasium",   venueType: "indoor",  capacity: 200,  description: "Badminton and indoor sports",      active: true, sortOrder: 3 },
    { name: "Athletics Track",    venueType: "outdoor", capacity: 1000, description: "400m running track",              active: true, sortOrder: 4 },
  ]).returning();
  t.push({ table: "sports_venues", rows: venueRows.length, skipped: false });

  const houses = ["Iqbal","Jinnah","Liaquat","Fatima"];
  const teamRows = await db.insert(sportsTeamsTable).values(
    catRows.slice(0,4).flatMap(cat =>
      houses.slice(0,2).map(house => ({
        name:             `${house} ${cat.name} Team`,
        sportCategoryId:  cat.id,
        house:            house,
        coachName:        pick(["Mr. Omar Shah","Mr. Zubair Ahmed"], catRows.indexOf(cat)),
        active:           true,
      }))
    )
  ).returning();
  t.push({ table: "sports_teams", rows: teamRows.length, skipped: false });

  const fixtureStatuses = ["completed","completed","completed","scheduled","scheduled"] as const;
  const fixtureRows: any[] = [];
  catRows.forEach((cat, ci) => {
    [0,1,2,3,4].forEach(fi => {
      const teamPair = teamRows.filter(t => t.sportCategoryId === cat.id);
      if (teamPair.length < 2) return;
      const status = fixtureStatuses[fi];
      const scheduled = fi < 3 ? dateBack(15 - fi * 4) : dateAhead(7 + fi * 3);
      fixtureRows.push({
        homeTeam:       teamPair[0].name,
        awayTeam:       teamPair[1].name,
        sport:          cat.name,
        venueId:        venueRows[ci % venueRows.length].id,
        scheduledDate:  scheduled,
        scheduledTime:  "14:00",
        status,
        homeScore:      status === "completed" ? 4 + (fi % 3) : null,
        awayScore:      status === "completed" ? 2 + (fi % 4) : null,
        result:         status === "completed" ? `${teamPair[0].name} won` : null,
      });
    });
  });
  if (fixtureRows.length) {
    await db.insert(sportsFixturesTable).values(fixtureRows);
  }
  t.push({ table: "sports_fixtures", rows: fixtureRows.length, skipped: false });
}

// ── Medical ───────────────────────────────────────────────────────────────────

async function seedMedical(t: TableLog[]) {
  if (await hasRows(medicalMedicineCategoriesTable)) {
    t.push({ table: "medical_medicine_categories", rows: 0, skipped: true });
    t.push({ table: "medical_medicines", rows: 0, skipped: true });
    t.push({ table: "medical_conditions", rows: 0, skipped: true });
    t.push({ table: "medical_visits", rows: 0, skipped: true });
    return;
  }

  const medCatRows = await db.insert(medicalMedicineCategoriesTable).values([
    { name: "Analgesics & Antipyretics", active: true, sortOrder: 1 },
    { name: "Antibiotics",               active: true, sortOrder: 2 },
    { name: "First Aid Supplies",        active: true, sortOrder: 3 },
    { name: "Vitamins & Supplements",    active: true, sortOrder: 4 },
  ]).returning();
  t.push({ table: "medical_medicine_categories", rows: medCatRows.length, skipped: false });

  const medRows = await db.insert(medicalMedicinesTable).values([
    { name: "Paracetamol 500mg",  categoryId: medCatRows[0].id, unit: "tablet",  active: true, sortOrder: 1 },
    { name: "Brufen 400mg",       categoryId: medCatRows[0].id, unit: "tablet",  active: true, sortOrder: 2 },
    { name: "Disprin",            categoryId: medCatRows[0].id, unit: "tablet",  active: true, sortOrder: 3 },
    { name: "Amoxicillin 250mg",  categoryId: medCatRows[1].id, unit: "capsule", active: true, sortOrder: 4 },
    { name: "Augmentin 625mg",    categoryId: medCatRows[1].id, unit: "tablet",  active: true, sortOrder: 5 },
    { name: "Ciprofloxacin 500mg",categoryId: medCatRows[1].id, unit: "tablet",  active: true, sortOrder: 6 },
    { name: "ORS Sachet",         categoryId: medCatRows[2].id, unit: "sachet",  active: true, sortOrder: 7 },
    { name: "Bandage Roll",       categoryId: medCatRows[2].id, unit: "piece",   active: true, sortOrder: 8 },
    { name: "Antiseptic Lotion",  categoryId: medCatRows[2].id, unit: "ml",      active: true, sortOrder: 9 },
    { name: "Plaster Strips",     categoryId: medCatRows[2].id, unit: "piece",   active: true, sortOrder: 10 },
    { name: "Vitamin C 500mg",    categoryId: medCatRows[3].id, unit: "tablet",  active: true, sortOrder: 11 },
    { name: "Zinc Supplement",    categoryId: medCatRows[3].id, unit: "tablet",  active: true, sortOrder: 12 },
    { name: "Multivitamin",       categoryId: medCatRows[3].id, unit: "tablet",  active: true, sortOrder: 13 },
  ]).returning();
  t.push({ table: "medical_medicines", rows: medRows.length, skipped: false });

  const condRows = await db.insert(medicalConditionsTable).values([
    { name: "Fever",               active: true, sortOrder: 1 },
    { name: "Headache",            active: true, sortOrder: 2 },
    { name: "Cold & Flu",          active: true, sortOrder: 3 },
    { name: "Gastroenteritis",     active: true, sortOrder: 4 },
    { name: "Minor Injury",        active: true, sortOrder: 5 },
    { name: "Eye Infection",       active: true, sortOrder: 6 },
    { name: "Skin Condition",      active: true, sortOrder: 7 },
    { name: "Allergy",             active: true, sortOrder: 8 },
  ]).returning();
  t.push({ table: "medical_conditions", rows: condRows.length, skipped: false });

  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode }).from(studentsTable);
  const visitStatuses = ["outpatient","outpatient","outpatient","admitted","outpatient","referred","outpatient","outpatient"] as const;

  const visitRows = Array.from({ length: 40 }, (_, i) => {
    const stu = students[i % students.length];
    const cond = condRows[i % condRows.length];
    return {
      studentId:      stu.id,
      studentName:    stu.fullName,
      applicantId:       stu.applicantId,
      classCode:      stu.classCode,
      visitDate:      dateBack(30 - (i % 29)),
      complaint:      cond.name,
      conditionId:    cond.id,
      diagnosis:      cond.name,
      treatmentGiven: pick(["Rest prescribed","Medication given","Dressing applied","Referred to hospital","Observation"], i),
      medicinesGiven: medRows[i % medRows.length].name,
      status:         visitStatuses[i % visitStatuses.length],
    };
  });
  await db.insert(medicalVisitsTable).values(visitRows);
  t.push({ table: "medical_visits", rows: visitRows.length, skipped: false });
}

// ── Gate ──────────────────────────────────────────────────────────────────────

async function seedGate(t: TableLog[]) {
  if (await hasRows(gateLogTable)) {
    t.push({ table: "gate_log", rows: 0, skipped: true });
    t.push({ table: "gate_outpass", rows: 0, skipped: true });
    return;
  }

  const personTypes = ["visitor","visitor","visitor","staff","delivery","visitor"] as const;
  const purposes = ["Meeting with Principal","Parent visit","Delivery","Staff entry","Maintenance work","Official visit"];
  const gateRows = Array.from({ length: 50 }, (_, i) => ({
    personName: `${pick(MALE_FIRST, i + 30)} ${pick(LAST_NAMES, i + 15)}`,
    personType:  personTypes[i % personTypes.length],
    purpose:     purposes[i % purposes.length],
    vehicleNo:   i % 3 === 0 ? `RWP-${pad(1000 + i * 13, 4)}` : null,
    phone:       `031${pad(i + 500, 8)}`,
    inTime:      `${dateBack(14 - (i % 14))} ${pad(9 + (i % 8), 2)}:${i % 2 === 0 ? "00" : "30"}`,
    outTime:     i % 5 === 0 ? null : `${dateBack(14 - (i % 14))} ${pad(12 + (i % 5), 2)}:${i % 2 === 0 ? "30" : "00"}`,
    gatePassNo:  `GP-${dateBack(14 - (i % 14))}-${pad(i + 1, 3)}`,
  }));
  await db.insert(gateLogTable).values(gateRows);
  t.push({ table: "gate_log", rows: gateRows.length, skipped: false });

  const students = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName, applicantId: studentsTable.applicantId, classCode: studentsTable.classCode }).from(studentsTable);
  const outpassStatuses = ["used","used","active","expired","cancelled"] as const;
  const outpassRows = Array.from({ length: 20 }, (_, i) => {
    const stu = students[i * 5 % students.length];
    const fromDt = i < 10 ? dateBack(10 - i) : dateAhead(i - 9);
    return {
      studentName: stu.fullName,
      applicantId:    stu.applicantId,
      classCode:   stu.classCode,
      purpose:     pick(["Weekend leave","Medical appointment","Family emergency","Tournament participation","College event"], i),
      destination: pick(CITIES, i),
      validFrom:   `${fromDt} 14:00`,
      validUntil:  `${dateAhead(i < 10 ? 0 : i - 8)} 20:00`,
      approvedBy:  pick(["Vice Principal","Head of House","Commandant"], i),
      passNumber:  `OP-${pad(i + 1, 4)}`,
      status:      outpassStatuses[i % outpassStatuses.length],
    };
  });
  await db.insert(gateOutpassTable).values(outpassRows);
  t.push({ table: "gate_outpass", rows: outpassRows.length, skipped: false });
}

// ── Syllabus ──────────────────────────────────────────────────────────────────

async function seedSyllabus(t: TableLog[]) {
  if (await hasRows(syllabusUnitsTable)) {
    t.push({ table: "syllabus_units", rows: 0, skipped: true });
    t.push({ table: "syllabus_topics", rows: 0, skipped: true });
    return;
  }

  const unitData = [
    ["class-9","MAT-01","Chapter 1: Matrices & Determinants","Matrix types, operations and determinant calculation"],
    ["class-9","MAT-01","Chapter 2: Real & Complex Numbers","Number systems, real number line, complex number arithmetic"],
    ["class-9","MAT-01","Chapter 3: Logarithms","Laws of logarithms, common and natural logs, applications"],
    ["class-9","MAT-01","Chapter 4: Algebraic Expressions","Polynomials, factoring, algebraic fractions"],
    ["class-9","MAT-01","Chapter 5: Linear Equations","Systems of equations, graphical solutions, word problems"],
    ["class-9","PHY-01","Chapter 1: Physical Quantities & Measurement","SI units, scalars and vectors, significant figures"],
    ["class-9","PHY-01","Chapter 2: Kinematics","Motion, velocity, acceleration and equations of motion"],
    ["class-9","PHY-01","Chapter 3: Dynamics","Newton's laws, friction, circular motion"],
    ["class-10","MAT-01","Chapter 1: Quadratic Equations","Roots, discriminant, quadratic formula"],
    ["class-10","MAT-01","Chapter 2: Theory of Quadratic Equations","Relations between roots and coefficients"],
  ];

  const unitRows = await db.insert(syllabusUnitsTable).values(
    unitData.map(([classCode, subjectCode, title, description], i) => ({
      classCode, subjectCode, title, description, active: true, sortOrder: i + 1,
    }))
  ).returning();
  t.push({ table: "syllabus_units", rows: unitRows.length, skipped: false });

  const topicData: any[] = unitRows.flatMap((unit, ui) => {
    const topics = [
      `${unit.title} – Introduction and overview`,
      `${unit.title} – Core concepts and worked examples`,
      `${unit.title} – Practice exercises and applications`,
    ];
    return topics.map((title, ti) => ({
      unitId: unit.id, title, active: true, sortOrder: ti + 1,
    }));
  });
  await db.insert(syllabusTopicsTable).values(topicData);
  t.push({ table: "syllabus_topics", rows: topicData.length, skipped: false });
}

// ── Communication & Events ────────────────────────────────────────────────────

async function seedCommunication(t: TableLog[]) {
  if (await hasRows(eventsTable)) {
    t.push({ table: "events", rows: 0, skipped: true });
    t.push({ table: "announcements", rows: 0, skipped: true });
    t.push({ table: "noticeboard_items", rows: 0, skipped: true });
    return;
  }

  await db.insert(eventsTable).values([
    { title: "Annual Sports Day 2026",       description: "Inter-house sports competition featuring cricket, football, hockey and athletics.", eventType: "sports",    startDate: dateAhead(30), startTime: "09:00", endDate: dateAhead(31), venue: "Main Ground & Athletics Track",    organizer: "Sports Department",      targetAudience: "all",     status: "published", isPublic: true },
    { title: "Parents & Teachers Meeting",   description: "Mid-year progress review with parents of all cadets.",                            eventType: "meeting",   startDate: dateAhead(14), startTime: "10:00", endDate: dateAhead(14), venue: "College Auditorium",               organizer: "Academic Department",    targetAudience: "parents", status: "published", isPublic: false },
    { title: "Independence Day Celebration", description: "National Day celebration with flag ceremony, speeches and cultural programme.",    eventType: "ceremony",  startDate: "2026-08-14",  startTime: "08:00", endDate: "2026-08-14",  venue: "College Ground",                   organizer: "Administration",         targetAudience: "all",     status: "published", isPublic: true },
    { title: "Final Term Examinations",      description: "Annual final term examinations for all classes (Class 7 to Class 12).",           eventType: "academic",  startDate: dateAhead(42), startTime: "08:30", endDate: dateAhead(56), venue: "Examination Halls",                organizer: "Academic Department",    targetAudience: "cadets",  status: "published", isPublic: false },
    { title: "Academic Award Ceremony",      description: "Annual prize giving for academic excellence, sports and co-curricular activities.", eventType: "ceremony", startDate: dateAhead(70), startTime: "10:00", endDate: dateAhead(70), venue: "College Auditorium",               organizer: "Principal",              targetAudience: "all",     status: "published", isPublic: true },
    { title: "Eid Milad-un-Nabi ﷺ",         description: "College-wide gathering to celebrate the birth of the Prophet ﷺ.",               eventType: "cultural",  startDate: dateAhead(5),  startTime: "10:00", endDate: dateAhead(5),  venue: "College Mosque & Grounds",        organizer: "College Administration", targetAudience: "all",     status: "published", isPublic: true },
    { title: "Faculty Development Day",      description: "Professional development workshop for all teaching and administrative staff.",    eventType: "meeting",   startDate: dateAhead(21), startTime: "09:00", endDate: dateAhead(21), venue: "Conference Room",                  organizer: "Academic Director",      targetAudience: "staff",   status: "published", isPublic: false },
    { title: "College Founding Day",         description: "Annual celebration of the college's founding anniversary.",                      eventType: "ceremony",  startDate: dateAhead(90), startTime: "09:00", endDate: dateAhead(90), venue: "College Grounds",                  organizer: "Principal",              targetAudience: "all",     status: "draft",     isPublic: false },
  ]);
  t.push({ table: "events", rows: 8, skipped: false });

  await db.insert(announcementsTable).values([
    { title: "Final Term Examination Schedule Released", body: "The final term examination schedule for Session 2025-2026 has been released. All cadets are advised to check the timetable and begin preparation accordingly. Study leave will commence from " + dateAhead(35) + ".", targetAudience: "cadets", priority: "normal", publishedAt: dateBack(2), createdBy: "Academic Department", active: true },
    { title: "Fee Submission Deadline – March 2026",     body: "This is a reminder that the fee submission deadline for March 2026 is " + dateAhead(10) + ". Cadets with outstanding dues are requested to clear their accounts immediately to avoid late fee charges.", targetAudience: "all", priority: "urgent", publishedAt: dateBack(5), createdBy: "Finance Department", active: true },
    { title: "Inter-House Sports Competition",           body: "The Annual Sports Day will be held on " + dateAhead(30) + " and " + dateAhead(31) + ". All house captains are requested to submit their team lists to the Sports Department by " + dateAhead(20) + ".", targetAudience: "cadets", priority: "normal", publishedAt: dateBack(3), createdBy: "Sports Department", active: true },
    { title: "New Admission Session 2026-2027 Open",     body: "Applications for the new admission session 2026-2027 are now open. Eligible candidates from Class 7 to Class 11 may apply online at the college website. Last date for applications is " + dateAhead(45) + ".", targetAudience: "all", priority: "normal", publishedAt: dateBack(7), createdBy: "Admissions Office", active: true },
    { title: "Public Holiday – Eid Milad-un-Nabi ﷺ",    body: "The college will remain closed on " + dateAhead(5) + " in observance of Eid Milad-un-Nabi ﷺ. Hostel cadets will have a special programme arranged by the college.", targetAudience: "all", priority: "normal", publishedAt: dateBack(1), createdBy: "Principal", active: true },
  ]);
  t.push({ table: "announcements", rows: 5, skipped: false });

  await db.insert(noticeboardItemsTable).values([
    { title: "Library Book Return Notice",         content: "All issued books must be returned to the library by " + dateAhead(7) + ". Cadets with overdue books will be fined Rs. 50 per day.", category: "academic",   publishedAt: dateBack(3), active: true },
    { title: "Hostel Curfew Reminder",             content: "All hostel cadets are reminded that lights-out time is 10:30 PM on weekdays and 11:00 PM on weekends. Compliance is mandatory.",  category: "general",    publishedAt: dateBack(1), active: true },
    { title: "Cricket Team Selection Trials",      content: "Trials for the college cricket team will be held on " + dateAhead(5) + " at the Main Ground at 3:00 PM. All interested cadets should report to the Sports Teacher.", category: "sports",     publishedAt: dateBack(2), active: true },
    { title: "Science Exhibition Participation",   content: "The college will be participating in the National Science Exhibition. Interested cadets should submit project proposals to the Physics department by " + dateAhead(14) + ".", category: "academic",   publishedAt: dateBack(4), active: true },
    { title: "Lost & Found",                       content: "A wristwatch and a set of keys have been found near the dining hall. Please contact the Admin Office to claim your belongings.", category: "general",    publishedAt: dateBack(1), active: true },
  ]);
  t.push({ table: "noticeboard_items", rows: 5, skipped: false });
}

// ═════════════════════════════════════════════════════════════════════════════
// CLEAR ALL DATA
// ═════════════════════════════════════════════════════════════════════════════

export async function clearAllData(): Promise<void> {
  // Delete in strict FK-safe order (children before parents, restrict-FK first)
  await db.delete(examResultsTable);
  await db.delete(examGradeBandsTable);
  await db.delete(examSchedulesTable);
  await db.delete(studentDisciplinaryTable);
  await db.delete(studentAttendanceTable);
  await db.delete(feeChallansTable);
  await db.delete(libraryIssuesTable);
  await db.delete(libraryBooksTable);
  await db.delete(storeTransactionsTable);
  await db.delete(storeItemsTable);
  await db.delete(hostelAllocationsTable);
  await db.delete(hostelRoomsTable);
  await db.delete(hostelBlocksTable);
  await db.delete(hostelRoomTypesTable);
  await db.delete(transportTripsTable);
  await db.delete(transportDriversTable);
  await db.delete(transportRoutesTable);
  await db.delete(transportVehiclesTable);
  await db.delete(sportsFixturesTable);
  await db.delete(sportsTeamsTable);
  await db.delete(sportsVenuesTable);
  await db.delete(sportsCategoriesTable);
  await db.delete(medicalVisitsTable);
  await db.delete(medicalMedicinesTable);
  await db.delete(medicalMedicineCategoriesTable);
  await db.delete(medicalConditionsTable);
  await db.delete(gateOutpassTable);
  await db.delete(gateLogTable);
  await db.delete(noticeboardItemsTable);
  await db.delete(announcementsTable);
  await db.delete(eventsTable);
  await db.delete(syllabusTopicsTable);
  await db.delete(syllabusUnitsTable);
  await db.delete(timetableSlotsTable);
  await db.delete(timetablePeriodsTable);
  await db.delete(teacherSubjectAssignmentsTable);
  await db.delete(sectionAllocationsTable);
  await db.delete(applicationEventsTable);
  await db.delete(applicationsTable);
  await db.delete(studentsTable);
  await db.delete(guardiansTable);
  await db.delete(employeeSalaryTemplateItemsTable);
  await db.delete(employeeSalaryTemplatesTable);
  await db.delete(employeeSalaryTransactionsTable);
  await db.delete(hrAttendanceTable);
  await db.delete(hrLeaveRequestsTable);
  await db.delete(employeeBankAccountsTable);
  await db.delete(employeesTable);
  await db.delete(hrDesignationsTable);
  await db.delete(hrDepartmentsTable);
  await db.delete(hrSalaryGradesTable);
  await db.delete(hrIncentiveTypesTable);
  await db.delete(hrDeductionTypesTable);
  await db.delete(feeScheduleTable);
  await db.delete(feeTypesTable);
  await db.delete(bankAccountsTable);
  await db.delete(vendorsTable);
  await db.delete(chartOfAccountsTable);
  await db.delete(classAcademicYearsTable);
  await db.delete(classSectionsTable);
  await db.delete(classSubjectsTable);
  await db.delete(meritConfigTable);
  await db.delete(sectionsTable);
  await db.delete(housesTable);
  await db.delete(subjectsTable);
  await db.delete(classesTable);
  await db.delete(classCategoriesTable);
  await db.delete(academicTermsTable);
  await db.delete(affiliationsTable);
  await db.delete(termsConditionsTable);
  await db.delete(academicYearsTable);
  await db.delete(testCentresTable);
  await db.delete(libraryPublishersTable);
  await db.delete(libraryCategoriesTable);
  await db.delete(storeUnitsTable);
  await db.delete(storeItemCategoriesTable);
  await db.delete(examGradingScalesTable);
  await db.delete(examTypesTable);
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC SEED ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

export async function seedDummyData(): Promise<SeedResult> {
  const tables: TableLog[] = [];

  await seedAcademic(tables);
  await seedTestCentres(tables);
  await seedHR(tables);
  const admittedIds = await seedApplications(tables);
  const studentIds  = await seedStudents(tables, admittedIds);
  await seedFinance(tables, studentIds);
  await seedHostel(tables, studentIds);
  await seedTransport(tables);
  await seedLibrary(tables);
  await seedStore(tables);
  await seedExams(tables);
  await seedTimetable(tables);
  await seedSports(tables);
  await seedMedical(tables);
  await seedGate(tables);
  await seedSyllabus(tables);
  await seedCommunication(tables);

  const totalRows    = tables.reduce((s, t) => s + t.rows, 0);
  const totalSkipped = tables.filter(t => t.skipped).length;

  return { tables, totalRows, totalSkipped };
}
