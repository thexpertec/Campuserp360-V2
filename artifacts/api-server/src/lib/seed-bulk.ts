/**
 * Bulk demo-data seed — 25 applications across all pipeline statuses,
 * plus subjects seeded and linked to classes.
 *
 * Sentinel: the presence of application CCM-2026-BULK01 means this seed
 * has already run. Safe to re-deploy.
 */
import {
  db,
  applicationsTable,
  applicationEventsTable,
  classesTable,
  sectionsTable,
  subjectsTable,
  classSectionsTable,
  classSubjectsTable,
  tenantsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_SLUG = (process.env["DEFAULT_TENANT_SLUG"] ?? "ccm").toLowerCase();
async function resolveCcmTenantId(): Promise<string | null> {
  const [row] = await db.select({ id: tenantsTable.id }).from(tenantsTable)
    .where(eq(tenantsTable.slug, DEFAULT_SLUG)).limit(1);
  return row?.id ?? null;
}
import { logger } from "./logger";

const SENTINEL = "CCM-2026-BULK01";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number): Date {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setHours(9, 0, 0, 0);
  return d;
}

// ─── Application data ────────────────────────────────────────────────────────

type AppRow = {
  referenceId: string;
  session: string;
  classApplying: string;
  previousMarks: string;
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  religion: string;
  studentMobile: string;
  studentEmail: string;
  presentAddress: string;
  state: string;
  city: string;
  examCenter: string;
  guardianName: string;
  relation: string;
  fatherName: string;
  occupation: string;
  guardianMobile: string;
  parentCnic: string;
  parentCnicLast4: string;
  status: string;
  rollNumber?: string;
  testDate?: Date;
  resultMarks?: number;
  interviewDate?: Date;
  interviewMarks?: number;
  meritScore?: number;
  createdAt: Date;
};

