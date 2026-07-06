import {
  Banknote, Award, ClipboardList, FileCheck, FileText, CreditCard, BookOpen,
  GraduationCap, Briefcase, Users,
} from "lucide-react";
import { displayPhone, displayCnic } from "@/lib/format";
import type { ElementType } from "react";

export type DocTypeId =
  | "salary-slip" | "certificate"
  | "dmc" | "report-card" | "admit-card" | "offer-letter" | "offer-letter-applicant" | "offer-letter-student" | "offer-letter-student-ix-xi" | "id-card";

/** Fixed list of situations a template can be assigned to. Labels here are the
 *  single source of truth for both the assignment dropdown and badge display. */
export const TEMPLATE_PURPOSES = [
  { slug: "admit-card-entry-test",   label: "Admit Card" },
  { slug: "offer-letter-applicants", label: "Offer Letter (Student)" },
  { slug: "salary-slip",             label: "Salary Slip" },
  { slug: "offer-letter-hr",         label: "Offer Letter (Employee)" },
  { slug: "certificate",             label: "Certificate" },
  { slug: "report-card",             label: "Report Card" },
  { slug: "dmc",                     label: "DMC" },
  { slug: "id-card",                 label: "Student ID Card" },
] as const;

export type TemplatePurposeSlug = typeof TEMPLATE_PURPOSES[number]["slug"];

/** Condensed labels for purpose badge display — kept identical to TEMPLATE_PURPOSES labels. */
export const PURPOSE_BADGE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_PURPOSES.map(p => [p.slug, p.label]),
);

/** Maps built-in doc type IDs to the purpose slug they naturally cover. */
export const PURPOSE_BY_DOC_TYPE: Partial<Record<DocTypeId, string>> = {
  "salary-slip":            "salary-slip",
  "certificate":            "certificate",
  "dmc":                    "dmc",
  "report-card":            "report-card",
  "id-card":                "id-card",
  "offer-letter":           "offer-letter-hr",
  "admit-card":             "admit-card-entry-test",
  "offer-letter-applicant": "offer-letter-applicants",
};

export type TagEntry  = { tag: string; label: string; sampleValue?: string };
export type TagGroup  = { group: string; tags: TagEntry[] };

export type GenerateTimeField = {
  key:          string;
  label:        string;
  type:         "date" | "text" | "test-schedule-picker" | "exam-picker";
  defaultToday?: boolean;
  placeholder?: string;
};

/** Build a key→sampleValue map for every tag in a doc type (falls back to the tag key). */
export function buildSampleValues(dt: AnyDocTypeDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const grp of dt.tagGroups) {
    for (const t of grp.tags) {
      const key = t.tag.slice(2, -2);
      out[key] = t.sampleValue ?? key;
    }
  }
  return out;
}

export type DocTypeDef = {
  id:          DocTypeId;
  label:       string;
  icon:        ElementType;
  color:       string;
  lightBg:     string;
  /** Audience tab this doc type belongs to. */
  audience:    "applicants" | "students" | "employee";
  tagGroups:   TagGroup[];
  defaultContent: string;
  /** If true, this doc type belongs to HR flows and is hidden from the unified student batch selector. */
  hrOnly?:     boolean;
  /** Where the row data comes from: enrolled students (default) or applicants table. */
  dataSource?: "students" | "applicants";
  /** Fields shown at generate time — one compact row per field. Everything else (school name,
   *  session, amounts, etc.) belongs in the template HTML, not here. */
  generateTimeFields?: GenerateTimeField[];
  /** Present on student-facing doc types. Maps template tag keys to student DB fields.
   *  Returns key→value pairs that are auto-filled from the roster. */
  studentFieldMap?: (
    student: any,
    sectionMap: Record<string, string>,
    classMap: Record<string, string>,
  ) => Record<string, string>;
};

// ── Custom (admin-created) template definitions ────────────────────────────────

export type TemplateCategory = "student" | "employee" | "applicant";

/** An admin-created template. Carries a runtime slug id and a fixed tag palette
 *  determined by its category, rather than the per-doc-type groups above. */
export type CustomDocTypeDef = {
  id:          string;
  label:       string;
  icon:        ElementType;
  color:       string;
  lightBg:     string;
  audience:    "students" | "employee" | "applicants";
  category:    TemplateCategory;
  isCustom:    true;
  tagGroups:   TagGroup[];
  defaultContent: string;
  /** Situation slug this template is assigned to, or null. */
  purpose:     string | null;
};

export type AnyDocTypeDef = DocTypeDef | CustomDocTypeDef;

export function isCustomDocType(dt: AnyDocTypeDef): dt is CustomDocTypeDef {
  return (dt as CustomDocTypeDef).isCustom === true;
}

/** Blank starter shown when a custom template is first created or reset. */
export const CUSTOM_STARTER_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px;border:1px solid #e5e7eb">
  <div style="text-align:center;border-bottom:2px solid #064A1A;padding-bottom:12px;margin-bottom:20px">
    <div class="ccm-institute-name" style="font-size:20px;font-weight:bold;color:#064A1A">{{school_name}}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;letter-spacing:0.05em;text-transform:uppercase">Document</div>
  </div>
  <p style="font-size:13px;line-height:1.8;color:#374151">
    Start designing your template here. Open <b>Settings &amp; Tags</b> to insert placeholder fields.
  </p>
  <div style="margin-top:48px;font-size:13px">
    <div>____________________</div>
    <div style="margin-top:4px">Principal / Commandant</div>
    <div class="ccm-institute-name" style="color:#6b7280">{{school_name}}</div>
  </div>
