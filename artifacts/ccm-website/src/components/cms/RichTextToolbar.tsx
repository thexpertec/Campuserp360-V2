import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ChevronDown, Type, Highlighter,
} from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: "Default",          value: "" },
  { label: "Arial",            value: "Arial, sans-serif" },
  { label: "Georgia",          value: "Georgia, serif" },
  { label: "Helvetica",        value: "Helvetica, sans-serif" },
  { label: "Times New Roman",  value: "Times New Roman, serif" },
  { label: "Courier New",      value: "Courier New, monospace" },
  { label: "Verdana",          value: "Verdana, sans-serif" },
  { label: "Trebuchet MS",     value: "Trebuchet MS, sans-serif" },
  { label: "Palatino",         value: "Palatino Linotype, serif" },
  { label: "Impact",           value: "Impact, sans-serif" },
];

const FONT_SIZES = [
  "10","11","12","13","14","15","16","18","20","22",
  "24","28","32","36","40","48","56","64","72","96",
];

const TEXT_COLORS = [
  "#000000","#1e293b","#374151","#6b7280","#9ca3af","#d1d5db","#e5e7eb","#f9fafb",
  "#ef4444","#f97316","#eab308","#84cc16","#22c55e","#14b8a6","#3b82f6","#8b5cf6",
  "#ec4899","#dc2626","#ea580c","#ca8a04","#16a34a","#0d9488","#2563eb","#7c3aed",
  "#ffffff","#fef2f2","#fff7ed","#fefce8","#f0fdf4","#f0fdfa","#eff6ff","#faf5ff",
];

