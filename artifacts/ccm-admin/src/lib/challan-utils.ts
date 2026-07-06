const TOKEN_KEY = "ccm_admin_token";
const TENANT_KEY = "ccm_admin_website_tenant";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY) ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const tenant = localStorage.getItem(TENANT_KEY);
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallanTemplate = "standard" | "bank-challan";

export interface ChallanSettings {
  phone: string;
  address: string;
  institutionCode: string;
  showSection: boolean;
  showFeeDesc: boolean;
  showBankAccounts: boolean;
  showInstructions: boolean;
  hideZeroRows: boolean;
  bankAccountIds: string[];
  activeTemplate: ChallanTemplate;
  logoUrl?: string | null;
  logoUrlRight?: string | null;
}

export const DEFAULT_CHALLAN_SETTINGS: ChallanSettings = {
  phone: "",
  address: "",
  institutionCode: "",
  showSection: true,
  showFeeDesc: true,
  showBankAccounts: false,
  showInstructions: true,
  hideZeroRows: false,
  bankAccountIds: [],
  activeTemplate: "standard",
  logoUrl: null,
  logoUrlRight: null,
};

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function fetchChallanSettings(): Promise<ChallanSettings> {
  try {
    const res = await fetch("/api/admin/settings/challan", {
      headers: authHeaders(),
    });
    if (!res.ok) return { ...DEFAULT_CHALLAN_SETTINGS };
    return res.json() as Promise<ChallanSettings>;
  } catch {
    return { ...DEFAULT_CHALLAN_SETTINGS };
  }
}

export async function saveChallanSettings(settings: Partial<ChallanSettings>): Promise<void> {
  const res = await fetch("/api/admin/settings/challan", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Server returned ${res.status}`);
  }
}