</div>`;

/** Tag palette available to custom Student templates. */
export const STUDENT_TAGS: TagGroup[] = [
  { group: "Student", tags: [
    { tag: "{{register_id}}",   label: "Applicant ID",   sampleValue: "CCM-2025-0042" },
    { tag: "{{student_name}}",  label: "Name",          sampleValue: "Ali Hassan Khan" },
    { tag: "{{father_name}}",   label: "Father's Name", sampleValue: "Hassan Khan" },
    { tag: "{{class}}",         label: "Class/Program",         sampleValue: "9th Grade" },
    { tag: "{{section}}",       label: "Section",       sampleValue: "A" },
    { tag: "{{date_of_birth}}", label: "Date of Birth", sampleValue: "12 Apr 2010" },
    { tag: "{{applicant_id}}",     label: "Applicant ID",   sampleValue: "CCM-2025-0042" },
    { tag: "{{roll_no}}",       label: "Roll No.",      sampleValue: "042" },
    { tag: "{{blood_group}}",   label: "Blood Group",   sampleValue: "B+" },
    { tag: "{{house}}",         label: "House",         sampleValue: "Iqbal House" },
    { tag: "{{student_photo}}", label: "Photo (img tag)", sampleValue: "" },
  ]},
  { group: "Admission & Dates", tags: [
    { tag: "{{date_of_enrolment}}", label: "Date of Enrolment", sampleValue: "01 Sep 2024" },
    { tag: "{{session}}",           label: "Session",           sampleValue: "2024-2025" },
    { tag: "{{school_name}}",       label: "School Name",       sampleValue: "Cadet College Murree" },
    { tag: "{{test_center_name}}",  label: "Test Center / Venue", sampleValue: "Army Public School" },
    { tag: "{{issue_date}}",        label: "Issue Date",        sampleValue: "15 Jun 2025" },
  ]},
  { group: "Contact", tags: [
    { tag: "{{phone}}",   label: "Phone",   sampleValue: "0321-5551234" },
    { tag: "{{email}}",   label: "Email",   sampleValue: "guardian@example.com" },
    { tag: "{{city}}",    label: "City",    sampleValue: "Rawalpindi" },
    { tag: "{{address}}", label: "Address", sampleValue: "House 12, Street 4, Rawalpindi" },
  ]},
];

/** Tag palette available to custom Applicant templates. */
export const APPLICANT_TAGS: TagGroup[] = [
  { group: "Applicant", tags: [
    { tag: "{{applicant_id}}",     label: "Applicant ID",       sampleValue: "APP-2025-0188" },
    { tag: "{{student_name}}",     label: "Name",               sampleValue: "Bilal Ahmed" },
    { tag: "{{father_name}}",      label: "Father's Name",      sampleValue: "Ahmed Khan" },
    { tag: "{{date_of_birth}}",    label: "Date of Birth",      sampleValue: "05 Mar 2012" },
    { tag: "{{class}}",            label: "Class/Program Applied For",  sampleValue: "8th Grade" },
    { tag: "{{student_photo}}",    label: "Photo (img tag)",    sampleValue: "" },
    { tag: "{{serial_no}}",        label: "Serial / Roll No.",  sampleValue: "188" },
  ]},
  { group: "Entry Test", tags: [
    { tag: "{{exam_date}}",                   label: "Test Date",            sampleValue: "15 Feb 2026" },
    { tag: "{{test_city}}",                   label: "Test City",            sampleValue: "Rawalpindi" },
    { tag: "{{test_center_name}}",            label: "Test Center / Venue",  sampleValue: "Army Public School" },
    { tag: "{{test_center_address}}",         label: "Center Address",       sampleValue: "Rawalpindi Cantt" },
    { tag: "{{test_focal_person_phone_number}}", label: "Center Contact",    sampleValue: "051-5551234" },
  ]},
  { group: "Contact", tags: [
    { tag: "{{phone}}",           label: "Phone",               sampleValue: "0321-5551234" },
    { tag: "{{email}}",           label: "Email",               sampleValue: "guardian@example.com" },
    { tag: "{{city}}",            label: "City",                sampleValue: "Rawalpindi" },
    { tag: "{{present_address}}", label: "Address",             sampleValue: "House 12, Street 4, Rawalpindi" },
  ]},
];

/** Tag palette available to custom Employee templates. */
export const EMPLOYEE_TAGS: TagGroup[] = [
  { group: "Employee", tags: [
    { tag: "{{employee_id}}",      label: "Employee ID",     sampleValue: "EMP-0034" },
    { tag: "{{employee_name}}",    label: "Name",            sampleValue: "Muhammad Tariq" },
    { tag: "{{cnic}}",             label: "CNIC",            sampleValue: "37405-1234567-9" },
    { tag: "{{designation}}",      label: "Designation",     sampleValue: "Senior Teacher" },
    { tag: "{{department}}",       label: "Department",      sampleValue: "Science" },
    { tag: "{{joining_date}}",     label: "Joining Date",    sampleValue: "01 Jul 2020" },
    { tag: "{{contract_period}}",  label: "Contract Period", sampleValue: "One Year (Extendable)" },
    { tag: "{{employee_photo}}",   label: "Photo (img tag)", sampleValue: "" },
  ]},
  { group: "Contact", tags: [
    { tag: "{{phone}}", label: "Phone", sampleValue: "0321-5551234" },
    { tag: "{{email}}", label: "Email", sampleValue: "tariq@example.com" },
  ]},
  { group: "Earnings", tags: [
    { tag: "{{basic_salary}}",      label: "Basic Salary",      sampleValue: "45,000" },
    { tag: "{{house_allowance}}",   label: "House Allowance",   sampleValue: "9,000" },
    { tag: "{{medical_allowance}}", label: "Medical Allowance", sampleValue: "4,500" },
    { tag: "{{other_allowances}}",  label: "Other Allowances",  sampleValue: "2,000" },
    { tag: "{{gross_salary}}",      label: "Gross Salary",      sampleValue: "60,500" },
  ]},
  { group: "Deductions", tags: [
    { tag: "{{income_tax}}",       label: "Income Tax",       sampleValue: "2,500" },
    { tag: "{{provident_fund}}",   label: "Provident Fund",   sampleValue: "2,250" },
    { tag: "{{other_deductions}}", label: "Other Deductions", sampleValue: "0" },
    { tag: "{{total_deductions}}", label: "Total Deductions", sampleValue: "4,750" },
    { tag: "{{net_salary}}",       label: "Net Salary",       sampleValue: "55,750" },
  ]},
  { group: "Dates", tags: [
    { tag: "{{month_year}}", label: "Month & Year", sampleValue: "June 2025" },
    { tag: "{{pay_date}}",   label: "Pay Date",     sampleValue: "30 Jun 2025" },
    { tag: "{{issue_date}}", label: "Issue Date",   sampleValue: "15 Jun 2025" },
  ]},
];

/** Build a CustomDocTypeDef from a persisted print_templates row. */
export function customDefFromRow(row: { type: string; name: string; category?: string | null; purpose?: string | null }): CustomDocTypeDef {
  const category: TemplateCategory =
    row.category === "employee"  ? "employee"  :
    row.category === "applicant" ? "applicant" : "student";
  const isEmployee  = category === "employee";
  const isApplicant = category === "applicant";
  return {
    id:       row.type,
    label:    row.name,
    icon:     isEmployee ? Briefcase : isApplicant ? Users : GraduationCap,
    color:    isEmployee ? "#9333ea" : isApplicant ? "#0284c7" : "#0d9488",
    lightBg:  isEmployee
      ? "bg-purple-50 border-purple-200 text-purple-700"
      : isApplicant
        ? "bg-sky-50 border-sky-200 text-sky-700"
        : "bg-teal-50 border-teal-200 text-teal-700",
    audience: isEmployee ? "employee" : isApplicant ? "applicants" : "students",
    category,
    isCustom: true,
    tagGroups: isEmployee ? EMPLOYEE_TAGS : isApplicant ? APPLICANT_TAGS : STUDENT_TAGS,
    defaultContent: CUSTOM_STARTER_HTML,
    purpose:  row.purpose ?? null,
  };
}

// ── Default HTML templates ─────────────────────────────────────────────────────

const SALARY_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;border:1px solid #e5e7eb">
  <div style="text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:12px;margin-bottom:16px">
    <div class="ccm-institute-name" style="font-size:20px;font-weight:bold;color:#1d4ed8">{{school_name}}</div>
    <div style="font-size:14px;font-weight:600;margin-top:4px">SALARY SLIP &mdash; {{month_year}}</div>
  </div>
  <table width="100%" style="font-size:13px;line-height:2;margin-bottom:16px">
    <tr><td width="50%"><b>Employee:</b> {{employee_name}}</td><td><b>Designation:</b> {{designation}}</td></tr>
    <tr><td><b>Employee ID:</b> {{employee_id}}</td><td><b>Department:</b> {{department}}</td></tr>
    <tr><td><b>CNIC:</b> {{cnic}}</td><td><b>Pay Date:</b> {{pay_date}}</td></tr>
  </table>
  <table width="100%" style="border-collapse:collapse;font-size:13px">
    <tr style="background:#eff6ff"><th style="padding:8px;border:1px solid #bfdbfe;text-align:left;width:50%">Earnings</th><th style="padding:8px;border:1px solid #bfdbfe;text-align:left;width:50%">Deductions</th></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Basic Salary: <b>{{basic_salary}}</b></td><td style="padding:6px 8px;border:1px solid #e5e7eb">Income Tax: <b>{{income_tax}}</b></td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">House Allowance: <b>{{house_allowance}}</b></td><td style="padding:6px 8px;border:1px solid #e5e7eb">Provident Fund: <b>{{provident_fund}}</b></td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Medical Allowance: <b>{{medical_allowance}}</b></td><td style="padding:6px 8px;border:1px solid #e5e7eb">Other Deductions: <b>{{other_deductions}}</b></td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">Other Allowances: <b>{{other_allowances}}</b></td><td style="padding:6px 8px;border:1px solid #e5e7eb">Total Deductions: <b>{{total_deductions}}</b></td></tr>
    <tr style="background:#eff6ff;font-weight:bold"><td style="padding:8px;border:2px solid #1d4ed8">Gross Salary: {{gross_salary}}</td><td style="padding:8px;border:2px solid #1d4ed8;color:#1d4ed8;font-size:14px">Net Salary: {{net_salary}}</td></tr>
  </table>
</div>`;

