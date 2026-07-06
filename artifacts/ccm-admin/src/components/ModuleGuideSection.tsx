import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Step = {
  title: string;
  description: string;
};

type GuideConfig = {
  gradient: string;
  overview: string;
  steps: Step[];
};

const GUIDES: Record<string, GuideConfig> = {
  admissions: {
    gradient: "from-violet-500 to-purple-600",
    overview: "Manage the full applicant lifecycle — from receiving applications through to final enrollment.",
    steps: [
      { title: "Receive Applications", description: "New applications arrive via the website. Review them under the Applications tab." },
      { title: "Verify Documents", description: "Check submitted documents and mark each application as Verified or request corrections." },
      { title: "Schedule Entry Test", description: "Set test dates, assign venues and print admit cards from the Entry Test tab." },
      { title: "Record Test Results", description: "Enter marks for each candidate. The system auto-calculates qualifying scores." },
      { title: "Conduct Interviews", description: "Schedule and record interview scores under the Interview tab." },
      { title: "Generate Merit List", description: "Configure the merit formula and publish the ranked list for public announcement." },
      { title: "Enroll Candidates", description: "Accept selections, assign Applicant IDs and finalize enrollment under the Enrollment tab." },
    ],
  },
  finance: {
    gradient: "from-emerald-500 to-teal-600",
    overview: "Handle the complete fee cycle — from defining fee structures to tracking collections and overdue accounts.",
    steps: [
      { title: "Define Fee Types", description: "Go to Fee Master and create fee categories (Tuition, Hostel, Transport, etc.)." },
      { title: "Build Fee Schedule", description: "Assign fee amounts to each class and term under the Fee Schedule tab." },
      { title: "Issue Fee Challans", description: "Generate and print challans for students under the Fee Collection tab." },
      { title: "Record Payments", description: "Mark challans as paid when students submit payment receipts." },
      { title: "Review Outstanding", description: "Monitor overdue accounts in the dashboard and send reminders as needed." },
      { title: "Manage Scholarships", description: "Apply concessions or scholarships via the Scholarships tab to adjust fee amounts." },
      { title: "Generate Reports", description: "Export collection summaries, class-wise fee reports and ledger statements." },
    ],
  },
  students: {
    gradient: "from-blue-500 to-indigo-600",
    overview: "Manage enrolled cadets — their records, attendance, house assignments and academic status.",
    steps: [
      { title: "View Student Roster", description: "The Roster tab lists all enrolled students. Use filters to narrow by class, house or status." },
      { title: "Enroll a Student", description: "Click 'Enroll Student' to add a new cadet. Assign a Applicant ID, class and house." },
      { title: "Open Student Profile", description: "Click any student's name to view their full profile — academics, fees, attendance and documents." },
      { title: "Update Records", description: "Edit personal details, guardian contacts and medical info directly in the profile." },
      { title: "Track Attendance", description: "Mark daily attendance class-by-class under the Attendance tab." },
      { title: "Manage Status", description: "Update a student's status (Active, Suspended, Transferred, Alumni) as needed." },
    ],
  },
  hr: {
    gradient: "from-rose-500 to-pink-600",
    overview: "Manage staff records, attendance, payroll and leave — from hiring to contract renewal.",
    steps: [
      { title: "Add Staff Profile", description: "Go to Staff Profiles and create a new record with designation, department and contract details." },
      { title: "Mark Attendance", description: "Record daily staff attendance or import from the biometric system under Attendance." },
      { title: "Configure Salary", description: "Set up pay scales, allowances and deductions per employee under Salary Setup." },
      { title: "Manage Leave", description: "Review and approve leave applications. Leave balances update automatically." },
      { title: "Run Payroll", description: "Generate monthly payroll slips under the Payroll tab after verifying attendance." },
      { title: "Renew Contracts", description: "Monitor contract expiry dates on the dashboard and renew before the deadline." },
    ],
  },
  hostel: {
    gradient: "from-orange-500 to-amber-600",
    overview: "Manage dormitory blocks, bed allocations, visitor logs and maintenance requests.",
    steps: [
      { title: "Set Up Blocks & Rooms", description: "Configure dormitory blocks, floors and room capacity under the Blocks tab." },
      { title: "Allocate Beds", description: "Assign students to specific rooms and beds at the start of each session." },
      { title: "Track Occupancy", description: "The dashboard shows live occupancy rates by block. Manage check-ins and check-outs." },
      { title: "Log Visitors", description: "Record parent/guardian visits with entry and exit times under the Visitors tab." },
      { title: "Manage Maintenance", description: "Raise and track maintenance requests (plumbing, electrical, furniture) per room." },
      { title: "Monitor Discipline", description: "Log conduct issues or leave passes and link them to the student's record." },
    ],
  },
  store: {
    gradient: "from-orange-500 to-amber-600",
    overview: "Track institution assets and consumables — from receiving stock to issuing items and raising purchase orders.",
    steps: [
      { title: "Register Assets", description: "Add new assets to the Asset Register with category, value and location." },
      { title: "Receive Stock", description: "Log incoming items against purchase orders under the Receive Stock tab." },
      { title: "Issue to Departments", description: "Record items issued to departments or individual students. Stock deducts automatically." },
      { title: "Monitor Low Stock", description: "The dashboard highlights items below reorder level. Raise purchase requisitions promptly." },
      { title: "Create Purchase Orders", description: "Generate POs under the Procurement tab for approval and dispatch to suppliers." },
      { title: "Issue Cadet Kits", description: "Use the Kit Issue tab to track uniform and equipment issued to each cadet." },
    ],
  },
  library: {
    gradient: "from-teal-500 to-emerald-600",
    overview: "Catalog books, manage issue and return cycles, and track fines across the library.",
    steps: [
      { title: "Catalog Books", description: "Add new titles under the Catalog tab with ISBN, category, author and copies." },
      { title: "Register Members", description: "All enrolled students and staff are auto-registered. Verify membership under Members." },
      { title: "Issue Books", description: "Go to Issue/Return, search the member and title, and record the issue date." },
      { title: "Process Returns", description: "Mark books as returned. The system auto-calculates overdue days and fines." },
      { title: "Collect Fines", description: "Record fine payments against overdue returns. Dashboard tracks total fines outstanding." },
      { title: "Generate Reports", description: "Export circulation statistics, most-borrowed titles and member activity reports." },
    ],
  },
  medical: {
    gradient: "from-red-500 to-rose-600",
    overview: "Manage patient visits, treatment records, medicine stock and referrals in the sick bay.",
    steps: [
      { title: "Register a Visit", description: "Log a new sick bay visit with patient name, complaint and date/time." },
      { title: "Record Symptoms", description: "Document symptoms and initial observations for the patient's medical record." },
      { title: "Administer Treatment", description: "Record treatment given and medicines dispensed. Stock deducts automatically." },
      { title: "Refer if Needed", description: "Mark patients referred to a hospital and document the referral details." },
      { title: "Discharge & Follow-up", description: "Update the patient's status to discharged and add any follow-up notes." },
      { title: "Monitor Stock", description: "Check medicine stock levels on the dashboard. Raise requisitions for low items." },
    ],
  },
  sports: {
    gradient: "from-yellow-500 to-amber-600",
    overview: "Manage sports teams, fixtures, results and equipment across all athletic disciplines.",
    steps: [
      { title: "Create Teams", description: "Set up teams per sport (Cricket, Football, Hockey, etc.) under the Teams tab." },
      { title: "Register Players", description: "Add students to squads. A player can be in multiple sport teams." },
      { title: "Schedule Fixtures", description: "Create match fixtures with date, venue and opponent under Fixtures." },
      { title: "Record Results", description: "After each match, enter the score and outcome. Win/loss stats update automatically." },
      { title: "Track Standings", description: "The dashboard shows cumulative win rates and trophy count per sport." },
      { title: "Manage Equipment", description: "Link issued equipment to the Inventory module. Track usage per team." },
    ],
  },
  transport: {
    gradient: "from-sky-500 to-blue-600",
    overview: "Manage the school vehicle fleet, routes, drivers and daily trip logs.",
    steps: [
      { title: "Register Vehicles", description: "Add each vehicle with registration number, capacity and current status." },
      { title: "Define Routes", description: "Create routes with stops and assign vehicles to each route." },
      { title: "Assign Drivers", description: "Link drivers to specific vehicles. Maintain licence and expiry records." },
      { title: "Assign Students", description: "Link students to their transport route. This auto-adds the transport fee." },
      { title: "Log Trips", description: "Record daily trips with departure/arrival times and fuel consumption." },
      { title: "Track Maintenance", description: "Log service records and flag overdue maintenance from the dashboard." },
    ],
  },
  timetable: {
    gradient: "from-cyan-500 to-sky-600",
    overview: "Build and publish the weekly class schedule — assigning teachers to periods without conflicts.",
    steps: [
      { title: "Set Academic Year", description: "Confirm the active academic year and session before building a timetable." },
      { title: "Define Periods", description: "Set the number of daily periods and their timings under Periods Setup." },
      { title: "Assign Subjects", description: "Specify which subjects are taught in each class and how many periods per week." },
      { title: "Assign Teachers", description: "Map each teacher to their subjects. The system flags double-bookings." },
      { title: "Resolve Conflicts", description: "Review and fix any scheduling conflicts shown in the Conflicts tab." },
      { title: "Publish Schedule", description: "Once conflict-free, publish the timetable so teachers and students can view it." },
    ],
  },
  syllabus: {
    gradient: "from-teal-500 to-emerald-600",
    overview: "Define curriculum topics, track lesson plan progress and identify subjects falling behind schedule.",
    steps: [
      { title: "Define Topics", description: "Break each subject's syllabus into chapters and topics under the Curriculum tab." },
      { title: "Assign to Classes", description: "Link syllabi to specific class–subject combinations for the active session." },
      { title: "Create Lesson Plans", description: "Teachers add weekly lesson plans linking planned topics to specific dates." },
      { title: "Mark as Covered", description: "Update topics as Covered, In Progress or Pending after each lesson." },
      { title: "Review Coverage", description: "The dashboard shows percentage completion per subject and flags those behind schedule." },
      { title: "Generate Reports", description: "Export syllabus completion reports for each class for parent/board meetings." },
    ],
  },
  exams: {
    gradient: "from-violet-500 to-purple-600",
    overview: "Create exam series, enter results, calculate grades and generate report cards and DMCs.",
    steps: [
      { title: "Create Exam Series", description: "Define an exam series (Mid-Term, Final, etc.) with start and end dates." },
      { title: "Build the Master Datesheet", description: "Plan all classes' paper dates on one grid under the Master Datesheet tab, then save." },
      { title: "Print Admit Cards", description: "Generate and print admit cards for candidates via the Printing module." },
      { title: "Enter Results", description: "Teachers enter marks per student per subject under the Result Entry tab." },
      { title: "Calculate Grades", description: "The system auto-computes grade, percentage and rank once all marks are entered." },
      { title: "Generate DMCs", description: "Produce and print Detailed Marks Certificates for each student from the Printing module." },
    ],
  },
};

export function ModuleGuideSection({ module }: { module: string }) {
  const [open, setOpen] = useState(true);
  const guide = GUIDES[module];
  if (!guide) return null;

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className={cn("h-1 bg-gradient-to-r", guide.gradient)} />
      <CardContent className="px-5 py-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 text-left group"
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-8 w-8 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm shrink-0",
                guide.gradient,
              )}
            >
              <HelpCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-slate-800">
                How to Use This Module
              </p>
              {!open && (
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                  {guide.overview}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {open ? "Collapse" : "Expand"}
            </span>
            {open ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {open && (
          <div className="mt-4">
            <p className="text-[12px] text-slate-500 mb-5 leading-relaxed">
              {guide.overview}
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="flex items-start gap-1 min-w-max">
                {guide.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <div className="flex flex-col items-center text-center w-28 shrink-0">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[13px] font-extrabold shadow-md mb-2 shrink-0",
                          guide.gradient,
                        )}
                      >
                        {i + 1}
                      </div>
                      <p className="text-[12px] font-bold text-slate-700 leading-tight">
                        {step.title}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                        {step.description}
                      </p>
                    </div>
                    {i < guide.steps.length - 1 && (
                      <div className="pt-4 shrink-0">
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
