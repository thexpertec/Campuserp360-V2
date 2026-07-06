export type DocInfo = { uploaded: boolean; verified: boolean; rejected?: boolean; rejection_reason?: string };

export type FeeInfo = {
  challan_no: string;
  amount: number;
  gross_amount?: number;    // class-schedule rate; when set and > amount, concession row is shown
  discount_amount?: number; // explicit reduction (gross_amount − amount); derived if omitted
  bank: string;
  bank_branch?: string;
  account_title?: string;
  account: string;
  challan_instructions?: string;
  due_date: string;
  status: "paid" | "pending";
  bank_reference?: string | null;
};

export type AdmissionFeeInfo = {
  amount: number;
  status: "paid" | "pending";
  bank_reference?: string | null;
};

export type SubjectScore = { obtained: number; total: number };

export type ResultStatus = "selected" | "wait_listed" | "not_selected" | null;

export type AppStatus =
  | "received"
  | "verified"
  | "test_scheduled"
  | "test_taken"
  | "result_announced"
  | "interview_scheduled"
  | "interview_taken"
  | "admitted"
  | "rejected"
  | "on_hold";

export type PortalUser = {
  ref_id: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  password?: string;
  father_name: string;
  school_name?: string;
  show_institute_name?: boolean;
  guardian_mobile: string;
  date_of_birth: string;
  blood_group: string;
  class_applying: string;
  session: string;
  address: string;
  city: string;
  state: string;
  exam_center: string;
  status: AppStatus;
  roll_no: string | null;
  test_date: string | null;
  test_time: string | null;
  test_venue: string | null;
  test_center_address?: string | null;
  test_focal_person?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  interview_venue?: string | null;
  interview_marks?: number | null;
  marks: number | null;
  total_marks: number;
  merit: number | null;
  result_status: ResultStatus;
  subjects: Record<string, SubjectScore> | null;
  fee: FeeInfo;
  admission_fee?: AdmissionFeeInfo;
  application_fee_enabled?: boolean;
  payment_methods?: {
    enable_bank_deposit: boolean;
    enable_jazzcash: boolean;
    enable_payfast: boolean;
  };
  docs: Record<string, DocInfo>;
  joining_date: string | null;
  fee_deadline: string | null;
  offer_date: string | null;
  candidate_accepted?: boolean;
  student_photo?: string;
  submitted_at?: string | null;
  verified_at?: string | null;
  result_announced_at?: string | null;
};

export type Stage = { key: string; icon: string; title: string; desc: string };

export const STAGES: Stage[] = [
  { key: "received",             icon: "📋", title: "Application Received",    desc: "Submitted via the online portal. Under review." },
  { key: "verified",             icon: "✅", title: "Documents Verified",       desc: "Documents reviewed by the admissions team." },
  { key: "test_scheduled",       icon: "📅", title: "Entry Test Scheduled",     desc: "Roll number, date and centre confirmed." },
  { key: "test_taken",           icon: "📝", title: "Entry Test Conducted",     desc: "Test paper attempted at the exam centre." },
  { key: "result_announced",     icon: "🏆", title: "Result Announced",         desc: "Marks and merit position published." },
  { key: "interview_scheduled",  icon: "🗓️",  title: "Interview Scheduled",     desc: "Interview date, time and venue assigned." },
  { key: "interview_taken",      icon: "🎙️",  title: "Interview Conducted",     desc: "Interview completed at the college campus." },
  { key: "decision",             icon: "🎓", title: "Final Decision",           desc: "Admission outcome finalized." },
];

export const STATUS_IDX: Record<string, number> = {
  received:            0,
  verified:            1,
  test_scheduled:      2,
  test_taken:          3,
  result_announced:    4,
  interview_scheduled: 5,
  interview_taken:     6,
  admitted:            7,
  rejected:            7,
  on_hold:             7,
};