const CERT_HTML = `<div style="font-family:Georgia,serif;text-align:center;padding:40px;max-width:680px;margin:0 auto;border:4px double #d97706">
  <div class="ccm-institute-name" style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#92400e;margin-bottom:8px">{{school_name}}</div>
  <div style="font-size:28px;font-weight:bold;color:#d97706;margin:12px 0">Certificate of Achievement</div>
  <div style="width:60px;height:3px;background:#d97706;margin:0 auto 24px"></div>
  <p style="font-size:14px;color:#374151;margin:0 0 12px">This is to certify that</p>
  <div style="font-size:26px;font-weight:bold;color:#111827;margin:8px 0">{{cadet_name}}</div>
  <p style="font-size:13px;color:#374151;margin:8px 0">Son/Daughter of <b>{{father_name}}</b>, Class <b>{{class_name}}</b>, Roll No. <b>{{roll_number}}</b></p>
  <p style="font-size:13px;color:#374151;margin:16px 0">has demonstrated outstanding excellence in the academic year <b>{{academic_year}}</b>.</p>
  <p style="font-size:14px;font-weight:600;margin:16px 0">Awarded <b>{{award_type}}</b> &mdash; Position <b>{{position}}</b> with <b>{{percentage}}</b>%</p>
  <div style="margin-top:48px;display:flex;justify-content:space-between;font-size:12px;color:#6b7280">
    <div>Date: {{issue_date}}</div>
    <div>____________________<br/>Principal</div>
  </div>
</div>`;

const DMC_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;border:2px solid #7c3aed">
  <div style="text-align:center;border-bottom:2px solid #7c3aed;padding-bottom:10px;margin-bottom:14px">
    <div class="ccm-institute-name" style="font-size:18px;font-weight:bold;color:#7c3aed">{{school_name}}</div>
    <div style="font-size:13px;font-weight:600;margin-top:4px">DETAILED MARKS CERTIFICATE</div>
  </div>
  <table width="100%" style="font-size:13px;line-height:1.8;margin-bottom:14px">
    <tr><td width="50%"><b>Student:</b> {{student_name}}</td><td><b>Father:</b> {{father_name}}</td></tr>
    <tr><td><b>Class:</b> {{class}}</td><td><b>Roll No:</b> {{roll_no}}</td></tr>
    <tr><td><b>Session:</b> {{session}}</td><td><b>Exam Date:</b> {{exam_date}}</td></tr>
  </table>
  <table width="100%" style="border-collapse:collapse;font-size:13px">
    <tr style="background:#f5f3ff"><th style="padding:7px;border:1px solid #c4b5fd;text-align:left">Subject</th><th style="padding:7px;border:1px solid #c4b5fd">Max Marks</th><th style="padding:7px;border:1px solid #c4b5fd">Obtained</th><th style="padding:7px;border:1px solid #c4b5fd">Grade</th></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{subject_1}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{max_1}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{obt_1}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{grade_1}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{subject_2}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{max_2}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{obt_2}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{grade_2}}</td></tr>
    <tr style="background:#f5f3ff;font-weight:bold"><td style="padding:8px;border:2px solid #7c3aed">TOTAL</td><td style="padding:8px;border:2px solid #7c3aed;text-align:center">{{total_marks}}</td><td style="padding:8px;border:2px solid #7c3aed;text-align:center">{{obtained_marks}}</td><td style="padding:8px;border:2px solid #7c3aed;text-align:center">{{grade}}</td></tr>
  </table>
  <div style="margin-top:12px;font-size:13px;display:flex;justify-content:space-between">
    <span>Percentage: <b>{{percentage}}%</b></span><span>Result: <b>{{result}}</b></span><span>Issue Date: <b>{{issue_date}}</b></span>
  </div>
</div>`;

const ADMIT_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;border:2px solid #064A1A">
  <div style="text-align:center;border-bottom:2px solid #064A1A;padding-bottom:10px;margin-bottom:14px">
    <div class="ccm-institute-name" style="font-size:18px;font-weight:bold;color:#064A1A">{{school_name}}</div>
    <div style="font-size:14px;font-weight:700;text-decoration:underline;margin-top:4px">ADMIT CARD</div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:14px">
    <table style="flex:1;border-collapse:collapse;font-size:13px">
      <tr>
        <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600;width:140px">Roll Number</td>
        <td style="border:1px solid #444;padding:6px 8px;font-weight:700;color:#064A1A">{{serial_no}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Name</td>
        <td style="border:1px solid #444;padding:6px 8px">{{student_name}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Class</td>
        <td style="border:1px solid #444;padding:6px 8px">{{class}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Mobile</td>
        <td style="border:1px solid #444;padding:6px 8px">{{mobile_no}}</td>
      </tr>
      <tr>
        <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Postal Address</td>
        <td style="border:1px solid #444;padding:6px 8px">{{present_address}}</td>
      </tr>
    </table>
    <div style="width:110px;height:140px;border:1px solid #444;display:flex;align-items:center;justify-content:center;font-size:10px;color:#555;text-align:center;padding:4px;background:#fafafa;flex-shrink:0;overflow:hidden">{{student_photo}}</div>
  </div>
  <div style="margin-bottom:8px;font-size:13px;font-weight:700">Entry Test Date: {{exam_date}}</div>
  <table width="100%" style="border-collapse:collapse;font-size:13px">
    <tr>
      <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600;width:160px">Proposed Center</td>
      <td style="border:1px solid #444;padding:6px 8px">{{test_city}}</td>
    </tr>
    <tr>
      <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Test Center / Venue</td>
      <td style="border:1px solid #444;padding:6px 8px">{{test_center_name}}</td>
    </tr>
    <tr>
      <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Address</td>
      <td style="border:1px solid #444;padding:6px 8px">{{test_center_address}}</td>
    </tr>
    <tr>
      <td style="border:1px solid #444;padding:6px 8px;background:#f4f4f4;font-weight:600">Contact</td>
      <td style="border:1px solid #444;padding:6px 8px">{{test_focal_person_phone_number}}</td>
    </tr>
  </table>
  <div style="margin-top:14px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;font-size:11px;color:#166534">
    Bring this call letter with you. You will not be permitted to appear in the written tests without this call letter.
    Mobile phones are not allowed inside the examination hall.
  </div>
</div>`;

