import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Palette, Loader2, RotateCcw, X, Check } from "lucide-react";
import { useEditMode } from "@/lib/edit-mode";
import { usePageBlocks } from "@/lib/usePageBlocks";
import { useToast } from "@/hooks/use-toast";
import { hexToHsl, triplet, readableFgTriplet, darkGradient } from "@/lib/site-settings";
import { SECTION_PALETTES, type SectionPalette } from "@/lib/colour-palettes";

// ─── Per-section colour planner ───────────────────────────────────────────────
// Each major homepage block (and the footer) can carry its own colour set, tuned
// inline on the live site. Colours persist through the existing page-blocks store
// (one block per section × role) so there is no DB/API change: the read path is
// `usePageBlocks(page)` and the write path is `savePageBlock`. A blank/unset role
// falls back to the global per-tenant palette / theme default — we only emit the
// CSS custom properties for roles that are actually set, scoped inline to this
// block so they win locally over the global <html> palette without bleeding into
// any other section.

export type SectionRole = "bg" | "text" | "accent" | "secondary" | "border";

export const SECTION_ROLES: { key: SectionRole; label: string; help: string }[] = [
  { key: "bg",        label: "Background", help: "Section background fill" },
  { key: "text",      label: "Text",      help: "Body text colour" },
  { key: "accent",    label: "Accent",    help: "Buttons & eyebrow labels" },
  { key: "secondary", label: "Secondary", help: "Supporting accents" },
  { key: "border",    label: "Borders",   help: "Card & divider lines" },
];

type SectionKind = "hero" | "dark" | "light";

type RoleValues = Partial<Record<SectionRole, string>>;

function normHex(v: string | undefined | null): string | null {
  if (!v) return null;
  const h = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}

/** Stable page-block key for a given section/role. */
function blockKeyFor(scope: string, role: SectionRole): string {
  return `seccolor_${scope}_${role}`;
}

/**
 * Resolve a section's colour roles into inline CSS — both the section-scoped CSS
 * custom properties (which cascade to descendants, overriding the global <html>
 * palette locally) and the element's own background/text colour. Mirrors the
 * global `applyPalette`: foregrounds are auto-derived for readability and only
 * set roles emit properties, so a blank role reverts to the inherited value.
 */
function buildSectionStyle(values: RoleValues, kind: SectionKind): CSSProperties {
  const s: Record<string, string> = {};

  const bg = normHex(values.bg);
  const text = normHex(values.text);
  const accent = normHex(values.accent);
  const secondary = normHex(values.secondary);
  const border = normHex(values.border);

  // Provide kind-appropriate defaults for CSS variables so descendants that use
  // text-foreground / border-foreground respond correctly even when no override
  // is set. Dark sections default to white foreground; light sections inherit the
  // global theme (no override needed). These are set first so explicit picks win.
  if (kind === "dark") {
    s["--foreground"] = "0 0% 100%";
    s["--card-foreground"] = "0 0% 100%";
    s["--primary-foreground"] = "0 0% 100%";
    s["--border"] = "0 0% 100% / 0.12";
  }

  if (bg) {
    const c = hexToHsl(bg);
    if (c) {
      const t = triplet(c);
      s["--background"] = t;
      s["--surface-dark"] = bg;
      s["--alumni-section-bg"] = bg;
      s["--section-warm-bg"] = bg;
      s.background = kind === "hero" ? darkGradient(c) : `hsl(${t})`;
      if (!text) {
        const fg = readableFgTriplet(bg);
        s["--foreground"] = fg;
        s["--card-foreground"] = fg;
        s["--primary-foreground"] = fg;
        s.color = `hsl(${fg})`;
        if (kind === "hero") {
          s["--hero-fg"] = `hsl(${fg})`;
          s["--hero-fg-muted"] = `hsl(${fg} / 0.85)`;
        }
      }
    }
  }

  if (text) {
    const c = hexToHsl(text);
    if (c) {
      const t = triplet(c);
      s["--foreground"] = t;
      s["--card-foreground"] = t;
      s["--primary-foreground"] = t;
      s["--hero-fg"] = `hsl(${t})`;
      s["--hero-fg-muted"] = `hsl(${t} / 0.85)`;
      s.color = `hsl(${t})`;
    }
  }

  if (accent) {
    const c = hexToHsl(accent);
    if (c) {
      const t = triplet(c);
      s["--accent"] = t;
      s["--accent-foreground"] = readableFgTriplet(accent);
      s["--heading-accent"] = `hsl(${t})`;
      s["--nav-cta-bg"] = `hsl(${t})`;
      s["--nav-cta-fg"] = `hsl(${readableFgTriplet(accent)})`;
    }
  }

  if (secondary) {
    const c = hexToHsl(secondary);
    if (c) {
      s["--secondary"] = triplet(c);
      s["--secondary-foreground"] = readableFgTriplet(secondary);
    }
  }

  if (border) {
    const c = hexToHsl(border);
    if (c) {
      const t = triplet(c);
      s["--border"] = t;
      s["--card-border"] = t;
    }
  }

  return s as CSSProperties;
}

