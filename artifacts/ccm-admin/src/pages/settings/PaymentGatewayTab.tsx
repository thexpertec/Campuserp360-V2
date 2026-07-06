import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, CreditCard, CheckCircle2, XCircle, Eye, EyeOff, AlertTriangle, Building2, Wallet } from "lucide-react";

const API = (import.meta.env.VITE_API_BASE as string) || "";
const TENANT_KEY = "ccm_admin_website_tenant";
const MASK = "••••••";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken() ?? ""}`,
  };
  const tenant = localStorage.getItem(TENANT_KEY);
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

type JazzCashState = {
  merchantId:    string;
  password:      string;
  integritySalt: string;
  mode:          "sandbox" | "live";
  configured:    boolean;
  passwordSet:   boolean;
  saltSet:       boolean;
};

type PayFastState = {
  merchantId:    string;
  securedKey:    string;
  merchantName:  string;
  mode:          "sandbox" | "live";
  configured:    boolean;
  securedKeySet: boolean;
};

type GatewayResponse = {
  jazzcash: JazzCashState;
  payfast:  PayFastState;
};

type PaymentConfig = {
  applicationFeeEnabled: boolean;
  applicationFeeAmount:  number;
  admissionFeeAmount:    number;
  bankName:              string;
  bankBranch:            string;
  accountTitle:          string;
  accountNumber:         string;
  challanInstructions:   string;
  enableBankDeposit:     boolean;
  enableJazzcash:        boolean;
  enablePayfast:         boolean;
};

function Section({
  title,
  icon: Icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ElementType;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        {badge}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, span, children }: { label: string; span?: "2"; children: React.ReactNode }) {
  return (
    <div className={span === "2" ? "sm:col-span-2" : ""}>
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  isAlreadySet,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  isAlreadySet: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const displayPlaceholder = isAlreadySet && !value ? "Already set — type to replace or leave blank to keep" : placeholder;
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={displayPlaceholder}
        className="pr-9 font-mono text-sm"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
      <CheckCircle2 className="h-3 w-3" /> Configured
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <XCircle className="h-3 w-3" /> Not configured
    </Badge>
  );
}

const EMPTY_JC: JazzCashState = {
  merchantId: "", password: "", integritySalt: "", mode: "sandbox", configured: false,
  passwordSet: false, saltSet: false,
};
const EMPTY_PF: PayFastState = {
  merchantId: "", securedKey: "", merchantName: "", mode: "sandbox", configured: false,
  securedKeySet: false,
};

export function PaymentGatewayTab() {
  const { toast } = useToast();
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [dirty, setDirty]                   = useState(false);
  const [methodsSaving, setMethodsSaving]   = useState(false);
  const [methodsDirty, setMethodsDirty]     = useState(false);

  const [jc, setJc] = useState<JazzCashState>(EMPTY_JC);
  const [pf, setPf] = useState<PayFastState>(EMPTY_PF);
  const [payConfig, setPayConfig]           = useState<PaymentConfig | null>(null);

  const [jcPwEdited,   setJcPwEdited]   = useState(false);
  const [jcSaltEdited, setJcSaltEdited] = useState(false);
  const [pfKeyEdited,  setPfKeyEdited]  = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [credRes, pcRes] = await Promise.all([
          fetch(`${API}/api/admin/admissions/gateway-credentials`, { headers: authHeaders() }),
          fetch(`${API}/api/admin/admissions/payment-config`,      { headers: authHeaders() }),
        ]);
        if (credRes.ok) {
          const data = (await credRes.json()) as GatewayResponse;
          setJc({ ...EMPTY_JC, ...data.jazzcash, password: "", integritySalt: "" });
          setPf({ ...EMPTY_PF, ...data.payfast,  securedKey: "" });
        }
        if (pcRes.ok) {
          setPayConfig((await pcRes.json()) as PaymentConfig);
        }
      } catch {
        toast({ title: "Load error", description: "Could not load gateway settings.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function setJcField<K extends keyof JazzCashState>(k: K, v: JazzCashState[K]) {
    setJc((s) => ({ ...s, [k]: v }));
    setDirty(true);
  }
  function setPfField<K extends keyof PayFastState>(k: K, v: PayFastState[K]) {
    setPf((s) => ({ ...s, [k]: v }));
    setDirty(true);
  }
  function setMethod<K extends keyof PaymentConfig>(k: K, v: PaymentConfig[K]) {
    setPayConfig((pc) => pc ? { ...pc, [k]: v } : pc);
    setMethodsDirty(true);
  }

  async function handleSaveMethods() {
    if (!payConfig) return;
    setMethodsSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/admissions/payment-config`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payConfig),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "save failed");
      }
      setMethodsDirty(false);
      toast({ title: "Payment methods saved", description: "Changes take effect immediately." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setMethodsSaving(false);
    }
  }

  async function handleSaveCredentials() {
    setSaving(true);
    try {
      const jcPassword      = jcPwEdited   ? jc.password      : MASK;
      const jcIntegritySalt = jcSaltEdited ? jc.integritySalt : MASK;
      const pfSecuredKey    = pfKeyEdited  ? pf.securedKey    : MASK;

      const res = await fetch(`${API}/api/admin/admissions/gateway-credentials`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          jazzcash: {
            merchantId:    jc.merchantId,
            password:      jcPassword,
            integritySalt: jcIntegritySalt,
            mode:          jc.mode,
          },
          payfast: {
            merchantId:   pf.merchantId,
            securedKey:   pfSecuredKey,
            merchantName: pf.merchantName,
            mode:         pf.mode,
          },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "save failed");
      }
      const result = (await res.json()) as { jazzcashConfigured: boolean; payfastConfigured: boolean };
      setJc((s) => ({ ...s, configured: result.jazzcashConfigured }));
      setPf((s) => ({ ...s, configured: result.payfastConfigured }));
      setJcPwEdited(false);
      setJcSaltEdited(false);
      setPfKeyEdited(false);
      setDirty(false);
      toast({ title: "Gateway credentials saved", description: "Changes take effect immediately — no restart needed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Payment Methods ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm text-foreground">Payment Methods</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which payment methods are offered to applicants on the admissions form.
        </p>

        <div className="space-y-3">
          {/* Bank Deposit */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Bank Deposit / IBFT</p>
                <p className="text-xs text-muted-foreground">Show bank details and receipt upload form to candidates.</p>
              </div>
            </div>
            <Switch
              checked={payConfig?.enableBankDeposit ?? true}
              onCheckedChange={(v) => setMethod("enableBankDeposit", v)}
              disabled={!payConfig}
            />
          </div>

          {/* JazzCash */}
          {(() => {
            const configured = jc.configured;
            const enabled    = payConfig?.enableJazzcash ?? false;
            const showWarn   = enabled && !configured;
            return (
              <div className={`rounded-xl border bg-card px-4 py-3 space-y-2 ${showWarn ? "border-yellow-400" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="font-medium text-sm">JazzCash</p>
                    {configured ? (
                      <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 text-xs">
                        <XCircle className="h-3 w-3" /> Not configured
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setMethod("enableJazzcash", v)}
                    disabled={!payConfig}
                  />
                </div>
                <p className="text-xs text-muted-foreground pl-6">Enable JazzCash online payment button.</p>
                {showWarn && (
                  <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 ml-6">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>JazzCash credentials are not set up. Enter them in the <strong>JazzCash</strong> section below before enabling.</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* PayFast */}
          {(() => {
            const configured = pf.configured;
            const enabled    = payConfig?.enablePayfast ?? false;
            const showWarn   = enabled && !configured;
            return (
              <div className={`rounded-xl border bg-card px-4 py-3 space-y-2 ${showWarn ? "border-yellow-400" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="font-medium text-sm">PayFast</p>
                    {configured ? (
                      <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50 text-xs">
                        <XCircle className="h-3 w-3" /> Not configured
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setMethod("enablePayfast", v)}
                    disabled={!payConfig}
                  />
                </div>
                <p className="text-xs text-muted-foreground pl-6">Enable PayFast (card / wallet) online payment button.</p>
                {showWarn && (
                  <div className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 ml-6">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>PayFast credentials are not set up. Enter them in the <strong>PayFast</strong> section below before enabling.</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSaveMethods} disabled={methodsSaving || !methodsDirty || !payConfig} size="sm" className="min-w-[140px]">
            {methodsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {methodsSaving ? "Saving…" : "Save Methods"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Credentials security note ── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Security note:</strong> Credentials are encrypted at rest using AES-256-GCM before storage.
        Merchant IDs are visible; passwords and keys are never returned from the server — re-enter only
        what you want to change and leave other fields blank to keep the stored value.
      </div>

      {/* ── JazzCash ── */}
      <Section
        title="JazzCash"
        icon={CreditCard}
        badge={<ConfiguredBadge configured={jc.configured} />}
      >
        <Field label="Merchant ID">
          <Input
            value={jc.merchantId}
            onChange={(e) => setJcField("merchantId", e.target.value)}
            placeholder="e.g. MC12345"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="Password">
          <SecretInput
            value={jc.password}
            onChange={(v) => { setJcField("password", v); setJcPwEdited(true); }}
            isAlreadySet={jc.passwordSet}
            placeholder="JazzCash merchant password"
          />
        </Field>
        <Field label="Integrity Salt" span="2">
          <SecretInput
            value={jc.integritySalt}
            onChange={(v) => { setJcField("integritySalt", v); setJcSaltEdited(true); }}
            isAlreadySet={jc.saltSet}
            placeholder="Hash integrity salt"
          />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-medium text-sm">Live Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, requests go to the JazzCash sandbox. Turn on only when you have live credentials.
            </p>
          </div>
          <Switch
            checked={jc.mode === "live"}
            onCheckedChange={(v) => setJcField("mode", v ? "live" : "sandbox")}
          />
        </div>
      </Section>

      <Separator />

      {/* ── PayFast ── */}
      <Section
        title="PayFast (Bank Alfalah)"
        icon={CreditCard}
        badge={<ConfiguredBadge configured={pf.configured} />}
      >
        <Field label="Merchant ID">
          <Input
            value={pf.merchantId}
            onChange={(e) => setPfField("merchantId", e.target.value)}
            placeholder="e.g. 1234"
            className="font-mono text-sm"
          />
        </Field>
        <Field label="Secured Key">
          <SecretInput
            value={pf.securedKey}
            onChange={(v) => { setPfField("securedKey", v); setPfKeyEdited(true); }}
            isAlreadySet={pf.securedKeySet}
            placeholder="HMAC signing key"
          />
        </Field>
        <Field label="Merchant Name">
          <Input
            value={pf.merchantName}
            onChange={(e) => setPfField("merchantName", e.target.value)}
            placeholder="e.g. Cadet College Murree"
          />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="font-medium text-sm">Live Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, requests go to the PayFast UAT environment. Turn on only when you have live credentials.
            </p>
          </div>
          <Switch
            checked={pf.mode === "live"}
            onCheckedChange={(v) => setPfField("mode", v ? "live" : "sandbox")}
          />
        </div>
      </Section>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSaveCredentials} disabled={saving || !dirty} size="sm" className="min-w-[140px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : "Save Credentials"}
        </Button>
      </div>
    </div>
  );
}