const APPS: AppRow[] = [
  // ── RECEIVED (8) ──────────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK01",
    session: "2026-2027", classApplying: "class-9", previousMarks: "78",
    fullName: "Muhammad Ali",
    dateOfBirth: "2011-03-12", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0300-2345678", studentEmail: "m.ali.2026@gmail.com",
    presentAddress: "House 22, Block B, North Karachi", state: "Sindh", city: "Karachi", examCenter: "Karachi",
    guardianName: "Mr. Tariq Ali", relation: "Father", fatherName: "Mr. Tariq Ali",
    occupation: "Businessman", guardianMobile: "0333-2345678",
    parentCnic: "42201-1234567-1", parentCnicLast4: "1234",
    status: "received", createdAt: daysAgo(3),
  },
  {
    referenceId: "CCM-2026-BULK02",
    session: "2026-2027", classApplying: "class-7", previousMarks: "91",
    fullName: "Hamza Raza",
    dateOfBirth: "2013-07-22", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0301-3456789", studentEmail: "hamza.raza@yahoo.com",
    presentAddress: "67 Gulberg III, Lahore", state: "Punjab", city: "Lahore", examCenter: "Lahore",
    guardianName: "Col. (R) Asim Raza", relation: "Father", fatherName: "Col. (R) Asim Raza",
    occupation: "Retired Army Officer", guardianMobile: "0321-3456789",
    parentCnic: "35202-9876543-2", parentCnicLast4: "9876",
    status: "received", createdAt: daysAgo(4),
  },
  {
    referenceId: "CCM-2026-BULK03",
    session: "2026-2027", classApplying: "class-11-preengineering", previousMarks: "82",
    fullName: "Abdullah Malik",
    dateOfBirth: "2009-11-05", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0315-4567890", studentEmail: "abdullah.malik@live.com",
    presentAddress: "Street 4, Chaklala Scheme 3, Rawalpindi", state: "Punjab", city: "Rawalpindi", examCenter: "Rawalpindi",
    guardianName: "Mr. Saleem Malik", relation: "Father", fatherName: "Mr. Saleem Malik",
    occupation: "Engineer", guardianMobile: "0345-4567890",
    parentCnic: "37405-1122334-3", parentCnicLast4: "1122",
    status: "received", createdAt: daysAgo(2),
  },
  {
    referenceId: "CCM-2026-BULK04",
    session: "2026-2027", classApplying: "class-9", previousMarks: "65",
    fullName: "Bilal Hussain",
    dateOfBirth: "2011-01-30", bloodGroup: "AB+", religion: "Islam",
    studentMobile: "0302-5678901", studentEmail: "bilal.h.2026@gmail.com",
    presentAddress: "House 7, F-8/4, Islamabad", state: "Islamabad Capital Territory", city: "Islamabad", examCenter: "Islamabad",
    guardianName: "Dr. Imtiaz Hussain", relation: "Father", fatherName: "Dr. Imtiaz Hussain",
    occupation: "Doctor", guardianMobile: "0312-5678901",
    parentCnic: "61101-9988776-4", parentCnicLast4: "9988",
    status: "received", createdAt: daysAgo(1),
  },
  {
    referenceId: "CCM-2026-BULK05",
    session: "2026-2027", classApplying: "class-11-premedical", previousMarks: "88",
    fullName: "Usman Farooq",
    dateOfBirth: "2009-09-15", bloodGroup: "O-", religion: "Islam",
    studentMobile: "0316-6789012", studentEmail: "usman.farooq@hotmail.com",
    presentAddress: "Gulshan-e-Iqbal, Peshawar", state: "Khyber Pakhtunkhwa", city: "Peshawar", examCenter: "Peshawar",
    guardianName: "Mr. Junaid Farooq", relation: "Father", fatherName: "Mr. Junaid Farooq",
    occupation: "Government Officer", guardianMobile: "0333-6789012",
    parentCnic: "17301-2233445-5", parentCnicLast4: "2233",
    status: "received", createdAt: daysAgo(5),
  },
  {
    referenceId: "CCM-2026-BULK06",
    session: "2026-2027", classApplying: "class-7", previousMarks: "76",
    fullName: "Faisal Iqbal",
    dateOfBirth: "2013-05-08", bloodGroup: "B-", religion: "Islam",
    studentMobile: "0303-7890123", studentEmail: "faisal.iqbal2026@gmail.com",
    presentAddress: "Bosan Road, Multan", state: "Punjab", city: "Multan", examCenter: "Multan",
    guardianName: "Mr. Khalid Iqbal", relation: "Father", fatherName: "Mr. Khalid Iqbal",
    occupation: "Landlord", guardianMobile: "0303-7890124",
    parentCnic: "36302-3344556-6", parentCnicLast4: "3344",
    status: "received", createdAt: daysAgo(6),
  },
  {
    referenceId: "CCM-2026-BULK07",
    session: "2026-2027", classApplying: "class-8", previousMarks: "84",
    fullName: "Zain Ahmed",
    dateOfBirth: "2012-12-20", bloodGroup: "A-", religion: "Islam",
    studentMobile: "0317-8901234", studentEmail: "zain.ahmed.jr@gmail.com",
    presentAddress: "Satellite Town, Quetta", state: "Balochistan", city: "Quetta", examCenter: "Quetta",
    guardianName: "Lt. Col. (R) Riaz Ahmed", relation: "Father", fatherName: "Lt. Col. (R) Riaz Ahmed",
    occupation: "Retired Army Officer", guardianMobile: "0313-8901234",
    parentCnic: "54400-4455667-7", parentCnicLast4: "4455",
    status: "received", createdAt: daysAgo(7),
  },
  {
    referenceId: "CCM-2026-BULK08",
    session: "2026-2027", classApplying: "class-11-ics", previousMarks: "71",
    fullName: "Omar Siddiqui",
    dateOfBirth: "2009-04-03", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0304-9012345", studentEmail: "omar.siddiqui9@gmail.com",
    presentAddress: "D Ground, Faisalabad", state: "Punjab", city: "Faisalabad", examCenter: "Lahore",
    guardianName: "Mr. Asher Siddiqui", relation: "Father", fatherName: "Mr. Asher Siddiqui",
    occupation: "Textile Business", guardianMobile: "0344-9012345",
    parentCnic: "33100-5566778-8", parentCnicLast4: "5566",
    status: "received", createdAt: daysAgo(8),
  },

  // ── VERIFIED (4) ──────────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK09",
    session: "2026-2027", classApplying: "class-9", previousMarks: "89",
    fullName: "Saad Mirza",
    dateOfBirth: "2011-08-14", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0318-0123456", studentEmail: "saad.mirza.ccm@gmail.com",
    presentAddress: "Latifabad, Hyderabad", state: "Sindh", city: "Hyderabad", examCenter: "Karachi",
    guardianName: "Mr. Waqar Mirza", relation: "Father", fatherName: "Mr. Waqar Mirza",
    occupation: "Civil Servant", guardianMobile: "0348-0123456",
    parentCnic: "41303-6677889-9", parentCnicLast4: "6677",
    status: "verified", createdAt: daysAgo(14),
  },
  {
    referenceId: "CCM-2026-BULK10",
    session: "2026-2027", classApplying: "class-7", previousMarks: "93",
    fullName: "Arslan Qureshi",
    dateOfBirth: "2013-02-17", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0305-1234560", studentEmail: "arslan.qureshi.2026@gmail.com",
    presentAddress: "Model Town, Sialkot", state: "Punjab", city: "Sialkot", examCenter: "Lahore",
    guardianName: "Mr. Naveed Qureshi", relation: "Father", fatherName: "Mr. Naveed Qureshi",
    occupation: "Exporter", guardianMobile: "0346-1234560",
    parentCnic: "34603-7788990-1", parentCnicLast4: "7788",
    status: "verified", createdAt: daysAgo(12),
  },
  {
    referenceId: "CCM-2026-BULK11",
    session: "2026-2027", classApplying: "class-11-premedical", previousMarks: "92",
    fullName: "Talha Chaudhry",
    dateOfBirth: "2009-06-28", bloodGroup: "AB-", religion: "Islam",
    studentMobile: "0319-2345601", studentEmail: "talha.ch.2026@yahoo.com",
    presentAddress: "GT Road, Gujranwala", state: "Punjab", city: "Gujranwala", examCenter: "Lahore",
    guardianName: "Mr. Tariq Chaudhry", relation: "Father", fatherName: "Mr. Tariq Chaudhry",
    occupation: "Steel Mill Owner", guardianMobile: "0349-2345601",
    parentCnic: "34101-8899001-2", parentCnicLast4: "8899",
    status: "verified", createdAt: daysAgo(11),
  },
  {
    referenceId: "CCM-2026-BULK12",
    session: "2026-2027", classApplying: "class-9", previousMarks: "74",
    fullName: "Danish Bukhari",
    dateOfBirth: "2011-10-09", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0306-3456012", studentEmail: "danish.bukhari7@gmail.com",
    presentAddress: "Abbottabad Cantonment, Abbottabad", state: "Khyber Pakhtunkhwa", city: "Abbottabad", examCenter: "Islamabad",
    guardianName: "Maj. (R) Kamran Bukhari", relation: "Father", fatherName: "Maj. (R) Kamran Bukhari",
    occupation: "Retired Army Officer", guardianMobile: "0336-3456012",
    parentCnic: "13302-9900112-3", parentCnicLast4: "9900",
    status: "verified", createdAt: daysAgo(13),
  },

  // ── TEST SCHEDULED (5) ────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK13",
    session: "2026-2027", classApplying: "class-9", previousMarks: "81",
    fullName: "Imran Nawaz",
    dateOfBirth: "2011-09-01", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0320-4567023", studentEmail: "imran.nawaz.ccm@gmail.com",
    presentAddress: "Civil Lines, Bahawalpur", state: "Punjab", city: "Bahawalpur", examCenter: "Lahore",
    guardianName: "Mr. Azhar Nawaz", relation: "Father", fatherName: "Mr. Azhar Nawaz",
    occupation: "Farmer", guardianMobile: "0350-4567023",
    parentCnic: "31301-1011121-4", parentCnicLast4: "1011",
    status: "test_scheduled", rollNumber: "CCM-2026-0101", testDate: daysFromNow(14),
    createdAt: daysAgo(18),
  },
  {
    referenceId: "CCM-2026-BULK14",
    session: "2026-2027", classApplying: "class-7", previousMarks: "87",
    fullName: "Haris Zaidi",
    dateOfBirth: "2013-04-11", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0307-5678034", studentEmail: "haris.zaidi.2026@hotmail.com",
    presentAddress: "New Sukkur, Sukkur", state: "Sindh", city: "Sukkur", examCenter: "Karachi",
    guardianName: "Mr. Zubair Zaidi", relation: "Father", fatherName: "Mr. Zubair Zaidi",
    occupation: "Trader", guardianMobile: "0337-5678034",
    parentCnic: "45503-2122232-5", parentCnicLast4: "2122",
    status: "test_scheduled", rollNumber: "CCM-2026-0102", testDate: daysFromNow(14),
    createdAt: daysAgo(20),
  },
  {
    referenceId: "CCM-2026-BULK15",
    session: "2026-2027", classApplying: "class-11-preengineering", previousMarks: "86",
    fullName: "Jawad Hashmi",
    dateOfBirth: "2009-12-25", bloodGroup: "O-", religion: "Islam",
    studentMobile: "0321-6789045", studentEmail: "jawad.hashmi.eng@gmail.com",
    presentAddress: "Cantonment Board, Mardan", state: "Khyber Pakhtunkhwa", city: "Mardan", examCenter: "Peshawar",
    guardianName: "Wg. Cdr. (R) Rehan Hashmi", relation: "Father", fatherName: "Wg. Cdr. (R) Rehan Hashmi",
    occupation: "Retired PAF Officer", guardianMobile: "0351-6789045",
    parentCnic: "16202-3233343-6", parentCnicLast4: "3233",
    status: "test_scheduled", rollNumber: "CCM-2026-0103", testDate: daysFromNow(14),
    createdAt: daysAgo(22),
  },
  {
    referenceId: "CCM-2026-BULK16",
    session: "2026-2027", classApplying: "class-9", previousMarks: "79",
    fullName: "Khalid Rehman",
    dateOfBirth: "2011-07-19", bloodGroup: "A-", religion: "Islam",
    studentMobile: "0308-7890056", studentEmail: "khalid.rehman1@gmail.com",
    presentAddress: "Circular Road, Sahiwal", state: "Punjab", city: "Sahiwal", examCenter: "Lahore",
    guardianName: "Mr. Pervaiz Rehman", relation: "Father", fatherName: "Mr. Pervaiz Rehman",
    occupation: "Bank Manager", guardianMobile: "0338-7890056",
    parentCnic: "36501-4344454-7", parentCnicLast4: "4344",
    status: "test_scheduled", rollNumber: "CCM-2026-0104", testDate: daysFromNow(21),
    createdAt: daysAgo(19),
  },
  {
    referenceId: "CCM-2026-BULK17",
    session: "2026-2027", classApplying: "class-11-ics", previousMarks: "83",
    fullName: "Nasir Khan",
    dateOfBirth: "2009-03-07", bloodGroup: "B-", religion: "Islam",
    studentMobile: "0322-8901067", studentEmail: "nasir.khan.ics@gmail.com",
    presentAddress: "Nowshera Cantonment", state: "Khyber Pakhtunkhwa", city: "Nowshera", examCenter: "Peshawar",
    guardianName: "Capt. (R) Aman Khan", relation: "Father", fatherName: "Capt. (R) Aman Khan",
    occupation: "Retired Army Officer", guardianMobile: "0352-8901067",
    parentCnic: "17101-5455565-8", parentCnicLast4: "5455",
    status: "test_scheduled", rollNumber: "CCM-2026-0105", testDate: daysFromNow(21),
    createdAt: daysAgo(21),
  },

  // ── RESULT ENTERED (4) ────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK18",
    session: "2026-2027", classApplying: "class-9", previousMarks: "85",
    fullName: "Rafay Anwar",
    dateOfBirth: "2011-05-23", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0309-9012078", studentEmail: "rafay.anwar.ccm@gmail.com",
    presentAddress: "Khushab City", state: "Punjab", city: "Khushab", examCenter: "Rawalpindi",
    guardianName: "Mr. Javed Anwar", relation: "Father", fatherName: "Mr. Javed Anwar",
    occupation: "Accountant", guardianMobile: "0339-9012078",
    parentCnic: "38403-6566676-9", parentCnicLast4: "6566",
    status: "result_entered", rollNumber: "CCM-2026-0061", testDate: daysAgo(5),
    resultMarks: 72, createdAt: daysAgo(30),
  },
  {
    referenceId: "CCM-2026-BULK19",
    session: "2026-2027", classApplying: "class-11-premedical", previousMarks: "90",
    fullName: "Shoaib Ali",
    dateOfBirth: "2009-08-16", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0323-0123089", studentEmail: "shoaib.ali.med@gmail.com",
    presentAddress: "DI Khan City", state: "Khyber Pakhtunkhwa", city: "Dera Ismail Khan", examCenter: "Peshawar",
    guardianName: "Dr. Kamal Ali", relation: "Father", fatherName: "Dr. Kamal Ali",
    occupation: "Physician", guardianMobile: "0353-0123089",
    parentCnic: "21101-7677787-1", parentCnicLast4: "7677",
    status: "result_entered", rollNumber: "CCM-2026-0062", testDate: daysAgo(5),
    resultMarks: 81, createdAt: daysAgo(32),
  },
  {
    referenceId: "CCM-2026-BULK20",
    session: "2026-2027", classApplying: "class-7", previousMarks: "88",
    fullName: "Tariq Mehmood",
    dateOfBirth: "2013-01-29", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0310-1234500", studentEmail: "tariq.mehmood.ajk@gmail.com",
    presentAddress: "Mirpur City, AJK", state: "Azad Jammu & Kashmir", city: "Mirpur", examCenter: "Rawalpindi",
    guardianName: "Mr. Shahid Mehmood", relation: "Father", fatherName: "Mr. Shahid Mehmood",
    occupation: "Overseas Pakistani", guardianMobile: "0340-1234500",
    parentCnic: "82203-8788898-2", parentCnicLast4: "8788",
    status: "result_entered", rollNumber: "CCM-2026-0063", testDate: daysAgo(5),
    resultMarks: 65, createdAt: daysAgo(28),
  },
  {
    referenceId: "CCM-2026-BULK21",
    session: "2026-2027", classApplying: "class-11-preengineering", previousMarks: "77",
    fullName: "Asad Latif",
    dateOfBirth: "2009-10-11", bloodGroup: "O-", religion: "Islam",
    studentMobile: "0324-2345511", studentEmail: "asad.latif.gilgit@gmail.com",
    presentAddress: "Gilgit City, GB", state: "Gilgit-Baltistan", city: "Gilgit", examCenter: "Islamabad",
    guardianName: "Mr. Bashir Latif", relation: "Father", fatherName: "Mr. Bashir Latif",
    occupation: "Government Officer", guardianMobile: "0354-2345511",
    parentCnic: "25100-9899009-3", parentCnicLast4: "9899",
    status: "result_entered", rollNumber: "CCM-2026-0064", testDate: daysAgo(5),
    resultMarks: 58, createdAt: daysAgo(27),
  },

  // ── INTERVIEW SCHEDULED (3) ───────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK22",
    session: "2026-2027", classApplying: "class-9", previousMarks: "83",
    fullName: "Babar Niaz",
    dateOfBirth: "2011-06-14", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0311-3456522", studentEmail: "babar.niaz.ccm@gmail.com",
    presentAddress: "Attock Cantonment", state: "Punjab", city: "Attock", examCenter: "Rawalpindi",
    guardianName: "Maj. (R) Shahzad Niaz", relation: "Father", fatherName: "Maj. (R) Shahzad Niaz",
    occupation: "Retired Army Officer", guardianMobile: "0341-3456522",
    parentCnic: "38101-0010111-4", parentCnicLast4: "0010",
    status: "interview_scheduled", rollNumber: "CCM-2026-0031",
    testDate: daysAgo(12), resultMarks: 78,
    interviewDate: daysFromNow(7), createdAt: daysAgo(40),
  },
  {
    referenceId: "CCM-2026-BULK23",
    session: "2026-2027", classApplying: "class-11-premedical", previousMarks: "91",
    fullName: "Danial Shah",
    dateOfBirth: "2009-02-28", bloodGroup: "B-", religion: "Islam",
    studentMobile: "0325-4567533", studentEmail: "danial.shah.med@gmail.com",
    presentAddress: "Chitral Town", state: "Khyber Pakhtunkhwa", city: "Chitral", examCenter: "Peshawar",
    guardianName: "Mr. Noor Shah", relation: "Father", fatherName: "Mr. Noor Shah",
    occupation: "Agriculturist", guardianMobile: "0355-4567533",
    parentCnic: "15401-1112213-5", parentCnicLast4: "1112",
    status: "interview_scheduled", rollNumber: "CCM-2026-0032",
    testDate: daysAgo(12), resultMarks: 85,
    interviewDate: daysFromNow(7), createdAt: daysAgo(42),
  },
  {
    referenceId: "CCM-2026-BULK24",
    session: "2026-2027", classApplying: "class-7", previousMarks: "95",
    fullName: "Farhan Toor",
    dateOfBirth: "2013-09-03", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0312-5678544", studentEmail: "farhan.toor.ccm@gmail.com",
    presentAddress: "Jhelum Cantonment", state: "Punjab", city: "Jhelum", examCenter: "Rawalpindi",
    guardianName: "Brig. (R) Nadeem Toor", relation: "Father", fatherName: "Brig. (R) Nadeem Toor",
    occupation: "Retired Army Officer", guardianMobile: "0342-5678544",
    parentCnic: "37203-2223324-6", parentCnicLast4: "2223",
    status: "interview_scheduled", rollNumber: "CCM-2026-0033",
    testDate: daysAgo(12), resultMarks: 90,
    interviewDate: daysFromNow(7), createdAt: daysAgo(38),
  },

  // ── MERIT LIST (3) ────────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK25",
    session: "2026-2027", classApplying: "class-9", previousMarks: "90",
    fullName: "Ghulam Hassan",
    dateOfBirth: "2011-04-06", bloodGroup: "A-", religion: "Islam",
    studentMobile: "0326-6789555", studentEmail: "ghulam.hassan.ccm@gmail.com",
    presentAddress: "New Larkana, Sindh", state: "Sindh", city: "Larkana", examCenter: "Karachi",
    guardianName: "Mr. Abdul Hassan", relation: "Father", fatherName: "Mr. Abdul Hassan",
    occupation: "Advocate", guardianMobile: "0356-6789555",
    parentCnic: "44103-3334435-7", parentCnicLast4: "3334",
    status: "merit_list", rollNumber: "CCM-2026-0011",
    testDate: daysAgo(20), resultMarks: 88,
    interviewDate: daysAgo(8), interviewMarks: 17, meritScore: 73,
    createdAt: daysAgo(50),
  },
  {
    referenceId: "CCM-2026-BULK26",
    session: "2026-2027", classApplying: "class-11-preengineering", previousMarks: "94",
    fullName: "Kamran Sheikh",
    dateOfBirth: "2009-07-21", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0313-7890566", studentEmail: "kamran.sheikh.eng@gmail.com",
    presentAddress: "DHA Phase 5, Lahore", state: "Punjab", city: "Lahore", examCenter: "Lahore",
    guardianName: "Mr. Imran Sheikh", relation: "Father", fatherName: "Mr. Imran Sheikh",
    occupation: "CEO, Tech Company", guardianMobile: "0343-7890566",
    parentCnic: "35202-4445546-8", parentCnicLast4: "4445",
    status: "merit_list", rollNumber: "CCM-2026-0012",
    testDate: daysAgo(20), resultMarks: 91,
    interviewDate: daysAgo(8), interviewMarks: 19, meritScore: 78,
    createdAt: daysAgo(52),
  },
  {
    referenceId: "CCM-2026-BULK27",
    session: "2026-2027", classApplying: "class-7", previousMarks: "96",
    fullName: "Umer Fareed",
    dateOfBirth: "2013-11-15", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0327-8901577", studentEmail: "umer.fareed.seven@gmail.com",
    presentAddress: "Gulshan-e-Ravi, Lahore", state: "Punjab", city: "Lahore", examCenter: "Lahore",
    guardianName: "Mr. Khalil Fareed", relation: "Father", fatherName: "Mr. Khalil Fareed",
    occupation: "Professor", guardianMobile: "0357-8901577",
    parentCnic: "35201-5556657-9", parentCnicLast4: "5556",
    status: "merit_list", rollNumber: "CCM-2026-0013",
    testDate: daysAgo(20), resultMarks: 94,
    interviewDate: daysAgo(8), interviewMarks: 20, meritScore: 82,
    createdAt: daysAgo(48),
  },

  // ── ADMITTED (3) ─────────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK28",
    session: "2026-2027", classApplying: "class-9", previousMarks: "92",
    fullName: "Raheel Akram",
    dateOfBirth: "2011-02-18", bloodGroup: "A+", religion: "Islam",
    studentMobile: "0314-9012588", studentEmail: "raheel.akram.ccm@gmail.com",
    presentAddress: "Clifton, Karachi", state: "Sindh", city: "Karachi", examCenter: "Karachi",
    guardianName: "Adm. (R) Akram Hussain", relation: "Father", fatherName: "Adm. (R) Akram Hussain",
    occupation: "Retired Navy Officer", guardianMobile: "0344-9012588",
    parentCnic: "42201-6667768-1", parentCnicLast4: "6667",
    status: "admitted", rollNumber: "CCM-2026-0001",
    testDate: daysAgo(30), resultMarks: 93,
    interviewDate: daysAgo(15), interviewMarks: 23, meritScore: 81,
    createdAt: daysAgo(60),
  },
  {
    referenceId: "CCM-2026-BULK29",
    session: "2026-2027", classApplying: "class-11-premedical", previousMarks: "95",
    fullName: "Sarmad Javed",
    dateOfBirth: "2009-05-10", bloodGroup: "B+", religion: "Islam",
    studentMobile: "0328-0123599", studentEmail: "sarmad.javed.med@gmail.com",
    presentAddress: "Model Town, Lahore", state: "Punjab", city: "Lahore", examCenter: "Lahore",
    guardianName: "Prof. Dr. Javed Iqbal", relation: "Father", fatherName: "Prof. Dr. Javed Iqbal",
    occupation: "University Professor", guardianMobile: "0358-0123599",
    parentCnic: "35202-7778879-2", parentCnicLast4: "7778",
    status: "admitted", rollNumber: "CCM-2026-0002",
    testDate: daysAgo(30), resultMarks: 95,
    interviewDate: daysAgo(15), interviewMarks: 24, meritScore: 84,
    createdAt: daysAgo(62),
  },
  {
    referenceId: "CCM-2026-BULK30",
    session: "2026-2027", classApplying: "class-7", previousMarks: "98",
    fullName: "Azan Butt",
    dateOfBirth: "2013-08-22", bloodGroup: "O-", religion: "Islam",
    studentMobile: "0315-1234600", studentEmail: "azan.butt.ccm@gmail.com",
    presentAddress: "Bahria Town Phase 7, Rawalpindi", state: "Punjab", city: "Rawalpindi", examCenter: "Rawalpindi",
    guardianName: "Air Cdre. (R) Adeel Butt", relation: "Father", fatherName: "Air Cdre. (R) Adeel Butt",
    occupation: "Retired PAF Officer", guardianMobile: "0345-1234600",
    parentCnic: "37405-8889980-3", parentCnicLast4: "8889",
    status: "admitted", rollNumber: "CCM-2026-0003",
    testDate: daysAgo(30), resultMarks: 97,
    interviewDate: daysAgo(15), interviewMarks: 25, meritScore: 86,
    createdAt: daysAgo(58),
  },

  // ── REJECTED (2) ──────────────────────────────────────────────────────────
  {
    referenceId: "CCM-2026-BULK31",
    session: "2026-2027", classApplying: "class-9", previousMarks: "52",
    fullName: "Waqar Zaman",
    dateOfBirth: "2011-11-27", bloodGroup: "AB+", religion: "Islam",
    studentMobile: "0329-2345611", studentEmail: "waqar.zaman1@gmail.com",
    presentAddress: "Satellite Town, Rawalpindi", state: "Punjab", city: "Rawalpindi", examCenter: "Rawalpindi",
    guardianName: "Mr. Fareed Zaman", relation: "Father", fatherName: "Mr. Fareed Zaman",
    occupation: "Driver", guardianMobile: "0359-2345611",
    parentCnic: "37405-9990091-4", parentCnicLast4: "9990",
    status: "rejected", rollNumber: "CCM-2026-0071",
    testDate: daysAgo(18), resultMarks: 28, createdAt: daysAgo(35),
  },
  {
    referenceId: "CCM-2026-BULK32",
    session: "2026-2027", classApplying: "class-11-preengineering", previousMarks: "61",
    fullName: "Raza Gillani",
    dateOfBirth: "2009-01-14", bloodGroup: "O+", religion: "Islam",
    studentMobile: "0316-3456622", studentEmail: "raza.gillani.eng@gmail.com",
    presentAddress: "Johar Town, Lahore", state: "Punjab", city: "Lahore", examCenter: "Lahore",
    guardianName: "Mr. Sardar Gillani", relation: "Father", fatherName: "Mr. Sardar Gillani",
    occupation: "Politician", guardianMobile: "0346-3456622",
    parentCnic: "35202-0001102-5", parentCnicLast4: "0001",
    status: "rejected", rollNumber: "CCM-2026-0072",
    testDate: daysAgo(18), resultMarks: 35, createdAt: daysAgo(37),
  },
];