// ─── Readable text helper (local, mirrors admin) ──────────────────────────────
function readableText(hex: string): string {
  const m = (hex.trim().replace(/^#/, "") || "000000").padEnd(6, "0");
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * lin(parseInt(m.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(m.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(m.slice(4, 6), 16));
  return L > 0.179 ? "#1f2937" : "#ffffff";
}

// ─── Palette card component ───────────────────────────────────────────────────
function PaletteCard({
  palette,
  active,
  onClick,
}: {
  palette: SectionPalette;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={palette.name}
      className={`relative w-full rounded-lg overflow-hidden border-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        active
          ? "border-sky-500 shadow-md shadow-sky-200"
          : "border-transparent hover:border-slate-300"
      }`}
    >
      {/* Colour preview strip */}
      <div style={{ background: palette.bg }} className="px-2 py-2">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span
            className="text-[9px] font-semibold truncate"
            style={{ color: palette.text }}
          >
            Sample text
          </span>
          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{ background: palette.accent, color: readableText(palette.accent) }}
          >
            CTA
          </span>
        </div>
        <div
          className="h-px w-full opacity-40"
          style={{ background: palette.border }}
        />
      </div>

      {/* Name */}
      <div className="bg-slate-50 px-2 py-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-700 truncate">{palette.name}</span>
        {active && <Check className="h-3 w-3 text-sky-500 shrink-0" />}
      </div>
    </button>
  );
}

// ─── Inline edit popover ──────────────────────────────────────────────────────

function SectionColorPopover({
  label,
  values,
  onApplyPalette,
  onResetAll,
  saving,
  anchorRect,
  onClose,
}: {
  label: string;
  values: RoleValues;
  onApplyPalette: (palette: SectionPalette) => void;
  onResetAll: () => void;
  saving: boolean;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const PANEL_W = 320;
  const left = Math.max(8, Math.min(anchorRect.right - PANEL_W, window.innerWidth - PANEL_W - 8));
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 420);
  const anyOverride = SECTION_ROLES.some(r => !!normHex(values[r.key]));

  // Detect which palette is currently active (bg + accent match)
  const activePaletteId =
    SECTION_PALETTES.find(
      p =>
        normHex(values.bg) === p.bg.toLowerCase() &&
        normHex(values.accent) === p.accent.toLowerCase(),
    )?.id ?? null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1100]" onClick={onClose} />
      <div
        className="fixed z-[1101] w-[320px] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
        style={{ left, top }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
            <Palette className="h-3.5 w-3.5" />
            <span>{label} Colours</span>
            {saving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mb-2.5 leading-snug">
          Pick a palette — all colours are contrast-tested for legibility.
        </p>

        {/* Palette grid */}
        <div className="grid grid-cols-2 gap-1.5 max-h-[320px] overflow-y-auto pr-0.5">
          {SECTION_PALETTES.map(p => (
            <PaletteCard
              key={p.id}
              palette={p}
              active={activePaletteId === p.id}
              onClick={() => {
                onApplyPalette(p);
                onClose();
              }}
            />
          ))}
        </div>

        {/* Reset */}
        <button
          type="button"
          onClick={onResetAll}
          disabled={!anyOverride}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" /> Reset section to theme default
        </button>
      </div>
    </>,
    document.body,
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

type SectionColorProps = {
  /** Page key the colour blocks belong to (matches site_page_blocks.page). */
  page: string;
  /** Stable section identifier (e.g. "hero", "features"). */
  scope: string;
  /** Human label shown in the edit popover. */
  label: string;
  /** How the section renders so backgrounds derive correctly. */
  kind?: SectionKind;
  /** Element to render (defaults to <section>). */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** Passthrough attributes (id, data-testid, data-hero-sentinel, etc.). */
  [key: string]: unknown;
};

/**
 * Wraps a major homepage block (or the footer). Renders the section element with
 * its colour roles applied as section-scoped inline CSS — identical to the plain
 * element for visitors when no overrides are set — plus an edit-mode-only palette
 * control. State is kept locally (like Editable*): palette picks drive an instant
 * preview, and each pick persists through the page-blocks save path.
 */
export default function SectionColor({
  page, scope, label, kind = "light", as = "section", className, style, children, ...rest
}: SectionColorProps) {
  const { enabled, savePageBlock } = useEditMode();
  const { toast } = useToast();
  const blocks = usePageBlocks(page);
  const btnId = useId();

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Resolve each role: a local edit (incl. cleared "") wins over the stored block.
  const values: RoleValues = {};
  for (const role of SECTION_ROLES) {
    const k = blockKeyFor(scope, role.key);
    const v = k in edits ? edits[k] : blocks[k];
    if (v) values[role.key] = v;
  }

  const colorStyle = buildSectionStyle(values, kind);
  const mergedStyle: CSSProperties = { position: "relative", ...style, ...colorStyle };

  async function persist(role: SectionRole, hex: string) {
    await savePageBlock(page, blockKeyFor(scope, role), hex, "color");
  }

  /** Apply all 5 roles from a palette at once — preview then persist. */
  function applyPalette(p: SectionPalette) {
    const roleMap: Record<SectionRole, string> = {
      bg: p.bg,
      text: p.text,
      accent: p.accent,
      secondary: p.secondary,
      border: p.border,
    };
    setEdits(prev => {
      const next = { ...prev };
      for (const [role, hex] of Object.entries(roleMap)) {
        next[blockKeyFor(scope, role as SectionRole)] = hex;
      }
      return next;
    });
    (async () => {
      setSaving(true);
      try {
        for (const [role, hex] of Object.entries(roleMap)) {
          await persist(role as SectionRole, hex);
        }
      } catch (e: any) {
        toast({ title: "Save failed", description: e?.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    })();
  }

  function resetAll() {
    setEdits(prev => {
      const next = { ...prev };
      for (const r of SECTION_ROLES) next[blockKeyFor(scope, r.key)] = "";
      return next;
    });
    (async () => {
      setSaving(true);
      try {
        for (const r of SECTION_ROLES) await persist(r.key, "");
      } catch (e: any) {
        toast({ title: "Save failed", description: e?.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    })();
  }

  const control = enabled ? (
    <button
      key={btnId}
      ref={btnRef}
      type="button"
      data-cms-section-color
      title={`Section colours · ${label}`}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        setAnchorRect(btnRef.current?.getBoundingClientRect() ?? null);
        setOpen(o => !o);
      }}
      className="absolute right-2 top-2 z-[60] inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-slate-900/85 px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-sky-600"
    >
      <Palette className="h-4 w-4" />
      <span className="hidden sm:inline">Colours</span>
    </button>
  ) : null;

  const popover = enabled && open && anchorRect ? (
    <SectionColorPopover
      key={`${btnId}-pop`}
      label={label}
      values={values}
      onApplyPalette={applyPalette}
      onResetAll={resetAll}
      saving={saving}
      anchorRect={anchorRect}
      onClose={() => setOpen(false)}
    />
  ) : null;

  return createElement(
    as,
    { ...rest, className, style: mergedStyle },
    children,
    control,
    popover,
  );
}
