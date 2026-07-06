import { useState } from "react";
import { useEditMode } from "@/lib/edit-mode";
import { Pencil, Eye, ListTree, LogOut } from "lucide-react";
import CollectionManager from "./CollectionManager";
import RichTextToolbar from "./RichTextToolbar";

/** Global styles for the inline-edit affordances (injected once). */
const CMS_STYLES = `
.cms-editable {
  outline: 1px dashed rgba(37, 99, 235, 0.45);
  outline-offset: 2px;
  border-radius: 3px;
  cursor: text;
  transition: background-color 0.15s, outline-color 0.15s;
}
.cms-editable:hover { background-color: rgba(37, 99, 235, 0.08); }
.cms-editable:focus {
  outline: 2px solid rgb(37, 99, 235);
  background-color: rgba(37, 99, 235, 0.06);
}
.cms-editable[data-cms-saving="1"] { opacity: 0.6; }
.cms-image-edit { position: relative; display: inline-block; }
.cms-image-edit__btn {
  position: absolute;
  top: 8px; left: 8px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.cms-image-edit__btn:hover { background: rgba(37, 99, 235, 0.95); }
.cms-image-edit__btn:disabled { opacity: 0.6; cursor: default; }
`;

export default function EditToolbar() {
  const { hasToken, enabled, setEnabled, tenant, signOut } = useEditMode();
  const [managerOpen, setManagerOpen] = useState(false);

  if (!hasToken) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CMS_STYLES }} />
      <div
        className="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-900/95 px-3 py-2 shadow-2xl backdrop-blur"
        data-testid="cms-toolbar"
      >
        <span className="hidden items-center gap-1.5 pl-1 pr-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Edit
        </span>

        <button
          onClick={() => setEnabled(!enabled)}
          data-testid="cms-toggle"
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
            enabled
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {enabled ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {enabled ? "Editing" : "Preview"}
        </button>

        <button
          onClick={() => setManagerOpen(true)}
          disabled={!enabled}
          data-testid="cms-manage"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          <ListTree className="h-4 w-4" /> Sections
        </button>

        {tenant && (
          <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 md:inline">
            {tenant}
          </span>
        )}

        <button
          onClick={signOut}
          title="Exit edit mode"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <CollectionManager open={managerOpen} onOpenChange={setManagerOpen} />
      <RichTextToolbar />
    </>
  );
}
