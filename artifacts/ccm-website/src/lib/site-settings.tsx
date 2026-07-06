import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { withTenant, cacheTenantSlug, isPreviewSession } from "./tenant-fetch";
import { markSettingsReady, useBooted, useFinalizeFirstRender } from "./boot-gate";

export type SiteSettings = Record<string, string>;

// A fully transparent 1x1 pixel. Used as a logo placeholder before the tenant's
// real logo resolves, so the bundled CCM logo.png is never loaded as a fallback
// for other tenants (which caused a wrong-tenant logo flash during the src swap).
export const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const DEFAULTS: SiteSettings = {
  contact_address:      "Main Company Baag - Burgraan Road, Murree Hills, Punjab, Pakistan",
  contact_uan:          "03041111024",
  contact_landline:     "0519269181",
  contact_email:        "burdiwaheed@gmail.com",
  contact_whatsapp:     "923041111024",
  contact_hours:        "9:00 AM \u2013 5:00 PM, Mon\u2013Sat",
  contact_maps_url:     "https://maps.google.com/?q=Cadet+College+Murree+Murree+Hills",
  topbar_phone:         "+923009543823",
  alumni_stat_founded:            "2002",
  alumni_stat_graduates:          "1000+",
  alumni_stat_years:              "24+",
  alumni_stat_armed_forces:       "350+",
  alumni_stat_graduates_total:    "1700",
  alumni_stat_doctors:            "180",
  alumni_stat_engineers:          "95",
  alumni_stat_civil_services:     "35",
  alumni_stat_international:      "22",
  college_tagline:      "Proud To Be HILLIANS",
  college_motto:        "Soldiers Are Born To Fight",
  college_established:  "August 2002",
  college_description:  "A premier military educational institution producing educated, motivated and spirited cadets \u2014 following the noble traditions of the Pakistan Army.",
  link_fee_pdf:         "https://cadetcollegemurree.edu.pk/uploads/documents/fee-structure.pdf",
  link_application_form:"https://cadetcollegemurree.edu.pk/uploads/frontend/downloads/download-photo1711182991.jpg",
  admissions_deadline:  "2026-10-31",
  social_facebook:      "",
  social_youtube:       "",
  social_instagram:     "",
  social_twitter:       "",
  site_theme:           "gccm",
  site_logo:            "",
  footer_logo:          "",
  site_favicon:         "",
  site_base_url:        "",
  nav_logo_size:        "80",
  footer_logo_size:     "48",
};

const KNOWN_THEMES = ["gccm", "pakmil"] as const;

function applyTheme(theme: string) {
  const t = KNOWN_THEMES.includes(theme as (typeof KNOWN_THEMES)[number]) ? theme : "gccm";
  document.documentElement.setAttribute("data-theme", t);
}

// When an admin opens a preview/edit link the chosen theme rides in `?theme=`.
// We read it at module load (before React's first paint) and apply it
// immediately, then treat it as authoritative for the session so the async
// settings fetch never swaps the theme out from under it. This is what isolates
// each preview to exactly the selected theme — no flash of the default theme.
function readPreviewTheme(): string | null {
  try {
    const t = new URLSearchParams(window.location.search).get("theme");
    return t && KNOWN_THEMES.includes(t as (typeof KNOWN_THEMES)[number]) ? t : null;
  } catch {
    return null;
  }
}

const PREVIEW_THEME = typeof window !== "undefined" ? readPreviewTheme() : null;
if (PREVIEW_THEME) applyTheme(PREVIEW_THEME);

// Detect the theme from the URL path prefix (e.g. /gccm/ → "gccm") at module
// load — synchronously, before React renders and before the async settings
// fetch returns. This eliminates the flash of the default "ccm" theme when
// the user lands on a non-CCM path like /gccm/.
const SLUG_TO_THEME: Record<string, string> = { ccm: "gccm", gccm: "gccm", pakmil: "pakmil" };
function readUrlTheme(): string | null {
  try {
    const first = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
    return SLUG_TO_THEME[first] ?? null;
  } catch { return null; }
}
const URL_THEME = !PREVIEW_THEME && typeof window !== "undefined" ? readUrlTheme() : null;
if (URL_THEME) applyTheme(URL_THEME);