// ─── Subjects ────────────────────────────────────────────────────────────────

const SUBJECTS = [
  { code: "URDU",    name: "Urdu",                type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "ENG",     name: "English",             type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "MATH",    name: "Mathematics",         type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "GEN-SCI", name: "General Science",     type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "SOC-ST",  name: "Social Studies",      type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "PAK-ST",  name: "Pakistan Studies",    type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "ISL-ED",  name: "Islamic Education",   type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "PHY",     name: "Physics",             type: "combined", maxMarks: 85,  passMarks: 29 },
  { code: "CHEM",    name: "Chemistry",           type: "combined", maxMarks: 85,  passMarks: 29 },
  { code: "BIO",     name: "Biology",             type: "combined", maxMarks: 85,  passMarks: 29 },
  { code: "CS",      name: "Computer Science",    type: "combined", maxMarks: 75,  passMarks: 25 },
  { code: "STAT",    name: "Statistics",          type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "HIST",    name: "History",             type: "theory",   maxMarks: 100, passMarks: 33 },
  { code: "GEO",     name: "Geography",           type: "theory",   maxMarks: 100, passMarks: 33 },
];

// Which subject codes belong to which class codes
const CLASS_SUBJECTS: Record<string, string[]> = {
  "class-7":                  ["URDU", "ENG", "MATH", "GEN-SCI", "SOC-ST", "ISL-ED"],
  "class-8":                  ["URDU", "ENG", "MATH", "GEN-SCI", "SOC-ST", "ISL-ED"],
  "class-9":                  ["URDU", "ENG", "MATH", "PHY", "CHEM", "BIO", "PAK-ST", "ISL-ED"],
  "class-11-premedical":      ["URDU", "ENG", "PHY", "CHEM", "BIO", "ISL-ED", "PAK-ST"],
  "class-11-preengineering":  ["URDU", "ENG", "MATH", "PHY", "CHEM", "CS", "ISL-ED", "PAK-ST"],
  "class-11-ics":             ["URDU", "ENG", "MATH", "CS", "STAT", "PHY", "ISL-ED", "PAK-ST"],
};