// ── Fallback demo accounts (used only if API is unreachable) ─────────────────
export const DEMO_ACCOUNTS: Record<string, PortalUser> = {
  "hamza@example.com": {
    ref_id: "CCM-2026-HMZ001",
    name: "Muhammad Hamza Iqbal",
    fullName: "Muhammad Hamza Iqbal",
    email: "hamza@example.com",
    phone: "03001234567",
    password: "12345",
    father_name: "Iqbal Ahmed",
    guardian_mobile: "0300-1234567",
    date_of_birth: "15 March 2012",
    blood_group: "B+",
    class_applying: "Class VI",
    session: "2026-27",
    address: "House 45, Street 7, G-10/2, Islamabad",
    city: "Islamabad",
    state: "Islamabad Capital Territory",
    exam_center: "Islamabad",
    status: "admitted",
    roll_no: "CCM-VI-001",
    test_date: "2026-05-12T08:00:00Z",
    test_time: "08:00 AM",
    test_venue: "Government College, Islamabad",
    test_center_address: "Sector G-9/4, Islamabad",
    test_focal_person: "0300-9543823",
    interview_date: "2026-05-20T09:00:00Z",
    interview_time: "09:00 AM",
    interview_venue: "CCM Main Campus, Murree",
    interview_marks: 28,
    marks: 190,
    total_marks: 200,
    merit: 1,
    result_status: "selected",
    subjects: {
      English: { obtained: 47, total: 50 },
      Mathematics: { obtained: 48, total: 50 },
      Urdu: { obtained: 28, total: 30 },
      Science: { obtained: 29, total: 30 },
      "IQ / Verbal": { obtained: 38, total: 40 },
    },
    fee: { challan_no: "CCM-2026-CH-HMZ001", amount: 2000, bank: "National Bank of Pakistan", account: "0004-6000-2000-3201", due_date: "30 Apr 2026", status: "paid" },
    docs: {
      "Birth Certificate": { uploaded: true, verified: true },
      "B-Form (Child CNIC)": { uploaded: true, verified: true },
      "School Leaving Cert": { uploaded: true, verified: false },
      "Student Photo": { uploaded: true, verified: true },
      "Medical Fitness Cert": { uploaded: false, verified: false },
    },
    joining_date: "15 June 2026",
    fee_deadline: "10 June 2026",
    offer_date: "28 May 2026",
    candidate_accepted: true,
  },
  "ali@example.com": {
    ref_id: "CCM-2026-ALI002",
    name: "Ali Abdullah Khan",
    fullName: "Ali Abdullah Khan",
    email: "ali@example.com",
    phone: "03009876543",
    password: "12345",
    father_name: "Tariq Mehmood Khan",
    guardian_mobile: "0301-9876543",
    date_of_birth: "22 July 2012",
    blood_group: "A+",
    class_applying: "Class VI",
    session: "2026-27",
    address: "Flat 12, Block C, DHA Phase 2, Lahore",
    city: "Lahore",
    state: "Punjab",
    exam_center: "Lahore",
    status: "test_scheduled",
    roll_no: "CCM-VI-002",
    test_date: "2026-05-12T08:00:00Z",
    test_time: "08:00 AM",
    test_venue: "Government College, Lahore",
    test_center_address: "Phase 2, DHA, Lahore Cantt, Lahore",
    test_focal_person: "0304-1111024",
    marks: null,
    total_marks: 200,
    merit: null,
    result_status: null,
    subjects: null,
    fee: { challan_no: "CCM-2026-CH-ALI002", amount: 2000, bank: "National Bank of Pakistan", account: "0004-6000-2000-3201", due_date: "30 Apr 2026", status: "pending" },
    docs: {
      "Birth Certificate": { uploaded: true, verified: true },
      "B-Form (Child CNIC)": { uploaded: false, verified: false },
      "School Leaving Cert": { uploaded: false, verified: false },
      "Student Photo": { uploaded: true, verified: true },
      "Medical Fitness Cert": { uploaded: false, verified: false },
    },
    joining_date: null,
    fee_deadline: null,
    offer_date: null,
  },
  "fawad@example.com": {
    ref_id: "CCM-2026-FAW015",
    name: "Fawad Saleem Kashmiri",
    fullName: "Fawad Saleem Kashmiri",
    email: "fawad@example.com",
    phone: "03121112233",
    password: "12345",
    father_name: "Saleem Kashmiri",
    guardian_mobile: "0313-1112233",
    date_of_birth: "5 November 2011",
    blood_group: "O-",
    class_applying: "Class IX",
    session: "2026-27",
    address: "Chak 22, Rahim Yar Khan",
    city: "Rahim Yar Khan",
    state: "Punjab",
    exam_center: "Multan",
    status: "result_announced",
    roll_no: "CCM-IX-015",
    test_date: "2026-05-12T08:00:00Z",
    test_time: "08:00 AM",
    test_venue: "Bahauddin Zakariya University, Multan",
    test_center_address: "Bosan Road, Multan",
    test_focal_person: "0304-1111024",
    marks: 92,
    total_marks: 200,
    merit: 15,
    result_status: "not_selected",
    subjects: {
      English: { obtained: 22, total: 50 },
      Mathematics: { obtained: 24, total: 50 },
      Urdu: { obtained: 13, total: 30 },
      Science: { obtained: 13, total: 30 },
      "IQ / Verbal": { obtained: 20, total: 40 },
    },
    fee: { challan_no: "CCM-2026-CH-FAW015", amount: 2000, bank: "National Bank of Pakistan", account: "0004-6000-2000-3201", due_date: "30 Apr 2026", status: "paid" },
    docs: {
      "Birth Certificate": { uploaded: true, verified: true },
      "B-Form (Child CNIC)": { uploaded: true, verified: true },
      "School Leaving Cert": { uploaded: true, verified: true },
      "Student Photo": { uploaded: true, verified: true },
      "Medical Fitness Cert": { uploaded: true, verified: true },
    },
    joining_date: null,
    fee_deadline: null,
    offer_date: null,
  },
};

export type SectionKey =
  | "dashboard"
  | "status"
  | "documents"
  | "challan"
  | "payment"
  | "admit"
  | "result"
  | "interview"
  | "offer"
  | "admission_fee"
  | "joining"
  | "reapply"
  | "settings";
