import { setAuthTokenGetter, setBaseUrl, setDefaultHeaders } from "@workspace/api-client-react";

const TOKEN_KEY = "ccm_admin_token";
const USER_KEY = "ccm_admin_user";

/** Dispatched on the same window after a token is stored so providers can re-fetch. */
export const AUTH_TOKEN_SET_EVENT = "ccm-auth-token-set";

function syncTenantHeader() {
  const user = getUser();
  const tenantId = user?.tenantId as string | undefined;
  if (tenantId) {
    setDefaultHeaders({ "x-tenant-id": tenantId });
  }
}

export function initAuth() {
  const base = (import.meta.env.VITE_API_BASE as string) || null;
  setBaseUrl(base);
  setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  syncTenantHeader();
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  syncTenantHeader();
  window.dispatchEvent(new Event(AUTH_TOKEN_SET_EVENT));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setUser(user: any) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  syncTenantHeader();
}

export function getUser() {
  const data = localStorage.getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Reads impersonation query params written by the SaaS admin's
 * "Enter Admin Dashboard" button, stores them in localStorage, then strips
 * the params from the URL so they don't survive a page reload.
 *
 * Must be called synchronously before React renders (i.e. in main.tsx)
 * so that initAuth() / getToken() see the token on the very first render.
 *
 * Returns true when impersonation params were found and consumed.
 */
export function bootstrapImpersonation(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("impersonate");
  if (!token) return false;

  setToken(token);
  setUser({
    username: `saas@${params.get("impersonateSlug") ?? "tenant"}`,
    name: params.get("impersonateName") ?? "SaaS Admin",
    isSuperAdmin: true,
    tenantId: params.get("impersonateTenantId"),
  });

  // Strip params so a reload doesn't attempt to re-bootstrap.
  const url = new URL(window.location.href);
  ["impersonate", "impersonateName", "impersonateSlug", "impersonateTenantId"].forEach(
    (k) => url.searchParams.delete(k),
  );
  window.history.replaceState({}, "", url.toString());
  return true;
}
