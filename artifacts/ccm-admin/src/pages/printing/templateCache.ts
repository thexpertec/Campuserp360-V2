const _auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

export type CachedTemplate = {
  content: string;
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  bgImageUrl: string | null;
  name: string;
  isCustom: boolean;
  category: string;
  /** Situation slug this template is assigned to, or null if unassigned. */
  purpose: string | null;
};

let _cache: Record<string, CachedTemplate> | null = null;
let _inflight: Promise<Record<string, CachedTemplate>> | null = null;

function _parse(item: Record<string, unknown>): CachedTemplate {
  return {
    content:      String(item.content      ?? ""),
    pageSize:     String(item.pageSize     ?? "A4"),
    orientation:  String(item.orientation  ?? "portrait"),
    marginTop:    Number(item.marginTop    ?? 20),
    marginRight:  Number(item.marginRight  ?? 15),
    marginBottom: Number(item.marginBottom ?? 20),
    marginLeft:   Number(item.marginLeft   ?? 15),
    bgImageUrl:   item.bgImageUrl ? String(item.bgImageUrl) : null,
    name:         String(item.name         ?? ""),
    isCustom:     item.isCustom === true,
    category:     String(item.category     ?? "builtin"),
    purpose:      item.purpose ? String(item.purpose) : null,
  };
}

/** Returns the in-memory cache synchronously, or null if not yet loaded. */
export function getTemplatesCached(): Record<string, CachedTemplate> | null {
  return _cache;
}

/** Fetch all templates once; subsequent calls resolve from memory instantly. */
export function loadTemplates(): Promise<Record<string, CachedTemplate>> {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;
  _inflight = fetch(`/api/admin/print-templates`, { headers: _auth() })
    .then(r => {
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json() as Promise<Record<string, unknown>[]>;
    })
    .then(data => {
      _cache = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.type) _cache[String(item.type)] = _parse(item);
        }
      }
      _inflight = null;
      return _cache;
    })
    .catch(() => {
      _inflight = null;
      if (!_cache) _cache = {};
      return _cache;
    });
  return _inflight;
}

/** Update cache after a save so other panels stay in sync. */
export function patchTemplateCache(type: string, patch: Partial<CachedTemplate>) {
  if (!_cache) _cache = {};
  // If a purpose is being assigned to this type, clear it from any other entry.
  if (patch.purpose && _cache) {
    for (const [k, v] of Object.entries(_cache)) {
      if (k !== type && v.purpose === patch.purpose) {
        _cache[k] = { ...v, purpose: null };
      }
    }
  }
  _cache[type] = {
    ...(_cache[type] ?? {
      content: "", pageSize: "A4", orientation: "portrait",
      marginTop: 20, marginRight: 15, marginBottom: 20, marginLeft: 15, bgImageUrl: null,
      name: "", isCustom: false, category: "builtin", purpose: null,
    }),
    ...patch,
  };
}

/** Remove a template from the cache (e.g. after deleting a custom template). */
export function removeTemplateFromCache(type: string) {
  if (_cache) delete _cache[type];
}

/** Force re-fetch (e.g. after background image upload/delete). */
export function invalidateTemplateCache() {
  _cache = null;
  _inflight = null;
}

/**
 * Find the template (by type slug) that currently holds the given purpose.
 * Returns null if none is assigned.
 */
export function getTemplateTypeByPurpose(purpose: string): string | null {
  if (!_cache) return null;
  for (const [type, tpl] of Object.entries(_cache)) {
    if (tpl.purpose === purpose) return type;
  }
  return null;
}