const OFFER_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px;border:1px solid #e5e7eb">
  <div class="ccm-institute-name" style="font-size:18px;font-weight:bold;color:#111827;margin-bottom:4px">{{school_name}}</div>
  <div style="font-size:11px;color:#6b7280;margin-bottom:24px">Official Correspondence</div>
  <div style="margin-bottom:16px;font-size:13px"><b>Date:</b> {{issue_date}}</div>
  <div style="margin-bottom:20px;font-size:13px"><b>To:</b> {{candidate_name}}<br/>S/O {{father_name}}<br/>CNIC: {{cnic}}<br/>{{address}}</div>
  <div style="font-size:15px;font-weight:600;text-decoration:underline;margin-bottom:16px">Subject: Offer of Employment</div>
  <p style="font-size:13px;line-height:1.8;color:#374151">Dear <b>{{candidate_name}}</b>,</p>
  <p style="font-size:13px;line-height:1.8;color:#374151;margin:12px 0">We are pleased to offer you the position of <b>{{position}}</b> in the <b>{{department}}</b> department. Your appointment details are as follows:</p>
  <table style="font-size:13px;line-height:1.9;width:100%">
    <tr><td width="40%"><b>Grade/Scale:</b></td><td>{{grade}}</td></tr>
    <tr><td><b>Salary:</b></td><td>Rs. {{salary}} per month</td></tr>
    <tr><td><b>Joining Date:</b></td><td>{{joining_date}}</td></tr>
    <tr><td><b>Contract Period:</b></td><td>{{contract_period}}</td></tr>
  </table>
  <p style="font-size:13px;line-height:1.8;color:#374151;margin-top:20px">Please report to the HR office on your joining date with original documents.</p>
  <div style="margin-top:48px;font-size:13px">
    <div>____________________</div>
    <div style="margin-top:4px">Principal / Commandant</div>
    <div class="ccm-institute-name" style="color:#6b7280">{{school_name}}</div>
  </div>
</div>`;

const REPORTCARD_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;border:2px solid #0f766e">
  <div style="text-align:center;border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:14px">
    <div class="ccm-institute-name" style="font-size:18px;font-weight:bold;color:#0f766e">{{school_name}}</div>
    <div style="font-size:13px;font-weight:600;margin-top:4px">STUDENT REPORT CARD &mdash; {{rc_session}}</div>
  </div>
  <table width="100%" style="font-size:13px;line-height:1.9;margin-bottom:14px">
    <tr><td width="50%"><b>Student:</b> {{student_name}}</td><td><b>Father:</b> {{father_name}}</td></tr>
    <tr><td><b>Class:</b> {{class}}</td><td><b>Section:</b> {{section}}</td></tr>
    <tr><td><b>Roll No:</b> {{roll_no}}</td><td><b>Applicant ID:</b> {{applicant_id}}</td></tr>
    <tr><td><b>Rank in Class:</b> {{rc_rank}}</td><td><b>Enrollment Date:</b> {{enrollment_date}}</td></tr>
  </table>
  <table width="100%" style="border-collapse:collapse;font-size:13px">
    <tr style="background:#f0fdfa">
      <th style="padding:7px;border:1px solid #99f6e4;text-align:left">Subject</th>
      <th style="padding:7px;border:1px solid #99f6e4;text-align:center">Max</th>
      <th style="padding:7px;border:1px solid #99f6e4;text-align:center">Obtained</th>
      <th style="padding:7px;border:1px solid #99f6e4;text-align:center">Grade</th>
    </tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s1_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s1_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s1_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s1_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s2_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s2_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s2_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s2_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s3_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s3_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s3_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s3_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s4_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s4_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s4_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s4_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s5_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s5_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s5_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s5_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s6_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s6_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s6_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s6_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s7_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s7_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s7_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s7_grade}}</td></tr>
    <tr><td style="padding:6px 8px;border:1px solid #e5e7eb">{{rc_s8_name}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s8_max}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s8_obt}}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">{{rc_s8_grade}}</td></tr>
    <tr style="background:#f0fdfa;font-weight:bold">
      <td style="padding:8px;border:2px solid #0f766e" colspan="2">Total: {{rc_total_obtained}} / {{rc_total_marks}}</td>
      <td style="padding:8px;border:2px solid #0f766e;text-align:center">{{rc_percentage}}%</td>
      <td style="padding:8px;border:2px solid #0f766e;text-align:center">{{rc_grade}}</td>
    </tr>
  </table>
  <div style="margin-top:12px;font-size:13px;display:flex;justify-content:space-between">
    <span>Result: <b>{{result}}</b></span><span>Remarks: <b>{{remarks}}</b></span><span>Date: <b>{{issue_date}}</b></span>
  </div>
  <div style="margin-top:32px;font-size:12px;display:flex;justify-content:space-between">
    <div>____________________<br/>Class Teacher</div>
    <div>____________________<br/>Principal</div>
  </div>
</div>`;

