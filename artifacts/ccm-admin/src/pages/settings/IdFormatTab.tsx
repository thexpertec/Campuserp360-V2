import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Hash, GraduationCap, Info, Save, Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { getToken } from "@/lib/auth";

type SuffixStyle = "random" | "sequential" | "both";
type SeparatorChar = "-" | "_" | "/" | "";

type CandidateIdFormat = {
  prefix: string;
  separator: SeparatorChar;
  includeYear: boolean;
  suffixStyle: SuffixStyle;
  suffixLength: "4" | "6" | "8";
};

type GrNumberFormat = {
  prefix: string;
  separator: SeparatorChar;
  includeYear: boolean;
  paddingDigits: "3" | "4" | "5";
  startingNumber: string;
};

type IdFormatSettings = {
  candidate: CandidateIdFormat;
  gr: GrNumberFormat;
};

const DEFAULT_SETTINGS: IdFormatSettings = {
  candidate: {
    prefix: "CCM",
    separator: "-",
    includeYear: true,
    suffixStyle: "random",
    suffixLength: "6",
  },
  gr: {
    prefix: "GR",
    separator: "-",
    includeYear: true,
    paddingDigits: "3",
    startingNumber: "1",
  },
};

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  return s;
}

function buildCandidatePreview(fmt: CandidateIdFormat, seed?: number): string {
  const sep = fmt.separator;
  const year = new Date().getFullYear();
  const parts: string[] = [fmt.prefix || "CCM"];
  if (fmt.includeYear) parts.push(String(year));

  const len = parseInt(fmt.suffixLength);
  if (fmt.suffixStyle === "random") {
    parts.push(randomSuffix(len));
  } else if (fmt.suffixStyle === "sequential") {
    const n = seed ?? 1;
    parts.push(String(n).padStart(len, "0"));
  } else {
    const n = seed ?? 1;
    parts.push(randomSuffix(Math.max(2, len - 3)) + String(n).padStart(3, "0"));
  }
  return parts.join(sep);
}

function buildGrPreview(fmt: GrNumberFormat, n?: number): string {
  const sep = fmt.separator;
  const year = new Date().getFullYear();
  const num = n ?? parseInt(fmt.startingNumber || "1");
  const parts: string[] = [fmt.prefix || "GR"];
  if (fmt.includeYear) parts.push(String(year));
  parts.push(String(num).padStart(parseInt(fmt.paddingDigits), "0"));
  return parts.join(sep);
}

