import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { withTenant } from "@/lib/tenant-fetch";
import PageHero from "@/components/PageHero";
import {
  CheckCircle,
  Loader2,
  User,
  GraduationCap,
  Briefcase,
  Star,
  MessageSquare,
  Info,
  ClipboardList,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
};

const fadeIn = {
  hidden:  { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6 } },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position { id: string; title: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const DEGREE_LEVELS = [
  "Matric (Secondary School)",
  "Intermediate (Higher Secondary)",
  "Bachelor's Degree",
  "Master's Degree",
  "M.Phil",
  "PhD",
  "Diploma / Certificate",
  "Other",
];

const FIELDS_OF_STUDY = [
  "Sciences",
  "Arts / Humanities",
  "Commerce / Accounting",
  "Engineering & Technology",
  "Medicine & Health Sciences",
  "Computer Science & IT",
  "Education / Teaching",
  "Law",
  "Business Administration",
  "Social Sciences",
  "Mathematics & Statistics",
  "Other",
];

const YEARS_OF_EXPERIENCE = [
  "Fresher (No experience)",
  "Less than 1 year",
  "1–2 years",
  "3–5 years",
  "6–10 years",
  "More than 10 years",
];

// ── Form schema ───────────────────────────────────────────────────────────────

const formSchema = z.object({
  fullName:            z.string().min(2, "Full name must be at least 2 characters"),
  fatherName:          z.string().optional(),
  cnic:                z.string().optional(),
  dob:                 z.string().optional(),
  gender:              z.string().optional(),
  phone:               z.string().min(7, "Enter a valid phone number"),
  email:               z.string().email("Please enter a valid email address"),
  address:             z.string().optional(),
  degreeLevel:         z.string().optional(),
  fieldOfStudy:        z.string().optional(),
  institution:         z.string().optional(),
  graduationYear:      z.string().optional(),
  extraQualifications: z.string().max(2000).optional(),
  yearsOfExperience:   z.string().optional(),
  experienceDetails:   z.string().max(3000).optional(),
  coverNote:           z.string().max(3000).optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEducationText(v: FormValues): string {
  const parts: string[] = [];
  if (v.degreeLevel)    parts.push(`Degree: ${v.degreeLevel}`);
  if (v.fieldOfStudy)   parts.push(`Field: ${v.fieldOfStudy}`);
  if (v.institution)    parts.push(`Institution: ${v.institution}`);
  if (v.graduationYear) parts.push(`Year: ${v.graduationYear}`);
  const header = parts.join(" | ");
  const extra  = v.extraQualifications?.trim();
  return [header, extra ? `Additional: ${extra}` : ""].filter(Boolean).join("\n");
}

function buildExperienceText(v: FormValues): string {
  const lines: string[] = [];
  if (v.yearsOfExperience) lines.push(`Years of Experience: ${v.yearsOfExperience}`);
  if (v.experienceDetails?.trim()) lines.push(v.experienceDetails.trim());
  return lines.join("\n");
}

// ── Select helper ─────────────────────────────────────────────────────────────

function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-11 px-3 text-base border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

// ── Position chip ─────────────────────────────────────────────────────────────

function PositionChip({
  position,
  selected,
  onClick,
}: {
  position: Position;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all",
        selected
          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
          : "bg-white border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-600",
      )}
    >
      {selected && <CheckCircle className="h-3.5 w-3.5" />}
      {position.title}
    </button>
  );
}

// ── Colourful section heading ─────────────────────────────────────────────────

type SectionColor = "blue" | "emerald" | "amber" | "indigo" | "rose";

const sectionColors: Record<SectionColor, string> = {
  blue:    "border-blue-500   bg-blue-50   text-blue-700",
  emerald: "border-emerald-500 bg-emerald-50 text-emerald-700",
  amber:   "border-amber-500  bg-amber-50  text-amber-700",
  indigo:  "border-indigo-500 bg-indigo-50 text-indigo-700",
  rose:    "border-rose-500   bg-rose-50   text-rose-700",
};

function SectionHead({
  title,
  color,
  icon: Icon,
  step,
}: {
  title: string;
  color: SectionColor;
  icon: React.ElementType;
  step: number;
}) {
  const cls = sectionColors[color];
  return (
    <div className={cn("flex items-center gap-3 border-l-4 rounded-r-lg px-4 py-3 mb-6", cls)}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/70 flex items-center justify-center shadow-sm">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider opacity-70">Step {step}</p>
        <h3 className="text-base font-bold">{title}</h3>
      </div>
    </div>
  );
}

// ── Instructions banner ───────────────────────────────────────────────────────

function InstructionsBanner() {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6 mb-10 shadow-lg">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Info className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-1">Before You Apply</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Please read these instructions carefully before filling out the form.
          </p>
        </div>
      </div>
      <ol className="space-y-3">
        {[
          "Fill all required fields (marked with *) accurately. Incomplete applications may be rejected.",
          "Ensure your CNIC and date of birth are correct — these will be used for identity verification.",
          "Describe your education and experience in detail. Vague responses reduce your chances of being shortlisted.",
          "You will be contacted only if your profile matches our current or future requirements.",
          "Applications are reviewed on a rolling basis. Shortlisted candidates are typically contacted within 4–6 weeks.",
          "Save your Applicant ID after submitting — you may need it for future correspondence.",
        ].map((item, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-200">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              {i + 1}
            </span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Careers() {
  const { toast }   = useToast();
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [submitted, setSubmitted]       = useState(false);
  const [appId, setAppId]               = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [copied, setCopied]             = useState(false);

  const { data: positions = [], isLoading: posLoading } = useQuery<Position[]>({
    queryKey: ["career-positions-public"],
    queryFn:  async () => {
      const res = await fetch(withTenant("/api/website/career-positions"));
      if (!res.ok) throw new Error("Failed to load positions");
      return res.json();
    },
    staleTime: 60_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "", fatherName: "", cnic: "", dob: "", gender: "",
      phone: "", email: "", address: "",
      degreeLevel: "", fieldOfStudy: "", institution: "", graduationYear: "",
      extraQualifications: "",
      yearsOfExperience: "", experienceDetails: "",
      coverNote: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch(withTenant("/api/website/career-applications"), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:    values.fullName,
          fatherName:  values.fatherName?.trim() || null,
          cnic:        values.cnic?.trim() || null,
          dob:         values.dob?.trim() || null,
          gender:      values.gender?.trim() || null,
          phone:       values.phone,
          email:       values.email,
          address:     values.address?.trim() || null,
          education:   buildEducationText(values) || null,
          experience:  buildExperienceText(values) || null,
          coverNote:   values.coverNote?.trim() || null,
          positionIds: Array.from(selectedIds),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? "Failed to submit application");
      }
      return res.json() as Promise<{ id?: string; referenceId?: string }>;
    },
    onSuccess: (data, variables) => {
      setAppId(data?.id ?? data?.referenceId ?? null);
      setSubmittedEmail(variables.email);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  function togglePosition(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function copyAppId() {
    if (!appId) return;
    navigator.clipboard.writeText(appId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <>
        <Helmet><title>Careers | Application Submitted</title></Helmet>
        <PageHero title="Careers" breadcrumb="Careers" />
        <section className="py-20 bg-gradient-to-b from-white to-slate-50">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            className="max-w-2xl mx-auto px-4 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>

            <h2 className="text-3xl font-heading font-bold text-slate-800 mb-3">
              Application Submitted Successfully!
            </h2>
            <p className="text-slate-500 text-lg mb-8">
              Thank you for your interest in joining Cadet College Murree.
            </p>

            {appId && (
              <div className="bg-white border-2 border-emerald-200 rounded-2xl p-6 mb-6 shadow-sm">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Your Applicant ID
                </p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl font-mono font-bold text-emerald-700 tracking-wider">
                    {appId}
                  </span>
                  <button
                    onClick={copyAppId}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-left text-sm text-amber-800">
              <p className="font-semibold mb-1 flex items-center gap-2">
                <Info className="h-4 w-4" /> Important
              </p>
              <ul className="space-y-1 list-disc list-inside text-amber-700">
                <li>Save your Applicant ID for future reference.</li>
                {submittedEmail && (
                  <li>You will be contacted at <strong>{submittedEmail}</strong> if shortlisted.</li>
                )}
                <li>Shortlisted candidates are typically contacted within 4–6 weeks.</li>
              </ul>
            </div>

            <Button
              asChild
              size="lg"
              className="bg-slate-800 hover:bg-slate-900 text-white px-8"
            >
              <a href="/">Back to Home</a>
            </Button>
          </motion.div>
        </section>
      </>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <>
      <Helmet><title>Careers | Join Our Team</title></Helmet>
      <PageHero title="Careers" breadcrumb="Careers" />

      <section className="py-12 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-4xl mx-auto px-4 lg:px-8">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>

            <InstructionsBanner />

            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-10">

                {/* ── 1. Personal Details ───────────────────────────────── */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                  <SectionHead title="Personal Details" color="blue" icon={User} step={1} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FormField control={form.control} name="fullName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Full Name *</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="e.g. Ahmed Hassan" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="fatherName" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Father's Name</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="e.g. Muhammad Ali" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cnic" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">CNIC</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="xxxxx-xxxxxxx-x" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dob" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Date of Birth</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Gender</FormLabel>
                        <FormControl>
                          <StyledSelect
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            options={["Male", "Female", "Other"]}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Phone Number *</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="03xx-xxxxxxx" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Email Address *</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" type="email" placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-base font-semibold">Residential Address</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="Current residential address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                {/* ── 2. Education ──────────────────────────────────────── */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                  <SectionHead title="Education & Qualifications" color="emerald" icon={GraduationCap} step={2} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <FormField control={form.control} name="degreeLevel" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Highest Degree Level</FormLabel>
                        <FormControl>
                          <StyledSelect
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            options={DEGREE_LEVELS}
                            placeholder="Select degree level…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="fieldOfStudy" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Field / Area of Study</FormLabel>
                        <FormControl>
                          <StyledSelect
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            options={FIELDS_OF_STUDY}
                            placeholder="Select field of study…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="institution" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Institution / University</FormLabel>
                        <FormControl>
                          <Input className="h-11 text-base" placeholder="e.g. University of Punjab, Lahore" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="graduationYear" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Year of Graduation</FormLabel>
                        <FormControl>
                          <Input
                            className="h-11 text-base"
                            type="number"
                            min={1970}
                            max={new Date().getFullYear() + 4}
                            placeholder="e.g. 2020"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="extraQualifications" render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel className="text-base font-semibold">
                          Additional Qualifications{" "}
                          <span className="text-slate-400 font-normal">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            className="text-base"
                            placeholder="Any other degrees, diplomas, certifications, or training programmes — e.g. B.Ed, NTS certified, IELTS 7.0…"
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                {/* ── 3. Experience ─────────────────────────────────────── */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                  <SectionHead title="Work Experience" color="amber" icon={Briefcase} step={3} />
                  <div className="space-y-5">
                    <FormField control={form.control} name="yearsOfExperience" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Total Years of Experience</FormLabel>
                        <FormControl>
                          <StyledSelect
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            options={YEARS_OF_EXPERIENCE}
                            placeholder="Select experience range…"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="experienceDetails" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          Experience Details{" "}
                          <span className="text-slate-400 font-normal">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            className="text-base"
                            placeholder="List relevant roles, organisations, and durations — e.g. Lecturer Physics, GCE Abbottabad, 2019–2022. Mention teaching levels, subjects, or key responsibilities."
                            rows={5}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </section>

                {/* ── 4. Positions of Interest ──────────────────────────── */}
                {!posLoading && positions.length > 0 && (
                  <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                    <SectionHead title="Positions of Interest" color="indigo" icon={Star} step={4} />
                    <p className="text-slate-500 text-sm mb-4">
                      Select any specific positions you would like to be considered for (optional — leave unselected to apply as a general candidate).
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {positions.map((pos) => (
                        <PositionChip
                          key={pos.id}
                          position={pos}
                          selected={selectedIds.has(pos.id)}
                          onClick={() => togglePosition(pos.id)}
                        />
                      ))}
                    </div>
                    {selectedIds.size > 0 && (
                      <p className="text-sm text-indigo-600 font-medium mt-3">
                        {selectedIds.size} position{selectedIds.size > 1 ? "s" : ""} selected
                      </p>
                    )}
                  </section>
                )}

                {/* ── 5. Cover Note ─────────────────────────────────────── */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                  <SectionHead
                    title="Cover Note"
                    color="rose"
                    icon={MessageSquare}
                    step={positions.length > 0 ? 5 : 4}
                  />
                  <FormField control={form.control} name="coverNote" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">
                        Why do you want to join CCM?{" "}
                        <span className="text-slate-400 font-normal">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          className="text-base"
                          placeholder="Tell us about your motivation, what you bring to the team, and why you believe you'd be a great fit for Cadet College Murree…"
                          rows={5}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </section>

                {/* ── Submit ────────────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-8">
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    size="lg"
                    className="w-full sm:w-auto sm:px-12 text-base font-semibold h-12"
                  >
                    {mutation.isPending ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Submitting…</>
                    ) : (
                      <><ClipboardList className="h-5 w-5 mr-2" />Submit Application</>
                    )}
                  </Button>
                  <p className="text-sm text-slate-400 text-center sm:text-left">
                    Fields marked with * are required
                  </p>
                </div>

              </form>
            </Form>
          </motion.div>
        </div>
      </section>
    </>
  );
}
