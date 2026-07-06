const API_BASE = "/api";

export function getToken(): string | null {
  try {
    const raw = localStorage.getItem("ccm_portal_token");
    return raw ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem("ccm_portal_token", token);
  } catch { /* ignore */ }
}

export function clearToken(): void {
  try {
    localStorage.removeItem("ccm_portal_token");
    localStorage.removeItem("ccm_portal_user");
  } catch { /* ignore */ }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const t = token ?? getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export type PortalLoginResponse = {
  token: string;
  expiresAt: string;
  user: ApiPortalUser;
};

export type ApiPortalUser = {
  ref_id: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  father_name: string;
  guardian_mobile: string;
  date_of_birth: string;
  blood_group: string;
  class_applying: string;
  session: string;
  address: string;
  city: string;
  state: string;
  exam_center: string;
  status: string;
  roll_no: string | null;
  test_date: string | null;
  test_time: string | null;
  test_venue: string | null;
  test_center_address: string | null;
  test_focal_person: string | null;
  interview_date: string | null;
  interview_time: string | null;
  interview_venue: string | null;
  interview_marks: number | null;
  marks: number | null;
  total_marks: number;
  merit: number | null;
  result_status: "selected" | "wait_listed" | "not_selected" | null;
  subjects: Record<string, { obtained: number; total: number }> | null;
  fee: {
    challan_no: string;
    amount: number;
    bank: string;
    account: string;
    due_date: string;
    status: "paid" | "pending";
    bank_reference: string | null;
  };
  admission_fee: {
    amount: number;
    status: "paid" | "pending";
    bank_reference: string | null;
  };
  docs: Record<string, { uploaded: boolean; verified: boolean; rejected: boolean; rejection_reason?: string }>;
  joining_date: string | null;
  fee_deadline: string | null;
  offer_date: string | null;
  candidate_accepted: boolean;
  submitted_at: string | null;
  verified_at: string | null;
  result_announced_at: string | null;
};

export async function portalLogin(username: string, password: string): Promise<PortalLoginResponse> {
  return request<PortalLoginResponse>("POST", "/portal/login", { username, password }, null);
}

export async function portalMe(): Promise<ApiPortalUser> {
  return request<ApiPortalUser>("GET", "/portal/me");
}

export async function portalChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request("PATCH", "/portal/password", { currentPassword, newPassword });
}

export async function portalSubmitFee(
  bankReference: string,
  paymentDate: string,
  receiptFile?: File,
): Promise<void> {
  let receiptBase64: string | undefined;
  let receiptMime: string | undefined;
  let receiptName: string | undefined;

  if (receiptFile) {
    receiptBase64 = await fileToBase64(receiptFile);
    receiptMime = receiptFile.type;
    receiptName = receiptFile.name;
  }

  await request("POST", "/portal/fee/submit", {
    bankReference,
    paymentDate,
    receiptBase64,
    receiptMime,
    receiptName,
  });
}

export async function portalUploadDocument(docType: string, file: File): Promise<void> {
  const fileBase64 = await fileToBase64(file);
  await request("POST", "/portal/documents/upload", {
    docType,
    fileBase64,
    mimeType: file.type,
    originalName: file.name,
  });
}

export async function portalAcceptOffer(): Promise<{ acceptedAt: string }> {
  return request<{ acceptedAt: string }>("POST", "/portal/accept");
}

export async function portalSubmitAdmissionFee(
  bankReference: string,
  paymentDate?: string,
): Promise<void> {
  await request("POST", "/portal/admission-fee/submit", { bankReference, paymentDate });
}

export type PaymentGateway = "payfast" | "jazzcash";
export type PaymentFeeType = "application" | "admission";

export type PaymentInitiateResponse = {
  gateway: PaymentGateway;
  actionUrl: string;
  fields: Record<string, string>;
};

export async function portalInitiatePayment(
  feeType: PaymentFeeType,
  gateway: PaymentGateway,
): Promise<PaymentInitiateResponse> {
  return request<PaymentInitiateResponse>("POST", "/portal/payments/initiate", { feeType, gateway });
}

/**
 * Build a hidden form from the gateway's checkout descriptor and submit it,
 * navigating the browser to the gateway's hosted payment page.
 */
export function submitGatewayForm(checkout: PaymentInitiateResponse): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.actionUrl;
  form.style.display = "none";
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export type ActiveTemplate = {
  content: string;
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  bgImageUrl: string | null;
};

/** Fetch the custom template assigned to a given purpose. Returns null if none. */
export async function fetchActiveTemplateByPurpose(purpose: string): Promise<ActiveTemplate | null> {
  try {
    const res = await fetch(`/api/print-templates/active-by-purpose/${encodeURIComponent(purpose)}`);
    if (!res.ok) return null;
    return await res.json() as ActiveTemplate;
  } catch {
    return null;
  }
}

/**
 * Build a full HTML document from a custom template, filling in the given values.
 * The result can be passed to printHtml() or opened in a new window.
 */
export function buildTemplateHtml(tpl: ActiveTemplate, values: Record<string, string>): string {
  const PAGE_PX: Record<string, { width: number; height: number }> = {
    A4: { width: 794, height: 1123 }, A5: { width: 559, height: 794 },
    Letter: { width: 816, height: 1056 }, Legal: { width: 816, height: 1344 },
    A3: { width: 1123, height: 1587 },
  };
  const dims = PAGE_PX[tpl.pageSize] ?? PAGE_PX.A4;
  const isL  = tpl.orientation === "landscape";
  const w    = isL ? dims.height : dims.width;
  const h    = isL ? dims.width  : dims.height;
  const bgAbsUrl = tpl.bgImageUrl
    ? (tpl.bgImageUrl.startsWith("/") ? window.location.origin + tpl.bgImageUrl : tpl.bgImageUrl)
    : null;

  let body = tpl.content;
  for (const [key, val] of Object.entries(values)) {
    body = body.split(`{{${key}}}`).join(val);
  }
  body = body.replace(/\{\{[^}]+\}\}/g, "");

  const MAX_TOP_PX = 151; // cap at 40 mm when a bg image is present so header graphic isn't buried
  const topPx = bgAbsUrl
    ? Math.min(Math.round(tpl.marginTop * 3.78), MAX_TOP_PX)
    : Math.round(tpl.marginTop * 3.78);

  const bgStyle = bgAbsUrl
    ? `background-image:url('${bgAbsUrl}');background-size:100% 100%;background-repeat:no-repeat;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @media print { @page { margin:0; size:${tpl.pageSize} ${tpl.orientation}; } body { margin:0; } }
  body { font-family: Arial, sans-serif; margin: 0; }
  .page { width:${w}px; min-height:${h}px; position:relative; }
  .page-bg { position:absolute; inset:0; z-index:0; ${bgStyle} }
  .page-body {
    position:relative; z-index:1;
    padding:${topPx}px ${Math.round(tpl.marginRight*3.78)}px ${Math.round(tpl.marginBottom*3.78)}px ${Math.round(tpl.marginLeft*3.78)}px;
    box-sizing:border-box;
  }
  table { border-collapse: collapse; }
  .printbtn, .print-btn { display: inline-block; margin-top: 18px; background: #064A1A; color: #fff; padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  @media print { .printbtn, .print-btn, .noprint { display: none !important; } }
</style>
</head><body>
  <div class="page">${bgAbsUrl ? `<div class="page-bg"></div>` : ""}<div class="page-body">${body}</div></div>
  <button class="printbtn noprint" onclick="window.print()">🖨️ Print / Save as PDF</button>
</body></html>`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