function Section({ title, icon: Icon, color, children }: {
  title: string;
  icon: React.ElementType;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PreviewBox({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4">
      <p className="text-xs text-muted-foreground mb-2.5 font-medium uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <Badge key={i} variant="outline" className="font-mono text-sm px-3 py-1 bg-white shadow-sm">
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

type PrefixAvailability = "idle" | "checking" | "available" | "taken";

export function IdFormatTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<IdFormatSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(() => Math.random());
  const [grPrefixError, setGrPrefixError] = useState<string | null>(null);
  const [candidatePrefixError, setCandidatePrefixError] = useState<string | null>(null);
  const [prefixAvailability, setPrefixAvailability] = useState<PrefixAvailability>("idle");
  const [candidateAvailability, setCandidateAvailability] = useState<PrefixAvailability>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const candidateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/gr-format", {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        if (res.ok) {
          const data = await res.json();
          const { candidate, ...gr } = data;
          setSettings(s => ({
            ...s,
            gr: { ...s.gr, ...gr },
            candidate: { ...s.candidate, ...(candidate ?? {}) },
          }));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Debounced real-time prefix availability check (~500 ms after user stops typing)
  useEffect(() => {
    if (loading) return;
    const prefix = settings.gr.prefix.trim();
    if (!prefix) {
      setPrefixAvailability("idle");
      return;
    }
    if (settings.candidate.prefix.trim().toUpperCase() === prefix.toUpperCase()) {
      setPrefixAvailability("taken");
      return;
    }
    setPrefixAvailability("checking");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/settings/gr-format/check-prefix?prefix=${encodeURIComponent(prefix)}&field=gr`,
          { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setPrefixAvailability(data.available ? "available" : "taken");
        } else {
          setPrefixAvailability("idle");
        }
      } catch {
        setPrefixAvailability("idle");
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [settings.gr.prefix, settings.candidate.prefix, loading]);

  // Same debounced availability check for the Candidate Applicant ID prefix
  useEffect(() => {
    if (loading) return;
    const prefix = settings.candidate.prefix.trim();
    if (!prefix) {
      setCandidateAvailability("idle");
      return;
    }
    if (settings.gr.prefix.trim().toUpperCase() === prefix.toUpperCase()) {
      setCandidateAvailability("taken");
      return;
    }
    setCandidateAvailability("checking");
    if (candidateDebounceRef.current) clearTimeout(candidateDebounceRef.current);
    candidateDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/settings/gr-format/check-prefix?prefix=${encodeURIComponent(prefix)}&field=candidate`,
          { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setCandidateAvailability(data.available ? "available" : "taken");
        } else {
          setCandidateAvailability("idle");
        }
      } catch {
        setCandidateAvailability("idle");
      }
    }, 500);
    return () => {
      if (candidateDebounceRef.current) clearTimeout(candidateDebounceRef.current);
    };
  }, [settings.candidate.prefix, settings.gr.prefix, loading]);

  function setCandidate<K extends keyof CandidateIdFormat>(key: K, value: CandidateIdFormat[K]) {
    setSettings((s) => ({ ...s, candidate: { ...s.candidate, [key]: value } }));
    if (key === "prefix") setCandidatePrefixError(null);
    setDirty(true);
  }

  function setGr<K extends keyof GrNumberFormat>(key: K, value: GrNumberFormat[K]) {
    setSettings((s) => ({ ...s, gr: { ...s.gr, [key]: value } }));
    if (key === "prefix") setGrPrefixError(null);
    setDirty(true);
  }

  async function handleSave() {
    const cp = settings.candidate.prefix.trim();
    const gp = settings.gr.prefix.trim();
    if (!cp) {
      toast({ title: "Validation error", description: "Candidate ID prefix is required.", variant: "destructive" });
      return;
    }
    if (!gp) {
      toast({ title: "Validation error", description: "Register ID prefix is required.", variant: "destructive" });
      return;
    }
    if (cp.toUpperCase() === gp.toUpperCase()) {
      setCandidatePrefixError("Applicant ID prefix cannot be the same as the Register ID prefix.");
      toast({ title: "Validation error", description: "Applicant ID and Register ID prefixes must be different.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/gr-format", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({
          ...settings.gr,
          prefix: gp,
          candidate: { ...settings.candidate, prefix: cp },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409) {
          const msg = err.error ?? "This prefix is already in use.";
          if (err.field === "candidate") {
            setCandidatePrefixError(msg);
          } else {
            setGrPrefixError(msg);
          }
        }
        toast({ title: "Save failed", description: err.error ?? "Please try again.", variant: "destructive" });
        return;
      }
      setDirty(false);
      setGrPrefixError(null);
      setCandidatePrefixError(null);
      toast({ title: "ID format saved", description: "New IDs will follow this format going forward." });
    } catch {
      toast({ title: "Save failed", description: "Could not reach the server. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const candidatePreviews = [
    buildCandidatePreview(settings.candidate, 1),
    buildCandidatePreview(settings.candidate, 2),
    buildCandidatePreview(settings.candidate, 3),
  ];

  const grStart = parseInt(settings.gr.startingNumber || "1") || 1;
  const grPreviews = [
    buildGrPreview(settings.gr, grStart),
    buildGrPreview(settings.gr, grStart + 1),
    buildGrPreview(settings.gr, grStart + 2),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading format settings…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800">
          These formats apply to IDs generated from this point forward. Existing IDs in the database are not affected.
        </p>
      </div>

      {/* ── Candidate Applicant ID ─────────────────────── */}
      <Section title="Candidate Applicant ID" icon={Hash} color="bg-violet-100 text-violet-700">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Prefix" hint="Short code prepended to every ID (max 10 chars). Must be unique across all tenants.">
            <Input
              value={settings.candidate.prefix}
              maxLength={10}
              onChange={(e) => setCandidate("prefix", e.target.value.toUpperCase())}
              placeholder="CCM"
              className={`uppercase ${candidatePrefixError ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
            {candidatePrefixError && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {candidatePrefixError}
              </p>
            )}
            {!candidatePrefixError && candidateAvailability === "checking" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Checking availability…
              </p>
            )}
            {!candidatePrefixError && candidateAvailability === "available" && (
              <p className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Available
              </p>
            )}
            {!candidatePrefixError && candidateAvailability === "taken" && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                Already taken
              </p>
            )}
          </Field>

          <Field label="Separator" hint="Character between segments.">
            <Select
              value={settings.candidate.separator === "" ? "__none__" : settings.candidate.separator}
              onValueChange={(v) => setCandidate("separator", (v === "__none__" ? "" : v) as SeparatorChar)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">Hyphen  ( - )</SelectItem>
                <SelectItem value="_">Underscore  ( _ )</SelectItem>
                <SelectItem value="/">Slash  ( / )</SelectItem>
                <SelectItem value="__none__">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Suffix Style" hint="How the unique part is generated.">
            <Select
              value={settings.candidate.suffixStyle}
              onValueChange={(v) => setCandidate("suffixStyle", v as SuffixStyle)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random alphanumeric</SelectItem>
                <SelectItem value="sequential">Sequential number</SelectItem>
                <SelectItem value="both">Random + sequential</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Suffix Length" hint="Number of characters in the suffix.">
            <Select
              value={settings.candidate.suffixLength}
              onValueChange={(v) => setCandidate("suffixLength", v as CandidateIdFormat["suffixLength"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4 characters</SelectItem>
                <SelectItem value="6">6 characters  (recommended)</SelectItem>
                <SelectItem value="8">8 characters</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 sm:col-span-2 lg:col-span-2">
            <div>
              <p className="font-medium text-sm">Include Year Segment</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Embeds the current calendar year (e.g. <span className="font-mono">2026</span>) between prefix and suffix.
              </p>
            </div>
            <Switch
              checked={settings.candidate.includeYear}
              onCheckedChange={(v) => setCandidate("includeYear", v)}
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="flex-1">
            <PreviewBox label="Preview — next 3 IDs" values={candidatePreviews} />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="mt-6 shrink-0"
            title="Regenerate preview"
            onClick={() => setPreviewSeed(Math.random())}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {/* force re-render of previews when seed changes */}
        <span className="hidden">{previewSeed}</span>
      </Section>

      <Separator />

      {/* ── Student Register ID ─────────────────────────── */}
      <Section title="Enrolled Student Register ID" icon={GraduationCap} color="bg-emerald-100 text-emerald-700">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Prefix" hint="Short code prepended to every Register ID (max 10 chars). Must be unique across all tenants.">
            <Input
              value={settings.gr.prefix}
              maxLength={10}
              onChange={(e) => setGr("prefix", e.target.value.toUpperCase())}
              placeholder="GR"
              className={`uppercase ${grPrefixError ? "border-destructive focus-visible:ring-destructive" : ""}`}
            />
            {grPrefixError && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {grPrefixError}
              </p>
            )}
            {!grPrefixError && prefixAvailability === "checking" && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Checking availability…
              </p>
            )}
            {!grPrefixError && prefixAvailability === "available" && (
              <p className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Available
              </p>
            )}
            {!grPrefixError && prefixAvailability === "taken" && (
              <p className="flex items-center gap-1 text-xs text-destructive mt-1">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                Already taken
              </p>
            )}
          </Field>

          <Field label="Separator" hint="Character between segments.">
            <Select
              value={settings.gr.separator === "" ? "__none__" : settings.gr.separator}
              onValueChange={(v) => setGr("separator", (v === "__none__" ? "" : v) as SeparatorChar)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">Hyphen  ( - )</SelectItem>
                <SelectItem value="_">Underscore  ( _ )</SelectItem>
                <SelectItem value="/">Slash  ( / )</SelectItem>
                <SelectItem value="__none__">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Number Padding" hint="How many digits the sequence number is zero-padded to.">
            <Select
              value={settings.gr.paddingDigits}
              onValueChange={(v) => setGr("paddingDigits", v as GrNumberFormat["paddingDigits"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 digits  (001, 002…)</SelectItem>
                <SelectItem value="4">4 digits  (0001, 0002…)</SelectItem>
                <SelectItem value="5">5 digits  (00001, 00002…)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Starting Number" hint="The first Applicant ID issued this session.">
            <Input
              type="number"
              min={1}
              max={99999}
              value={settings.gr.startingNumber}
              onChange={(e) => setGr("startingNumber", e.target.value)}
              placeholder="1"
            />
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 sm:col-span-2">
            <div>
              <p className="font-medium text-sm">Include Year Segment</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Embeds the calendar year (e.g. <span className="font-mono">2026</span>) between prefix and sequence number.
              </p>
            </div>
            <Switch
              checked={settings.gr.includeYear}
              onCheckedChange={(v) => setGr("includeYear", v)}
            />
          </div>
        </div>

        <PreviewBox label="Preview — next 3 Applicant IDs" values={grPreviews} />
      </Section>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !dirty} size="sm" className="min-w-[120px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : "Save Format"}
        </Button>
      </div>
    </div>
  );
}
