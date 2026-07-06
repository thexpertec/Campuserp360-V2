import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ClipboardList, FileText, ShieldCheck, BookOpen, Wallet,
  Download, ArrowRight, CheckCircle, CalendarCheck, AlertCircle,
  Loader2, ListChecks, FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EditableText from "@/components/cms/EditableText";
import { withTenant } from "@/lib/tenant-fetch";
import { formatDateLong } from "@/lib/locale";
import type { PageBlocks } from "@/lib/usePageBlocks";
import type { SiteSettings } from "@/lib/site-settings";
import type { PublicClassItem } from "@workspace/api-client-react";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

// ── Static content reused from the previous Admissions tabs ──────────────────

const subjectGroups = [
  { name: "Pre-Medical", subjects: "Physics, Chemistry, Biology" },
  { name: "Pre-Engineering", subjects: "Physics, Chemistry, Mathematics" },
  { name: "ICS", subjects: "Physics, Computer Science, Mathematics" },
];

const feeData = [
  { item: "Admission Fee (one-time)",       col1: "Rs. 5,000",  col2: "Rs. 5,000"  },
  { item: "Monthly Tuition Fee",            col1: "Rs. 8,000",  col2: "Rs. 8,000"  },
  { item: "Boarding & Lodging (per month)", col1: "Rs. 12,000", col2: "Rs. 12,000" },
  { item: "Mess Charges (per month)",       col1: "Rs. 6,000",  col2: "Rs. 6,000"  },
  { item: "Books & Stationery (per year)",  col1: "Rs. 4,000",  col2: "Rs. 4,000"  },
  { item: "Uniform (one-time)",             col1: "Rs. 7,500",  col2: "Rs. 7,500"  },
  { item: "Medical Fund (per year)",        col1: "Rs. 2,000",  col2: "Rs. 2,000"  },
  { item: "Sports & Activities (per year)", col1: "Rs. 1,500",  col2: "Rs. 1,500"  },
];

// Sensible default instruction copy — all editable later via the page-blocks CMS.
const HOW_TO_STEPS = [
  "Read the eligibility criteria and confirm the candidate meets the age and academic requirements.",
  "Keep scanned copies of the required documents and a recent passport-size photograph ready.",
  "Tick the acknowledgment below and click \u201cProceed to Apply Online\u201d.",
  "Complete the online form, pay the application fee (if applicable), and save your Applicant ID.",
];

const REQUIRED_DOCS = [
  "Recent passport-size photograph of the candidate",
  "Candidate\u2019s B-Form / Birth Certificate",
  "Father\u2019s / Guardian\u2019s CNIC",
  "Previous class result card / mark sheet",
  "Domicile certificate (where applicable)",
  "Any additional documents requested by the college",
];

const DEFAULT_URDU =
  "\u06C1\u0645\u0627\u0631\u06D2 \u0633\u0627\u062A\u06BE \u0634\u0627\u0645\u0644 \u06C1\u0648\u06BA \u0627\u0648\u0631 \u0627\u06CC\u06A9 \u0645\u0639\u062A\u0628\u0631 \u0627\u062F\u0627\u0631\u06D2 \u06A9\u0627 \u062D\u0635\u06C1 \u0628\u0646\u06CC\u06BA \u062C\u0648 \u0645\u0633\u062A\u0642\u0628\u0644 \u06A9\u06D2 \u0631\u06C1\u0646\u0645\u0627\u0624\u06BA \u06A9\u06CC \u062A\u0631\u0628\u06CC\u062A \u06A9\u06D2 \u0644\u06CC\u06D2 \u067E\u064F\u0631\u0639\u0632\u0645 \u06C1\u06D2\u06D4 \u0627\u0628\u06BE\u06CC \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062F\u06CC\u06BA \u0627\u0648\u0631 \u06A9\u06CC\u0688\u0679 \u06A9\u0627\u0644\u062C \u0645\u0631\u06CC \u0645\u06CC\u06BA \u0627\u067E\u0646\u06D2 \u0631\u0648\u0634\u0646 \u0645\u0633\u062A\u0642\u0628\u0644 \u06A9\u0648 \u06CC\u0642\u06CC\u0646\u06CC \u0628\u0646\u0627\u0626\u06CC\u06BA\u06D4";