// ─── Persistent settings cache (flash-of-wrong-theme/logo prevention) ─────────
// When PREVIEW_THEME and URL_THEME are both unavailable (e.g. a domain-based
// tenant whose URL carries no slug prefix), the async settings fetch takes
// ~200–500 ms. During that window React renders with DEFAULTS — the wrong
// theme colours AND the wrong (fallback /logo.png) logo — before the real
// tenant settings arrive. We persist the full last-resolved settings object in
// localStorage, keyed by host + slug, and hydrate React's initial state from it
// so the correct theme, colours and logo all render on the very first paint.
function settingsStorageKey(): string {
  try {
    return `site-settings-cache:${window.location.host}:${cacheTenantSlug()}`;
  } catch { return "site-settings-cache"; }
}

function readCachedSettings(): SiteSettings | null {
  try {
    const raw = localStorage.getItem(settingsStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SiteSettings) : null;
  } catch { return null; }
}

function saveCachedSettings(s: SiteSettings): void {
  try { localStorage.setItem(settingsStorageKey(), JSON.stringify(s)); } catch {}
}

// Read cached settings once at module load (never in preview mode — previews
// must stay isolated to their ?theme= selection).
const CACHED_SETTINGS =
  typeof window !== "undefined" && !isPreviewSession() ? readCachedSettings() : null;

// Apply the cached theme synchronously, before React's first paint, so the
// data-theme stylesheet block is correct immediately. URL_THEME (if present)
// already won above, so only fall back to the cache when it didn't.
const CACHED_THEME = CACHED_SETTINGS?.site_theme ?? null;
if (!URL_THEME && CACHED_THEME) applyTheme(CACHED_THEME);

// A warm visit already has the correct branding cached, so open the boot gate
// synchronously at module load — the first paint shows the real tenant with no
// splash. Cold/preview visits leave the gate closed until the fetch below resolves.
if (CACHED_SETTINGS) markSettingsReady();