// ─── Events helper ────────────────────────────────────────────────────────────

function eventsFor(appId: string, app: AppRow) {
  const evts: {
    applicationId: string; eventType: string; title: string; description: string; occurredAt: Date;
  }[] = [];

  evts.push({
    applicationId: appId, eventType: "received",
    title: "Application Received",
    description: "Application submitted successfully via the online portal.",
    occurredAt: app.createdAt,
  });

  if (["verified","test_scheduled","result_entered","interview_scheduled","merit_list","admitted","rejected"].includes(app.status)) {
    evts.push({
      applicationId: appId, eventType: "verified",
      title: "Documents Verified",
      description: "Admissions office reviewed and verified the submitted documents.",
      occurredAt: new Date(app.createdAt.getTime() + 3 * 86_400_000),
    });
  }

  if (app.rollNumber && ["test_scheduled","result_entered","interview_scheduled","merit_list","admitted","rejected"].includes(app.status)) {
    evts.push({
      applicationId: appId, eventType: "test_scheduled",
      title: "Entry Test Scheduled",
      description: `Roll number ${app.rollNumber} issued. Please report at 8:30 AM at the exam centre.`,
      occurredAt: new Date(app.createdAt.getTime() + 7 * 86_400_000),
    });
  }

  if (app.resultMarks !== undefined && ["result_entered","interview_scheduled","merit_list","admitted","rejected"].includes(app.status)) {
    evts.push({
      applicationId: appId, eventType: "result_entered",
      title: "Test Result Entered",
      description: `Entry test marks recorded: ${app.resultMarks}/100.`,
      occurredAt: app.testDate ? new Date(app.testDate.getTime() + 86_400_000) : daysAgo(10),
    });
  }

  if (app.interviewDate && ["interview_scheduled","merit_list","admitted"].includes(app.status)) {
    evts.push({
      applicationId: appId, eventType: "interview_scheduled",
      title: "Interview Scheduled",
      description: `Please attend the selection interview. Bring all original documents.`,
      occurredAt: app.testDate ? new Date(app.testDate.getTime() + 5 * 86_400_000) : daysAgo(8),
    });
  }

  if (app.interviewMarks !== undefined && app.meritScore !== undefined && ["merit_list","admitted"].includes(app.status)) {
    evts.push({
      applicationId: appId, eventType: "merit_list",
      title: "Placed on Merit List",
      description: `Merit score: ${app.meritScore}. Interview marks: ${app.interviewMarks}/25. Awaiting admission decision.`,
      occurredAt: app.interviewDate ? new Date(app.interviewDate.getTime() + 2 * 86_400_000) : daysAgo(5),
    });
  }

  if (app.status === "admitted") {
    evts.push({
      applicationId: appId, eventType: "admitted",
      title: "Admission Confirmed",
      description: `Congratulations! Admission to ${app.classApplying.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} has been confirmed. Fee challan will be dispatched separately.`,
      occurredAt: app.interviewDate ? new Date(app.interviewDate.getTime() + 4 * 86_400_000) : daysAgo(3),
    });
  }

  if (app.status === "rejected") {
    evts.push({
      applicationId: appId, eventType: "rejected",
      title: "Application Not Successful",
      description: "We regret to inform you that the application was not successful in this cycle. You may reapply next year.",
      occurredAt: app.testDate ? new Date(app.testDate.getTime() + 3 * 86_400_000) : daysAgo(5),
    });
  }

  return evts;
}

