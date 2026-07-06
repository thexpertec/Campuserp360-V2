/**
 * Canonical module registry — single source of truth for all functional
 * modules available on the platform. Module keys are stored in the
 * tenant_module_permissions table and referenced by the CCM admin nav.
 */

export type ModuleConfigField = {
  key: string;
  label: string;
  type: "number";
  default: number;
  min?: number;
  max?: number;
};

export type ModuleDefinition = {
  key: string;
  label: string;
  description: string;
  configFields?: ModuleConfigField[];
};

export const MODULES: ModuleDefinition[] = [
  {
    key: "admissions",
    label: "Admissions",
    description: "Application intake, entry test scheduling, merit list, and enrollment.",
    configFields: [
      { key: "max_applications", label: "Max Applications per Session", type: "number", default: 5000, min: 0 },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    description: "Academic setup, section allocation, houses, and affiliations.",
    configFields: [
      { key: "max_students", label: "Max Active Students", type: "number", default: 2000, min: 0 },
    ],
  },
  {
    key: "timetable",
    label: "Timetable",
    description: "Class timetable, period setup, class subjects, and teacher load management.",
  },
  {
    key: "exams",
    label: "Exams & Results",
    description: "Examination scheduling, results entry, and report cards.",
  },
  {
    key: "syllabus",
    label: "Syllabus",
    description: "Lesson plans, syllabus tracking, and curriculum setup.",
  },
  {
    key: "fees",
    label: "Fees & Finance",
    description: "Fee master, fee challans, accounts, and vendor management.",
  },
  {
    key: "finance",
    label: "Finance / COA",
    description: "Chart of accounts, journal entries, and financial reporting.",
  },
  {
    key: "hr",
    label: "HRM & Payroll",
    description: "Staff directory, HR records, payroll processing, and leave management.",
    configFields: [
      { key: "max_employees", label: "Max Active Employees", type: "number", default: 500, min: 0 },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Payroll runs, salary slips, and allowance/deduction configuration.",
  },
  {
    key: "hostel",
    label: "Hostel",
    description: "Dormitory management, bed allocation, mess/dining, and visitor log.",
  },
  {
    key: "inventory",
    label: "Inventory & Store",
    description: "Item catalog, stock movements, and store management.",
  },
  {
    key: "website",
    label: "Website CMS",
    description: "Public website content management, pages, gallery, and media.",
  },
  {
    key: "batch_print",
    label: "Printing",
    description: "Bulk document printing — admit cards, certificates, ID cards, and custom templates.",
  },
  {
    key: "media_library",
    label: "Media Library",
    description: "Image and file uploads, media management, and shared asset library.",
  },
  {
    key: "communication",
    label: "Communication",
    description: "Announcements, notice board, SMS alerts, email broadcasts, and parent messaging.",
  },
  {
    key: "transport",
    label: "Transport",
    description: "Fleet management, trip scheduling, driver records, and route setup.",
  },
  {
    key: "library",
    label: "Library",
    description: "Book catalog, issue & return tracking, fines, and library setup.",
  },
  {
    key: "health",
    label: "Sick Bay",
    description: "Patient records, sick bay log, medications, and medical setup.",
  },
  {
    key: "sports",
    label: "Sports",
    description: "Teams & squads, fixtures, co-curricular activities, and sports setup.",
  },
  {
    key: "gate_security",
    label: "Gate Security",
    description: "Entry/exit log, cadet out-pass, visitor management, and staff gate passes.",
  },
  {
    key: "events",
    label: "Events",
    description: "School events calendar, bulk event entry, and event management.",
  },
  {
    key: "approvals",
    label: "Approvals",
    description: "Maker-checker workflow inbox for journal entries, fees, payroll, and exam results.",
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key) as string[];

/** Look up a module definition by key. Returns undefined if not found. */
export function getModule(key: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.key === key);
}