// Swap the browser-tab favicon to the tenant's configured icon (if any). Falls
// back to whatever <link rel="icon"> ships in index.html when unset.
function applyFavicon(url: string | undefined) {
  if (!url) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

// ─── Per-site colour palette overrides ────────────────────────────────────────
// Admins can fine-tune brand colours per tenant (stored as hex settings). When a
// role is set we override the matching CSS custom properties inline on <html> so
// they win over the [data-theme] stylesheet block; unset roles are cleared so the
// theme default shows through. Foregrounds are auto-derived for readability.

export type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function triplet(c: Hsl): string {
  return `${c.h} ${c.s}% ${c.l}%`;
}

// WCAG relative luminance → pick dark or white text for contrast on the colour.
export function readableFgTriplet(hex: string): string {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return "0 0% 100%";
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * lin(parseInt(m.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(m.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(m.slice(4, 6), 16));
  return L > 0.179 ? "0 0% 12%" : "0 0% 100%";
}

// Build a dark, diagonal hero gradient from the given colour's hue. The hero is
// always a dark field (its text is hard-coded white / --hero-fg), so we clamp the
// starting lightness low — a light primary still tints the hero toward its hue
// without washing out the white hero text.
export function darkGradient(c: Hsl): string {
  const base = Math.min(c.l, 18);
  const l2 = Math.max(4, Math.round(base * 0.55));
  const l3 = Math.max(2, Math.round(base * 0.25));
  return `linear-gradient(135deg, hsl(${c.h} ${c.s}% ${base}%) 0%, hsl(${c.h} ${c.s}% ${l2}%) 55%, hsl(${c.h} ${c.s}% ${l3}%) 100%)`;
}

// Every CSS property the palette may touch — cleared before each apply so that
// removing an override correctly reverts to the theme default.
const PALETTE_PROPS = [
  "--primary", "--primary-foreground", "--ring", "--nav-bg", "--nav-fg",
  "--icon-bg-color", "--icon-fg-color", "--hero-gradient", "--page-hero-gradient",
  "--secondary", "--secondary-foreground",
  "--accent", "--accent-foreground", "--heading-accent", "--nav-active-color",
  "--nav-cta-bg", "--nav-cta-fg",
  "--surface-dark", "--alumni-section-bg",
];

function applyPalette(s: SiteSettings) {
  const root = document.documentElement;
  PALETTE_PROPS.forEach(p => root.style.removeProperty(p));

  const primary = s.color_primary ? hexToHsl(s.color_primary) : null;
  if (primary) {
    const t = triplet(primary);
    const fg = readableFgTriplet(s.color_primary);
    root.style.setProperty("--primary", t);
    root.style.setProperty("--primary-foreground", fg);
    root.style.setProperty("--ring", t);
    root.style.setProperty("--nav-bg", `hsl(${t})`);
    root.style.setProperty("--nav-fg", `hsl(${fg})`);
    root.style.setProperty("--icon-bg-color", `hsl(${t} / 0.10)`);
    root.style.setProperty("--icon-fg-color", `hsl(${t})`);
    root.style.setProperty("--hero-gradient", darkGradient(primary));
    root.style.setProperty("--page-hero-gradient", darkGradient(primary));
  }

  const secondary = s.color_secondary ? hexToHsl(s.color_secondary) : null;
  if (secondary) {
    root.style.setProperty("--secondary", triplet(secondary));
    root.style.setProperty("--secondary-foreground", readableFgTriplet(s.color_secondary));
  }

  const accent = s.color_accent ? hexToHsl(s.color_accent) : null;
  if (accent) {
    const t = triplet(accent);
    const fg = readableFgTriplet(s.color_accent);
    root.style.setProperty("--accent", t);
    root.style.setProperty("--accent-foreground", fg);
    root.style.setProperty("--heading-accent", `hsl(${t})`);
    root.style.setProperty("--nav-active-color", `hsl(${t})`);
    root.style.setProperty("--nav-cta-bg", `hsl(${t})`);
    root.style.setProperty("--nav-cta-fg", `hsl(${fg})`);
  }

  const dark = s.color_surface_dark;
  if (dark && /^#[0-9a-fA-F]{6}$/.test(dark.trim())) {
    root.style.setProperty("--surface-dark", dark.trim());
    root.style.setProperty("--alumni-section-bg", dark.trim());
  }
}

const SiteSettingsContext = createContext<SiteSettings>(DEFAULTS);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const initialTheme = PREVIEW_THEME ?? URL_THEME ?? CACHED_THEME ?? DEFAULTS.site_theme;
  // Hydrate initial state from the cached settings (logo, colours, etc.) so the
  // very first render already shows the correct tenant branding — no fallback
  // /logo.png flash. PREVIEW_THEME forces its own theme on top.
  const [settings, setSettings] = useState<SiteSettings>(
    { ...DEFAULTS, ...(CACHED_SETTINGS ?? {}), site_theme: initialTheme },
  );

  // Apply theme + palette + favicon from cache synchronously *before* the browser
  // paints, so cached colours and favicon are correct on the first frame too.
  useLayoutEffect(() => {
    applyTheme(initialTheme);
    if (CACHED_SETTINGS) {
      applyPalette(CACHED_SETTINGS);
      applyFavicon(CACHED_SETTINGS.site_favicon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // withTenant forwards both the ?tenant= override and, in a preview/edit
    // session, the admin ?token= — so the server honors the override (and returns
    // the selected tenant's theme) even on a real tenant domain.
    const url = withTenant("/api/website/settings");
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: SiteSettings) => {
        if (data && typeof data === "object") {
          const resolvedTheme = PREVIEW_THEME ?? data.site_theme ?? "gccm";
          setSettings(prev => ({ ...prev, ...data, ...(PREVIEW_THEME ? { site_theme: PREVIEW_THEME } : {}) }));
          applyTheme(resolvedTheme);
          applyPalette(data);
          applyFavicon(data.site_favicon);
          // Persist the full settings so the next refresh hydrates correct theme,
          // colours AND logo synchronously — eliminating the flash of wrong theme.
          if (!isPreviewSession()) saveCachedSettings({ ...data, site_theme: resolvedTheme });
        }
      })
      .catch(() => {})
      // Settings have resolved (or failed) — release the boot gate's settings half.
      .finally(() => markSettingsReady());
  }, []);

  // After this first render commits, every first-paint gated resource has already
  // registered synchronously, so the boot gate may now latch open permanently —
  // client-side navigation to a page with cold content never re-shows the splash.
  useFinalizeFirstRender();

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
      <BootSplash />
    </SiteSettingsContext.Provider>
  );
}

// Neutral, theme-coloured first-paint splash. It covers the app only while the
// boot gate is closed (cold / preview loads, until settings + page-blocks resolve)
// so no tenant ever flashes CCM's fallback branding. Warm loads open the gate
// synchronously, so this never renders for them. It is intentionally tenant-neutral
// — just the theme background and a spinner in the (synchronously-known) theme
// colour — never a logo or name.
function BootSplash() {
  const booted = useBooted();
  if (booted) return null;
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}

export function useSiteBaseUrl(): string {
  const settings = useSiteSettings();
  if (settings.site_base_url) return settings.site_base_url.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  const slug = (window as unknown as Record<string, unknown>)["__TENANT_SLUG__"] as string | undefined;
  return slug ? `${origin}/${slug}` : origin;
}
