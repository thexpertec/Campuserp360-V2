import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MediaPicker } from "@/components/media-picker";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, MapPin, Phone, Mail, Globe, Calendar,
  Loader2, Save, School, Image as ImageIcon, Trash2,
} from "lucide-react";

const API = (import.meta.env.VITE_API_BASE as string) || "";
const TENANT_KEY = "ccm_admin_website_tenant";

// Logo & favicon are real, tenant-scoped website settings (they drive the public
// site), so they persist to the backend rather than localStorage like the rest.
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken() ?? ""}`,
  };
  const tenant = localStorage.getItem(TENANT_KEY);
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

type GeneralSettings = {
  institutionName: string;
  shortName: string;
  tagline: string;
  registrationNo: string;
  affiliationBody: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
  alternatePhone: string;
  email: string;
  website: string;
  currentSession: string;
  sessionStartMonth: string;
  currency: string;
  dateFormat: string;
  timezone: string;
  maintenanceMode: boolean;
  allowOnlineAdmissions: boolean;
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DATE_FORMATS = ["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD","DD-MMM-YYYY"];
const TIMEZONES = ["Asia/Karachi","Asia/Kolkata","UTC","Asia/Dubai","Europe/London","America/New_York"];
const CURRENCIES = ["PKR","USD","AED","GBP","SAR"];

const DEFAULT_SETTINGS: GeneralSettings = {
  institutionName: "Cadet College Murree",
  shortName: "CCM",
  tagline: "Excellence in Education & Discipline",
  registrationNo: "",
  affiliationBody: "Federal Board of Intermediate & Secondary Education",
  address: "Murree Hills, Murree",
  city: "Murree",
  province: "Punjab",
  postalCode: "47150",
  country: "Pakistan",
  phone: "+92-51-000000",
  alternatePhone: "",
  email: "info@ccm.edu.pk",
  website: "www.ccm.edu.pk",
  currentSession: "2026-2027",
  sessionStartMonth: "April",
  currency: "PKR",
  dateFormat: "DD/MM/YYYY",
  timezone: "Asia/Karachi",
  maintenanceMode: false,
  allowOnlineAdmissions: true,
};

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, span, children }: {
  label: string; required?: boolean; span?: "2" | "3"; children: React.ReactNode;
}) {
  return (
    <div className={span === "3" ? "sm:col-span-2 lg:col-span-3" : span === "2" ? "sm:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function GeneralTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [footerLogoUrl, setFooterLogoUrl] = useState<string>("");
  const [faviconUrl, setFaviconUrl] = useState<string>("");
  const [pickerFor, setPickerFor] = useState<null | "logo" | "footer_logo" | "favicon">(null);

  // Load the current logo / favicon / locale from the tenant's website settings.
  // Routed through React Query so the response is shared with the app-wide cache.
  const { data: loadedRows } = useQuery({
    queryKey: ["admin-website-settings"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/admin/website/settings`, { headers: authHeaders() });
      if (!res.ok) return [] as { key: string; value: string }[];
      return (await res.json()) as { key: string; value: string }[];
    },
  });

  // Seed the editable form state once the cached settings arrive. `loadedRows`
  // keeps a stable reference while unchanged, so user edits are never clobbered.
  useEffect(() => {
    if (!loadedRows) return;
    const map = Object.fromEntries((loadedRows ?? []).map((r) => [r.key, r.value]));
    if (typeof map.site_logo === "string") setLogoUrl(map.site_logo);
    if (typeof map.footer_logo === "string") setFooterLogoUrl(map.footer_logo);
    if (typeof map.site_favicon === "string") setFaviconUrl(map.site_favicon);
    setSettings((s) => ({
      ...s,
      ...(map.institution_name          ? { institutionName:      map.institution_name }          : {}),
      ...(map.short_name                ? { shortName:            map.short_name }                : {}),
      ...(map.college_tagline           ? { tagline:              map.college_tagline }           : {}),
      ...(map.registration_no           ? { registrationNo:       map.registration_no }           : {}),
      ...(map.affiliation_body          ? { affiliationBody:      map.affiliation_body }          : {}),
      ...(map.contact_address           ? { address:              map.contact_address }           : {}),
      ...(map.contact_city              ? { city:                 map.contact_city }              : {}),
      ...(map.contact_province          ? { province:             map.contact_province }          : {}),
      ...(map.contact_postal_code       ? { postalCode:           map.contact_postal_code }       : {}),
      ...(map.contact_country           ? { country:              map.contact_country }           : {}),
      ...(map.contact_phone             ? { phone:                map.contact_phone }             : {}),
      ...(map.contact_alternate_phone   ? { alternatePhone:       map.contact_alternate_phone }   : {}),
      ...(map.contact_email             ? { email:                map.contact_email }             : {}),
      ...(map.contact_website           ? { website:              map.contact_website }           : {}),
      ...(map.current_session           ? { currentSession:       map.current_session }           : {}),
      ...(map.session_start_month       ? { sessionStartMonth:    map.session_start_month }       : {}),
      ...(map.locale_currency           ? { currency:             map.locale_currency }           : {}),
      ...(map.locale_date_format        ? { dateFormat:           map.locale_date_format }        : {}),
      ...(map.locale_timezone           ? { timezone:             map.locale_timezone }           : {}),
      ...(map.allow_online_admissions !== undefined ? { allowOnlineAdmissions: map.allow_online_admissions === "true" } : {}),
      ...(map.maintenance_mode          !== undefined ? { maintenanceMode:      map.maintenance_mode === "true" }        : {}),
    }));
  }, [loadedRows]);

  function set<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/admin/website/settings`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          updates: [
            { key: "site_logo",                 value: logoUrl },
            { key: "footer_logo",               value: footerLogoUrl },
            { key: "site_favicon",              value: faviconUrl },
            { key: "institution_name",          value: settings.institutionName },
            { key: "short_name",                value: settings.shortName },
            { key: "college_tagline",           value: settings.tagline },
            { key: "registration_no",           value: settings.registrationNo },
            { key: "affiliation_body",          value: settings.affiliationBody },
            { key: "contact_address",           value: settings.address },
            { key: "contact_city",              value: settings.city },
            { key: "contact_province",          value: settings.province },
            { key: "contact_postal_code",       value: settings.postalCode },
            { key: "contact_country",           value: settings.country },
            { key: "contact_phone",             value: settings.phone },
            { key: "contact_alternate_phone",   value: settings.alternatePhone },
            { key: "contact_email",             value: settings.email },
            { key: "contact_website",           value: settings.website },
            { key: "current_session",           value: settings.currentSession },
            { key: "session_start_month",       value: settings.sessionStartMonth },
            { key: "locale_currency",           value: settings.currency },
            { key: "locale_date_format",        value: settings.dateFormat },
            { key: "locale_timezone",           value: settings.timezone },
            { key: "allow_online_admissions",   value: settings.allowOnlineAdmissions ? "true" : "false" },
            { key: "maintenance_mode",          value: settings.maintenanceMode ? "true" : "false" },
          ],
        }),
      });
      if (!res.ok) throw new Error("save failed");
    },
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin-website-settings"] });
      toast({ title: "Settings saved", description: "General settings have been updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save settings. Please try again.", variant: "destructive" });
    },
  });
  const saving = saveMutation.isPending;

  function handleSave() {
    if (!settings.institutionName.trim()) {
      toast({ title: "Validation error", description: "Institution name is required.", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div className="space-y-8">
      <Section title="Institution Identity" icon={School}>
        <Field label="Institution Name" required span="2">
          <Input value={settings.institutionName} onChange={(e) => set("institutionName", e.target.value)} placeholder="e.g. Cadet College Murree" />
        </Field>
        <Field label="Short Name / Acronym">
          <Input value={settings.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="e.g. CCM" maxLength={10} />
        </Field>
        <Field label="Tagline" span="2">
          <Input value={settings.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Excellence in Education & Discipline" />
        </Field>
        <Field label="Registration No.">
          <Input value={settings.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} placeholder="e.g. REG-2001-XXX" />
        </Field>
        <Field label="Affiliation / Board" span="2">
          <Input value={settings.affiliationBody} onChange={(e) => set("affiliationBody", e.target.value)} placeholder="e.g. FBISE" />
        </Field>

        <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Logo */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Logo</Label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <Building2 className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPickerFor("logo")}>
                    <ImageIcon className="mr-2 h-3.5 w-3.5" /> Choose from Library
                  </Button>
                  {logoUrl && (
                    <Button variant="ghost" size="sm" onClick={() => { setLogoUrl(""); setDirty(true); }}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">PNG or SVG. Transparent background preferred.</p>
              </div>
            </div>
          </div>
          {/* Favicon */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Favicon</Label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {faviconUrl ? (
                  <img src={faviconUrl} alt="Favicon" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Globe className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPickerFor("favicon")}>
                    <ImageIcon className="mr-2 h-3.5 w-3.5" /> Choose from Library
                  </Button>
                  {faviconUrl && (
                    <Button variant="ghost" size="sm" onClick={() => { setFaviconUrl(""); setDirty(true); }}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Square PNG/ICO/SVG. Shown in the browser tab.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Logo — separate from the navbar logo */}
        <div className="sm:col-span-2 lg:col-span-3">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">Footer Logo</Label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {footerLogoUrl ? (
                <img src={footerLogoUrl} alt="Footer Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <Building2 className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPickerFor("footer_logo")}>
                  <ImageIcon className="mr-2 h-3.5 w-3.5" /> Choose from Library
                </Button>
                {footerLogoUrl && (
                  <Button variant="ghost" size="sm" onClick={() => { setFooterLogoUrl(""); setDirty(true); }}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Separate logo shown in the website footer. Falls back to the navbar logo if left empty.</p>
            </div>
          </div>
        </div>
      </Section>

      <Separator />

      <Section title="Contact & Location" icon={MapPin}>
        <Field label="Address" span="3">
          <Textarea value={settings.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="Street address" />
        </Field>
        <Field label="City">
          <Input value={settings.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
        </Field>
        <Field label="Province / State">
          <Input value={settings.province} onChange={(e) => set("province", e.target.value)} placeholder="Province" />
        </Field>
        <Field label="Postal Code">
          <Input value={settings.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="00000" />
        </Field>
        <Field label="Country">
          <Input value={settings.country} onChange={(e) => set("country", e.target.value)} placeholder="Pakistan" />
        </Field>
        <Field label="Primary Phone">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92-51-000000" />
          </div>
        </Field>
        <Field label="Alternate Phone">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" value={settings.alternatePhone} onChange={(e) => set("alternatePhone", e.target.value)} placeholder="+92-51-000000" />
          </div>
        </Field>
        <Field label="Email Address">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" type="email" value={settings.email} onChange={(e) => set("email", e.target.value)} placeholder="info@institution.edu.pk" />
          </div>
        </Field>
        <Field label="Website">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8" value={settings.website} onChange={(e) => set("website", e.target.value)} placeholder="www.institution.edu.pk" />
          </div>
        </Field>
      </Section>

      <Separator />

      <Section title="Academic & Regional Defaults" icon={Calendar}>
        <Field label="Current Academic Session">
          <Input value={settings.currentSession} onChange={(e) => set("currentSession", e.target.value)} placeholder="e.g. 2026-2027" />
        </Field>
        <Field label="Session Start Month">
          <Select value={settings.sessionStartMonth} onValueChange={(v) => set("sessionStartMonth", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={settings.currency} onValueChange={(v) => set("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date Format">
          <Select value={settings.dateFormat} onValueChange={(v) => set("dateFormat", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_FORMATS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={settings.timezone} onValueChange={(v) => set("timezone", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Settings2Icon className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">System Preferences</h3>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-medium text-sm">Online Admissions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Allow candidates to apply through the public admission portal.</p>
          </div>
          <Switch checked={settings.allowOnlineAdmissions} onCheckedChange={(v) => set("allowOnlineAdmissions", v)} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="font-medium text-sm text-amber-900">Maintenance Mode</p>
            <p className="text-xs text-amber-700 mt-0.5">When on, only administrators can access the system. Use during updates.</p>
          </div>
          <Switch checked={settings.maintenanceMode} onCheckedChange={(v) => set("maintenanceMode", v)} />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !dirty} size="sm" className="min-w-[120px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <MediaPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onSelect={(url) => {
          if (pickerFor === "logo") setLogoUrl(url);
          else if (pickerFor === "footer_logo") setFooterLogoUrl(url);
          else if (pickerFor === "favicon") setFaviconUrl(url);
          setDirty(true);
        }}
      />
    </div>
  );
}

function Settings2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
