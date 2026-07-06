import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Phone, MapPin, Eye, Landmark, FileText, Building2, CheckCircle2, ImagePlus, Trash2 } from "lucide-react";
import { fetchChallanSettings, saveChallanSettings, DEFAULT_CHALLAN_SETTINGS, type ChallanSettings, type ChallanTemplate } from "@/lib/challan-utils";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const TENANT_KEY = "ccm_admin_website_tenant";

function authHeaders(): Record<string, string> {
  const token = getToken() ?? "";
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const tenant = localStorage.getItem(TENANT_KEY);
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

type BankAccount = {
  id: string;
  type: string;
  accountTitle: string;
  bankName: string | null;
  ibanNumber: string | null;
  isActive: boolean;
};

function useBankAccounts() {
  return useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/bank-accounts", { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const TEMPLATES: { id: ChallanTemplate; label: string; description: string; Icon: React.FC<{ className?: string }> }[] = [
  {
    id: "standard",
    label: "Standard",
    description: "Simple 3-copy layout — Student, Office, Bank. Clean table with fee types, amount in words, and optional bank account block.",
    Icon: FileText,
  },
  {
    id: "bank-challan",
    label: "Bank Challan",
    description: "Traditional Pakistani bank-style — Bank, College, Student copies. Prominent bank name & IBAN block, numbered fee rows, depositor/CNIC fields, signature lines, and disclaimer text.",
    Icon: Building2,
  },
];

function TemplatePicker({
  value,
  onChange,
}: {
  value: ChallanTemplate;
  onChange: (t: ChallanTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TEMPLATES.map(t => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none",
              active
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-white hover:border-primary/40 hover:bg-muted/30",
            )}>
            {active && (
              <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />
            )}
            <div className="flex items-center gap-2.5 mb-1.5">
              <t.Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
                {t.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">{t.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ChallanTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: bankAccountsRaw = [], isLoading: baLoading } = useBankAccounts();
  const bankAccounts = bankAccountsRaw.filter(a => a.isActive && a.type === "bank");

  const { data: saved, isLoading } = useQuery<ChallanSettings>({
    queryKey: ["challan-settings"],
    queryFn: fetchChallanSettings,
  });

  const [form, setForm] = useState<ChallanSettings>(DEFAULT_CHALLAN_SETTINGS);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRightUploading, setLogoRightUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  async function handleLogoFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (PNG, JPG, SVG…)", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/settings/challan/logo", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const { url } = await res.json() as { url: string };
      setForm(prev => ({ ...prev, logoUrl: url }));
      qc.invalidateQueries({ queryKey: ["challan-settings"] });
      toast({ title: "Left logo updated", description: "The new logo will appear on the left side of printed challans." });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    setLogoUploading(true);
    try {
      const res = await fetch("/api/admin/settings/challan/logo", {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setForm(prev => ({ ...prev, logoUrl: null }));
      qc.invalidateQueries({ queryKey: ["challan-settings"] });
      toast({ title: "Left logo removed" });
    } catch (err) {
      toast({ title: "Remove failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoRightFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file (PNG, JPG, SVG…)", variant: "destructive" });
      return;
    }
    setLogoRightUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/settings/challan/logo-right", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const { url } = await res.json() as { url: string };
      setForm(prev => ({ ...prev, logoUrlRight: url }));
      qc.invalidateQueries({ queryKey: ["challan-settings"] });
      toast({ title: "Right logo updated", description: "The new logo will appear on the right side of printed challans." });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLogoRightUploading(false);
      if (fileRightRef.current) fileRightRef.current.value = "";
    }
  }

  async function handleRemoveLogoRight() {
    setLogoRightUploading(true);
    try {
      const res = await fetch("/api/admin/settings/challan/logo-right", {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setForm(prev => ({ ...prev, logoUrlRight: null }));
      qc.invalidateQueries({ queryKey: ["challan-settings"] });
      toast({ title: "Right logo removed" });
    } catch (err) {
      toast({ title: "Remove failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLogoRightUploading(false);
    }
  }

  const mutation = useMutation({
    mutationFn: saveChallanSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challan-settings"] });
      toast({ title: "Challan settings saved", description: "Changes will apply to the next challan printed." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function patch(p: Partial<ChallanSettings>) {
    setForm(prev => ({ ...prev, ...p }));
  }

  function toggleBankAccount(id: string) {
    setForm(prev => {
      const ids = prev.bankAccountIds.includes(id)
        ? prev.bankAccountIds.filter(x => x !== id)
        : [...prev.bankAccountIds, id];
      return { ...prev, bankAccountIds: ids };
    });
  }

  function handleSave() {
    mutation.mutate(form);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* ── Template Picker ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Challan Template</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose the layout used when printing fee challans. Only one template is active at a time.
          </p>
        </div>
        <TemplatePicker
          value={form.activeTemplate}
          onChange={t => patch({ activeTemplate: t })}
        />
      </section>

      <Separator />

      {/* ── Challan Logos ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
            Challan Logos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Left logo appears on the left side of the challan header; right logo on the right. On the Bank Challan template both sides are shown. If none is uploaded, the default logo.png is used.
          </p>
        </div>

        {/* Left Logo */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Left Logo</p>
          <div className="flex items-start gap-4">
            {form.logoUrl ? (
              <div className="relative group">
                <img
                  src={form.logoUrl}
                  alt="Left challan logo"
                  className="w-20 h-20 object-contain rounded-lg border border-border bg-slate-50 p-1"
                />
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={logoUploading}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove left logo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
                <ImagePlus className="h-7 w-7" />
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={logoUploading}
                onClick={() => fileRef.current?.click()}
              >
                {logoUploading
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                  : <><ImagePlus className="h-3.5 w-3.5 mr-1.5" /> {form.logoUrl ? "Change" : "Upload Left Logo"}</>}
              </Button>
              {form.logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={logoUploading}
                  onClick={handleRemoveLogo}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">PNG, JPG, or SVG recommended. Displayed at ~32×32 px.</p>
            </div>
          </div>
        </div>

        {/* Right Logo */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Right Logo</p>
          <div className="flex items-start gap-4">
            {form.logoUrlRight ? (
              <div className="relative group">
                <img
                  src={form.logoUrlRight}
                  alt="Right challan logo"
                  className="w-20 h-20 object-contain rounded-lg border border-border bg-slate-50 p-1"
                />
                <button
                  type="button"
                  onClick={handleRemoveLogoRight}
                  disabled={logoRightUploading}
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove right logo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-muted-foreground">
                <ImagePlus className="h-7 w-7" />
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileRightRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoRightFile(f); }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={logoRightUploading}
                onClick={() => fileRightRef.current?.click()}
              >
                {logoRightUploading
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                  : <><ImagePlus className="h-3.5 w-3.5 mr-1.5" /> {form.logoUrlRight ? "Change" : "Upload Right Logo"}</>}
              </Button>
              {form.logoUrlRight && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={logoRightUploading}
                  onClick={handleRemoveLogoRight}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground">PNG, JPG, or SVG recommended. Displayed at ~32×32 px.</p>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Institution Contact ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Institution Contact</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Printed under the school name on every challan copy.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Institution Code
            </Label>
            <Input
              placeholder="e.g. 313262"
              value={form.institutionCode}
              onChange={e => patch({ institutionCode: e.target.value })}
              className="h-9 max-w-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Printed above the institution name on the bank challan (e.g. a registration number).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              Phone / UAN
            </Label>
            <Input
              placeholder="e.g. 051-1234567"
              value={form.phone}
              onChange={e => patch({ phone: e.target.value })}
              className="h-9 max-w-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Address
            </Label>
            <Input
              placeholder="e.g. Murree, Punjab, Pakistan"
              value={form.address}
              onChange={e => patch({ address: e.target.value })}
              className="h-9"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Display Options ── */}
      <section className="space-y-1">
        <div className="mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Eye className="h-4 w-4 text-muted-foreground" />
            Display Options
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle which fields and sections appear on the printed challan.
          </p>
        </div>

        <ToggleRow
          label="Show Section"
          description="Display the student's section in the info table."
          checked={form.showSection}
          onChange={v => patch({ showSection: v })}
        />
        <Separator className="opacity-50" />
        <ToggleRow
          label="Show Fee Type Description"
          description="Show the italic description line below each fee type name."
          checked={form.showFeeDesc}
          onChange={v => patch({ showFeeDesc: v })}
        />
        <Separator className="opacity-50" />
        <ToggleRow
          label="Show Instructions / Amount in Words"
          description="Display the 'Amount in Words' row and the signature line."
          checked={form.showInstructions}
          onChange={v => patch({ showInstructions: v })}
        />
        <Separator className="opacity-50" />
        <ToggleRow
          label="Hide Zero-Amount Rows"
          description="Skip fee types where the payable amount is Rs. 0."
          checked={form.hideZeroRows}
          onChange={v => patch({ hideZeroRows: v })}
        />
        <Separator className="opacity-50" />
        <ToggleRow
          label="Show Bank Account Details"
          description="Print bank account names and IBANs at the bottom of each copy."
          checked={form.showBankAccounts}
          onChange={v => patch({ showBankAccounts: v })}
        />

        {/* Bank account selector (visible when show_bank_accounts is on) */}
        {form.showBankAccounts && (
          <div className="mt-3 ml-0 pl-0 space-y-2 border border-border rounded-lg p-4 bg-muted/30">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              Select bank accounts to display
              <span className="text-muted-foreground font-normal ml-1">(leave all unchecked to show all active accounts)</span>
            </p>
            {baLoading ? (
              <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading accounts…
              </div>
            ) : bankAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">No active bank accounts found. Add them under Finance → Accounts.</p>
            ) : (
              <div className="space-y-2 mt-1">
                {bankAccounts.map(a => (
                  <label key={a.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border border-input accent-primary"
                      checked={form.bankAccountIds.includes(a.id)}
                      onChange={() => toggleBankAccount(a.id)}
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-medium">{a.accountTitle}</span>
                      {a.bankName && <span className="text-muted-foreground"> · {a.bankName}</span>}
                      {a.ibanNumber && <span className="text-muted-foreground"> · {a.ibanNumber}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="pt-2">
        <Button onClick={handleSave} disabled={mutation.isPending} size="sm" className="min-w-[140px]">
          {mutation.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            : <><Save className="h-4 w-4 mr-2" /> Save Settings</>}
        </Button>
      </div>
    </div>
  );
}
