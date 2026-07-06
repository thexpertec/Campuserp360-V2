import { Helmet } from "react-helmet-async";
import { formatCnic, formatPhone } from "@/lib/format";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useRef, forwardRef, createContext, useContext } from "react";
import { useSiteSettings, useSiteBaseUrl } from "@/lib/site-settings";
import { formatDateLong } from "@/lib/locale";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import SectionColor from "@/components/cms/SectionColor";
import AdmissionInformation from "@/components/admissions/AdmissionInformation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { withTenant } from "@/lib/tenant-fetch";
import { CheckCircle, AlertCircle, FileText, Download, ClipboardList, Wallet, User, Users, GraduationCap, Phone, ArrowRight, ArrowLeft, Copy, Save, Sparkles, ClipboardCheck, CalendarCheck, MessageCircle, Upload, X, ImageIcon, Search, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import PageHero from "@/components/PageHero";
import Confetti from "@/components/Confetti";
import { Link } from "wouter";
import { useSubmitApplication, useListActiveTestCentres, useListPublicClasses, useGetWebsiteAdmissionFormConfig, useGetWebsiteAdmissionPaymentConfig, ApiError } from "@workspace/api-client-react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const phoneRule = z
  .string()
  .refine((v) => v.replace(/\D/g, "").length === 11, "Enter a valid 11-digit phone number (e.g. 03xx-xxxxxxx)");

// For configurable fields we use an "empty-or-valid" union so:
// - empty string passes Zod (required is enforced manually in handleNext per config)
// - non-empty string still gets format validation (phone digits, email, CNIC length)
const optionalPhoneRule = z.union([z.literal(""), phoneRule]).optional().default("");
const optionalEmailRule = z.union([
  z.literal(""),
  z.string().email("Please enter a valid email address"),
]).optional().default("");
const optionalCnicRule = z.union([
  z.literal(""),
  z.string().refine((v) => v.replace(/\D/g, "").length === 13, "Enter a valid 13-digit B-Form / CNIC number"),
]).optional().default("");

const applicationSchema = z.object({
  // Academic
  classApplying: z.string().min(1, "Please select a class"),
  previousMarks: z
    .string()
    .refine((v) => {
      const n = Number(v.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) && n > 0 && n <= 100;
    }, "Enter marks between 1 and 100"),
  // Student personal
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  // Configurable — optional in schema, required enforced dynamically in handleNext
  bloodGroup: z.string().optional().default(""),
  religion: z.string().optional().default(""),
  domicile: z.string().optional().default(""),
  // Student contact
  studentMobile: optionalPhoneRule,
  studentEmail: optionalEmailRule,
  presentAddress: z.string().min(10, "Please provide a complete address"),
  state: z.string().optional().default(""),
  city: z.string().optional().default(""),
  examCenter: z.string().optional().default(""),
  // Guardian
  guardianName: z.string().min(3, "Guardian's name must be at least 3 characters"),
  relation: z.string().optional().default(""),
  fatherName: z.string().min(3, "Father's name must be at least 3 characters"),
  occupation: z.string().optional().default(""),
  motherName: z.string().optional().default(""),
  guardianMobile: phoneRule,
  guardianEmail: optionalEmailRule,
  alternatePhone: optionalPhoneRule,
  parentCnic: z
    .string()
    .refine((v) => v.replace(/\D/g, "").length === 13, "Enter a valid 13-digit CNIC"),
  studentBForm: optionalCnicRule,
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

const CURRENT_SESSION = "Admissions 2026";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

const RELIGIONS = ["Islam", "Christianity", "Hinduism", "Sikhism", "Other"];

const STATES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu And Kashmir",
];

const CITIES_BY_STATE: Record<string, string[]> = {
  "Punjab": ["Lahore", "Rawalpindi", "Faisalabad", "Multan", "Murree", "Sialkot", "Gujranwala", "Bahawalpur", "Sargodha", "Jhelum"],
  "Sindh": ["Karachi", "Hyderabad", "Sukkur", "Larkana", "Mirpur Khas", "Nawabshah"],
  "Khyber Pakhtunkhwa": ["Peshawar", "Abbottabad", "Mardan", "Mansehra", "Swat", "Kohat", "Bannu", "Dera Ismail Khan"],
  "Balochistan": ["Quetta", "Gwadar", "Turbat", "Khuzdar", "Sibi", "Loralai"],
  "Islamabad Capital Territory": ["Islamabad"],
  "Gilgit-Baltistan": ["Gilgit", "Skardu", "Hunza", "Chilas", "Ghizer"],
  "Azad Jammu And Kashmir": ["Muzaffarabad", "Mirpur", "Rawalakot", "Kotli", "Bagh", "Bhimber"],
};


const RELATIONS = ["Father", "Mother", "Uncle", "Brother", "Grandfather", "Guardian"];

const DRAFT_KEY = "ccm-admission-draft-v2";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fields the admin can toggle on/off per-tenant
const CONFIGURABLE_FIELDS = new Set([
  "gender", "bloodGroup", "religion", "photo",
  "studentMobile", "studentEmail", "state", "city", "examCenter",
  "relation", "occupation", "studentBForm",
  "domicile", "motherName", "guardianEmail", "alternatePhone",
]);

type FieldCfg = { enabled: boolean; required: boolean };
const DEFAULT_FIELD_CFG: FieldCfg = { enabled: true, required: true };

const stepFields: Record<number, (keyof ApplicationFormValues)[]> = {
  0: ["classApplying", "previousMarks"],
  1: ["fullName", "dateOfBirth", "bloodGroup", "domicile"],
  2: ["studentMobile", "studentEmail", "presentAddress", "state", "city", "examCenter"],
  3: ["guardianName", "relation", "fatherName", "guardianMobile", "parentCnic", "studentBForm", "motherName", "guardianEmail", "alternatePhone"],
};

// Every field that participates in step-by-step validation. Used to scrub
// errors that zodResolver pre-populates for fields outside the current step.
const ALL_VALIDATED_FIELDS = Object.values(stepFields).flat();

// Reverse map: which step does a given field live on? Used to jump the user to
// the earliest step containing a server-reported validation error.
const fieldToStep: Record<string, number> = {};
for (const [stepStr, names] of Object.entries(stepFields)) {
  for (const name of names) fieldToStep[name as string] = Number(stepStr);
}

// Human-friendly labels for fields, so a server validation error can name the
// exact field instead of showing a raw key or a generic message.
const FIELD_LABELS: Record<string, string> = {
  classApplying: "Class / Program",
  previousMarks: "Previous Marks",
  fullName: "Student Name",
  dateOfBirth: "Date of Birth",
  bloodGroup: "Blood Group",
  domicile: "Domicile",
  gender: "Gender",
  religion: "Religion",
  nationality: "Nationality",
  studentMobile: "Student Mobile",
  studentEmail: "Student Email",
  presentAddress: "Present Address",
  state: "Province / State",
  city: "City",
  examCenter: "Exam Center",
  guardianName: "Guardian Name",
  relation: "Relation",
  fatherName: "Father Name",
  motherName: "Mother Name",
  occupation: "Occupation",
  guardianMobile: "Guardian Mobile",
  guardianEmail: "Guardian Email",
  alternatePhone: "Alternate Phone",
  parentCnic: "Parent CNIC",
  studentBForm: "Student B-Form / CNIC",
};

// Controls when validation messages are allowed to surface. zodResolver
// pre-populates the RHF errors object for fields the user hasn't reached yet,
// so we gate *display* on actual interaction rather than on the errors object.
// `true` means validation was explicitly requested (Next / Submit attempt).
const RevealErrorsContext = createContext(false);

// Renders the field's validation message only once the user has interacted with
// the field (blur/change → isTouched) or explicitly asked to proceed (Next /
// Submit → reveal). This guarantees a freshly loaded step shows no errors.
function GatedFormMessage() {
  const { isTouched } = useFormField();
  const reveal = useContext(RevealErrorsContext);
  if (!reveal && !isTouched) return null;
  return <FormMessage />;
}

const stepsMeta = [
  { title: "Academic", subtitle: "Class/Program & marks", Icon: GraduationCap },
  { title: "Student", subtitle: "Personal details", Icon: User },
  { title: "Contact", subtitle: "Address & center", Icon: Phone },
  { title: "Guardian", subtitle: "Parent details", Icon: Users },
];

export default function Admissions() {
  const { toast } = useToast();
  const settings = useSiteSettings();
  const baseUrl = useSiteBaseUrl();
  const blocks = usePageBlocks("admissions");
  const [submitted, setSubmitted] = useState(false);
  const [referenceId, setReferenceId] = useState<string>("");
  const [portalUsername, setPortalUsername] = useState<string>("");
  const [portalPassword, setPortalPassword] = useState<string>("");
  const [submittedPayment, setSubmittedPayment] = useState<{ method: string; status: string } | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"information" | "apply">("information");
  const formRef = useRef<HTMLDivElement>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  // Whether validation messages for the current step may be shown. Flipped on
  // when the user clicks Next/Submit; reset on every step navigation so a newly
  // loaded step never shows errors before interaction.
  const [showErrors, setShowErrors] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoError, setPhotoError] = useState<string>("");

  // Payment step state
  const paymentDataRef = useRef<{ method: string; reference: string; status: string }>({ method: "free", reference: "", status: "free" });
  const bankReceiptFileRef = useRef<File | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [selectedPayMethod, setSelectedPayMethod] = useState<string>("");
  const [bankRef, setBankRef] = useState("");
  const [bankDate, setBankDate] = useState("");
  const [bankReceiptFile, setBankReceiptFile] = useState<File | null>(null);
  const [bankReceiptPreview, setBankReceiptPreview] = useState<string>("");

  const submitMutation = useSubmitApplication();
  const { data: testCentres } = useListActiveTestCentres();
  const { data: publicClasses, isLoading: publicClassesLoading } = useListPublicClasses();
  const { data: formConfigRaw } = useGetWebsiteAdmissionFormConfig();
  const { data: paymentConfig } = useGetWebsiteAdmissionPaymentConfig();
  const applicationFeeEnabled = paymentConfig?.applicationFeeEnabled !== false;
  const paymentStepEntry = { title: "Payment", subtitle: "Application fee", Icon: Wallet };
  const allStepsMeta = applicationFeeEnabled ? [...stepsMeta, paymentStepEntry] : stepsMeta;

  const examCenters = (testCentres ?? []).map((c) => c.name);

  // Per-field visibility/required config from admin. Falls back to all-enabled when loading.
  const fieldConfig = useMemo<Record<string, FieldCfg>>(() => {
    if (!formConfigRaw || typeof formConfigRaw !== "object") return {};
    return formConfigRaw as Record<string, FieldCfg>;
  }, [formConfigRaw]);

  const fc = (key: string): FieldCfg => fieldConfig[key] ?? DEFAULT_FIELD_CFG;

  const form = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    mode: "onTouched",
    defaultValues: {
      classApplying: "",
      previousMarks: "",
      fullName: "",
      dateOfBirth: "",
      bloodGroup: "",
      religion: "",
      domicile: "",
      studentMobile: "",
      studentEmail: "",
      presentAddress: "",
      state: "",
      city: "",
      examCenter: "",
      guardianName: "",
      relation: "",
      fatherName: "",
      occupation: "",
      motherName: "",
      guardianMobile: "",
      guardianEmail: "",
      alternatePhone: "",
      parentCnic: "",
      studentBForm: "",
    },
  });

  const selectedState = form.watch("state");
  const cityOptions = selectedState ? CITIES_BY_STATE[selectedState] ?? [] : [];

  // Reset city when state changes to one that doesn't include the current city
  useEffect(() => {
    const currentCity = form.getValues("city");
    if (selectedState && currentCity && !cityOptions.includes(currentCity)) {
      form.setValue("city", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

  function handlePhotoChange(file: File | null) {
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoError("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file (JPG, PNG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be smaller than 2 MB");
      return;
    }
    setPhotoError("");
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(String(e.target?.result ?? ""));
    reader.readAsDataURL(file);
  }

  // Detect gateway payment return (?payment=success&ref=CCM-XXX or ?payment=failed)
  // after the browser is redirected back from JazzCash / PayFast.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paymentOutcome = params.get("payment");
    const paymentRef = params.get("ref");

    if (paymentOutcome === "success" && paymentRef) {
      setReferenceId(paymentRef);
      setSubmittedPayment({ method: "online", status: "paid" });
      setSubmitted(true);
      setPhase("apply");
      // Clean the URL so a refresh doesn't re-trigger this
      const clean = new URL(window.location.href);
      clean.searchParams.delete("payment");
      clean.searchParams.delete("ref");
      window.history.replaceState(null, "", clean.toString());
    } else if (paymentOutcome === "failed") {
      const description = paymentRef
        ? `Payment could not be completed. Your application (${paymentRef}) has been saved — you can retry payment from the Candidate Portal using that Applicant ID.`
        : "Payment did not complete. Please select a payment method and try again.";
      toast({ title: "Payment was not completed", description, variant: "destructive" });
      const clean = new URL(window.location.href);
      clean.searchParams.delete("payment");
      clean.searchParams.delete("ref");
      window.history.replaceState(null, "", clean.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore draft on mount (with TTL — discard if older than 24h).
  // Also clear any prior-version drafts to prevent schema-shape conflicts.
  useEffect(() => {
    try {
      // Drop any legacy draft keys from earlier form versions.
      ["ccm-admission-draft-v1"].forEach((legacy) => {
        try {
          localStorage.removeItem(legacy);
        } catch {
          /* ignore */
        }
      });

      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const isExpired =
        !parsed?.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS;
      if (isExpired) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (parsed?.values && typeof parsed.values === "object") {
        // Only restore keys that exist in the current schema — defensive against
        // older drafts containing removed fields.
        const current = form.getValues();
        const filtered: Record<string, unknown> = {};
        for (const key of Object.keys(current)) {
          if (key in parsed.values) filtered[key] = parsed.values[key];
        }
        form.reset({ ...current, ...filtered });
        form.clearErrors();
      }
    } catch {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft as user types
  useEffect(() => {
    const sub = form.watch((values) => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ savedAt: Date.now(), values }),
        );
        setDraftSavedAt(new Date());
      } catch {
        /* ignore */
      }
    });
    return () => sub.unsubscribe();
  }, [form]);

  // Required messages for configurable fields — used in manual required-check in handleNext
  const CONFIGURABLE_REQUIRED_MSGS: Partial<Record<keyof ApplicationFormValues, string>> = {
    bloodGroup:     "Please select blood group",
    studentMobile:  "Enter a valid 11-digit phone number (e.g. 03xx-xxxxxxx)",
    studentEmail:   "Please enter a valid email address",
    state:          "Please select a state",
    city:           "Please select a city",
    examCenter:     "Please select an exam center",
    relation:       "Please select relation",
    studentBForm:   "Enter a valid 13-digit B-Form / CNIC number",
    domicile:       "Please enter domicile province",
    motherName:     "Please enter mother's name",
    guardianEmail:  "Please enter a valid email address",
    alternatePhone: "Enter a valid 11-digit phone number (e.g. 03xx-xxxxxxx)",
  };

  async function handleNext() {
    const allStepFields = stepFields[step];
    // For Zod trigger: only include enabled+required configurable fields so the resolver
    // doesn't see empty values as errors for disabled/optional ones.
    const fieldsToValidate = allStepFields.filter((f) =>
      !CONFIGURABLE_FIELDS.has(f) || (fc(f).enabled && fc(f).required)
    ) as (keyof ApplicationFormValues)[];

    const ok = await form.trigger(fieldsToValidate);
    // Clear errors for fields outside this step AND for disabled/optional configurable fields.
    form.clearErrors(ALL_VALIDATED_FIELDS.filter((f) => !fieldsToValidate.includes(f)));

    // Manual required check: the schema makes configurable fields optional so Zod passes
    // empty strings. We enforce required here for enabled+required fields that are empty.
    const currentVals = form.getValues();
    let hasManualError = false;
    for (const [key, msg] of Object.entries(CONFIGURABLE_REQUIRED_MSGS) as [keyof ApplicationFormValues, string][]) {
      if (!allStepFields.includes(key)) continue;
      if (!fc(key).enabled || !fc(key).required) continue;
      const val = (currentVals[key] as string | undefined) ?? "";
      if (!val || val.trim() === "") {
        form.setError(key, { message: msg });
        hasManualError = true;
      }
    }

    // Step 1 also requires a photo — but only if the photo field is enabled+required.
    const photoRequired = fc("photo").enabled && fc("photo").required;
    if (step === 1 && photoRequired && !photoFile) {
      setPhotoError("Please upload a student photo");
      if (!ok || hasManualError) {
        setShowErrors(true);
        toast({ title: "Please complete this step", description: "Fix the highlighted fields and try again.", variant: "destructive" });
      }
      return;
    }
    if (!ok || hasManualError) {
      // Reveal the current step's validation messages so the user can fix them.
      setShowErrors(true);
      toast({
        title: "Please complete this step",
        description: "Fix the highlighted fields and try again.",
        variant: "destructive",
      });
      return;
    }
    // Current step is valid — advance with a clean slate so the next step never
    // shows errors before the user interacts with it.
    form.clearErrors();
    setShowErrors(false);
    setSelectedPayMethod("");
    setBankRef("");
    setBankDate("");
    setStep((s) => Math.min(s + 1, allStepsMeta.length - 1));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    // Clear any validation state so the previous step loads without stale errors.
    form.clearErrors();
    setShowErrors(false);
    setStep((s) => Math.max(s - 1, 0));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Payment step handlers ──────────────────────────────────────────────────

  // Surface a server 400 validation body ({ fields: [{ field, message }] }) onto
  // the form: mark each field, jump to the earliest affected step, and toast the
  // specific fields. Returns true when it handled field-level errors. Shared by
  // the standard submit (onSubmit) and the online-gateway submit path.
  function surfaceFieldErrors(body: unknown): boolean {
    const fields = Array.isArray((body as any)?.fields)
      ? ((body as any).fields as { field: string; message: string }[])
      : [];
    if (fields.length === 0) return false;
    setShowErrors(true);
    let earliestStep = Infinity;
    const labels: string[] = [];
    for (const f of fields) {
      form.setError(f.field as keyof ApplicationFormValues, {
        message: f.message || "Please check this field",
      });
      const st = fieldToStep[f.field];
      if (st !== undefined && st < earliestStep) earliestStep = st;
      labels.push(FIELD_LABELS[f.field] ?? f.field);
    }
    if (earliestStep !== Infinity) setStep(earliestStep);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    toast({
      title: "Please check these fields",
      description: `${labels.join(", ")} — ${fields[0].message || "needs attention"}.`,
      variant: "destructive",
    });
    return true;
  }

  async function handlePaymentComplete(method: string, reference: string, status: string) {
    paymentDataRef.current = { method, reference, status };
    await form.handleSubmit(onSubmit)();
  }

  async function handleSimulatePayment() {
    setPaymentProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setPaymentProcessing(false);
    await handlePaymentComplete("simulate", `SIM-${Date.now()}`, "paid");
  }

  async function handleGatewayPayment(gateway: "jazzcash" | "payfast") {
    setPaymentProcessing(true);

    // Collect form values and strip disabled configurable fields
    const values = form.getValues();
    const payload = { ...values } as Record<string, unknown>;
    for (const key of CONFIGURABLE_FIELDS) {
      if (!fc(key).enabled) delete payload[key];
    }
    payload.gateway = gateway;
    payload.session = CURRENT_SESSION;
    payload.photoFilename = photoFile?.name ?? "";

    try {
      const response = await fetch(withTenant("/api/applications/payment/initiate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPaymentProcessing(false);
        // 400 with field-level issues → target the exact fields (same as the
        // standard submit path) instead of a generic "could not start payment".
        if (response.status === 400 && surfaceFieldErrors(data)) return;
        toast({
          title: "Could not start payment",
          description:
            (data as any).error ||
            "An error occurred while connecting to the payment gateway. Please try again or use bank transfer.",
          variant: "destructive",
        });
        return;
      }

      const { actionUrl, fields } = (await response.json()) as {
        referenceId: string;
        txnRef: string;
        gateway: string;
        actionUrl: string;
        fields: Record<string, string>;
      };

      // Build and auto-submit a hidden form directed at the gateway URL.
      // The browser navigates away; the gateway will redirect back to our
      // /api/applications/payment/{gateway}/return handler on completion.
      const gatewayForm = document.createElement("form");
      gatewayForm.method = "POST";
      gatewayForm.action = actionUrl;
      for (const [name, value] of Object.entries(fields)) {
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = name;
        inp.value = value;
        gatewayForm.appendChild(inp);
      }
      document.body.appendChild(gatewayForm);
      gatewayForm.submit();
      // Keep paymentProcessing true — the page is navigating away to the gateway
    } catch (err) {
      setPaymentProcessing(false);
      toast({
        title: "Could not start payment",
        description:
          err instanceof Error
            ? err.message
            : "An error occurred while connecting to the payment gateway. Please try again or use bank transfer.",
        variant: "destructive",
      });
    }
  }

  function handleBankReceiptFile(file: File | null) {
    setBankReceiptFile(file);
    bankReceiptFileRef.current = file;
    setBankReceiptPreview("");
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setBankReceiptPreview(String(e.target?.result ?? ""));
      reader.readAsDataURL(file);
    }
  }

  async function handleBankSubmit() {
    if (!bankRef.trim() || !bankDate) return;
    setPaymentProcessing(true);
    bankReceiptFileRef.current = bankReceiptFile;
    await handlePaymentComplete("bank_deposit", bankRef.trim(), "bank_pending");
    setPaymentProcessing(false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  async function onSubmit(values: ApplicationFormValues) {
    const photoRequired = fc("photo").enabled && fc("photo").required;
    if (photoRequired && !photoFile) {
      setPhotoError("Please upload a student photo");
      setStep(1);
      return;
    }
    // Strip disabled configurable fields from the payload so the API doesn't receive
    // empty strings for fields the tenant has turned off.
    const payload = { ...values } as Record<string, unknown>;
    for (const key of CONFIGURABLE_FIELDS) {
      if (!fc(key).enabled) delete payload[key];
    }
    // Attach payment data — comes from the payment step or defaults to "free"
    const { method: payMethod, reference: payRef, status: payStatus } = paymentDataRef.current;

    // Encode the bank receipt file as base64 (if any) for the API
    let receiptBase64: string | undefined;
    let receiptMime: string | undefined;
    let receiptName: string | undefined;
    const receiptFile = bankReceiptFileRef.current;
    if (receiptFile && payMethod === "bank_deposit") {
      receiptBase64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = (e) => resolve((e.target?.result as string).split(",")[1] ?? "");
        r.readAsDataURL(receiptFile);
      });
      receiptMime = receiptFile.type;
      receiptName = receiptFile.name;
    }

    try {
      const created = await submitMutation.mutateAsync({
        data: {
          ...payload,
          session: CURRENT_SESSION,
          photoFilename: photoFile?.name ?? "",
          paymentMethod: payMethod || undefined,
          paymentReference: payRef || undefined,
          paymentStatus: payStatus || undefined,
          receiptBase64,
          receiptMime,
          receiptName,
        } as unknown as Parameters<typeof submitMutation.mutateAsync>[0]["data"],
      });
      setReferenceId(created.referenceId);
      setPortalUsername(values.studentEmail || values.studentMobile);
      setPortalPassword((created as { portalPassword?: string }).portalPassword ?? "");
      setSubmittedPayment({ method: payMethod, status: payStatus });
      setSubmitted(true);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      toast({
        title: "Application Submitted",
        description: `Your Applicant ID is ${created.referenceId}.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body    = (err.data as any) ?? {};
        const code    = body?.code as string | undefined;
        const refId   = body?.existingReferenceId as string | undefined;
        const refHint = refId ? ` Your existing Applicant ID is ${refId}.` : "";
        const bFormDup = code === "duplicate_bform";
        const emailDup = !bFormDup && (code === "duplicate_email" || code === "duplicate_email_and_phone");
        const phoneDup = !bFormDup && (code === "duplicate_phone" || code === "duplicate_email_and_phone");
        if (bFormDup) {
          setStep(3);
          setShowErrors(true);
          form.setError("studentBForm", { message: "An application with this B-Form number is already registered" });
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
          toast({
            title: "Application already exists",
            description: `A submission with this student B-Form / CNIC has already been received.${refHint} Use the Candidate Portal to track it.`,
            variant: "destructive",
          });
        } else {
          const field = emailDup && phoneDup ? "email address and phone number"
                      : emailDup             ? "email address"
                      :                        "phone number";
          setStep(2);
          setShowErrors(true);
          if (emailDup) form.setError("studentEmail",  { message: "An application with this email is already registered" });
          if (phoneDup) form.setError("studentMobile", { message: "An application with this phone number is already registered" });
          if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
          toast({
            title: "Application already exists",
            description: `An application using this ${field} has already been submitted.${refHint} Use the Candidate Portal to track your existing application.`,
            variant: "destructive",
          });
        }
        return;
      }
      // 400 with a field-keyed list → mark those exact fields and jump the user
      // to the earliest step that needs fixing, instead of a generic message.
      if (err instanceof ApiError && err.status === 400 && surfaceFieldErrors((err.data as any) ?? {})) {
        return;
      }
      const message =
        err instanceof ApiError
          ? err.status === 400
            ? ((err.data as any)?.error ?? "Some details look invalid. Please review and try again.")
            : "We couldn't save your application right now. Please retry in a moment."
          : "Network error. Please check your connection and try again.";
      toast({
        title: "Submission failed",
        description: message,
        variant: "destructive",
      });
    }
  }

  function startNewApplication() {
    form.reset();
    setReferenceId("");
    setPortalUsername("");
    setSubmitted(false);
    setStep(0);
    setPhase("information");
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoError("");
    setSelectedPayMethod("");
    setBankRef("");
    setBankDate("");
    setSubmittedPayment(null);
    paymentDataRef.current = { method: "free", reference: "", status: "free" };
  }

  function goToApply() {
    setPhase("apply");
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function backToInformation() {
    setPhase("information");
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

  const progressPercent = ((step + 1) / allStepsMeta.length) * 100;

  return (
    <>
      <Helmet>
        <title>Admissions Open 2026-27 | Cadet College Murree</title>
        <meta
          name="description"
          content="Apply now for Cadet College Murree admissions 2026-27. Classes 6th to 11th (Pre-Medical, Pre-Engineering, ICS). Eligibility criteria, fee structure, and online application form."
        />
        <link rel="canonical" href={`${baseUrl}/admissions`} />
        <meta property="og:title" content="Admissions Open 2026-27 | Cadet College Murree" />
        <meta property="og:description" content="Apply for Cadet College Murree admissions. Classes 6-11. Eligibility, fee structure, and online application." />
        <meta property="og:url" content={`${baseUrl}/admissions`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <div>
        <PageHero title={<EditableText page="admissions" blockKey="hero_title" value={blocks.hero_title || "Online Admission"} />} breadcrumb="Online Admission" />

        {/* Admission notice strip */}
        <div className="bg-accent/10 border-b border-accent/20 py-4 px-4 text-center" data-testid="admissions-notice">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Badge className="bg-accent text-accent-foreground text-sm px-4 py-1"><EditableText as="span" page="admissions" blockKey="admissions_notice_badge" value={blocks.admissions_notice_badge || "Admissions Open — Intake 2026-27"} /></Badge>
            <p className="text-foreground/85 text-sm">
              <EditableText as="span" multiline page="admissions" blockKey="admissions_notice_body" value={blocks.admissions_notice_body || "Cadet College Murree invites applications for First Year (Pre-Medical, Pre-Engineering, ICS) and Classes 6th–9th."} />
            </p>
            <div className="flex items-center gap-1.5 text-accent font-semibold text-sm">
              <AlertCircle className="w-4 h-4" />
              <EditableText
                as="span"
                page="admissions"
                blockKey="admissions_last_date"
                value={blocks.admissions_last_date || `Last Date: ${settings.admissions_deadline
                  ? formatDateLong(settings.admissions_deadline)
                  : "31 October 2026"}`}
              />
            </div>
          </div>
        </div>

        {/* Two-phase admission flow: Information → Apply */}
        <SectionColor page="admissions" scope="tabs" label="Admissions" kind="light" className="py-16 px-4 max-w-7xl mx-auto" data-testid="admissions-tabs">
          {submitted ? (
            <SubmittedSuccess
              referenceId={referenceId}
              portalUsername={portalUsername}
              portalPassword={portalPassword}
              onReset={startNewApplication}
              paymentMethod={submittedPayment?.method ?? null}
              paymentStatus={submittedPayment?.status ?? null}
            />
          ) : phase === "information" ? (
            <AdmissionInformation
              blocks={blocks}
              settings={settings}
              applicationFeeEnabled={applicationFeeEnabled}
              publicClasses={publicClasses ?? []}
              publicClassesLoading={publicClassesLoading}
              onProceed={goToApply}
            />
          ) : (
            <div ref={formRef}>
              <button
                type="button"
                onClick={backToInformation}
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-accent mb-6 transition-colors"
                data-testid="button-back-to-information"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Information &amp; Instructions
              </button>
              <motion.div initial="hidden" animate="visible" variants={fadeUp}>
                  {/* Wizard header */}
                  <div className="mb-8">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-primary"><EditableText as="span" page="admissions" blockKey="form_heading" value={blocks.form_heading || "Online Application Form"} /></h2>
                        <p className="text-foreground/80 mt-1">
                          Step {step + 1} of {allStepsMeta.length} — {allStepsMeta[step]?.title ?? ""}
                        </p>
                      </div>
                      {draftSavedAt && (
                        <div
                          className="inline-flex items-center gap-1.5 text-xs text-foreground/65 bg-muted/60 border border-border px-3 py-1.5 rounded-full"
                          data-testid="draft-saved-indicator"
                        >
                          <Save className="w-3.5 h-3.5 text-accent" />
                          <span>Draft saved</span>
                        </div>
                      )}
                    </div>

                    {/* Progress bar */}
                    <Progress value={progressPercent} className="h-2 mt-4" data-testid="wizard-progress" />

                    {/* Step indicators */}
                    <ol className={`mt-6 grid gap-2 sm:gap-3 ${allStepsMeta.length >= 5 ? "grid-cols-5" : "grid-cols-4"}`} aria-label="Application steps">
                      {allStepsMeta.map((s, i) => {
                        const Icon = s.Icon;
                        const isActive = i === step;
                        const isDone = i < step;
                        return (
                          <li
                            key={s.title}
                            className={`relative flex items-center gap-2 sm:gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                              isActive
                                ? "border-primary bg-primary/5"
                                : isDone
                                ? "border-accent/40 bg-accent/5"
                                : "border-border bg-card"
                            }`}
                            data-testid={`wizard-step-${i}`}
                          >
                            <span
                              className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors ${
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : isDone
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-muted text-foreground/60"
                              }`}
                            >
                              {isDone ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                            </span>
                            <div className="min-w-0 hidden sm:block">
                              <div className={`text-xs font-semibold uppercase tracking-wider ${isActive ? "text-primary" : isDone ? "text-accent" : "text-foreground/55"}`}>
                                Step {i + 1}
                              </div>
                              <div className="text-sm font-semibold text-foreground truncate">{s.title}</div>
                            </div>
                            <div className="sm:hidden text-xs font-semibold text-foreground truncate">{s.title}</div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  <Form {...form}>
                   <RevealErrorsContext.Provider value={showErrors}>
                    <form
                      onSubmit={form.handleSubmit(onSubmit, () => setShowErrors(true))}
                      className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm"
                      data-testid="admission-form"
                    >
                      <AnimatePresence mode="wait">
                        {step === 0 && (
                          <motion.div
                            key="step-0"
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.25 }}
                            className="grid sm:grid-cols-2 gap-6"
                          >
                            <FormField control={form.control} name="classApplying" render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>Class/Program *</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-class">
                                      <SelectValue placeholder="Select class" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {(publicClasses ?? []).length === 0 ? (
                                      <>
                                        <SelectItem value="class-6">Class VI</SelectItem>
                                        <SelectItem value="class-7">Class VII</SelectItem>
                                        <SelectItem value="class-8">Class VIII</SelectItem>
                                        <SelectItem value="class-9">Class IX</SelectItem>
                                        <SelectItem value="class-11-premedical">Class XI (Pre-Medical)</SelectItem>
                                        <SelectItem value="class-11-preengineering">Class XI (Pre-Engineering)</SelectItem>
                                        <SelectItem value="class-11-ics">Class XI (ICS)</SelectItem>
                                      </>
                                    ) : (
                                      (publicClasses ?? []).map((c) => (
                                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="previousMarks" render={({ field, fieldState }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>Previous Class/Program Marks (%) *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="e.g. 85"
                                    inputMode="numeric"
                                    data-testid="input-marks"
                                    isValid={!fieldState.invalid && field.value.length >= 1}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                                <p className="text-xs text-foreground/65 mt-1">
                                  Minimum 70% is required for eligibility.
                                </p>
                              </FormItem>
                            )} />
                            <div className="sm:col-span-2 bg-primary/[0.04] border border-primary/15 rounded-xl p-4 flex gap-3 text-sm">
                              <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                              <div className="text-foreground/85">
                                After submission you'll receive a unique Applicant ID. Keep it safe — you'll need it to check your application status and entry-test results.
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {step === 1 && (
                          <motion.div
                            key="step-1"
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.25 }}
                            className="grid sm:grid-cols-2 gap-6"
                          >
                            <FormField control={form.control} name="fullName" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Full Name *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="Full name"
                                    data-testid="input-fullname"
                                    isValid={!fieldState.invalid && field.value.length >= 2}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("gender").enabled && (
                            <FormField control={form.control} name="gender" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Gender {fc("gender").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-gender">
                                      <SelectValue placeholder="Select gender" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            <FormField control={form.control} name="dateOfBirth" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Date of Birth *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    type="date"
                                    data-testid="input-dob"
                                    isValid={!fieldState.invalid && !!field.value}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("bloodGroup").enabled && (
                            <FormField control={form.control} name="bloodGroup" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Blood Group {fc("bloodGroup").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-blood-group">
                                      <SelectValue placeholder="Select blood group" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {BLOOD_GROUPS.map((b) => (
                                      <SelectItem key={b} value={b}>{b}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("religion").enabled && (
                            <FormField control={form.control} name="religion" render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>Religion {fc("religion").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-religion">
                                      <SelectValue placeholder="Select religion" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {RELIGIONS.map((r) => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}

                            {fc("domicile").enabled && (
                            <FormField control={form.control} name="domicile" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Domicile Province {fc("domicile").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-domicile">
                                      <SelectValue placeholder="Select province" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {STATES.map((s) => (
                                      <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("photo").enabled && (
                            <div className="sm:col-span-2 space-y-2">
                              <label className="text-sm font-medium leading-none">
                                Student Photo {fc("photo").required ? "*" : <span className="text-foreground/50 font-normal text-xs">(optional)</span>}
                              </label>
                              <PhotoUpload
                                file={photoFile}
                                preview={photoPreview}
                                error={photoError}
                                onChange={handlePhotoChange}
                              />
                            </div>
                            )}
                          </motion.div>
                        )}

                        {step === 2 && (
                          <motion.div
                            key="step-2"
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.25 }}
                            className="grid sm:grid-cols-2 gap-6"
                          >
                            {fc("studentMobile").enabled && (
                            <FormField control={form.control} name="studentMobile" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Student Mobile No {fc("studentMobile").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="03xx-xxxxxxx"
                                    inputMode="tel"
                                    data-testid="input-student-mobile"
                                    value={field.value}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    onChange={(e) => field.onChange(formatPhone(e.target.value))}
                                    isValid={!fieldState.invalid && field.value.replace(/\D/g, "").length === 11}
                                    maxLength={12}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("studentEmail").enabled && (
                            <FormField control={form.control} name="studentEmail" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Student Email {fc("studentEmail").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    type="email"
                                    placeholder="student@example.com"
                                    data-testid="input-student-email"
                                    isValid={!fieldState.invalid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            <FormField control={form.control} name="presentAddress" render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>Present Address *</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="House #, street, area" rows={3} data-testid="textarea-address" {...field} />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("state").enabled && (
                            <FormField control={form.control} name="state" render={({ field }) => (
                              <FormItem>
                                <FormLabel>State / Province {fc("state").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-state">
                                      <SelectValue placeholder="Select state" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {STATES.map((s) => (
                                      <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("city").enabled && (
                            <FormField control={form.control} name="city" render={({ field }) => (
                              <FormItem>
                                <FormLabel>City {fc("city").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  disabled={!selectedState}
                                >
                                  <FormControl>
                                    <SelectTrigger data-testid="select-city">
                                      <SelectValue placeholder={selectedState ? "Select city" : "Select state first"} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {cityOptions.map((c) => (
                                      <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("examCenter").enabled && (
                            <FormField control={form.control} name="examCenter" render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel>Exam Center {fc("examCenter").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-exam-center">
                                      <SelectValue placeholder="Select exam center" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {examCenters.length === 0 ? (
                                      <SelectItem value="__loading" disabled>Loading centres…</SelectItem>
                                    ) : (
                                      examCenters.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                                <p className="text-xs text-foreground/65 mt-1">
                                  Pick the city most convenient for sitting the entry test.
                                </p>
                              </FormItem>
                            )} />
                            )}
                          </motion.div>
                        )}

                        {step === 3 && (
                          <motion.div
                            key="step-3"
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.25 }}
                            className="grid sm:grid-cols-2 gap-6"
                          >
                            <FormField control={form.control} name="guardianName" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Guardian Name *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="Full name of guardian"
                                    data-testid="input-guardian-name"
                                    isValid={!fieldState.invalid && field.value.length >= 3}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("relation").enabled && (
                            <FormField control={form.control} name="relation" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Relation {fc("relation").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-relation">
                                      <SelectValue placeholder="Select relation" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {RELATIONS.map((r) => (
                                      <SelectItem key={r} value={r}>{r}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            <FormField control={form.control} name="fatherName" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Father's Name *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="As per CNIC"
                                    data-testid="input-fathername"
                                    isValid={!fieldState.invalid && field.value.length >= 3}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("occupation").enabled && (
                            <FormField control={form.control} name="occupation" render={({ field }) => (
                              <FormItem>
                                <FormLabel>Occupation {fc("occupation").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Government Officer" data-testid="input-occupation" {...field} />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            <FormField control={form.control} name="guardianMobile" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Guardian Mobile No *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="03xx-xxxxxxx"
                                    inputMode="tel"
                                    data-testid="input-guardian-mobile"
                                    value={field.value}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    onChange={(e) => field.onChange(formatPhone(e.target.value))}
                                    isValid={!fieldState.invalid && field.value.replace(/\D/g, "").length === 11}
                                    maxLength={12}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            <FormField control={form.control} name="parentCnic" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Parent CNIC *</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="XXXXX-XXXXXXX-X"
                                    inputMode="numeric"
                                    data-testid="input-parent-cnic"
                                    value={field.value}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    onChange={(e) => field.onChange(formatCnic(e.target.value))}
                                    isValid={!fieldState.invalid && field.value.replace(/\D/g, "").length === 13}
                                    maxLength={15}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            {fc("studentBForm").enabled && (
                            <FormField control={form.control} name="studentBForm" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Student B-Form / CNIC No. {fc("studentBForm").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="XXXXX-XXXXXXX-X"
                                    inputMode="numeric"
                                    data-testid="input-student-bform"
                                    value={field.value}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    onChange={(e) => field.onChange(formatCnic(e.target.value))}
                                    isValid={!fieldState.invalid && field.value.replace(/\D/g, "").length === 13}
                                    maxLength={15}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("motherName").enabled && (
                            <FormField control={form.control} name="motherName" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Mother's Name {fc("motherName").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="As per B-Form"
                                    data-testid="input-mother-name"
                                    isValid={!fieldState.invalid && field.value.length >= 3}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("guardianEmail").enabled && (
                            <FormField control={form.control} name="guardianEmail" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Guardian Email {fc("guardianEmail").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    type="email"
                                    placeholder="guardian@example.com"
                                    data-testid="input-guardian-email"
                                    isValid={!fieldState.invalid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)}
                                    {...field}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            {fc("alternatePhone").enabled && (
                            <FormField control={form.control} name="alternatePhone" render={({ field, fieldState }) => (
                              <FormItem>
                                <FormLabel>Alternate Phone {fc("alternatePhone").required ? "*" : <span className="text-foreground/50 font-normal">(optional)</span>}</FormLabel>
                                <FormControl>
                                  <ValidatedInput
                                    placeholder="03xx-xxxxxxx"
                                    inputMode="tel"
                                    data-testid="input-alternate-phone"
                                    value={field.value}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    onChange={(e) => field.onChange(formatPhone(e.target.value))}
                                    isValid={!fieldState.invalid && field.value.replace(/\D/g, "").length === 11}
                                    maxLength={12}
                                  />
                                </FormControl>
                                <GatedFormMessage />
                              </FormItem>
                            )} />
                            )}
                            <div className="sm:col-span-2 bg-accent/[0.06] border border-accent/25 rounded-xl p-4 text-sm text-foreground/85">
                              By submitting, you confirm the information provided is accurate. Inaccurate submissions may delay or cancel your application.
                            </div>
                          </motion.div>
                        )}

                        {/* ── Step 4: Payment ─────────────────────────────────────────── */}
                        {step === 4 && (
                          <motion.div
                            key="step-4"
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -24 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-6"
                            data-testid="wizard-step-payment"
                          >
                            {/* Fee summary banner */}
                            <div className="flex items-center gap-4 bg-primary/5 border border-primary/20 rounded-2xl p-5">
                              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                                <Wallet className="w-6 h-6 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-primary text-base">Application Processing Fee</h3>
                                <p className="text-sm text-foreground/65">Please pay the one-time fee to submit your application.</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-2xl font-bold text-primary">
                                  Rs.&nbsp;{(paymentConfig?.applicationFeeAmount ?? 500).toLocaleString()}/-
                                </div>
                              </div>
                            </div>

                            {/* Payment method selector */}
                            <div className="space-y-3">
                              <h4 className="font-semibold text-foreground text-sm uppercase tracking-wider">Select Payment Method</h4>

                              {/* Bank Deposit */}
                              {paymentConfig?.enableBankDeposit !== false && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPayMethod("bank_deposit")}
                                  disabled={paymentProcessing}
                                  data-testid="pay-method-bank"
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors ${
                                    selectedPayMethod === "bank_deposit"
                                      ? "border-primary bg-primary/5"
                                      : "border-border bg-card hover:border-primary/40"
                                  }`}
                                >
                                  <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground">Bank Deposit / Transfer</div>
                                    <div className="text-xs text-foreground/60">Deposit to our bank account and enter the transaction reference</div>
                                  </div>
                                  {selectedPayMethod === "bank_deposit" && <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />}
                                </button>
                              )}

                              {/* JazzCash — only when enabled AND credentials are configured */}
                              {paymentConfig?.enableJazzcash !== false && paymentConfig?.jazzcashConfigured === true && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPayMethod("jazzcash")}
                                  disabled={paymentProcessing}
                                  data-testid="pay-method-jazzcash"
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors ${
                                    selectedPayMethod === "jazzcash"
                                      ? "border-[#CC0000] bg-[#CC0000]/5"
                                      : "border-border bg-card hover:border-[#CC0000]/40"
                                  }`}
                                >
                                  <div className="w-10 h-10 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-[#CC0000] text-xs">JC</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground">JazzCash</div>
                                    <div className="text-xs text-foreground/60">Pay instantly via JazzCash mobile wallet</div>
                                  </div>
                                  {selectedPayMethod === "jazzcash" && <CheckCircle className="w-5 h-5 text-[#CC0000] flex-shrink-0" />}
                                </button>
                              )}

                              {/* PayFast — only when enabled AND credentials are configured */}
                              {paymentConfig?.enablePayfast !== false && paymentConfig?.payfastConfigured === true && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedPayMethod("payfast")}
                                  disabled={paymentProcessing}
                                  data-testid="pay-method-payfast"
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-colors ${
                                    selectedPayMethod === "payfast"
                                      ? "border-[#00BCD4] bg-[#00BCD4]/5"
                                      : "border-border bg-card hover:border-[#00BCD4]/40"
                                  }`}
                                >
                                  <div className="w-10 h-10 bg-cyan-50 border border-cyan-100 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-[#00BCD4] text-xs">PF</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-foreground">PayFast</div>
                                    <div className="text-xs text-foreground/60">Pay securely via PayFast online gateway</div>
                                  </div>
                                  {selectedPayMethod === "payfast" && <CheckCircle className="w-5 h-5 text-[#00BCD4] flex-shrink-0" />}
                                </button>
                              )}

                              {/* Simulate Payment — dev/demo only */}
                              {!import.meta.env.PROD && (
                              <button
                                type="button"
                                onClick={() => setSelectedPayMethod("simulate")}
                                disabled={paymentProcessing}
                                data-testid="pay-method-simulate"
                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed text-left transition-colors ${
                                  selectedPayMethod === "simulate"
                                    ? "border-accent bg-accent/5"
                                    : "border-border/60 bg-muted/30 hover:border-accent/40"
                                }`}
                              >
                                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <Sparkles className="w-5 h-5 text-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-foreground">Simulate Payment <span className="text-xs font-normal text-foreground/50">(test / demo)</span></div>
                                  <div className="text-xs text-foreground/60">Instantly marks payment as successful — no real transaction</div>
                                </div>
                                {selectedPayMethod === "simulate" && <CheckCircle className="w-5 h-5 text-accent flex-shrink-0" />}
                              </button>
                              )}
                            </div>

                            {/* Bank Deposit panel */}
                            {selectedPayMethod === "bank_deposit" && (
                              <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="panel-bank-deposit">
                                <div className="bg-muted/60 rounded-lg p-4 space-y-2 text-sm">
                                  <div className="font-semibold text-foreground/70 text-xs uppercase tracking-wider mb-2">Bank Account Details</div>
                                  {[
                                    ["Bank", paymentConfig?.bankName ?? "—"],
                                    ["Branch", paymentConfig?.bankBranch ?? "—"],
                                    ["Account Title", paymentConfig?.accountTitle ?? "—"],
                                    ["Account Number", paymentConfig?.accountNumber ?? "—"],
                                  ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between items-center gap-4">
                                      <span className="text-foreground/60 font-medium">{label}</span>
                                      <span className="font-semibold text-foreground text-right">{value}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-sm font-semibold text-foreground">Transaction Reference Number <span className="text-destructive">*</span></label>
                                  <input
                                    type="text"
                                    placeholder="e.g. TXN-20260626-012345"
                                    value={bankRef}
                                    onChange={(e) => setBankRef(e.target.value)}
                                    disabled={paymentProcessing}
                                    data-testid="input-bank-ref"
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-sm font-semibold text-foreground">Payment Date <span className="text-destructive">*</span></label>
                                  <input
                                    type="date"
                                    value={bankDate}
                                    onChange={(e) => setBankDate(e.target.value)}
                                    disabled={paymentProcessing}
                                    data-testid="input-bank-date"
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-sm font-semibold text-foreground">
                                    Upload Receipt <span className="text-foreground/50 font-normal">(optional — JPG, PNG or PDF, max 5 MB)</span>
                                  </label>
                                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm cursor-pointer transition-colors w-full justify-center ${paymentProcessing ? "opacity-50 cursor-not-allowed border-border text-foreground/50" : "border-primary/40 text-primary hover:bg-primary/5"}`}>
                                    <Upload className="w-4 h-4 flex-shrink-0" />
                                    <span>{bankReceiptFile ? "Replace file" : "Choose file"}</span>
                                    <input
                                      type="file"
                                      accept=".jpg,.jpeg,.png,.pdf"
                                      className="hidden"
                                      disabled={paymentProcessing}
                                      onChange={(e) => handleBankReceiptFile(e.target.files?.[0] ?? null)}
                                    />
                                  </label>
                                  {bankReceiptPreview && (
                                    <div className="relative inline-block mt-1">
                                      <img src={bankReceiptPreview} alt="Receipt preview" className="max-w-[200px] max-h-[200px] rounded-lg border border-border object-contain" />
                                      <button type="button" onClick={() => handleBankReceiptFile(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs">×</button>
                                    </div>
                                  )}
                                  {bankReceiptFile && !bankReceiptPreview && (
                                    <div className="flex items-center gap-2 mt-1 text-sm text-foreground/70">
                                      <FileText className="w-4 h-4 flex-shrink-0" />
                                      <span className="truncate">{bankReceiptFile.name}</span>
                                      <button type="button" onClick={() => handleBankReceiptFile(null)} className="ml-auto text-destructive hover:underline text-xs">Remove</button>
                                    </div>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="lg"
                                  onClick={handleBankSubmit}
                                  disabled={!bankRef.trim() || !bankDate || paymentProcessing}
                                  className="w-full bg-primary hover:bg-primary/90 font-bold gap-2"
                                  data-testid="button-confirm-bank"
                                >
                                  {paymentProcessing ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                                  ) : (
                                    <><CheckCircle className="w-4 h-4" /> Confirm & Submit Application</>
                                  )}
                                </Button>
                                <p className="text-xs text-foreground/55 text-center">
                                  Your application will be marked as <strong>Bank Pending</strong> until our team verifies the deposit.
                                </p>
                              </div>
                            )}

                            {/* JazzCash panel */}
                            {selectedPayMethod === "jazzcash" && (
                              <div className="bg-card border border-border rounded-xl p-5 text-center space-y-4" data-testid="panel-jazzcash">
                                {paymentProcessing ? (
                                  <div className="py-6 space-y-3">
                                    <Loader2 className="w-10 h-10 animate-spin text-[#CC0000] mx-auto" />
                                    <p className="text-foreground/70 font-medium">Processing via JazzCash…</p>
                                    <p className="text-xs text-foreground/50">Please wait while we confirm your payment.</p>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm text-foreground/75">Click below to pay <strong>Rs. {(paymentConfig?.applicationFeeAmount ?? 500).toLocaleString()}/-</strong> via JazzCash.</p>
                                    <Button
                                      type="button"
                                      size="lg"
                                      onClick={() => handleGatewayPayment("jazzcash")}
                                      className="w-full bg-[#CC0000] hover:bg-[#aa0000] text-white font-bold gap-2"
                                      data-testid="button-pay-jazzcash"
                                    >
                                      Pay with JazzCash
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* PayFast panel */}
                            {selectedPayMethod === "payfast" && (
                              <div className="bg-card border border-border rounded-xl p-5 text-center space-y-4" data-testid="panel-payfast">
                                {paymentProcessing ? (
                                  <div className="py-6 space-y-3">
                                    <Loader2 className="w-10 h-10 animate-spin text-[#00BCD4] mx-auto" />
                                    <p className="text-foreground/70 font-medium">Processing via PayFast…</p>
                                    <p className="text-xs text-foreground/50">Please wait while we confirm your payment.</p>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-sm text-foreground/75">Click below to pay <strong>Rs. {(paymentConfig?.applicationFeeAmount ?? 500).toLocaleString()}/-</strong> via PayFast.</p>
                                    <Button
                                      type="button"
                                      size="lg"
                                      onClick={() => handleGatewayPayment("payfast")}
                                      className="w-full bg-[#00BCD4] hover:bg-[#0097A7] text-white font-bold gap-2"
                                      data-testid="button-pay-payfast"
                                    >
                                      Pay with PayFast
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Simulate panel — dev/demo only */}
                            {!import.meta.env.PROD && selectedPayMethod === "simulate" && (
                              <div className="bg-accent/5 border border-accent/25 rounded-xl p-5 space-y-3" data-testid="panel-simulate">
                                <p className="text-sm text-foreground/70">
                                  <strong>Test mode:</strong> clicking the button below instantly marks your payment as successful without any real transaction. Use this in demo / development environments.
                                </p>
                                {paymentProcessing ? (
                                  <div className="flex items-center justify-center gap-3 py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                                    <span className="font-medium text-foreground/70">Processing…</span>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    size="lg"
                                    onClick={handleSimulatePayment}
                                    className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold gap-2"
                                    data-testid="button-simulate-payment"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    Simulate Payment &amp; Submit
                                  </Button>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Navigation */}
                      <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBack}
                          disabled={step === 0 || paymentProcessing}
                          className="gap-2"
                          data-testid="button-wizard-back"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">Back</span>
                        </Button>

                        {/* On the payment step the UI itself provides action buttons */}
                        {step !== 4 && (step < allStepsMeta.length - 1 ? (
                          <Button
                            type="button"
                            size="lg"
                            onClick={handleNext}
                            className="gap-2 bg-primary hover:bg-primary/90 px-6"
                            data-testid="button-wizard-next"
                          >
                            Continue
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            size="lg"
                            className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-6 shadow-lg shadow-accent/20"
                            data-testid="button-submit-application"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Submit Application
                          </Button>
                        ))}
                      </div>
                    </form>
                   </RevealErrorsContext.Provider>
                  </Form>
                </motion.div>
              </div>
            )}
        </SectionColor>

        {/* Admission Schedule */}
        <SectionColor page="admissions" scope="schedule" label="Admission Schedule" kind="light" className="bg-muted py-16 px-4 border-t border-border" data-testid="admissions-schedule">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-primary mb-8 text-center"><EditableText as="span" page="admissions" blockKey="schedule_heading" value={blocks.schedule_heading || "Admission Schedule"} /></h2>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-bold text-primary mb-2"><EditableText as="span" page="admissions" blockKey="schedule_a_title" value={blocks.schedule_a_title || "Classes 6th to 9th"} /></h3>
                <p className="text-sm text-foreground/80 mb-3"><EditableText as="span" multiline page="admissions" blockKey="schedule_a_intro" value={blocks.schedule_a_intro || "Admissions are announced twice a year:"} /></p>
                <ul className="text-sm space-y-1 text-foreground/85">
                  <li>• <EditableText as="span" page="admissions" blockKey="schedule_a_period1" value={blocks.schedule_a_period1 || "October to November"} /></li>
                  <li>• <EditableText as="span" page="admissions" blockKey="schedule_a_period2" value={blocks.schedule_a_period2 || "February to March"} /></li>
                </ul>
                <p className="text-xs text-foreground/80 mt-3"><EditableText as="span" multiline page="admissions" blockKey="schedule_a_note" value={blocks.schedule_a_note || "Advertisement published in leading national newspapers."} /></p>
              </div>
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="font-bold text-primary mb-2"><EditableText as="span" page="admissions" blockKey="schedule_b_title" value={blocks.schedule_b_title || "Class 11th (FSc / ICS)"} /></h3>
                <p className="text-sm text-foreground/80 mb-3"><EditableText as="span" multiline page="admissions" blockKey="schedule_b_intro" value={blocks.schedule_b_intro || "Admissions are announced once a year:"} /></p>
                <ul className="text-sm space-y-1 text-foreground/85">
                  <li>• <EditableText as="span" page="admissions" blockKey="schedule_b_period1" value={blocks.schedule_b_period1 || "May to June"} /></li>
                </ul>
                <p className="text-xs text-foreground/80 mt-3"><EditableText as="span" multiline page="admissions" blockKey="schedule_b_note" value={blocks.schedule_b_note || "Pre-Medical, Pre-Engineering, and ICS disciplines available."} /></p>
              </div>
            </div>
          </div>
        </SectionColor>
      </div>
    </>
  );
}

type ValidatedInputProps = React.InputHTMLAttributes<HTMLInputElement> & { isValid?: boolean };

const ValidatedInput = forwardRef<HTMLInputElement, ValidatedInputProps>(
  ({ isValid, className, ...props }, ref) => {
    return (
      <div className="relative">
        <Input
          ref={ref}
          className={`${isValid ? "border-accent/60 pr-10 focus-visible:ring-accent/30" : ""} ${className ?? ""}`}
          {...props}
        />
        {isValid && (
          <CheckCircle className="w-4 h-4 text-accent absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
      </div>
    );
  },
);
ValidatedInput.displayName = "ValidatedInput";

function PhotoUpload({
  file,
  preview,
  error,
  onChange,
}: {
  file: File | null;
  preview: string;
  error: string;
  onChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputId = "student-photo-input";

  return (
    <div data-testid="photo-upload">
      {!file ? (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onChange(f);
          }}
          className={`flex flex-col items-center justify-center gap-3 cursor-pointer rounded-xl border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-accent bg-accent/5"
              : error
              ? "border-destructive/50 bg-destructive/5"
              : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/[0.03]"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Upload className="w-5 h-5" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground text-sm">
              Drag and drop a photo, or click to browse
            </div>
            <div className="text-xs text-foreground/60 mt-1">
              JPG or PNG, up to 2 MB
            </div>
          </div>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="input-photo"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border border-accent/40 bg-accent/[0.04] p-4">
          {preview ? (
            <img
              src={preview}
              alt="Student photo preview"
              className="w-20 h-20 rounded-lg object-cover border border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-foreground/50" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-primary text-sm truncate">{file.name}</div>
            <div className="text-xs text-foreground/60 mt-0.5">
              {(file.size / 1024).toFixed(0)} KB
            </div>
            <div className="flex gap-2 mt-2">
              <label
                htmlFor={inputId}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent cursor-pointer"
              >
                <Upload className="w-3 h-3" /> Replace
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline"
                data-testid="button-remove-photo"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="text-sm text-destructive mt-2" data-testid="photo-error">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmittedSuccess({ referenceId, portalUsername, portalPassword, onReset, paymentMethod, paymentStatus }: { referenceId: string; portalUsername: string; portalPassword?: string; onReset: () => void; paymentMethod?: string | null; paymentStatus?: string | null }) {
  const trackHref = `/status?ref=${encodeURIComponent(referenceId)}`;
  return <SubmittedSuccessInner referenceId={referenceId} portalUsername={portalUsername} portalPassword={portalPassword} onReset={onReset} trackHref={trackHref} paymentMethod={paymentMethod} paymentStatus={paymentStatus} />;
}

function SubmittedSuccessInner({ referenceId, portalUsername, portalPassword, onReset, trackHref, paymentMethod, paymentStatus }: { referenceId: string; portalUsername: string; portalPassword?: string; onReset: () => void; trackHref: string; paymentMethod?: string | null; paymentStatus?: string | null }) {
  const { toast } = useToast();

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(referenceId);
      toast({ title: "Copied!", description: "Applicant ID copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Please copy the ID manually.", variant: "destructive" });
    }
  };

  const timeline = [
    { Icon: ClipboardCheck, title: "Application Verified", desc: "Our team reviews your submission within 2-3 working days." },
    { Icon: Phone, title: "Confirmation Call", desc: "We'll call to confirm your details and answer any questions." },
    { Icon: CalendarCheck, title: "Entry Test Scheduled", desc: "Test date, time and centre will be shared via SMS & email." },
    { Icon: GraduationCap, title: "Interview & Result", desc: "Final result is announced within two weeks of the test." },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      data-testid="submission-success"
    >
      {/* Celebratory confetti burst — fires once when this screen mounts */}
      <Confetti trigger={referenceId} count={130} durationMs={5000} />

      {/* Success hero card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-[#053d15] to-[#021a07] rounded-3xl p-8 md:p-12 text-center text-white shadow-xl">
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-secondary/15 blur-3xl pointer-events-none" />

        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
          className="relative z-10 inline-flex w-20 h-20 rounded-full bg-accent items-center justify-center mb-6 shadow-2xl shadow-accent/40"
        >
          <CheckCircle className="w-10 h-10 text-white" />
        </motion.div>

        <h2 className="relative z-10 text-3xl md:text-4xl font-bold mb-3">Application Received!</h2>
        <p className="relative z-10 text-white/85 text-base md:text-lg max-w-xl mx-auto mb-8">
          Thank you for applying to Cadet College Murree. Save your Applicant ID below — you'll need it to track your application.
        </p>

        <div className="relative z-10 inline-flex flex-col sm:flex-row items-center gap-3 bg-white/10 backdrop-blur border border-white/20 rounded-2xl px-5 py-4">
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-widest text-accent font-bold">Your Applicant ID</div>
            <div className="text-2xl md:text-3xl font-mono font-bold tracking-wider" data-testid="reference-id">
              {referenceId}
            </div>
            {paymentStatus && paymentStatus !== "free" && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {paymentStatus === "paid" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-emerald-400/30 text-emerald-100 border border-emerald-400/40" data-testid="payment-status-badge">
                    <CheckCircle className="w-3 h-3" /> Payment Confirmed
                  </span>
                )}
                {paymentStatus === "bank_pending" && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-sky-400/30 text-sky-100 border border-sky-400/40" data-testid="payment-status-badge">
                    ⏳ Bank Deposit Pending Verification
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={copyId}
            className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
            data-testid="button-copy-reference"
          >
            <Copy className="w-4 h-4" />
            Copy
          </Button>
        </div>
      </div>

      {/* Portal Credentials Card */}
      {portalUsername && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45 }}
          className="mt-6 bg-card border-2 border-accent/40 rounded-2xl overflow-hidden"
        >
          <div className="bg-accent/10 border-b border-accent/20 px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent text-accent-foreground flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-primary text-base">Your Candidate Portal Access</div>
              <div className="text-xs text-foreground/65">Save these credentials — you'll need them to track your application</div>
            </div>
          </div>
          <div className="p-6 grid sm:grid-cols-3 gap-4 items-end">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-foreground/50 font-bold mb-1">Username</div>
              <div className="font-mono font-semibold text-sm bg-muted border border-border rounded-lg px-3 py-2 break-all">
                {portalUsername}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-foreground/50 font-bold mb-1">Password</div>
              <div className="font-mono font-semibold text-sm bg-muted border border-border rounded-lg px-3 py-2">
                {portalPassword || "—"}{" "}
                {portalPassword && (
                  <span className="text-foreground/45 font-normal">(save this — change after login)</span>
                )}
              </div>
            </div>
            <a
              href="/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              Login to Portal
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
          <div className="bg-primary/[0.03] border-t border-border px-6 py-3 text-xs text-foreground/60">
            📧 These credentials have been sent to your registered email address.
          </div>
        </motion.div>
      )}

      {/* What happens next timeline */}
      <div className="mt-10">
        <h3 className="text-xl md:text-2xl font-bold text-primary mb-6 text-center">What happens next?</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {timeline.map((t, i) => {
            const Icon = t.Icon;
            return (
              <div
                key={i}
                className="relative bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-colors"
                data-testid={`timeline-step-${i}`}
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shadow-md">
                  {i + 1}
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="font-bold text-primary mb-1">{t.title}</div>
                <p className="text-sm text-foreground/75 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Track status CTA */}
      <div className="mt-10">
        <Link
          href={trackHref}
          className="group flex flex-col md:flex-row items-center justify-between gap-4 p-6 md:p-8 rounded-3xl bg-gradient-to-r from-accent via-secondary to-primary text-white shadow-lg hover:shadow-xl transition-shadow"
          data-testid="success-track-status"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/80 font-bold">Next Step</div>
              <div className="font-bold text-lg md:text-xl">Track Your Application Status</div>
              <p className="text-sm text-white/85 mt-1">
                See verification, test schedule and result updates live — any time, from any device.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-semibold whitespace-nowrap bg-white/15 backdrop-blur px-4 py-2 rounded-xl group-hover:bg-white/25 transition-colors">
            Open Tracker <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Help band + new application */}
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-primary/[0.04] border border-primary/15 rounded-2xl p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-primary mb-1">Have questions?</div>
            <p className="text-sm text-foreground/80 mb-3">
              Our admissions office is open Mon–Sat, 9:00 AM – 5:00 PM. Quote your Applicant ID when you contact us.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                <a href="tel:03041111024" data-testid="success-call">
                  <Phone className="w-4 h-4 mr-1" /> 0304-1111024
                </a>
              </Button>
              <Button asChild size="sm" className="bg-[#25D366] hover:bg-[#1ebe5b] text-white">
                <a
                  href={`https://wa.me/923041111024?text=${encodeURIComponent(
                    `Hi, I just submitted my admission application. My Applicant ID is ${referenceId}.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="success-whatsapp"
                >
                  <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          className="h-auto border-dashed border-2 hover:bg-muted/50 flex-col py-6 gap-2"
          data-testid="button-new-application"
        >
          <ClipboardList className="w-5 h-5 text-primary" />
          <span className="font-semibold">Start a new application</span>
        </Button>
      </div>
    </motion.div>
  );
}
