import { setAuthTokenGetter, setBaseUrl, setDefaultHeaders } from "@workspace/api-client-react";

const TOKEN_KEY = "ccm_admin_token";
const USER_KEY = "ccm_admin_user";

/** Dispatched on the same window after a token is stored so providers can re-fetch. */
export const AUTH_TOKEN_SET_EVENT = "ccm-auth-token-set";

export function initAuth() {
  // Route Orval-generated API hooks through the correct base URL.
  // In Replit dev, VITE_API_BASE is the main domain (port 5000 proxy) so that
  // PUT/PATCH/DELETE requests are not blocked by Replit's port-8099 proxy.
  const base = (import.meta.env.VITE_API_BASE as string) || null;
  setBaseUrl(base);
  setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  // Always tell the API server which tenant this admin console manages.
  // getAdminTenantId() falls back to host-domain matching only, which fails on
  // *.replit.app and any domain not registered in the tenants table.
  setDefaultHeaders({ "x-tenant-id": "ccm" });
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(AUTH_TOKEN_SET_EVENT));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setUser(user: any) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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
