/**
 * Forward the `?tenant=<slug>` override (when present in the page URL) to public
 * website CMS API requests, so a specific tenant can be previewed by slug in
 * non-production contexts (e.g. the Replit preview, where the request host does
 * not map to a tenant domain).
 *
 * In production the tenant resolves from the request host, so the override is
 * simply absent and URLs are returned unchanged.
 */
// Page routes that occupy the first path segment — must NOT be mistaken for
// tenant slugs.  Keep in sync with the routes defined in App.tsx.
const KNOWN_PAGE_ROUTES = new Set([
  "about", "admissions", "gallery", "events", "contact", "teachers",
  "downloads", "status", "alumni", "results", "fee-structure", "privacy",
  "terms", "portal",
]);

export function getTenantOverride(): string | null {
  if (typeof window === "undefined") return null;
  // Priority 1: injected by gateway/Vite plugin as window.__TENANT_SLUG__
  const injected = (window as unknown as Record<string, unknown>)["__TENANT_SLUG__"] as string | undefined;
  if (injected) return injected;
  // Priority 2: URL path prefix — the browser URL is /mariam-college/gallery etc.
  // Accept any valid slug (letter-start, alphanumeric + hyphens, 2–31 chars)
  // that is NOT a known page route, so /gallery is never mistaken for a tenant.
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
  if (/^[a-z][a-z0-9-]{1,30}$/.test(firstSegment) && !KNOWN_PAGE_ROUTES.has(firstSegment)) {
    return firstSegment;
  }
  // Priority 3: explicit ?tenant= in the page URL (dev/admin-preview override)
  return new URLSearchParams(window.location.search).get("tenant");
}

/**
 * Partition key segment for client-side caches (theme / settings / hero).
 *
 * IMPORTANT: derived from the URL PATH ONLY — never from window.__TENANT_SLUG__.
 * The inline anti-flash bootstrap in index.html runs *before* the gateway
 * injects __TENANT_SLUG__, so it can only see the path. To keep the cache key
 * identical between that inline reader and this bundle's writer, both must use
 * path-based detection. Domain-based tenants (path "/") return "root" but are
 * still uniquely partitioned by host; path-based tenants return their slug.
 */
export function cacheTenantSlug(): string {
  if (typeof window === "undefined") return "root";
  const first = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
  return /^[a-z][a-z0-9-]{1,30}$/.test(first) && !KNOWN_PAGE_ROUTES.has(first)
    ? first
    : "root";
}

/**
 * True when the page is an admin preview / tenant-override session. In these
 * sessions the rendered tenant may differ from the host's real tenant, so
 * client-side caches must NOT be read or written — otherwise a preview would
 * pollute (or be polluted by) a real visitor's cached branding.
 */
export function isPreviewSession(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("theme") || sp.get("tenant") || sp.get("token")) return true;
  if (/[#&](?:cms|preview)=/.test(window.location.hash || "")) return true;
  try {
    if (sessionStorage.getItem("ccm_edit_token") || sessionStorage.getItem("ccm_site_token")) {
      return true;
    }
  } catch { /* sessionStorage may be unavailable */ }
  return false;
}

/**
 * The admin token for a preview/edit session, when one is active. Public CMS
 * reads forward it as `?token=` so the server honors the `?tenant=` override for
 * super-admins on real tenant domains too — so the previewed theme/content (reads)
 * match the selected tenant rather than falling back to the host's default tenant.
 *
 * Resolution order (first hit wins), and the token is persisted to sessionStorage
 * so it survives client-side navigation within the previewed tab:
 *  1. `ccm_edit_token` — an inline-edit session (captured by edit-mode from #cms=).
 *  2. `ccm_site_token`  — a read-only preview token already captured this session.
 *  3. the current URL — `?token=` (section-preview iframe) or a `#cms=`/`#preview=`
 *     hash (full-page open), used before edit-mode has captured/stripped it.
 */
export function getEditToken(): string | null {
  if (typeof window === "undefined") return null;
  const edit = sessionStorage.getItem("ccm_edit_token");
  if (edit) return edit;
  const saved = sessionStorage.getItem("ccm_site_token");
  if (saved) return saved;
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  let fromHash: string | null = null;
  const m = /[#&](?:cms|preview)=([^&]+)/.exec(window.location.hash || "");
  if (m && m[1]) {
    try { fromHash = decodeURIComponent(m[1]); } catch { fromHash = m[1]; }
  }
  const token = fromQuery || fromHash;
  if (token) {
    sessionStorage.setItem("ccm_site_token", token);
    return token;
  }
  return null;
}

export function withTenant(url: string): string {
  const params: string[] = [];
  const tenant = getTenantOverride();
  if (tenant) params.push(`tenant=${encodeURIComponent(tenant)}`);
  const token = getEditToken();
  if (token) params.push(`token=${encodeURIComponent(token)}`);
  if (params.length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${params.join("&")}`;
}