const BLOCK_FORMATS = [
  { label: "Normal text", value: "p" },
  { label: "Heading 1",   value: "h1" },
  { label: "Heading 2",   value: "h2" },
  { label: "Heading 3",   value: "h3" },
  { label: "Heading 4",   value: "h4" },
  { label: "Preformatted",value: "pre" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function execCmd(command: string, value?: string) {
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(command, false, value);
}

/** Wrap selection in a <span> with one CSS property set.
 *  Falls back to extract+insert for cross-element selections. */
function wrapInSpan(prop: "fontSize" | "fontFamily", value: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const span = document.createElement("span");
  span.style[prop] = value;
  try {
    range.surroundContents(span);
  } catch {
    const frag = range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }
  const nr = document.createRange();
  nr.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(nr);
}

function getFmt() {
  try {
    return {
      bold:        document.queryCommandState("bold"),
      italic:      document.queryCommandState("italic"),
      underline:   document.queryCommandState("underline"),
      strike:      document.queryCommandState("strikethrough"),
      jLeft:       document.queryCommandState("justifyLeft"),
      jCenter:     document.queryCommandState("justifyCenter"),
      jRight:      document.queryCommandState("justifyRight"),
      jFull:       document.queryCommandState("justifyFull"),
      fontName:    document.queryCommandValue("fontName"),
    };
  } catch {
    return { bold:false,italic:false,underline:false,strike:false,
             jLeft:true,jCenter:false,jRight:false,jFull:false,fontName:"" };
  }
}
type Fmt = ReturnType<typeof getFmt>;

// ── Sub-components ────────────────────────────────────────────────────────────

function ColorGrid({ onPick }: { onPick(c: string): void }) {
  return (
    <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-white/10 bg-slate-800 p-2 shadow-2xl">
      <div className="grid grid-cols-8 gap-1">
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            onMouseDown={(e) => { e.preventDefault(); onPick(c); }}
            className="h-5 w-5 rounded border border-white/10 transition-transform hover:scale-125"
            style={{ background: c }}
            title={c}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="color"
          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onPick(e.target.value)}
          title="Custom color"
        />
        <span className="text-[10px] text-white/40">Custom</span>
      </div>
    </div>
  );
}

function DropDown({
  open, onToggle, label, children, minWidth = 140,
}: {
  open: boolean; onToggle(): void;
  label: React.ReactNode; children: React.ReactNode; minWidth?: number;
}) {
  return (
    <div className="relative">
      <button
        onMouseDown={(e) => { e.preventDefault(); onToggle(); }}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-white/70 hover:bg-white/15 hover:text-white"
      >
        {label}
        <ChevronDown className="h-3 w-3 flex-shrink-0" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-0.5 rounded-lg border border-white/10 bg-slate-800 py-1 shadow-2xl"
          style={{ minWidth }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-white/15" />;
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

type Drop = "font" | "size" | "block" | "textColor" | "bgColor" | null;

export default function RichTextToolbar() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [isMulti, setIsMulti] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [fmt, setFmt] = useState<Fmt>(getFmt());
  const [selectedSize, setSelectedSize] = useState("16");
  const [drop, setDrop] = useState<Drop>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const rePos = useCallback((target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    const barH = 44;
    const gap  = 6;
    let top = r.top + window.scrollY - barH - gap;
    if (top < window.scrollY + 4) top = r.bottom + window.scrollY + gap;
    setPos({ top, left: Math.max(8, r.left + window.scrollX) });
  }, []);

  const refreshFmt = useCallback(() => setFmt(getFmt()), []);

  // Detect focused .cms-rich element
  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.classList?.contains("cms-rich")) return;
      clearTimeout(hideTimer.current);
      setEl(t);
      setIsMulti(t.classList.contains("cms-multiline"));
      rePos(t);
      refreshFmt();
    };
    const onOut = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.classList?.contains("cms-rich")) return;
      hideTimer.current = setTimeout(() => {
        const f = document.activeElement as HTMLElement | null;
        const inBar  = barRef.current?.contains(f) ?? false;
        const inEdit = f?.classList?.contains("cms-rich") ?? false;
        if (!inBar && !inEdit) { setEl(null); setDrop(null); }
      }, 130);
    };
    const onSel = () => {
      const f = document.activeElement as HTMLElement | null;
      if (f?.classList?.contains("cms-rich")) { refreshFmt(); rePos(f); }
    };
    const onScroll = () => {
      const f = document.activeElement as HTMLElement | null;
      if (f?.classList?.contains("cms-rich")) rePos(f);
    };
    document.addEventListener("focusin",        onIn,    true);
    document.addEventListener("focusout",       onOut,   true);
    document.addEventListener("selectionchange",onSel);
    window.addEventListener("scroll",           onScroll, { passive: true });
    window.addEventListener("resize",           onScroll, { passive: true });
    return () => {
      document.removeEventListener("focusin",        onIn,    true);
      document.removeEventListener("focusout",       onOut,   true);
      document.removeEventListener("selectionchange",onSel);
      window.removeEventListener("scroll",           onScroll);
      window.removeEventListener("resize",           onScroll);
    };
  }, [rePos, refreshFmt]);

  if (!el) return null;

  const noBlur = (e: React.MouseEvent) => e.preventDefault();
  const focus  = () => el.focus();

  const apply  = (cmd: string, val?: string) => { focus(); execCmd(cmd, val); refreshFmt(); };
  const openD  = (d: Drop) => setDrop(p => p === d ? null : d);
  const closeD = () => setDrop(null);

  const applyFont = (v: string) => {
    focus();
    if (v) {
      try { wrapInSpan("fontFamily", v); }
      catch { execCmd("fontName", v.split(",")[0]?.trim() ?? v); }
    } else {
      execCmd("removeFormat");
    }
    closeD(); refreshFmt();
  };

  const applySize = (s: string) => {
    focus();
    try { wrapInSpan("fontSize", `${s}px`); }
    catch { /* selection empty */ }
    setSelectedSize(s);
    closeD(); refreshFmt();
  };

  const applyColor = (c: string, kind: "text" | "bg") => {
    focus();
    execCmd(kind === "text" ? "foreColor" : "hiliteColor", c);
    closeD(); refreshFmt();
  };

  const align = fmt.jCenter ? "center" : fmt.jRight ? "right" : fmt.jFull ? "justify" : "left";

  const btnCls = (on = false) =>
    `flex h-7 w-7 items-center justify-center rounded text-[13px] font-bold transition-colors ${
      on ? "bg-blue-600 text-white" : "text-white/65 hover:bg-white/15 hover:text-white"
    }`;

  return createPortal(
    <div
      ref={barRef}
      onMouseDown={noBlur}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 10000 }}
      className="flex flex-wrap items-center gap-0.5 rounded-xl border border-white/10 bg-slate-900 px-1.5 py-1 shadow-2xl ring-1 ring-black/20"
    >

      {/* ── Block format (multiline only) ─────────────────────────────── */}
      {isMulti && (
        <>
          <DropDown
            open={drop === "block"}
            onToggle={() => openD("block")}
            label={<><Type className="h-3.5 w-3.5" /><span className="text-[11px]">Format</span></>}
            minWidth={150}
          >
            {BLOCK_FORMATS.map((f) => (
              <button
                key={f.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  focus();
                  execCmd("formatBlock", f.value);
                  closeD(); refreshFmt();
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
              >
                {f.label}
              </button>
            ))}
          </DropDown>
          <Sep />
        </>
      )}

      {/* ── Inline styles ─────────────────────────────────────────────── */}
      <button onMouseDown={(e) => { e.preventDefault(); apply("bold");         }} className={btnCls(fmt.bold)}      title="Bold (Ctrl+B)">        <Bold          className="h-3.5 w-3.5" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); apply("italic");       }} className={btnCls(fmt.italic)}    title="Italic (Ctrl+I)">      <Italic        className="h-3.5 w-3.5" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); apply("underline");    }} className={btnCls(fmt.underline)} title="Underline (Ctrl+U)">   <UnderlineIcon className="h-3.5 w-3.5" /></button>
      <button onMouseDown={(e) => { e.preventDefault(); apply("strikethrough");}} className={btnCls(fmt.strike)}    title="Strikethrough">         <Strikethrough className="h-3.5 w-3.5" /></button>

      <Sep />

      {/* ── Font family ───────────────────────────────────────────────── */}
      <DropDown
        open={drop === "font"}
        onToggle={() => openD("font")}
        minWidth={170}
        label={
          <span className="max-w-[72px] truncate text-[11px]">
            {FONT_FAMILIES.find((f) =>
              f.value && fmt.fontName?.toLowerCase().includes(f.value.split(",")[0].trim().toLowerCase()),
            )?.label ?? "Font"}
          </span>
        }
      >
        {FONT_FAMILIES.map((f) => (
          <button
            key={f.value}
            onMouseDown={(e) => { e.preventDefault(); applyFont(f.value); }}
            style={{ fontFamily: f.value || "inherit" }}
            className="block w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
          >
            {f.label}
          </button>
        ))}
      </DropDown>

      {/* ── Font size ─────────────────────────────────────────────────── */}
      <DropDown
        open={drop === "size"}
        onToggle={() => openD("size")}
        minWidth={80}
        label={<span className="w-7 text-center text-[11px]">{selectedSize}px</span>}
      >
        <div className="max-h-52 overflow-y-auto">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); applySize(s); }}
              className={`block w-full px-3 py-1 text-left text-xs text-white/80 hover:bg-white/10 ${
                s === selectedSize ? "bg-white/10 font-semibold" : ""
              }`}
            >
              {s} px
            </button>
          ))}
        </div>
      </DropDown>

      <Sep />

      {/* ── Text color ────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onMouseDown={(e) => { e.preventDefault(); openD("textColor"); }}
          className="flex h-7 w-7 flex-col items-center justify-center rounded text-white/65 hover:bg-white/15 hover:text-white"
          title="Text color"
        >
          <span className="text-[13px] font-bold leading-none">A</span>
          <span className="mt-0.5 h-1 w-4 rounded-sm bg-red-500" />
        </button>
        {drop === "textColor" && (
          <ColorGrid onPick={(c) => applyColor(c, "text")} />
        )}
      </div>

      {/* ── Highlight color ───────────────────────────────────────────── */}
      <div className="relative">
        <button
          onMouseDown={(e) => { e.preventDefault(); openD("bgColor"); }}
          className="flex h-7 w-7 items-center justify-center rounded text-white/65 hover:bg-white/15 hover:text-white"
          title="Highlight color"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>
        {drop === "bgColor" && (
          <ColorGrid onPick={(c) => applyColor(c, "bg")} />
        )}
      </div>

      {/* ── Alignment (multiline only) ────────────────────────────────── */}
      {isMulti && (
        <>
          <Sep />
          <button onMouseDown={(e) => { e.preventDefault(); apply("justifyLeft");   }} className={btnCls(align === "left")}    title="Left"><AlignLeft    className="h-3.5 w-3.5" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); apply("justifyCenter"); }} className={btnCls(align === "center")}  title="Center"><AlignCenter  className="h-3.5 w-3.5" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); apply("justifyRight");  }} className={btnCls(align === "right")}   title="Right"><AlignRight   className="h-3.5 w-3.5" /></button>
          <button onMouseDown={(e) => { e.preventDefault(); apply("justifyFull");   }} className={btnCls(align === "justify")} title="Justify"><AlignJustify className="h-3.5 w-3.5" /></button>
        </>
      )}

    </div>,
    document.body,
  );
}
