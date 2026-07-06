import { useEffect, useState } from "react";
import { ArrowLeft, Users, GraduationCap, Briefcase, Plus, Trash2, Pencil, PenLine } from "lucide-react";
import { Link, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  DOC_TYPES, customDefFromRow, PURPOSE_BADGE_LABELS, PURPOSE_BY_DOC_TYPE,
  type AnyDocTypeDef, type CustomDocTypeDef,
} from "./doc-types";
import { loadTemplates, removeTemplateFromCache, patchTemplateCache } from "./templateCache";
import TemplateBuilder from "./TemplateBuilder";
import CreateTemplateDialog from "./CreateTemplateDialog";
import EditTemplateDialog, { type EditableTemplate, type UpdatedTemplate } from "./EditTemplateDialog";
import SignaturesManager from "./SignaturesManager";

/** Per-tenant display-name/purpose overrides for built-in templates. */
type BuiltinOverride = { label: string; purpose: string | null };

type Audience = "applicants" | "students" | "employee";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

const AUDIENCE_TABS: { id: Audience; label: string; icon: React.ElementType }[] = [
  { id: "applicants", label: "Applicants", icon: Users },
  { id: "students",   label: "Students",   icon: GraduationCap },
  { id: "employee",   label: "Employee",   icon: Briefcase },
];

type MainTab = "templates" | "signatures";

const VALID_IDS = new Set<string>(DOC_TYPES.map(d => d.id));

function audienceOf(id: string, customTypes: CustomDocTypeDef[]): Audience {
  return (
    DOC_TYPES.find(d => d.id === id)?.audience ??
    customTypes.find(d => d.id === id)?.audience ??
    "students"
  );
}

function initialDocType(): string {
  const params = new URLSearchParams(window.location.search);
  const t = params.get("type");
  return t && VALID_IDS.has(t) ? t : DOC_TYPES[0]!.id;
}