interface SiteDownload {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  category: string | null;
}

type RailItem = {
  value: string;
  label: string;
  Icon: typeof ClipboardList;
  testid: string;
};

type Props = {
  blocks: PageBlocks;
  settings: SiteSettings;
  applicationFeeEnabled: boolean;
  publicClasses: PublicClassItem[];
  publicClassesLoading: boolean;
  onProceed: () => void;
};

const SYLLABUS_RX = /syllab|past ?paper|sample ?paper|curriculum|test/i;

export default function AdmissionInformation({ blocks, settings, applicationFeeEnabled, publicClasses, publicClassesLoading, onProceed }: Props) {
  const [activeTab, setActiveTab] = useState("apply");
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloads, setDownloads] = useState<SiteDownload[]>([]);
  const [dlLoading, setDlLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(withTenant("/api/website/downloads"))
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!alive) return;
        setDownloads(Array.isArray(data) ? data : []);
        setDlLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setDownloads([]);
        setDlLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { syllabusDownloads, formDownloads } = useMemo(() => {
    const syl: SiteDownload[] = [];
    const frm: SiteDownload[] = [];
    for (const d of downloads) {
      const hay = `${d.category ?? ""} ${d.title ?? ""}`;
      if (SYLLABUS_RX.test(hay)) syl.push(d);
      else frm.push(d);
    }
    return { syllabusDownloads: syl, formDownloads: frm };
  }, [downloads]);

  const lastDateFallback = settings.admissions_deadline
    ? formatDateLong(settings.admissions_deadline)
    : "31 October 2026";

  const railItems: RailItem[] = [
    { value: "apply", label: "Apply Online", Icon: ClipboardList, testid: "info-tab-apply" },
    { value: "form", label: "Download Form", Icon: FileText, testid: "info-tab-form" },
    { value: "eligibility", label: "Eligibility Criteria", Icon: ShieldCheck, testid: "info-tab-eligibility" },
    { value: "syllabus", label: "Download Syllabus", Icon: BookOpen, testid: "info-tab-syllabus" },
    ...(applicationFeeEnabled
      ? [{ value: "fee", label: "Fee Structure", Icon: Wallet, testid: "info-tab-fee" } as RailItem]
      : []),
  ];

  return (
    <div className="flex flex-col md:flex-row gap-5 md:gap-8" data-testid="admission-information">
      {/* ── Tab rail ─────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Admission information"
        className="flex md:flex-col gap-2.5 md:gap-3 shrink-0 md:w-60 lg:w-64 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0"
      >
        {railItems.map(({ value, label, Icon, testid }) => {
          const active = activeTab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={testid}
              data-state={active ? "active" : "inactive"}
              onClick={() => setActiveTab(value)}
              className="group relative shrink-0 md:w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 md:py-3.5 text-left shadow-sm transition-all duration-200 hover:border-accent/50 hover:bg-accent/[0.05] data-[state=active]:border-accent data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 text-accent shrink-0 transition-colors group-data-[state=active]:bg-white/20 group-data-[state=active]:text-accent-foreground">
                <Icon className="w-5 h-5" />
              </span>
              <span className="font-semibold text-sm leading-tight whitespace-nowrap md:whitespace-normal">{label}</span>
              {/* Active pointer (desktop) */}
              <span className="hidden md:block absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-accent opacity-0 transition-opacity group-data-[state=active]:opacity-100" />
            </button>
          );
        })}
      </div>

      {/* ── Content panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {activeTab === "apply" && (
          <ApplyPanel
            blocks={blocks}
            lastDateFallback={lastDateFallback}
            applicationFeeEnabled={applicationFeeEnabled}
            acknowledged={acknowledged}
            setAcknowledged={setAcknowledged}
            onProceed={onProceed}
          />
        )}

        {activeTab === "form" && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <PanelHeading
              page="admissions" blockKey="dlform_heading" defaultTitle="Download Application Forms"
              blocks={blocks}
              defaultIntro="Download and review the official registration and admission forms before applying online."
              introKey="dlform_intro"
            />
            <DownloadGrid
              items={formDownloads}
              loading={dlLoading}
              emptyTitle="Forms coming soon"
              emptyText="Admission forms will appear here once published. You can apply online directly using the form."
              fallbackHref={settings.link_application_form}
              fallbackLabel="Download Application Form"
            />
          </motion.div>
        )}

        {activeTab === "eligibility" && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <h2 className="text-2xl font-bold text-primary mb-2">
              <EditableText as="span" page="admissions" blockKey="eligibility_heading" value={blocks.eligibility_heading || "Eligibility Criteria"} />
            </h2>
            <p className="text-foreground/80 mb-6">
              <EditableText as="span" multiline page="admissions" blockKey="eligibility_intro" value={blocks.eligibility_intro || "For admission to any class, a candidate must either be studying in that class or have passed the previous class with at least 70% marks at the time of applying. A relaxation of 90 days in age limit applies for all applicants."} />
            </p>
            <div className="rounded-xl overflow-hidden border border-border">
              <Table data-testid="eligibility-table">
                <TableHeader>
                  <TableRow className="bg-primary">
                    <TableHead className="text-primary-foreground font-bold text-base"><EditableText as="span" page="admissions" blockKey="eligibility_col_class" value={blocks.eligibility_col_class || "Class/Program"} /></TableHead>
                    <TableHead className="text-primary-foreground font-bold text-base"><EditableText as="span" page="admissions" blockKey="eligibility_col_age" value={blocks.eligibility_col_age || "Maximum Age Limit"} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {publicClassesLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i} className={i % 2 === 0 ? "bg-muted/40" : ""}>
                        <TableCell><div className="h-4 w-32 bg-muted rounded animate-pulse" /></TableCell>
                        <TableCell><div className="h-4 w-44 bg-muted rounded animate-pulse" /></TableCell>
                      </TableRow>
                    ))
                  ) : publicClasses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        No classes are currently listed. Please contact the admissions office.
                      </TableCell>
                    </TableRow>
                  ) : (
                    publicClasses.map((cls, i) => (
                      <TableRow key={cls.code} className={i % 2 === 0 ? "bg-muted/40" : ""} data-testid={`eligibility-row-${i}`}>
                        <TableCell className="font-semibold text-primary">{cls.name}</TableCell>
                        <TableCell>{cls.eligibility ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-8 bg-primary/5 border border-primary/20 rounded-xl p-6">
              <h3 className="font-bold text-primary mb-3"><EditableText as="span" page="admissions" blockKey="eligibility_notes_heading" value={blocks.eligibility_notes_heading || "Important Notes"} /></h3>
              <ul className="space-y-2 text-sm text-foreground/85">
                <li className="flex gap-2"><span className="text-accent font-bold">&bull;</span> <EditableText as="span" multiline page="admissions" blockKey="eligibility_note_0" value={blocks.eligibility_note_0 || "Minimum 70% marks in the previous class examination is mandatory"} /></li>
                <li className="flex gap-2"><span className="text-accent font-bold">&bull;</span> <EditableText as="span" multiline page="admissions" blockKey="eligibility_note_1" value={blocks.eligibility_note_1 || "Age relaxation of 90 days is granted for all applicants"} /></li>
                <li className="flex gap-2"><span className="text-accent font-bold">&bull;</span> <EditableText as="span" multiline page="admissions" blockKey="eligibility_note_2" value={blocks.eligibility_note_2 || "Candidate must be physically and mentally fit"} /></li>
                <li className="flex gap-2"><span className="text-accent font-bold">&bull;</span> <EditableText as="span" multiline page="admissions" blockKey="eligibility_note_3" value={blocks.eligibility_note_3 || "Admission is subject to passing an entry test and interview"} /></li>
                <li className="flex gap-2"><span className="text-accent font-bold">&bull;</span> <EditableText as="span" multiline page="admissions" blockKey="eligibility_note_4" value={blocks.eligibility_note_4 || "All documents must be attested by a Gazetted Officer"} /></li>
              </ul>
            </div>
          </motion.div>
        )}

        {activeTab === "syllabus" && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <h2 className="text-2xl font-bold text-primary mb-2">
              <EditableText as="span" page="admissions" blockKey="syllabus_heading" value={blocks.syllabus_heading || "Subjects & Entry Test Syllabus"} />
            </h2>
            <p className="text-foreground/80 mb-8">
              <EditableText as="span" multiline page="admissions" blockKey="syllabus_intro" value={blocks.syllabus_intro || "The entry test covers subjects from the previous class curriculum. Candidates are advised to be thorough with their previous-year textbooks."} />
            </p>
            <div className="grid sm:grid-cols-3 gap-6 mb-10">
              {subjectGroups.map((group, i) => (
                <div key={i} data-testid={`subject-group-${i}`} className="bg-card border border-border rounded-xl p-6 text-center">
                  <h3 className="font-bold text-primary text-lg mb-2">{group.name}</h3>
                  <p className="text-foreground/80 text-sm">{group.subjects}</p>
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-6 mb-10">
              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="font-bold text-primary mb-3">Classes 6th &mdash; 9th Entry Test</h3>
                <ul className="text-sm space-y-1 text-foreground/80">
                  <li>&bull; English (Grammar &amp; Comprehension)</li>
                  <li>&bull; Urdu (Grammar &amp; Composition)</li>
                  <li>&bull; Mathematics</li>
                  <li>&bull; General Knowledge / Science</li>
                </ul>
              </div>
              <div className="bg-muted rounded-xl p-6 border border-border">
                <h3 className="font-bold text-primary mb-3">Class 11th Entry Test</h3>
                <ul className="text-sm space-y-1 text-foreground/80">
                  <li>&bull; English</li>
                  <li>&bull; Mathematics or Biology (as per selected group)</li>
                  <li>&bull; Physics &amp; Chemistry (for Pre-Med/Pre-Eng)</li>
                  <li>&bull; Computer Science (for ICS)</li>
                </ul>
              </div>
            </div>
            <h3 className="font-bold text-primary text-lg mb-4">Downloadable Syllabus</h3>
            <DownloadGrid
              items={syllabusDownloads}
              loading={dlLoading}
              emptyTitle="Syllabus files coming soon"
              emptyText="Detailed syllabus documents will appear here once published. The test outline above covers the core subjects."
              fallbackHref={settings.link_fee_pdf}
              fallbackLabel="Download Syllabus PDF"
            />
          </motion.div>
        )}

        {activeTab === "fee" && applicationFeeEnabled && (
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-primary mb-1">Fee Structure</h2>
                <p className="text-foreground/80 text-sm">Approximate fee schedule for academic year 2026-27. Subject to change &mdash; contact the admissions office for the latest figures.</p>
              </div>
              <Button variant="outline" asChild className="flex items-center gap-2" data-testid="button-download-feestructure">
                <a href={settings.link_fee_pdf} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4" /> Download PDF
                </a>
              </Button>
            </div>
            <div className="rounded-xl overflow-hidden border border-border">
              <Table data-testid="fee-table">
                <TableHeader>
                  <TableRow className="bg-primary">
                    <TableHead className="text-primary-foreground font-bold">Fee Type</TableHead>
                    <TableHead className="text-primary-foreground font-bold text-right">Classes 6–9</TableHead>
                    <TableHead className="text-primary-foreground font-bold text-right">Classes 10–11</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeData.map((row, i) => (
                    <TableRow key={i} className={i % 2 === 0 ? "bg-muted/40" : ""} data-testid={`fee-row-${i}`}>
                      <TableCell>{row.item}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{row.col1}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{row.col2}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-5 text-sm text-foreground/80">
              For payment plans, installment options, or scholarship inquiries, contact our accounts office at{" "}
              <a href="tel:03041111024" className="text-primary font-semibold hover:underline" data-testid="link-accounts-phone">UAN: 03041111024</a>{" "}
              or email{" "}
              <a href="mailto:burdiwaheed@gmail.com" className="text-primary font-semibold hover:underline" data-testid="link-accounts-email">burdiwaheed@gmail.com</a>.
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ── Apply Online panel ───────────────────────────────────────────────────────
function ApplyPanel({
  blocks, lastDateFallback, applicationFeeEnabled, acknowledged, setAcknowledged, onProceed,
}: {
  blocks: PageBlocks;
  lastDateFallback: string;
  applicationFeeEnabled: boolean;
  acknowledged: boolean;
  setAcknowledged: (v: boolean) => void;
  onProceed: () => void;
}) {
  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-8">
      {/* Top CTA */}
      <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/[0.03] p-5 sm:p-6" data-testid="apply-cta-top">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-accent/15 text-accent shrink-0">
              <ClipboardList className="w-5 h-5" />
            </span>
            <div>
              <div className="font-bold text-primary text-lg leading-tight">Ready to begin?</div>
              <p className="text-sm text-foreground/70">Review the instructions below, then start your application.</p>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            onClick={onProceed}
            disabled={!acknowledged}
            className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-6 shadow-md shadow-accent/20 shrink-0"
            data-testid="button-proceed-top"
          >
            Proceed to Apply Online
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        {!acknowledged && (
          <p className="text-xs text-foreground/60 mt-3 flex items-center gap-1.5" data-testid="proceed-hint">
            <AlertCircle className="w-3.5 h-3.5 text-accent" />
            Tick &ldquo;I have read the instructions&rdquo; below to continue.
          </p>
        )}
      </div>

      {/* Admissions Open heading */}
      <div>
        <div className="inline-flex items-center gap-2 text-accent font-bold text-sm uppercase tracking-wider mb-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <EditableText as="span" page="admissions" blockKey="info_intake_session" value={blocks.info_intake_session || "Intake 2026-27"} />
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-primary mb-4">
          <EditableText as="span" page="admissions" blockKey="info_intake_heading" value={blocks.info_intake_heading || "Admissions Open"} />
        </h2>
        <div className="text-foreground/85 leading-relaxed space-y-3">
          <EditableText as="div" multiline page="admissions" blockKey="info_intro" value={blocks.info_intro || "Cadet College Murree invites applications for admission to First Year (Pre-Medical, Pre-Engineering, and ICS), as well as limited seats in Classes 6th, 7th, 8th, and 9th. The college provides a disciplined environment, high-quality education, and comprehensive grooming \u2014 with a strong emphasis on academic excellence, character building, and co-curricular development. Join a prestigious institution dedicated to shaping future leaders and secure your bright future at Cadet College Murree."} />
        </div>
      </div>

      {/* How to apply + Required documents */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-primary text-lg">
              <EditableText as="span" page="admissions" blockKey="info_how_heading" value={blocks.info_how_heading || "How to Apply"} />
            </h3>
          </div>
          <ol className="space-y-3">
            {HOW_TO_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/85">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">{i + 1}</span>
                <EditableText as="span" multiline page="admissions" blockKey={`info_how_${i}`} value={blocks[`info_how_${i}`] || step} />
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-primary text-lg">
              <EditableText as="span" page="admissions" blockKey="info_docs_heading" value={blocks.info_docs_heading || "Required Documents"} />
            </h3>
          </div>
          <ul className="space-y-2.5">
            {REQUIRED_DOCS.map((doc, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-foreground/85">
                <CheckCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <EditableText as="span" multiline page="admissions" blockKey={`info_doc_${i}`} value={blocks[`info_doc_${i}`] || doc} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Key dates + fee note */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-5" data-testid="info-last-date">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-accent/15 text-accent shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
              <EditableText as="span" page="admissions" blockKey="info_last_date_label" value={blocks.info_last_date_label || "Last Date to Apply"} />
            </div>
            <div className="font-bold text-primary text-lg">
              <EditableText as="span" page="admissions" blockKey="info_last_date" value={blocks.info_last_date || lastDateFallback} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-5" data-testid="info-fee-note">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
            <Wallet className="w-5 h-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
              <EditableText as="span" page="admissions" blockKey="info_fee_label" value={blocks.info_fee_label || "Application Fee"} />
            </div>
            <div className="font-semibold text-foreground/85 text-sm">
              <EditableText as="span" multiline page="admissions" blockKey="info_fee_note" value={blocks.info_fee_note || (applicationFeeEnabled ? "A nominal application processing fee applies. You can pay online or via bank deposit during submission." : "No application fee is required for this admission cycle \u2014 apply at no cost.")} />
            </div>
          </div>
        </div>
      </div>

      {/* Urdu support message */}
      <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-6" data-testid="info-urdu">
        <EditableText
          as="p"
          multiline
          page="admissions"
          blockKey="info_urdu_message"
          value={blocks.info_urdu_message || DEFAULT_URDU}
          className="text-foreground/85 leading-loose text-right text-lg"
        />
      </div>

      {/* Acknowledgment gate */}
      <div className="rounded-2xl border-2 border-accent/40 bg-accent/[0.04] p-6" data-testid="acknowledgment-box">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            className="mt-0.5 h-5 w-5 border-accent data-[state=checked]:bg-accent data-[state=checked]:border-accent"
            data-testid="checkbox-acknowledge"
          />
          <span className="text-sm font-medium text-foreground/90">
            <EditableText as="span" page="admissions" blockKey="info_ack_label" value={blocks.info_ack_label || "I have read the instructions and confirm the candidate meets the eligibility criteria."} />
          </span>
        </label>
        <Button
          type="button"
          size="lg"
          onClick={onProceed}
          disabled={!acknowledged}
          className="w-full sm:w-auto mt-5 gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 shadow-lg shadow-accent/20"
          data-testid="button-proceed-bottom"
        >
          Proceed to Apply Online
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}

// ── Shared heading for download panels ───────────────────────────────────────
function PanelHeading({
  page, blockKey, defaultTitle, introKey, defaultIntro, blocks,
}: {
  page: string;
  blockKey: string;
  defaultTitle: string;
  introKey: string;
  defaultIntro: string;
  blocks: PageBlocks;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-primary mb-2">
        <EditableText as="span" page={page} blockKey={blockKey} value={blocks[blockKey] || defaultTitle} />
      </h2>
      <p className="text-foreground/80">
        <EditableText as="span" multiline page={page} blockKey={introKey} value={blocks[introKey] || defaultIntro} />
      </p>
    </div>
  );
}

// ── Download grid (reused styling from the Downloads page) ────────────────────
function DownloadGrid({
  items, loading, emptyTitle, emptyText, fallbackHref, fallbackLabel,
}: {
  items: SiteDownload[];
  loading: boolean;
  emptyTitle: string;
  emptyText: string;
  fallbackHref?: string;
  fallbackLabel: string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary/50" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 rounded-2xl border-2 border-dashed border-border bg-muted/30 text-center px-6" data-testid="download-empty">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="w-7 h-7 text-primary/60" />
        </div>
        <div>
          <div className="font-bold text-primary mb-1">{emptyTitle}</div>
          <p className="text-foreground/70 text-sm max-w-sm">{emptyText}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {fallbackHref && (
            <Button variant="outline" asChild className="gap-2">
              <a href={fallbackHref} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4" /> {fallbackLabel}
              </a>
            </Button>
          )}
          <Button variant="ghost" asChild className="gap-2">
            <Link href="/downloads">View all downloads</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-5">
      {items.map((dl, i) => (
        <div
          key={dl.id}
          data-testid={`info-download-${i}`}
          className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md hover:border-accent/30 transition-all duration-300"
        >
          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary shrink-0">
            <FileText className="w-6 h-6" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-primary leading-snug">{dl.title}</h3>
            {dl.subtitle && <p className="text-accent text-xs font-semibold mt-0.5">{dl.subtitle}</p>}
            {dl.description && <p className="text-foreground/75 text-sm mt-2 leading-relaxed">{dl.description}</p>}
            {dl.fileUrl && (
              <Button asChild size="sm" className="mt-3 gap-2" data-testid={`info-button-download-${i}`}>
                <a href={dl.fileUrl} target="_blank" rel="noopener noreferrer" download={dl.fileName ?? undefined}>
                  <Download className="w-4 h-4" /> Download
                </a>
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