const OFFER_STUDENT_HTML = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px;border:1px solid #e5e7eb">
  <div style="text-align:center;border-bottom:2px solid #0d9488;padding-bottom:12px;margin-bottom:20px">
    <div style="font-size:20px;font-weight:bold;color:#0d9488">{{school_name}}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;letter-spacing:0.05em;text-transform:uppercase">Admission Offer Letter</div>
  </div>
  <div style="margin-bottom:16px;font-size:13px"><b>Date:</b> {{issue_date}}</div>
  <div style="margin-bottom:20px;font-size:13px">
    <b>To:</b><br/>
    The Parent / Guardian of<br/>
    <b>{{student_name}}</b><br/>
    S/O <b>{{father_name}}</b>
  </div>
  <div style="font-size:15px;font-weight:600;text-decoration:underline;margin-bottom:16px">Subject: Offer of Admission</div>
  <p style="font-size:13px;line-height:1.8;color:#374151">Dear Parent / Guardian,</p>
  <p style="font-size:13px;line-height:1.8;color:#374151;margin:12px 0">
    We are pleased to inform you that <b>{{student_name}}</b> (Applicant ID <b>{{applicant_id}}</b>) has been
    selected for admission to <b>{{school_name}}</b> for the academic session <b>{{session}}</b>.
    The details of the offered seat are as follows:
  </p>
  <table style="font-size:13px;line-height:2;width:100%;margin:12px 0">
    <tr><td width="40%"><b>Class / Program:</b></td><td>{{class}}</td></tr>
    <tr><td><b>Section:</b></td><td>{{section}}</td></tr>
    <tr><td><b>Session:</b></td><td>{{session}}</td></tr>
    <tr><td><b>Reporting Date:</b></td><td>{{reporting_date}}</td></tr>
    <tr><td><b>Hostel Block:</b></td><td>{{hostel_block}}</td></tr>
    <tr><td><b>Fee (Monthly):</b></td><td>Rs. {{fee_amount}}</td></tr>
  </table>
  <p style="font-size:13px;line-height:1.8;color:#374151;margin-top:16px">
    Please report to the Admission Office on or before the reporting date with the following original documents:
    (i)&nbsp;B-Form / CNIC, (ii)&nbsp;Previous academic certificates / result card, (iii)&nbsp;Character certificate,
    (iv)&nbsp;Four recent passport-size photographs.
  </p>
  <p style="font-size:13px;line-height:1.8;color:#374151;margin-top:8px">
    Failure to report by the due date will result in cancellation of this offer without further notice.
    We look forward to welcoming the student to our institution.
  </p>
  <div style="margin-top:48px;font-size:13px">
    <div>____________________</div>
    <div style="margin-top:4px">Principal / Commandant</div>
    <div style="color:#6b7280">{{school_name}}</div>
  </div>
</div>`;

const IDCARD_HTML = `<div style="font-family:Arial,sans-serif;width:300px;margin:0 auto;border:2px solid #2563eb;border-radius:8px;overflow:hidden">
  <div style="background:#2563eb;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
    <div style="color:white;font-weight:bold;font-size:13px">CCM</div>
    <div style="color:rgba(255,255,255,0.9);font-size:11px">Student ID Card</div>
  </div>
  <div style="padding:14px;display:flex;gap:12px">
    <div style="width:72px;height:90px;background:#e5e7eb;border:1px solid #d1d5db;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af">Photo</div>
    <div style="font-size:12px;line-height:1.8">
      <div style="font-size:14px;font-weight:bold;color:#111827">{{student_name}}</div>
      <div><b>Class:</b> {{class}}</div>
      <div><b>Roll No:</b> {{roll_no}}</div>
      <div><b>House:</b> {{house}}</div>
      <div><b>Blood:</b> {{blood_group}}</div>
      <div><b>Session:</b> {{session}}</div>
    </div>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:8px 14px;font-size:11px;color:#6b7280">
    <div><b>Father:</b> {{father_name}} &nbsp;|&nbsp; <b>Ph:</b> {{father_phone}}</div>
    <div style="margin-top:2px"><b>Valid:</b> {{issue_date}} &mdash; {{expiry_date}}</div>
  </div>