export default function TemplateEditorPage() {
  useSearch();
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>("templates");
  const [activeId, setActiveId] = useState<string>(initialDocType);
  const [activeAudience, setActiveAudience] = useState<Audience>(() => audienceOf(initialDocType(), []));
  const [customTypes, setCustomTypes] = useState<CustomDocTypeDef[]>([]);
  const [builtinOverrides, setBuiltinOverrides] = useState<Record<string, BuiltinOverride>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EditableTemplate | null>(null);

  // Listen for event from TemplateBuilder's Settings & Tags "Signatures" link
  useEffect(() => {
    const handler = () => setMainTab("signatures");
    window.addEventListener("ccm:openSignaturesTab", handler);
    return () => window.removeEventListener("ccm:openSignaturesTab", handler);
  }, []);

  // Load custom templates and built-in overrides from the API on mount.
  useEffect(() => {
    loadTemplates()
      .then(data => {
        const customs = Object.entries(data)
          .filter(([, v]) => v.isCustom)
          .map(([type, v]) => customDefFromRow({ type, name: v.name, category: v.category, purpose: v.purpose }));
        setCustomTypes(customs);

        const overrides: Record<string, BuiltinOverride> = {};
        for (const [type, v] of Object.entries(data)) {
          if (!v.isCustom && VALID_IDS.has(type)) {
            overrides[type] = { label: v.name, purpose: v.purpose };
          }
        }
        setBuiltinOverrides(overrides);

        // If the URL points at a custom template, honour it once loaded.
        const params = new URLSearchParams(window.location.search);
        const t = params.get("type");
        if (t && customs.some(c => c.id === t)) {
          setActiveId(t);
          setActiveAudience(customs.find(c => c.id === t)!.audience);
        }
      })
      .catch(() => { /* ignore — builder shows built-ins */ });
  }, []);

  const allTypes: AnyDocTypeDef[] = [...DOC_TYPES, ...customTypes];
  const rawActiveType = allTypes.find(d => d.id === activeId) ?? DOC_TYPES[0]!;
  const activeOverride = builtinOverrides[rawActiveType.id];
  const activeType = activeOverride ? { ...rawActiveType, label: activeOverride.label } : rawActiveType;
  const audienceBuiltin = DOC_TYPES.filter(d => d.audience === activeAudience);
  const audienceCustom  = customTypes.filter(d => d.audience === activeAudience);

  function selectDocType(id: string) {
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("type", id);
    window.history.replaceState(null, "", url.toString());
  }

  function selectAudience(aud: Audience) {
    setActiveAudience(aud);
    const first = DOC_TYPES.find(d => d.audience === aud) ?? customTypes.find(d => d.audience === aud);
    if (first) selectDocType(first.id);
  }

  function handleCreated(def: CustomDocTypeDef) {
    patchTemplateCache(def.id, {
      content: "", name: def.label, isCustom: true, category: def.category, purpose: def.purpose,
    });
    setCustomTypes(prev => [...prev, def]);
    setActiveAudience(def.audience);
    selectDocType(def.id);
  }

  function handleUpdated(updated: UpdatedTemplate) {
    if (VALID_IDS.has(updated.id)) {
      setBuiltinOverrides(prev => ({ ...prev, [updated.id]: { label: updated.name, purpose: updated.purpose } }));
    } else {
      setCustomTypes(prev => prev.map(c => c.id === updated.id ? { ...c, label: updated.name, purpose: updated.purpose } : c));
    }
    setEditingTemplate(null);
  }

  async function handleDelete(def: CustomDocTypeDef) {
    if (!window.confirm(`Delete the template "${def.label}"? This cannot be undone.`)) return;
    setDeletingId(def.id);
    try {
      const res = await fetch(`/api/admin/print-templates/${def.id}`, { method: "DELETE", headers: auth() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Delete failed", description: err.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      removeTemplateFromCache(def.id);
      setCustomTypes(prev => prev.filter(c => c.id !== def.id));
      if (activeId === def.id) {
        const fallback = DOC_TYPES.find(d => d.audience === activeAudience) ?? DOC_TYPES[0]!;
        selectDocType(fallback.id);
      }
      toast({ title: "Template deleted", description: `"${def.label}" was removed.` });
    } catch {
      toast({ title: "Delete failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col">

      {/* ── Top header ── */}
      <div className="shrink-0 border-b border-border bg-background px-5 py-3 flex items-center gap-4">
        <Link href="/printing" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Printing
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold text-foreground">Template Editor</h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Customise the HTML design for each document type
        </span>
      </div>

      {/* ── Main tab bar ── */}
      <div className="shrink-0 border-b border-border bg-background px-4 flex items-end justify-between">
        <div className="flex gap-0">
          {AUDIENCE_TABS.map(tab => {
            const Icon = tab.icon;
            const active = mainTab === "templates" && tab.id === activeAudience;
            return (
              <button
                key={tab.id}
                onClick={() => { setMainTab("templates"); selectAudience(tab.id); }}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setMainTab("signatures")}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors",
            mainTab === "signatures"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
          )}
        >
          <PenLine className="h-4 w-4" />
          Signatures &amp; Stamps
        </button>
      </div>

      {/* ── Signatures manager ── */}
      {mainTab === "signatures" && (
        <div className="flex-1 overflow-auto">
          <SignaturesManager />
        </div>
      )}

      {/* ── Doc-type chip row (templates tab only) ── */}
      {mainTab === "templates" && <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-2.5 flex flex-wrap items-center gap-2">
        {audienceBuiltin.map(dt => {
          const Icon = dt.icon;
          const active = dt.id === activeId;
          const override = builtinOverrides[dt.id];
          const label = override?.label ?? dt.label;
          const purpose = override ? override.purpose : PURPOSE_BY_DOC_TYPE[dt.id as keyof typeof PURPOSE_BY_DOC_TYPE] ?? null;
          const purposeLabel = purpose ? PURPOSE_BADGE_LABELS[purpose] ?? null : null;
          return (
            <div
              key={dt.id}
              className={cn(
                "group flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                active
                  ? `${dt.lightBg} shadow-sm`
                  : "border-border text-muted-foreground bg-background hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <button
                onClick={() => selectDocType(dt.id)}
                className="flex items-center gap-1.5"
                title={label}
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: active ? dt.color : undefined }}
                />
                {label}
                {purposeLabel && (
                  <span className="text-[9px] uppercase tracking-wide bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full leading-none">
                    {purposeLabel}
                  </span>
                )}
              </button>
              <button
                onClick={() => setEditingTemplate({ id: dt.id, label, purpose })}
                title="Edit template"
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* Custom templates for this audience, after a subtle divider */}
        {audienceCustom.length > 0 && <div className="h-5 w-px bg-border mx-1" />}
        {audienceCustom.map(dt => {
          const Icon = dt.icon;
          const active = dt.id === activeId;
          const purposeLabel = dt.purpose ? PURPOSE_BADGE_LABELS[dt.purpose] : null;
          return (
            <div
              key={dt.id}
              className={cn(
                "group flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                active
                  ? `${dt.lightBg} shadow-sm`
                  : "border-border text-muted-foreground bg-background hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <button
                onClick={() => selectDocType(dt.id)}
                className="flex items-center gap-1.5"
                title={dt.label}
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: active ? dt.color : undefined }}
                />
                {dt.label}
                {purposeLabel ? (
                  <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none">
                    {purposeLabel}
                  </span>
                ) : (
                  <span className="text-[9px] uppercase tracking-wide opacity-60">custom</span>
                )}
              </button>
              <button
                onClick={() => setEditingTemplate(dt)}
                title="Edit template"
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(dt)}
                disabled={deletingId === dt.id}
                title="Delete template"
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* New template button */}
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground bg-background hover:bg-muted/50 hover:text-foreground transition-colors ml-auto"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          New Template
        </button>
      </div>}

      {/* ── Editor (templates tab only) ── */}
      {mainTab === "templates" && (
        <div>
          <TemplateBuilder activeType={activeType} customTypes={customTypes} />
        </div>
      )}

      <CreateTemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      {editingTemplate && (
        <EditTemplateDialog
          open={!!editingTemplate}
          onOpenChange={v => { if (!v) setEditingTemplate(null); }}
          template={editingTemplate}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
