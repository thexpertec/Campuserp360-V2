import { useEffect, useRef, useState } from "react";
import { withTenant, cacheTenantSlug, isPreviewSession } from "./tenant-fetch";
import { beginGatedFetch, endGatedFetch, useBooted } from "./boot-gate";

// ─── In-flight request sharing (de-dupe identical concurrent reads) ───────────
// The home page mounts many components that each call useTenantResource for the
// SAME resource (e.g. several usePageBlocks("home") instances), which on a cold
// load fired N identical parallel requests and saturated the connection pool —
// the latency that tripped the boot gate's safety net and flashed CCM branding.
// We coalesce concurrent identical requests behind one promise, keyed by the
// tenant-scoped cache key + URL, and drop it once settled so a later
// (tenant-change) refetch still goes to the network.
const inFlight = new Map<string, Promise<unknown>>();

function sharedFetch(dedupeKey: string, url: string): Promise<unknown> {
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing;
  const p = fetch(withTenant(url))
    .then((r) => (r.ok ? r.json() : Promise.reject(r)))
    .finally(() => {
      inFlight.delete(dedupeKey);
    });
  inFlight.set(dedupeKey, p);
  return p;
}

// ─── Per-tenant persistent content cache (flash-of-wrong-tenant prevention) ───
// On a refresh, React Query / in-memory caches are empty, so any content that is
// fetched asynchronously paints its initial value first. Historically that initial
// value was a hardcoded CCM fallback (FALLBACK_* arrays, homeBlocks "|| CCM" text),
// which made EVERY other tenant flash CCM branding before its real data arrived.
//
// This helper mirrors the settings cache in site-settings.tsx: it persists the
// last-resolved payload of each website resource in localStorage, partitioned by
// host + tenant slug + resource, and hydrates React's initial state from it. So a
// refresh of a previously-visited tenant paints that tenant's OWN content on the
// very first frame — never another tenant's hardcoded fallback.
//
// The partition key, preview-session suppression, and slug derivation MUST stay in
// sync with site-settings.tsx (settingsStorageKey / CACHED_SETTINGS) and the inline
// bootstrap in index.html so all anti-flash caches agree on which tenant they hold.

function contentCacheKey(resource: string): string {
  try {
    return `site-content-cache:${window.location.host}:${cacheTenantSlug()}:${resource}`;
  } catch {
    return `site-content-cache:${resource}`;
  }
}

function readContentCache<T>(resource: string): T | null {
  try {
    // Never read the cache during a preview/edit session — the rendered tenant
    // may differ from the host's real (cached) tenant.
    if (isPreviewSession()) return null;
    const raw = localStorage.getItem(contentCacheKey(resource));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeContentCache<T>(resource: string, value: T): void {
  try {
    if (isPreviewSession()) return;
    localStorage.setItem(contentCacheKey(resource), JSON.stringify(value));
  } catch {
    // Quota / serialization failures are non-fatal — the live fetch still renders.
  }
}

/**
 * Fetch a tenant-scoped website resource with a localStorage-backed, per-tenant
 * cache so refreshes never flash another tenant's content.
 *
 * - Initial value: this tenant's cached payload from the previous visit, else
 *   `cold` (which MUST be tenant-neutral, e.g. `[]` or `{}` — never another
 *   tenant's hardcoded content).
 * - On mount: fetches `withTenant(url)`, updates state, and persists the result
 *   (even empty arrays / objects) so the next refresh paints synchronously and a
 *   tenant with genuinely no content shows empty rather than a stale fallback.
 *
 * @param resource Stable cache partition name (e.g. "features", "page-blocks:home").
 * @param url      API path passed through `withTenant()`.
 * @param cold     Tenant-neutral value used only when no cache exists yet.
 * @param transform Optional shaping of the raw JSON before storing/returning.
 * @param gate     When true AND this load is cold (no cache / preview session),
 *                 hold the first-paint boot gate open until the fetch settles, so
 *                 branding-critical content (page-blocks) never flashes the CCM
 *                 fallback before the real tenant data arrives. Warm (cached)
 *                 loads never gate. See boot-gate.ts.
 * @param defer    When true, the fetch is held until the boot gate has opened
 *                 (settings + page-blocks resolved). Use for non-critical,
 *                 below-the-fold content so it never competes with the
 *                 branding-critical reads on a cold load. Cached values still
 *                 render on the first frame; only the network refresh waits.
 */
export function useTenantResource<T>(
  resource: string,
  url: string,
  cold: T,
  transform?: (data: unknown) => T,
  gate = false,
  defer = false,
): T {
  // The storage key folds in the active tenant slug, so it changes whenever the
  // tenant changes — including via client-side navigation across tenant path
  // prefixes that keep this hook mounted (not just on a full page reload).
  const key = contentCacheKey(resource);
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: readContentCache<T>(resource) ?? cold,
  }));

  // If the tenant (and thus the key) changed while mounted, re-hydrate from that
  // tenant's own cache synchronously during render — so we never paint the
  // previous tenant's content for a frame before the new fetch resolves. This is
  // React's "reset state when a key changes" pattern; the guard prevents a loop.
  if (state.key !== key) {
    setState({ key, value: readContentCache<T>(resource) ?? cold });
  }

  // Register the boot gate SYNCHRONOUSLY during the first render (not in an
  // effect), so the gate is already closed before the first paint. This must beat
  // any module-load markSettingsReady() (warm settings), otherwise the gate could
  // open and paint the CCM fallback before this fetch ever registered — the exact
  // failure when settings are cached but this resource is not. The ref guard runs
  // the registration exactly once per mounted instance; release happens in the
  // fetch effect below (on settle or unmount), idempotently.
  const gateRef = useRef<{ gated: boolean; released: boolean } | null>(null);
  if (gateRef.current === null) {
    const isGated = gate && readContentCache<T>(resource) == null;
    if (isGated) beginGatedFetch();
    gateRef.current = { gated: isGated, released: false };
  }

  // Deferred resources wait until the boot gate has opened before hitting the
  // network, so they never compete with the branding-critical reads on a cold
  // load. Non-deferred resources fetch immediately (shouldFetch is always true).
  const booted = useBooted();
  const shouldFetch = !defer || booted;

  useEffect(() => {
    if (!shouldFetch) return;
    let active = true;
    const releaseGate = () => {
      const g = gateRef.current;
      if (g && g.gated && !g.released) {
        g.released = true;
        endGatedFetch();
      }
    };
    sharedFetch(`${key}::${url}`, url)
      .then((data: unknown) => {
        if (active) {
          const next = transform ? transform(data) : (data as T);
          setState({ key, value: next });
          writeContentCache(resource, next);
        }
      })
      .catch(() => {
        // Network/HTTP errors keep whatever we already have (cache or cold) —
        // we never overwrite good cached content with an error state.
      })
      .finally(() => {
        // Release once the first-paint fetch settles. Gated only on the initial
        // mount, so a later tenant-change refetch never re-gates.
        releaseGate();
      });
    return () => {
      active = false;
      // Unmounting before the fetch settles must still release the gate, or the
      // splash could stick forever.
      releaseGate();
    };
    // key (tenant + resource) + url fully determine the request; transform is
    // stable per call site. shouldFetch flips deferred resources on once booted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, url, shouldFetch]);

  return state.value;
}