</div>`;

// ── Student field-map helpers ──────────────────────────────────────────────────

function studentBase(s: any, sectionMap: Record<string, string>, classMap: Record<string, string>): Record<string, string> {
  const rollResolved = s.rollNo ?? s.applicantId ?? "";
  const photoFilename: string | null | undefined = s.photoFilename;
  const student_photo = photoFilename
    ? `<span style="display:inline-block;width:110px;height:140px;overflow:hidden;vertical-align:middle;line-height:0;"><img src="${photoFilename}" alt="Student" style="width:100%;height:100%;object-fit:cover;display:block;" /></span>`
    : "";
  return {
    student_name:    s.fullName,
    father_name:     s.fatherName     ?? "",
    applicant_id:       s.applicantId       ?? "",
    roll_no:         rollResolved,
    roll_number:     rollResolved,
    class:           classMap[s.classCode] ?? s.classCode ?? "",
    section:         sectionMap[s.sectionId] ?? "",
    blood_group:     s.bloodGroup     ?? "",
    father_phone:    displayPhone(s.guardianMobile) ?? "",
    fee_status:      s.feeStatus      ?? "",
    hostel_block:    s.hostelBlock    ?? "",
    hostel_room:     s.hostelRoom     ?? "",
    enrollment_date: s.enrollmentDate ?? "",
    student_photo,
  };
}

// ── Document type definitions ──────────────────────────────────────────────────

export const DOC_TYPES: DocTypeDef[] = [
  {
    id: "salary-slip", label: "Salary Slip", icon: Banknote,
    color: "#1d4ed8", lightBg: "bg-blue-50 border-blue-200 text-blue-700",
    audience: "employee",
    hrOnly: true,
    defaultContent: SALARY_HTML,
    tagGroups: [
      { group: "Employee", tags: [
        { tag: "{{employee_name}}", label: "Employee Name",  sampleValue: "Muhammad Tariq" },
        { tag: "{{designation}}",   label: "Designation",    sampleValue: "Senior Teacher" },
        { tag: "{{department}}",    label: "Department",     sampleValue: "Science" },
        { tag: "{{employee_id}}",   label: "Employee ID",    sampleValue: "EMP-0034" },
        { tag: "{{cnic}}",          label: "CNIC",           sampleValue: "37405-1234567-9" },
      ]},
      { group: "Earnings", tags: [
        { tag: "{{basic_salary}}",      label: "Basic Salary",       sampleValue: "45,000" },
        { tag: "{{house_allowance}}",   label: "House Allowance",    sampleValue: "9,000" },
        { tag: "{{medical_allowance}}", label: "Medical Allowance",  sampleValue: "4,500" },
        { tag: "{{other_allowances}}",  label: "Other Allowances",   sampleValue: "2,000" },
        { tag: "{{gross_salary}}",      label: "Gross Salary",       sampleValue: "60,500" },
      ]},
      { group: "Deductions & Summary", tags: [
        { tag: "{{income_tax}}",       label: "Income Tax",       sampleValue: "2,500" },
        { tag: "{{provident_fund}}",   label: "Provident Fund",   sampleValue: "2,250" },
        { tag: "{{other_deductions}}", label: "Other Deductions", sampleValue: "0" },
        { tag: "{{total_deductions}}", label: "Total Deductions", sampleValue: "4,750" },
        { tag: "{{net_salary}}",       label: "Net Salary",       sampleValue: "55,750" },
        { tag: "{{month_year}}",       label: "Month & Year",     sampleValue: "June 2025" },
        { tag: "{{pay_date}}",         label: "Pay Date",         sampleValue: "30 Jun 2025" },
      ]},
    ],
  },
  {
    id: "certificate", label: "Certificate", icon: Award,
    color: "#d97706", lightBg: "bg-amber-50 border-amber-200 text-amber-700",
    audience: "students",
    defaultContent: CERT_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{cadet_name}}",    label: "Cadet Name",      sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",   label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{class_name}}",    label: "Class/Program",           sampleValue: "10th Grade" },
        { tag: "{{roll_number}}",   label: "Roll Number",     sampleValue: "042" },
        { tag: "{{student_photo}}", label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Achievement", tags: [
        { tag: "{{award_type}}",    label: "Award Type",     sampleValue: "Academic Excellence Award" },
        { tag: "{{position}}",      label: "Position",       sampleValue: "1st" },
        { tag: "{{percentage}}",    label: "Percentage",     sampleValue: "94.5" },
        { tag: "{{academic_year}}", label: "Academic Year",  sampleValue: "2024-2025" },
      ]},
      { group: "Date", tags: [
        { tag: "{{issue_date}}",    label: "Issue Date",    sampleValue: "15 Jun 2025" },
        { tag: "{{ceremony_date}}", label: "Ceremony Date", sampleValue: "20 Jun 2025" },
      ]},
    ],
    generateTimeFields: [
      { key: "issue_date", label: "Issue Date", type: "date", defaultToday: true },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      cadet_name:  s.fullName,
      father_name: s.fatherName ?? "",
      class_name:  classMap[s.classCode] ?? s.classCode ?? "",
      roll_number: s.rollNo ?? s.applicantId ?? "",
    }),
  },
  {
    id: "dmc", label: "DMC", icon: ClipboardList,
    color: "#7c3aed", lightBg: "bg-violet-50 border-violet-200 text-violet-700",
    audience: "students",
    defaultContent: DMC_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",  label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{class}}",        label: "Class/Program",           sampleValue: "10th Grade" },
        { tag: "{{roll_no}}",      label: "Roll No.",        sampleValue: "042" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2024-2025" },
        { tag: "{{student_photo}}",label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Subjects", tags: [
        { tag: "{{subject_1}}", label: "Subject 1",    sampleValue: "Mathematics" },
        { tag: "{{max_1}}",     label: "Max Marks 1",  sampleValue: "100" },
        { tag: "{{obt_1}}",     label: "Obtained 1",   sampleValue: "92" },
        { tag: "{{grade_1}}",   label: "Grade 1",      sampleValue: "A+" },
        { tag: "{{subject_2}}", label: "Subject 2",    sampleValue: "Physics" },
        { tag: "{{max_2}}",     label: "Max Marks 2",  sampleValue: "100" },
        { tag: "{{obt_2}}",     label: "Obtained 2",   sampleValue: "88" },
        { tag: "{{grade_2}}",   label: "Grade 2",      sampleValue: "A" },
      ]},
      { group: "Summary", tags: [
        { tag: "{{total_marks}}",   label: "Total Marks",      sampleValue: "200" },
        { tag: "{{obtained_marks}}",label: "Obtained Marks",   sampleValue: "180" },
        { tag: "{{percentage}}",    label: "Percentage",       sampleValue: "90.0" },
        { tag: "{{grade}}",         label: "Overall Grade",    sampleValue: "A+" },
        { tag: "{{result}}",        label: "Result (Pass/Fail)",sampleValue: "PASS" },
        { tag: "{{exam_date}}",     label: "Exam Date",        sampleValue: "10 May 2025" },
        { tag: "{{issue_date}}",    label: "Issue Date",       sampleValue: "15 Jun 2025" },
      ]},
    ],
    generateTimeFields: [
      { key: "issue_date", label: "Issue Date", type: "date", defaultToday: true },
      { key: "exam_date",  label: "Exam Date",  type: "date" },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
    }),
  },
  {
    id: "report-card", label: "Report Card", icon: BookOpen,
    color: "#0f766e", lightBg: "bg-teal-50 border-teal-200 text-teal-700",
    audience: "students",
    defaultContent: REPORTCARD_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}",    label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",     label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{class}}",           label: "Class/Program",           sampleValue: "9th Grade" },
        { tag: "{{section}}",         label: "Section",         sampleValue: "A" },
        { tag: "{{roll_no}}",         label: "Roll No.",        sampleValue: "042" },
        { tag: "{{applicant_id}}",       label: "Applicant ID",     sampleValue: "CCM-2025-0042" },
        { tag: "{{rc_session}}",      label: "Session",         sampleValue: "2024-2025" },
        { tag: "{{rc_rank}}",         label: "Rank in Class",   sampleValue: "3" },
        { tag: "{{enrollment_date}}", label: "Enrollment Date", sampleValue: "01 Sep 2024" },
        { tag: "{{student_photo}}",   label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Subjects (auto-filled from Exams)", tags: [
        { tag: "{{rc_s1_name}}",  label: "Subject 1 Name",     sampleValue: "Mathematics" },
        { tag: "{{rc_s1_max}}",   label: "Subject 1 Max",      sampleValue: "100" },
        { tag: "{{rc_s1_obt}}",   label: "Subject 1 Obtained", sampleValue: "88" },
        { tag: "{{rc_s1_grade}}", label: "Subject 1 Grade",    sampleValue: "A" },
        { tag: "{{rc_s2_name}}",  label: "Subject 2 Name",     sampleValue: "Physics" },
        { tag: "{{rc_s2_max}}",   label: "Subject 2 Max",      sampleValue: "100" },
        { tag: "{{rc_s2_obt}}",   label: "Subject 2 Obtained", sampleValue: "82" },
        { tag: "{{rc_s2_grade}}", label: "Subject 2 Grade",    sampleValue: "A" },
        { tag: "{{rc_s3_name}}",  label: "Subject 3 Name",     sampleValue: "English" },
        { tag: "{{rc_s3_max}}",   label: "Subject 3 Max",      sampleValue: "100" },
        { tag: "{{rc_s3_obt}}",   label: "Subject 3 Obtained", sampleValue: "79" },
        { tag: "{{rc_s3_grade}}", label: "Subject 3 Grade",    sampleValue: "B+" },
        { tag: "{{rc_s4_name}}",  label: "Subject 4 Name",     sampleValue: "Chemistry" },
        { tag: "{{rc_s4_max}}",   label: "Subject 4 Max",      sampleValue: "100" },
        { tag: "{{rc_s4_obt}}",   label: "Subject 4 Obtained", sampleValue: "75" },
        { tag: "{{rc_s4_grade}}", label: "Subject 4 Grade",    sampleValue: "B+" },
        { tag: "{{rc_s5_name}}",  label: "Subject 5 Name",     sampleValue: "Biology" },
        { tag: "{{rc_s5_max}}",   label: "Subject 5 Max",      sampleValue: "100" },
        { tag: "{{rc_s5_obt}}",   label: "Subject 5 Obtained", sampleValue: "71" },
        { tag: "{{rc_s5_grade}}", label: "Subject 5 Grade",    sampleValue: "B" },
        { tag: "{{rc_s6_name}}",  label: "Subject 6 Name",     sampleValue: "Pakistan Studies" },
        { tag: "{{rc_s6_max}}",   label: "Subject 6 Max",      sampleValue: "75" },
        { tag: "{{rc_s6_obt}}",   label: "Subject 6 Obtained", sampleValue: "60" },
        { tag: "{{rc_s6_grade}}", label: "Subject 6 Grade",    sampleValue: "B" },
        { tag: "{{rc_s7_name}}",  label: "Subject 7 Name",     sampleValue: "Islamiat" },
        { tag: "{{rc_s7_max}}",   label: "Subject 7 Max",      sampleValue: "50" },
        { tag: "{{rc_s7_obt}}",   label: "Subject 7 Obtained", sampleValue: "42" },
        { tag: "{{rc_s7_grade}}", label: "Subject 7 Grade",    sampleValue: "A" },
        { tag: "{{rc_s8_name}}",  label: "Subject 8 Name",     sampleValue: "" },
        { tag: "{{rc_s8_max}}",   label: "Subject 8 Max",      sampleValue: "" },
        { tag: "{{rc_s8_obt}}",   label: "Subject 8 Obtained", sampleValue: "" },
        { tag: "{{rc_s8_grade}}", label: "Subject 8 Grade",    sampleValue: "" },
      ]},
      { group: "Summary", tags: [
        { tag: "{{rc_total_marks}}",    label: "Total Max Marks",   sampleValue: "725" },
        { tag: "{{rc_total_obtained}}", label: "Total Obtained",    sampleValue: "597" },
        { tag: "{{rc_percentage}}",     label: "Percentage",        sampleValue: "82.3" },
        { tag: "{{rc_grade}}",          label: "Overall Grade",     sampleValue: "A" },
        { tag: "{{result}}",            label: "Result (Pass/Fail)",sampleValue: "PASS" },
        { tag: "{{remarks}}",           label: "Remarks",           sampleValue: "Excellent Performance" },
        { tag: "{{issue_date}}",        label: "Issue Date",        sampleValue: "15 Jun 2025" },
      ]},
    ],
    generateTimeFields: [
      { key: "_exam_picker", label: "Exam / Session", type: "exam-picker" },
      { key: "issue_date",   label: "Issue Date",     type: "date", defaultToday: true },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
    }),
  },
  {
    id: "admit-card", label: "Admit Card", icon: FileCheck,
    color: "#0891b2", lightBg: "bg-cyan-50 border-cyan-200 text-cyan-700",
    audience: "applicants",
    dataSource: "applicants",
    defaultContent: ADMIT_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "ALI HASSAN KHAN" },
        { tag: "{{father_name}}",  label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{class}}",        label: "Class/Program Applying",  sampleValue: "Class 8" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2025-2026" },
        { tag: "{{issue_date}}",   label: "Issue Date",      sampleValue: "01 May 2025" },
      ]},
      { group: "Applicant", tags: [
        { tag: "{{serial_no}}",       label: "Roll / Serial No.", sampleValue: "CCM-2025-042" },
        { tag: "{{mobile_no}}",       label: "Mobile No.",        sampleValue: "0321-5551234" },
        { tag: "{{present_address}}", label: "Postal Address",    sampleValue: "House 12, Street 4, Rawalpindi" },
        { tag: "{{student_photo}}",   label: "Photo (img tag)",   sampleValue: "PASTE RECENT PASSPORT-SIZE PHOTO" },
      ]},
      { group: "Test Centre", tags: [
        { tag: "{{exam_date}}",                    label: "Exam Date",               sampleValue: "10 May 2025" },
        { tag: "{{test_city}}",                    label: "Proposed City / Centre",  sampleValue: "Rawalpindi" },
        { tag: "{{test_center_name}}",             label: "Test Centre Name",        sampleValue: "Army Public School" },
        { tag: "{{test_center_address}}",          label: "Test Centre Address",     sampleValue: "Chaklala Garrison, Rawalpindi" },
        { tag: "{{test_focal_person_phone_number}}", label: "Focal Person / Contact", sampleValue: "0311-5551234" },
        { tag: "{{issue_date}}",                   label: "Issue Date",              sampleValue: "01 May 2025" },
      ]},
    ],
    generateTimeFields: [
      { key: "_schedule_picker", label: "Test Schedule", type: "test-schedule-picker" },
      { key: "issue_date",       label: "Issue Date",    type: "date", defaultToday: true },
    ],
    studentFieldMap: (s) => {
      const photoFilename: string | null | undefined = s.photoFilename;
      const photoImg = photoFilename
        ? `<span style="display:inline-block;width:110px;height:140px;overflow:hidden;vertical-align:middle;line-height:0;"><img src="${photoFilename}" alt="Candidate" style="width:100%;height:100%;object-fit:cover;display:block;" /></span>`
        : "PASTE RECENT PASSPORT-SIZE PHOTO";
      return {
        serial_no:                        s.rollNumber       ?? "",
        student_name:                     s.fullName.toUpperCase(),
        father_name:                      s.fatherName       ?? "",
        class:                            s.classApplying    ?? "",
        mobile_no:                        s.guardianMobile   ?? "",
        present_address:                  s.presentAddress   ?? "",
        test_city:                        s.examCenter       ?? "",
        test_center_name:                 s.testVenue        ?? "",
        test_center_address:              s.testCenterAddress ?? "",
        test_focal_person_phone_number:   s.testFocalPerson  ?? "",
        student_photo:                    photoImg,
      };
    },
  },
  {
    id: "offer-letter", label: "Offer Letter (HR)", icon: FileText,
    color: "#9333ea", lightBg: "bg-purple-50 border-purple-200 text-purple-700",
    audience: "employee",
    hrOnly: true,
    defaultContent: OFFER_HTML,
    tagGroups: [
      { group: "Candidate", tags: [
        { tag: "{{candidate_name}}",  label: "Candidate Name",  sampleValue: "Usman Farooq" },
        { tag: "{{father_name}}",     label: "Father's Name",   sampleValue: "Farooq Ahmed" },
        { tag: "{{cnic}}",            label: "CNIC",            sampleValue: "37405-9876543-1" },
        { tag: "{{address}}",         label: "Address",         sampleValue: "House 12, Street 4, Rawalpindi" },
        { tag: "{{employee_photo}}",  label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Position & Terms", tags: [
        { tag: "{{position}}",        label: "Position",        sampleValue: "Lecturer (Mathematics)" },
        { tag: "{{department}}",      label: "Department",      sampleValue: "Academic" },
        { tag: "{{grade}}",           label: "Grade / Scale",   sampleValue: "BPS-17" },
        { tag: "{{salary}}",          label: "Salary",          sampleValue: "55,000" },
        { tag: "{{joining_date}}",    label: "Joining Date",    sampleValue: "01 Jul 2025" },
        { tag: "{{contract_period}}", label: "Contract Period", sampleValue: "One Year (Extendable)" },
        { tag: "{{issue_date}}",      label: "Issue Date",      sampleValue: "15 Jun 2025" },
      ]},
    ],
  },
  {
    id: "offer-letter-applicant", label: "Offer Letter (Applicant)", icon: FileText,
    color: "#0891b2", lightBg: "bg-cyan-50 border-cyan-200 text-cyan-700",
    audience: "applicants",
    dataSource: "applicants",
    defaultContent: OFFER_STUDENT_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",  label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{applicant_id}}",    label: "Applicant ID",   sampleValue: "CCM-2025-0042" },
        { tag: "{{class}}",        label: "Class / Program", sampleValue: "7th Grade" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2025-2026" },
        { tag: "{{mobile_no}}",    label: "Phone No.",       sampleValue: "0321-5551234" },
        { tag: "{{student_photo}}",label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Entry Test", tags: [
        { tag: "{{exam_date}}",        label: "Entry Test Date",   sampleValue: "10 May 2025" },
        { tag: "{{test_city}}",        label: "Test Centre City",  sampleValue: "Rawalpindi" },
        { tag: "{{test_center_name}}", label: "Test Centre Name",  sampleValue: "Army Public School" },
        { tag: "{{merit_score}}",      label: "Total Merit Marks", sampleValue: "87.5" },
      ]},
      { group: "Admission Terms", tags: [
        { tag: "{{reporting_date}}", label: "Reporting Date", sampleValue: "01 Sep 2025" },
        { tag: "{{hostel_block}}",   label: "Hostel Block",   sampleValue: "Block A" },
        { tag: "{{fee_amount}}",     label: "Fee Amount",     sampleValue: "12,500" },
        { tag: "{{issue_date}}",     label: "Issue Date",     sampleValue: "15 Jun 2025" },
      ]},
      { group: "Institution", tags: [
        { tag: "{{school_name}}", label: "School Name", sampleValue: "Cadet College Murree" },
      ]},
    ],
    generateTimeFields: [
      { key: "reporting_date", label: "Reporting Date", type: "date" },
      { key: "issue_date",     label: "Issue Date",     type: "date", defaultToday: true },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
      applicant_id:        s.rollNumber       ?? s.referenceId  ?? "",
      class:            s.classApplying    ?? "",
      mobile_no:        s.guardianMobile   ?? "",
      exam_date:        s.testDate
                          ? new Date(s.testDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                          : "",
      test_city:        s.examCenter       ?? "",
      test_center_name: s.testVenue        ?? "",
      merit_score:      s.meritScore != null ? String(s.meritScore) : "",
    }),
  },
  {
    id: "offer-letter-student", label: "Offer Letter (Student)", icon: FileText,
    color: "#0d9488", lightBg: "bg-teal-50 border-teal-200 text-teal-700",
    audience: "students",
    defaultContent: OFFER_STUDENT_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",  label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{applicant_id}}",    label: "Applicant ID",   sampleValue: "CCM-2025-0042" },
        { tag: "{{class}}",        label: "Class / Program", sampleValue: "7th Grade" },
        { tag: "{{section}}",      label: "Section",         sampleValue: "A" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2025-2026" },
        { tag: "{{student_photo}}",label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Admission Terms", tags: [
        { tag: "{{reporting_date}}", label: "Reporting Date", sampleValue: "01 Sep 2025" },
        { tag: "{{hostel_block}}",   label: "Hostel Block",   sampleValue: "Block A" },
        { tag: "{{fee_amount}}",     label: "Fee Amount",     sampleValue: "12,500" },
        { tag: "{{issue_date}}",     label: "Issue Date",     sampleValue: "15 Jun 2025" },
      ]},
      { group: "Institution", tags: [
        { tag: "{{school_name}}", label: "School Name", sampleValue: "Cadet College Murree" },
      ]},
    ],
    generateTimeFields: [
      { key: "reporting_date", label: "Reporting Date", type: "date" },
      { key: "issue_date",     label: "Issue Date",     type: "date", defaultToday: true },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
    }),
  },
  {
    id: "offer-letter-student-ix-xi", label: "Offer Letter (IX–XI)", icon: FileText,
    color: "#0d9488", lightBg: "bg-teal-50 border-teal-200 text-teal-700",
    audience: "applicants",
    defaultContent: OFFER_STUDENT_HTML,
    tagGroups: [
      { group: "Student", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{father_name}}",  label: "Father's Name",   sampleValue: "Hassan Khan" },
        { tag: "{{applicant_id}}",    label: "Applicant ID",   sampleValue: "CCM-2025-0042" },
        { tag: "{{class}}",        label: "Class / Program", sampleValue: "9th Grade" },
        { tag: "{{section}}",      label: "Section",         sampleValue: "A" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2025-2026" },
        { tag: "{{student_photo}}",label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Admission Terms", tags: [
        { tag: "{{reporting_date}}", label: "Reporting Date", sampleValue: "01 Sep 2025" },
        { tag: "{{hostel_block}}",   label: "Hostel Block",   sampleValue: "Block A" },
        { tag: "{{fee_amount}}",     label: "Fee Amount",     sampleValue: "12,500" },
        { tag: "{{issue_date}}",     label: "Issue Date",     sampleValue: "15 Jun 2025" },
      ]},
      { group: "Institution", tags: [
        { tag: "{{school_name}}", label: "School Name", sampleValue: "Cadet College Murree" },
      ]},
    ],
    generateTimeFields: [
      { key: "reporting_date", label: "Reporting Date", type: "date" },
      { key: "issue_date",     label: "Issue Date",     type: "date", defaultToday: true },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
    }),
  },
  {
    id: "id-card", label: "ID Card", icon: CreditCard,
    color: "#2563eb", lightBg: "bg-blue-50 border-blue-200 text-blue-700",
    audience: "students",
    defaultContent: IDCARD_HTML,
    tagGroups: [
      { group: "Identity", tags: [
        { tag: "{{student_name}}", label: "Student Name",    sampleValue: "Ali Hassan Khan" },
        { tag: "{{class}}",        label: "Class/Program",           sampleValue: "9th Grade" },
        { tag: "{{roll_no}}",      label: "Roll No.",        sampleValue: "042" },
        { tag: "{{house}}",        label: "House",           sampleValue: "Iqbal House" },
        { tag: "{{blood_group}}",  label: "Blood Group",     sampleValue: "B+" },
        { tag: "{{session}}",      label: "Session",         sampleValue: "2024-2025" },
        { tag: "{{student_photo}}",label: "Photo (img tag)", sampleValue: "" },
      ]},
      { group: "Contact & Validity", tags: [
        { tag: "{{father_name}}",  label: "Father's Name",  sampleValue: "Hassan Khan" },
        { tag: "{{father_phone}}", label: "Father's Phone", sampleValue: "0321-5551234" },
        { tag: "{{issue_date}}",   label: "Issue Date",     sampleValue: "01 Sep 2024" },
        { tag: "{{expiry_date}}",  label: "Expiry Date",    sampleValue: "31 Aug 2025" },
      ]},
    ],
    generateTimeFields: [
      { key: "issue_date",  label: "Issue Date",  type: "date", defaultToday: true },
      { key: "expiry_date", label: "Expiry Date", type: "date" },
    ],
    studentFieldMap: (s, sectionMap, classMap) => ({
      ...studentBase(s, sectionMap, classMap),
    }),
  },
];

export function getDocType(id: DocTypeId): DocTypeDef {
  return DOC_TYPES.find(d => d.id === id) ?? DOC_TYPES[0];
}

/** Doc types that are student-facing and support bulk generation from roster. */
export const STUDENT_DOC_IDS = new Set<DocTypeId>(
  DOC_TYPES.filter(d => !!d.studentFieldMap).map(d => d.id),
);
