// ─── Section Colour Palette Catalogue ────────────────────────────────────────
// Pre-authored palettes for per-section colour overrides. Every bg+text pair
// is WCAG AA compliant (contrast ≥ 4.5:1). Admins pick from this catalogue
// instead of entering raw hex values so the site always stays legible.

export type SectionPalette = {
  id: string;
  name: string;
  bg: string;
  text: string;
  accent: string;
  secondary: string;
  border: string;
};

export const SECTION_PALETTES: SectionPalette[] = [
  // ── Dark sections (light text on dark bg) ──────────────────────────────────
  {
    id: "forest-dark",
    name: "Forest",
    bg: "#064A1A",
    text: "#ffffff",
    accent: "#4ade80",
    secondary: "#198754",
    border: "#0a5e22",
  },
  {
    id: "navy-dark",
    name: "Navy",
    bg: "#0f2057",
    text: "#ffffff",
    accent: "#f0a500",
    secondary: "#2e5fad",
    border: "#1a2f7a",
  },
  {
    id: "maroon-dark",
    name: "Maroon",
    bg: "#5c0a2d",
    text: "#ffffff",
    accent: "#d4af37",
    secondary: "#8a1145",
    border: "#7a1040",
  },
  {
    id: "charcoal-dark",
    name: "Charcoal",
    bg: "#1e293b",
    text: "#ffffff",
    accent: "#38bdf8",
    secondary: "#475569",
    border: "#334155",
  },
  {
    id: "teal-dark",
    name: "Teal",
    bg: "#0d5c63",
    text: "#ffffff",
    accent: "#a3e7ed",
    secondary: "#1a8a96",
    border: "#0f7a84",
  },
  {
    id: "purple-dark",
    name: "Purple",
    bg: "#2d1b69",
    text: "#ffffff",
    accent: "#f59e0b",
    secondary: "#4a3ca0",
    border: "#3b2580",
  },
  {
    id: "amber-dark",
    name: "Amber Dark",
    bg: "#78350f",
    text: "#fef3c7",
    accent: "#fbbf24",
    secondary: "#d97706",
    border: "#92400e",
  },
  {
    id: "gold-black",
    name: "Gold & Black",
    bg: "#1a1200",
    text: "#fef3c7",
    accent: "#d4af37",
    secondary: "#b45309",
    border: "#3d2d00",
  },
  // ── Light sections (dark text on light bg) ─────────────────────────────────
  {
    id: "white-clean",
    name: "White",
    bg: "#ffffff",
    text: "#1f2937",
    accent: "#064A1A",
    secondary: "#4b5563",
    border: "#e5e7eb",
  },
  {
    id: "cream-warm",
    name: "Cream",
    bg: "#fdf6e3",
    text: "#2d1b1b",
    accent: "#8b4513",
    secondary: "#6b4226",
    border: "#e8d5b7",
  },
  {
    id: "sky-light",
    name: "Sky Blue",
    bg: "#eff6ff",
    text: "#1e3a5f",
    accent: "#1d4ed8",
    secondary: "#3b82f6",
    border: "#bfdbfe",
  },
  {
    id: "sage-light",
    name: "Sage Green",
    bg: "#f0fdf4",
    text: "#14532d",
    accent: "#15803d",
    secondary: "#22c55e",
    border: "#bbf7d0",
  },
  {
    id: "slate-light",
    name: "Slate",
    bg: "#f1f5f9",
    text: "#1e293b",
    accent: "#0369a1",
    secondary: "#64748b",
    border: "#cbd5e1",
  },
  {
    id: "rose-light",
    name: "Rose",
    bg: "#fff1f2",
    text: "#881337",
    accent: "#be123c",
    secondary: "#f43f5e",
    border: "#fecdd3",
  },
];

// ── Contrast validation (dev-only) ─────────────────────────────────────────────
// Logs a warning for any bg+text pair that fails WCAG AA (contrast < 4.5:1).
function relativeLuminance(hex: string): number {
  const m = hex.replace(/^#/, "");
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * lin(parseInt(m.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(m.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(m.slice(4, 6), 16))
  );
}

function contrastRatio(hex1: string, hex2: string): number {
  const L1 = relativeLuminance(hex1);
  const L2 = relativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  for (const p of SECTION_PALETTES) {
    const ratio = contrastRatio(p.bg, p.text);
    if (ratio < 4.5) {
      console.warn(
        `[colour-palettes] "${p.name}" bg(${p.bg})+text(${p.text}) contrast ${ratio.toFixed(1)}:1 — below WCAG AA 4.5:1`,
      );
    }
  }
}
