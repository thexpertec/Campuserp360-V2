import {
  createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState, type ReactNode,
} from "react";
import { getTenantOverride } from "./tenant-fetch";

/**
 * Inline website editing ("CMS edit mode").
 *
 * A logged-in admin opens the real public website with their admin token passed
 * in the URL hash (`#cms=<token>`). We capture it, persist it in sessionStorage,
 * and expose helpers for writing to the existing admin website-content endpoints.
 * Tenant scoping reuses the `?tenant=` slug override already understood by the
 * public site (forwarded as `X-Tenant-Id` on writes).
 */

const TOKEN_KEY = "ccm_edit_token";
const ENABLED_KEY = "ccm_edit_enabled";

type PageBlockRow = { id: string; page: string; blockKey: string; content: string | null };

export type EditModeCtx = {
  /** A (validated-or-pending) admin token is present. */
  hasToken: boolean;
  /** Edit affordances are active (toggle). */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Tenant slug/id override forwarded to admin writes (null in prod host-mapped). */
  tenant: string | null;
  adminFetch: (path: string, init?: RequestInit) => Promise<any>;
  uploadFile: (file: File) => Promise<string>;
  savePageBlock: (page: string, blockKey: string, content: string, blockType?: string) => Promise<void>;
  saveSetting: (key: string, value: string) => Promise<void>;
  signOut: () => void;
};

const NOOP: EditModeCtx = {
  hasToken: false, enabled: false, setEnabled: () => {}, tenant: null,
  adminFetch: async () => null, uploadFile: async () => "",
  savePageBlock: async () => {}, saveSetting: async () => {}, signOut: () => {},
};

const Ctx = createContext<EditModeCtx>(NOOP);

function readHashToken(kind: "cms" | "preview"): string | null {
  if (typeof window === "undefined") return null;
  const m = new RegExp(`[#&]${kind}=([^&]+)`).exec(window.location.hash || "");
  if (!m || !m[1]) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem(TOKEN_KEY));
  const [enabled, setEnabledState] = useState<boolean>(() =>
    typeof window === "undefined" ? false : sessionStorage.getItem(ENABLED_KEY) === "1");

  const tenant = getTenantOverride();

  // ── Capture token from the URL hash on first load, then strip it. ──────────
  // `#cms=` starts an inline-edit session (toolbar on). `#preview=` is a read-only
  // preview: it authorizes CMS reads (theme/content) so the ?tenant= override is
  // honored on a real tenant domain, but shows no edit affordances.
  useEffect(() => {
    const editToken = readHashToken("cms");
    const previewToken = readHashToken("preview");
    if (editToken) {
      sessionStorage.setItem(TOKEN_KEY, editToken);
      sessionStorage.setItem(ENABLED_KEY, "1");
      setToken(editToken);
      setEnabledState(true);
    } else if (previewToken) {
      sessionStorage.setItem("ccm_site_token", previewToken);
    }
    if (!editToken && !previewToken) return;
    const cleanHash = (window.location.hash || "")
      .replace(/[#&]cms=[^&]*/, "")
      .replace(/[#&]preview=[^&]*/, "")
      .replace(/^#&/, "#");
    const url = window.location.pathname + window.location.search +
      (cleanHash && cleanHash !== "#" ? cleanHash : "");
    window.history.replaceState(null, "", url);
  }, []);

  // ── Validate token once present; clear it if the server rejects it. ────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch("/api/admin/website/tenants", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error("invalid"); })
      .catch(() => {
        if (cancelled) return;
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(ENABLED_KEY);
        setToken(null);
        setEnabledState(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    sessionStorage.setItem(ENABLED_KEY, v ? "1" : "0");
  }, []);

  const adminFetch = useCallback(async (path: string, init?: RequestInit) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
      ...((init?.headers as Record<string, string>) ?? {}),
    };
    if (tenant) headers["X-Tenant-Id"] = tenant;
    const res = await fetch(path, { ...init, headers });
    const text = await res.text();
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; }
      catch { if (text) msg = text; }
      throw new Error(msg);
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }, [token, tenant]);

  const uploadFile = useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = ((reader.result as string).split(",")[1]) ?? "";
      try {
        const r = await adminFetch("/api/admin/website/upload", {
          method: "POST",
          body: JSON.stringify({ fileData: base64, fileName: file.name, mimeType: file.type }),
        });
        resolve(r?.url as string);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  }), [adminFetch]);

  // ── Page-block id cache (page::blockKey → row) ─────────────────────────────
  const blockMap = useRef<Map<string, PageBlockRow> | null>(null);
  const loadBlocks = useCallback(async () => {
    if (blockMap.current) return blockMap.current;
    const rows = (await adminFetch("/api/admin/website/page-blocks")) as PageBlockRow[] | null;
    const map = new Map<string, PageBlockRow>();
    for (const r of rows ?? []) map.set(`${r.page}::${r.blockKey}`, r);
    blockMap.current = map;
    return map;
  }, [adminFetch]);

  const savePageBlock = useCallback(async (
    page: string, blockKey: string, content: string, blockType = "text",
  ) => {
    const map = await loadBlocks();
    const key = `${page}::${blockKey}`;
    const existing = map.get(key);
    if (existing) {
      await adminFetch(`/api/admin/website/page-blocks/${existing.id}`, {
        method: "PATCH", body: JSON.stringify({ content, isPublished: true }),
      });
      existing.content = content;
    } else {
      const row = (await adminFetch("/api/admin/website/page-blocks", {
        method: "POST",
        body: JSON.stringify({ page, blockKey, blockType, content, isPublished: true }),
      })) as PageBlockRow | null;
      if (row?.id) map.set(key, row);
    }
  }, [adminFetch, loadBlocks]);

  const saveSetting = useCallback(async (key: string, value: string) => {
    await adminFetch("/api/admin/website/settings", {
      method: "PUT", body: JSON.stringify({ updates: [{ key, value }] }),
    });
  }, [adminFetch]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ENABLED_KEY);
    blockMap.current = null;
    setToken(null);
    setEnabledState(false);
  }, []);

  const value = useMemo<EditModeCtx>(() => ({
    hasToken: !!token,
    enabled: !!token && enabled,
    setEnabled, tenant, adminFetch, uploadFile, savePageBlock, saveSetting, signOut,
  }), [token, enabled, setEnabled, tenant, adminFetch, uploadFile, savePageBlock, saveSetting, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditMode(): EditModeCtx {
  return useContext(Ctx);
}
