import { createElement, useEffect, useRef, useState } from "react";
import { useEditMode } from "@/lib/edit-mode";
import { useToast } from "@/hooks/use-toast";

type Props = {
  /** site_settings key. */
  settingKey: string;
  /** Currently displayed value. */
  value: string;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  multiline?: boolean;
};

/**
 * Click-to-edit text bound to a global site setting (site_settings table).
 * Keeps its own display state because the public settings context is not
 * re-fetched after a save.
 */
export default function EditableSetting({
  settingKey, value, as = "span", className, multiline = false,
}: Props) {
  const { enabled, saveSetting } = useEditMode();
  const { toast } = useToast();
  const ref = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(value);
  const dirty = useRef(false);

  // Sync from prop only until the admin edits it.
  useEffect(() => {
    if (!dirty.current) setCurrent(value);
  }, [value]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (el && document.activeElement !== el) el.textContent = current;
  }, [current, enabled]);

  if (!enabled) {
    return createElement(as, { className }, current);
  }

  async function commit() {
    const el = ref.current;
    if (!el) return;
    const next = (el.textContent ?? "").trim();
    if (next === current) return;
    try {
      await saveSetting(settingKey, next);
      dirty.current = true;
      setCurrent(next);
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
      el.textContent = current;
    }
  }

  return createElement(as, {
    ref,
    className: `${className ?? ""} cms-editable`.trim(),
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    title: "Click to edit setting · click away to save · Esc to cancel",
    // Stop the click from triggering a parent <a>/<Link> navigation while editing.
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
        if (ref.current) ref.current.textContent = current;
        (e.currentTarget as HTMLElement).blur();
      }
    },
  });
}