// ─── Main seed function ───────────────────────────────────────────────────────

export async function seedBulkDemoData(): Promise<void> {
  try {
    const existing = await db
      .select({ id: applicationsTable.id })
      .from(applicationsTable)
      .where(eq(applicationsTable.referenceId, SENTINEL))
      .limit(1);

    if (existing.length > 0) {
      logger.info("Bulk demo data already seeded — skipping");
      return;
    }

    const tenantId = await resolveCcmTenantId();

    // ── 1. Insert applications ────────────────────────────────────────────────
    const inserted = await db
      .insert(applicationsTable)
      .values(APPS.map(a => ({
        referenceId:    a.referenceId,
        session:        a.session,
        classApplying:  a.classApplying,
        previousMarks:  a.previousMarks,
        fullName:       a.fullName,
        dateOfBirth:    a.dateOfBirth,
        bloodGroup:     a.bloodGroup,
        religion:       a.religion,
        studentMobile:  a.studentMobile,
        studentEmail:   a.studentEmail,
        presentAddress: a.presentAddress,
        state:          a.state,
        city:           a.city,
        examCenter:     a.examCenter,
        guardianName:   a.guardianName,
        relation:       a.relation,
        fatherName:     a.fatherName,
        occupation:     a.occupation,
        guardianMobile: a.guardianMobile,
        parentCnic:     a.parentCnic,
        parentCnicLast4: a.parentCnicLast4,
        status:         a.status,
        rollNumber:     a.rollNumber ?? null,
        testDate:       a.testDate ?? null,
        resultMarks:    a.resultMarks ?? null,
        interviewDate:  a.interviewDate ?? null,
        interviewMarks: a.interviewMarks ?? null,
        meritScore:     a.meritScore ?? null,
        createdAt:      a.createdAt,
        tenantId:       tenantId ?? null,
      })))
      .onConflictDoNothing()
      .returning({ id: applicationsTable.id, referenceId: applicationsTable.referenceId });

    logger.info(`Bulk-seeded ${inserted.length} applications`);

    // ── 2. Insert application events ──────────────────────────────────────────
    const allEvents = inserted.flatMap((row) => {
      const appData = APPS.find(a => a.referenceId === row.referenceId)!;
      return eventsFor(row.id, appData);
    });
    await db.insert(applicationEventsTable).values(allEvents);
    logger.info(`Bulk-seeded ${allEvents.length} application events`);

    // ── 3. Seed subjects (skip if already exist) ──────────────────────────────
    const existingSubjects = await db.select().from(subjectsTable);
    let subjectRows = existingSubjects;
    if (existingSubjects.length === 0) {
      subjectRows = await db
        .insert(subjectsTable)
        .values(SUBJECTS.map((s, i) => ({
          code: s.code, name: s.name, type: s.type as "theory" | "practical" | "combined",
          isElective: false, maxMarks: s.maxMarks, passMarks: s.passMarks,
          active: true, sortOrder: i,
        })))
        .returning();
      logger.info(`Seeded ${subjectRows.length} subjects`);
    }
    const subjectByCode = new Map(subjectRows.map(s => [s.code, s.id]));

    // ── 4. Link subjects to classes (skip if any links already exist) ─────────
    const existingClassSubjects = await db.select({ id: classSubjectsTable.id }).from(classSubjectsTable).limit(1);
    if (existingClassSubjects.length === 0) {
      const classRows = await db.select({ id: classesTable.id, code: classesTable.code }).from(classesTable);
      const classLinks: { classId: string; subjectId: string; sortOrder: number }[] = [];
      for (const cls of classRows) {
        const subjectCodes = CLASS_SUBJECTS[cls.code] ?? [];
        subjectCodes.forEach((code, i) => {
          const subId = subjectByCode.get(code);
          if (subId) classLinks.push({ classId: cls.id, subjectId: subId, sortOrder: i });
        });
      }
      if (classLinks.length > 0) {
        await db.insert(classSubjectsTable).values(classLinks);
        logger.info(`Linked subjects to classes (${classLinks.length} links)`);
      }
    }

    // ── 5. Link sections to all classes (skip if any links already exist) ─────
    const existingClassSections = await db.select({ id: classSectionsTable.id }).from(classSectionsTable).limit(1);
    if (existingClassSections.length === 0) {
      const classRows = await db.select({ id: classesTable.id }).from(classesTable);
      const sectionRows = await db.select({ id: sectionsTable.id }).from(sectionsTable);
      const sectionLinks: { classId: string; sectionId: string; sortOrder: number }[] = [];
      for (const cls of classRows) {
        sectionRows.forEach((sec, i) => {
          sectionLinks.push({ classId: cls.id, sectionId: sec.id, sortOrder: i });
        });
      }
      if (sectionLinks.length > 0) {
        await db.insert(classSectionsTable).values(sectionLinks);
        logger.info(`Linked sections to classes (${sectionLinks.length} links)`);
      }
    }

    logger.info("Bulk demo seed complete");
  } catch (err) {
    logger.error({ err }, "Failed to seed bulk demo data");
  }
}
