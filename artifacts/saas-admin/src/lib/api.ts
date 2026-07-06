import { getToken, clearAuth } from "./auth";

const BASE = "/api/saas-admin";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Only force a redirect when an *authenticated* request fails — i.e. the
    // session token expired or was rejected. For the login request itself there
    // is no token yet, so let the caller (the login form) handle the 401 and
    // show an "Invalid credentials" message instead of bouncing the user away.
    if (token) {
      clearAuth();
      // Redirect within the app's base path (e.g. "/saas/login"), not the root
      // "/login" — the latter is served by the public website, not this app.
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      window.location.replace(`${base}/login`);
    }
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

export type TenantModuleItem = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
  configFields: Array<{
    key: string;
    label: string;
    type: "number";
    default: number;
    min?: number;
    max?: number;
  }>;
};

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; expiresAt: string; user: { id: string; username: string } }>(
      "POST", "/login", { username, password },
    ),

  me: () => request<{ id: string; username: string; isSaasAdmin: boolean }>("GET", "/me"),

  listTenants: () =>
    request<Array<{
      id: string; name: string; slug: string; contactEmail: string | null; domain: string | null;
      plan: string; isActive: boolean; createdAt: string; updatedAt: string;
      applicantPrefix: string; enrolledPrefix: string;
    }>>("GET", "/tenants"),

  createTenant: (data: {
    name: string; slug: string; contactEmail?: string; domain?: string; plan?: string; isActive?: boolean;
  }) => request<{ id: string; name: string; slug: string; domain: string | null; plan: string; isActive: boolean; createdAt: string }>(
    "POST", "/tenants", data,
  ),

  getTenant: (id: string) =>
    request<{
      id: string; name: string; slug: string; contactEmail: string | null; domain: string | null;
      plan: string; isActive: boolean; createdAt: string; updatedAt: string;
    }>("GET", `/tenants/${id}`),

  updateTenant: (id: string, data: { name?: string; slug?: string; contactEmail?: string; domain?: string; plan?: string; isActive?: boolean }) =>
    request<{ id: string; name: string; slug: string; domain: string | null; plan: string; isActive: boolean }>(
      "PATCH", `/tenants/${id}`, data,
    ),

  listTenantAdmins: (tenantId: string) =>
    request<Array<{
      id: string; tenantId: string; username: string; fullName: string;
      email: string | null; role: string; isActive: boolean; createdAt: string;
    }>>("GET", `/tenants/${tenantId}/admins`),

  createTenantAdmin: (tenantId: string, data: {
    username: string; password: string; fullName: string; email?: string; role?: string;
  }) => request<{ id: string; username: string; fullName: string; role: string }>(
    "POST", `/tenants/${tenantId}/admins`, data,
  ),

  resetTenantAdminPassword: (tenantId: string, adminId: string, password: string) =>
    request<{ ok: boolean }>(
      "PATCH", `/tenants/${tenantId}/admins/${adminId}/reset-password`, { password },
    ),

  setTenantAdminRole: (tenantId: string, adminId: string, role: "admin" | "super_admin") =>
    request<{ ok: boolean; role: string }>(
      "PATCH", `/tenants/${tenantId}/admins/${adminId}/role`, { role },
    ),

  deleteTenant: (id: string, password: string) =>
    request<{ ok: boolean; deleted: { id: string; name: string; slug: string } }>(
      "DELETE", `/tenants/${id}`, { password },
    ),

  impersonate: (tenantId: string) =>
    request<{ token: string; expiresAt: string; tenant: { id: string; name: string; slug: string } }>(
      "POST", `/tenants/${tenantId}/impersonate`,
    ),

  getTenantModules: (tenantId: string) =>
    request<{ modules: TenantModuleItem[] }>(
      "GET", `/tenants/${tenantId}/modules`,
    ),

  updateTenantModules: (tenantId: string, modules: Array<{ key: string; enabled: boolean; config?: Record<string, unknown> }>) =>
    request<{ modules: TenantModuleItem[] }>(
      "PUT", `/tenants/${tenantId}/modules`, { modules },
    ),

  changeCredentials: (data: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
    confirmPassword?: string;
  }) => request<{ ok: boolean }>("PATCH", "/credentials", data),
};
