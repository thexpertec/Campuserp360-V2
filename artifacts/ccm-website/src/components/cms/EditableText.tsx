import { createElement, useEffect, useRef, useState } from "react";
import { useEditMode } from "@/lib/edit-mode";
import { useToast } from "@/hooks/use-toast";

type Props = {
  page: string;
  blockKey: string;
  value: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  /** Allow newlines (Enter inserts a line break instead of committing). */
  multiline?: boolean;
  /**
   * Enables the floating rich-text toolbar (bold/italic/font/size/color/align).
   * Defaults to true when multiline=true. Content is saved as HTML.
   */
  rich?: boolean;
};

/** Returns true when a string looks like it contains HTML markup. */
function looksLikeHtml(s: string): boolean {
  return /<[a-z][a-z0-9]*[\s/>]/i.test(s);
}

/** Sanitise HTML for save: strip <script> / <style> / on* attributes.
 *  The admin is authenticated, but defence-in-depth is cheap. */
function sanitise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+on\w+="[^"]*"/gi, "")
    .replace(/\s+on\w+='[^']*'/gi, "")
    .trim();
}

export default function EditableText({
  page, blockKey, value,
  as = "span", className,
  multiline = false, rich,
}: Props) {
  // rich defaults to true when multiline is set
  const isRich = rich ?? multiline;

  const { enabled, savePageBlock } = useEditMode();
  const { toast } = useToast();
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(value);
  const dirty = useRef(false);

  // Sync from prop only until the admin has committed an edit here.
  useEffect(() => {
    if (!dirty.current) setCurrent(value);
  }, [value]);

  // Keep DOM content in sync while not actively editing.
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (isRich) el.innerHTML = current;
    else el.textContent = current;
  }, [current, enabled, isRich]);

  // ── Non-edit render ──────────────────────────────────────────────────────
  if (!enabled) {
    if (isRich && looksLikeHtml(current)) {
      return createElement(as, {
        className,
        dangerouslySetInnerHTML: { __html: current },
      });
    }
    return createElement(as, { className }, current);
  }

  // ── Save on blur ──────────────────────────────────────────────────────────
  async function commit() {
    const el = ref.current;
    if (!el) return;

    let next: string;
    if (isRich) {
      next = sanitise(el.innerHTML ?? "");
    } else if (multiline) {
      next = (el.innerText ?? "").replace(/\u00a0/g, " ").trimEnd();
    } else {
      next = (el.textContent ?? "").trim();
    }

    if (next === current) return;

    el.dataset.cmsSaving = "1";
    try {
      await savePageBlock(page, blockKey, next, isRich ? "richtext" : "text");
      dirty.current = true;
      setCurrent(next);
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
      // Restore previous content
      if (isRich) el.innerHTML = current;
      else el.textContent = current;
    } finally {
      delete el.dataset.cmsSaving;
    }
  }

  // ── Classes ───────────────────────────────────────────────────────────────
  const editClasses = [
    className ?? "",
    "cms-editable",
    isRich ? "cms-rich" : "",
    isRich && multiline ? "cms-multiline" : "",
  ].filter(Boolean).join(" ").trim();

  return createElement(as, {
    ref,
    className: editClasses,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    title: "Click to edit · click away to save · Esc to cancel",
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
      }
      if (e.key === "Escape") {
        const el = ref.current;
        if (el) {
          if (isRich) el.innerHTML = current;
          else el.textContent = current;
        }
        (e.currentTarget as HTMLElement).blur();
      }
    },
  });
}
