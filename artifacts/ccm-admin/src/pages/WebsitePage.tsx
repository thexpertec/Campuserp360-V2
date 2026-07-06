import { useState, useRef, useEffect, Fragment } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken, getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Loader2, Globe, Megaphone, CalendarDays, Images, Download, Users, Banknote, Search, UploadCloud, X, GripVertical, Settings2, Save, ExternalLink, Quote, Star, Building2, Link2, Trophy, ImageIcon, Eye, RotateCcw, BarChart3, Gauge, CheckCircle2, AlertTriangle, XCircle, Monitor, Smartphone, RefreshCw, TrendingUp, Palette, ChevronDown } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import * as LucideIcons from "lucide-react";
import { MediaPicker } from "@/components/media-picker";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const API = (import.meta.env.VITE_API_BASE as string) || "";

const TENANT_KEY = "ccm_admin_website_tenant";
function getSelectedTenant(): string | null {
  return localStorage.getItem(TENANT_KEY);
}
function setSelectedTenant(id: string | null) {
  if (id) localStorage.setItem(TENANT_KEY, id);
  else localStorage.removeItem(TENANT_KEY);
}

// The currently-selected website theme, mirrored to module scope so the
// preview / edit links can pin it in the URL (`?theme=`). Without this the
// public site renders its default theme first and only swaps to the real one
// once its async settings fetch resolves — a visible flash on every preview.
// SettingsTab keeps this in sync with the theme picker.
let activeWebsiteTheme: string | null = null;
function setActiveWebsiteTheme(t: string | null) {
  activeWebsiteTheme = t && t.trim() ? t.trim() : null;
}

let activeWebsiteSlug: string | null = null;
function setActiveWebsiteSlug(s: string | null) {
  activeWebsiteSlug = s && s.trim() ? s.trim().toLowerCase() : null;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken() ?? ""}`,
  };
  const tenant = getSelectedTenant();
  if (tenant) headers["X-Tenant-Id"] = tenant;
  return headers;
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { msg = text || msg; }
    throw new Error(msg);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch {
    throw new Error(`Save failed (unexpected server response). Please reload and try again.`);
  }
}

async function uploadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      try {
        const result = await apiFetch("/api/admin/website/upload", {
          method: "POST",
          body: JSON.stringify({ fileData: base64, fileName: file.name, mimeType: file.type }),
        });
        resolve(result.url as string);
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function ImageUploadField({ value, onChange, label = "Image" }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value && (
        <div className="relative inline-block">
          <img src={value} alt="preview" className="h-20 w-32 object-cover rounded border" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button type="button" onClick={() => onChange("")} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full h-5 w-5 flex items-center justify-center shadow hover:bg-destructive/80">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="https://… , upload, or choose from library" className="flex-1 text-sm" />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent shrink-0"
        >
          <Images className="h-4 w-4" />
          Library
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 shrink-0"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml" className="hidden" onChange={handleFile} />
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={url => onChange(url)} />
    </div>
  );
}

// ─── ICON PICKER ──────────────────────────────────────────────────────────────
// Renders the actual lucide icon beside its name so the right one is easy to pick.

function LucideIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Cmp) return <ImageIcon className={className} />;
  return <Cmp className={className} />;
}

function IconSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue>
          <span className="flex items-center gap-2">
            <LucideIcon name={value} className="h-4 w-4 text-slate-600" />
            <span>{value}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {options.map(n => (
          <SelectItem key={n} value={n}>
            <span className="flex items-center gap-2">
              <LucideIcon name={n} className="h-4 w-4 text-slate-600" />
              <span>{n}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FileUploadField({ value, onChange, fileNameValue = "", onFileNameChange, label = "File", hideLabel = false }: {
  value: string; onChange: (url: string) => void;
  fileNameValue?: string; onFileNameChange?: (name: string) => void;
  label?: string; hideLabel?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
      if (!fileNameValue) onFileNameChange?.(file.name);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{label}</Label>}
      <div className="flex gap-2">
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder="https://… or upload a file ↑" className="flex-1 text-sm" />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 shrink-0"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

// Default a new list item's sort order to the next available position so staff
// don't have to think about ordering numbers when adding content.
function nextSortOrder(items: { sortOrder?: number | string }[]): string {
  const max = items.reduce((m, r) => Math.max(m, Number(r.sortOrder ?? 0) || 0), -1);
  return String(max + 1);
}

function PublishedBadge({ v }: { v: boolean }) {
  return v
    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Published</Badge>
    : <Badge variant="outline" className="text-slate-500">Draft</Badge>;
}

// ─── SORTABLE TABLE ────────────────────────────────────────────────────────────

export type ColDef<T> = {
  key: string;
  label: string;
  width?: number;
  render: (row: T) => React.ReactNode;
};

function SortableRow<T extends { id: string }>({
  row,
  columns,
  isDragDisabled,
}: {
  row: T;
  columns: ColDef<T>[];
  isDragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? "#f0f9ff" : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
      <td className="w-8 px-2 py-2">
        {!isDragDisabled && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none"
            title="Drag to reorder"
            tabIndex={-1}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </td>
      {columns.map(col => (
        <td key={col.key} className="px-3 py-2" style={col.width ? { width: col.width, minWidth: col.width } : undefined}>
          {col.render(row)}
        </td>
      ))}
    </tr>
  );
}

function SortableTable<T extends { id: string }>({
  items,
  columns,
  onReorder,
  isLoading,
  emptyTitle,
  searchActive,
  editingId = null,
  addingActive = false,
  renderEditor,
}: {
  items: T[];
  columns: ColDef<T>[];
  onReorder: (newOrder: T[]) => void;
  isLoading: boolean;
  emptyTitle: string;
  searchActive: boolean;
  editingId?: string | null;
  addingActive?: boolean;
  renderEditor?: () => React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (items.length === 0 && !addingActive) {
    return (
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-8 text-center text-slate-400 text-sm">{emptyTitle}</div>
      </div>
    );
  }

  const dragDisabled = searchActive || addingActive || editingId !== null;
  const fullColSpan = columns.length + 1;

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {searchActive && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5" />
          Clear search to drag-reorder rows
        </div>
      )}
      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-8 px-2 py-2"></th>
                  {columns.map(col => (
                    <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                      style={col.width ? { width: col.width } : undefined}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addingActive && renderEditor && (
                  <tr className="border-b-2 border-sky-200">
                    <td colSpan={fullColSpan} className="p-0">{renderEditor()}</td>
                  </tr>
                )}
                {items.map(row => (
                  <Fragment key={row.id}>
                    <SortableRow row={row} columns={columns} isDragDisabled={dragDisabled} />
                    {editingId === row.id && renderEditor && (
                      <tr className="border-b-2 border-sky-200">
                        <td colSpan={fullColSpan} className="p-0">{renderEditor()}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function useSortableTab<T extends { id: string }>(
  queryKey: string[],
  reorderPath: string,
  fetchedData: T[],
) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [items, setItems] = useState<T[]>([]);

  // Sync fetched data into local state. `fetchedData` is frequently a brand-new
  // array reference on every render (e.g. `Array.isArray(data) ? data : []`),
  // so we must bail out when the content is unchanged — returning the previous
  // reference tells React to skip the re-render and prevents an infinite update
  // loop (React error #185 "Maximum update depth exceeded").
  useEffect(() => {
    setItems(prev =>
      prev.length === fetchedData.length && prev.every((p, i) => p === fetchedData[i])
        ? prev
        : fetchedData,
    );
  }, [fetchedData]);

  const reorderM = useMutation({
    mutationFn: (order: string[]) => apiFetch(reorderPath, { method: "PATCH", body: JSON.stringify({ order }) }),
    onError: () => {
      toast({ title: "Reorder failed", variant: "destructive" });
      qc.invalidateQueries({ queryKey });
    },
  });

  function handleReorder(newItems: T[]) {
    setItems(newItems);
    reorderM.mutate(newItems.map(i => i.id));
  }

  return { items, setItems, handleReorder };
}

// ─── CONTENT SECTIONS (left menu) ─────────────────────────────────────────────
// Structured/list content that can't be edited as plain inline text or images.
// Each section is its own manager. Free-form website text and images are edited
// inline on the live site (see the "Edit Website Inline" entry), not here.
const SECTIONS = [
  { key: "menu",           label: "Navigation Menu", icon: LucideIcons.Menu },
  { key: "hero-headers",   label: "Hero Header",     icon: LucideIcons.LayoutTemplate },
  { key: "events",         label: "Events & News",   icon: CalendarDays },
  { key: "gallery",        label: "Gallery",         icon: Images       },
  { key: "faculty",        label: "Teachers",        icon: Users        },
  { key: "facilities",     label: "Facilities",      icon: Building2    },
  { key: "downloads",      label: "Downloads",       icon: Download     },
  { key: "alumni",         label: "Alumni Stories",  icon: LucideIcons.Award },
  { key: "announcements",  label: "Announcements",   icon: Megaphone    },
  { key: "results",        label: "Exam Results",    icon: Trophy       },
  { key: "fee-structure",  label: "Fee Structure",   icon: Banknote     },
  { key: "features",       label: "Features",        icon: Star         },
  { key: "testimonials",   label: "Testimonials",    icon: Quote        },
  { key: "quick-links",    label: "Quick Links",     icon: Link2        },
  { key: "footer-links",   label: "Footer Links",    icon: LucideIcons.PanelBottom },
  { key: "site-settings",  label: "Site Settings",   icon: Settings2    },
  { key: "seo-visitors",   label: "SEO & Visitors",  icon: BarChart3    },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

// ─── PAGE-CENTRIC LAYOUT DATA ─────────────────────────────────────────────────

type EditorSection  = { type: "editor";   key: SectionKey };
type InlineSection  = { type: "inline";   label: string; icon: React.ComponentType<{ className?: string }>; desc: string };
type ExternalSection= { type: "external"; label: string; icon: React.ComponentType<{ className?: string }>; moduleLabel: string; href: string; desc: string };
type SectionSpec = EditorSection | InlineSection | ExternalSection;

type PageDef = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  sections: SectionSpec[];
};

const PAGES: PageDef[] = [
  {
    key: "home",
    label: "Home",
    icon: LucideIcons.Home,
    desc: "Homepage — hero, quick links, announcements, admissions CTA, and homepage-only sections",
    sections: [
      { type: "editor", key: "quick-links" },
      { type: "editor", key: "announcements" },
      { type: "inline", label: "Admissions CTA & Countdown", icon: LucideIcons.Timer,
        desc: "The 'Admissions Open' banner with countdown timer on the home page. Edit the eyebrow label, heading, body text, and button labels directly on the live website using the inline editor." },
      { type: "external", label: "Countdown Deadline Date", icon: LucideIcons.CalendarClock,
        moduleLabel: "Site Settings → Admissions", href: "?page=site-settings",
        desc: "The deadline date that drives the countdown timer is the 'Admissions Deadline' field in Site Settings." },
      { type: "editor", key: "features" },
      { type: "editor", key: "testimonials" },
      { type: "editor", key: "facilities" },
    ],
  },
  {
    key: "about",
    label: "About",
    icon: LucideIcons.Info,
    desc: "College history, mission, vision, and leadership information",
    sections: [
      { type: "inline", label: "About Page Content", icon: LucideIcons.Info,
        desc: "Headings, body copy, images, and leadership bios — edit these directly on the live website using the inline editor." },
    ],
  },
  {
    key: "admissions",
    label: "Admissions",
    icon: LucideIcons.BookOpen,
    desc: "Online admissions form, eligibility details, and test-centre information",
    sections: [
      { type: "inline", label: "Admissions Page Text", icon: LucideIcons.BookOpen,
        desc: "Intro copy, eligibility criteria, and instructions shown at the top of the Admissions page — edit directly on the live website." },
      { type: "external", label: "Classes/Programs & Test Centres", icon: LucideIcons.ClipboardList,
        moduleLabel: "Admissions Setup", href: "/admin/applications?tab=setup",
        desc: "Available classes, seats, and test-centre locations are managed in the Admissions Setup module." },
    ],
  },
  {
    key: "gallery",
    label: "Gallery",
    icon: Images,
    desc: "Photo gallery shown on the Gallery page",
    sections: [
      { type: "editor", key: "gallery" },
    ],
  },
  {
    key: "events",
    label: "Events & News",
    icon: CalendarDays,
    desc: "Events and news items displayed on the Events page",
    sections: [
      { type: "editor", key: "events" },
    ],
  },
  {
    key: "teachers",
    label: "Faculty",
    icon: Users,
    desc: "Faculty profiles shown on the Teachers page",
    sections: [
      { type: "editor", key: "faculty" },
    ],
  },
  {
    key: "alumni",
    label: "Alumni",
    icon: LucideIcons.Award,
    desc: "Alumni stories shown on the Alumni page",
    sections: [
      { type: "editor", key: "alumni" },
    ],
  },
  {
    key: "downloads",
    label: "Downloads",
    icon: Download,
    desc: "Documents and downloadable files on the Downloads page",
    sections: [
      { type: "editor", key: "downloads" },
    ],
  },
  {
    key: "fee-structure",
    label: "Fee Structure",
    icon: Banknote,
    desc: "Fee structure shown on the Fee Structure page",
    sections: [
      { type: "editor", key: "fee-structure" },
    ],
  },
  {
    key: "results",
    label: "Exam Results",
    icon: Trophy,
    desc: "Exam results published on the Results page",
    sections: [
      { type: "editor", key: "results" },
    ],
  },
  {
    key: "contact",
    label: "Contact",
    icon: LucideIcons.MapPin,
    desc: "Contact details, address, and inquiry form",
    sections: [
      { type: "inline", label: "Contact Page Content", icon: LucideIcons.MapPin,
        desc: "Address, phone numbers, map embed, and the contact form — edit these directly on the live website using the inline editor." },
    ],
  },
  {
    key: "status-tracker",
    label: "Status Tracker",
    icon: Search,
    desc: "Candidate status check page shown to applicants",
    sections: [
      { type: "external", label: "Candidate Status Portal", icon: Search,
        moduleLabel: "Candidate Portal", href: "/portal",
        desc: "The candidate status tracker is powered by the Candidate Portal and Admissions module — manage application statuses there." },
    ],
  },
];

// Site-wide sections — each maps to a ?page=<key> route and renders full-width.
const SITE_WIDE: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "hero-headers",  label: "Hero Slideshow",  icon: LucideIcons.LayoutTemplate },
  { key: "menu",          label: "Navigation Menu", icon: LucideIcons.Menu },
  { key: "footer-links",  label: "Footer Links",    icon: LucideIcons.PanelBottom },
  { key: "site-settings", label: "Site Settings",   icon: Settings2 },
  { key: "seo-visitors",  label: "SEO & Visitors",  icon: BarChart3 },
];

// Reverse map: SectionKey → page key (for ?section= back-compat)
const SECTION_TO_PAGE: Partial<Record<SectionKey, string>> = {};
for (const p of PAGES) {
  for (const s of p.sections) {
    if (s.type === "editor") SECTION_TO_PAGE[s.key] = p.key;
  }
}
// Site-wide sections map to their own key as the page key
for (const sw of SITE_WIDE) SECTION_TO_PAGE[sw.key] = sw.key;


// ─── ANNOUNCEMENTS TAB ────────────────────────────────────────────────────────

type AnnForm = { title: string; body: string; category: string; imageUrl: string; isPublished: boolean; publishedAt: string; sortOrder: string };
const emptyAnn = (): AnnForm => ({ title: "", body: "", category: "general", imageUrl: "", isPublished: false, publishedAt: "", sortOrder: "0" });
const toAnnForm = (r: any): AnnForm => ({ title: r.title ?? "", body: r.body ?? "", category: r.category ?? "general", imageUrl: r.imageUrl ?? "", isPublished: !!r.isPublished, publishedAt: r.publishedAt ?? "", sortOrder: String(r.sortOrder ?? 0) });

function AnnouncementsTab() {
  const qk = ["/admin/website/announcements"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/announcements") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/announcements", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/announcements/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/announcements/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<AnnForm>(emptyAnn());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/announcements/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof AnnForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyAnn(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toAnnForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: form.title.trim(), body: form.body.trim() || undefined, category: form.category, imageUrl: form.imageUrl.trim() || undefined, isPublished: form.isPublished, publishedAt: form.publishedAt || undefined, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "imageUrl", label: "Image", width: 70, render: r => r.imageUrl ? <img src={r.imageUrl} alt="" className="h-8 w-12 object-cover rounded" /> : <span className="text-slate-400 text-xs">—</span> },
    { key: "title", label: "Title", width: 260, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "category", label: "Category", width: 120, render: r => <Badge variant="outline">{r.category || "—"}</Badge> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "publishedAt", label: "Date", width: 110, render: r => <span className="text-sm text-slate-500">{r.publishedAt || "—"}</span> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Announcement</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No announcements yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Announcement</div>
            <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            <div><Label>Body</Label><Textarea value={form.body} onChange={sf("body")} rows={4} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["general","admissions","academic","sports","event","notice"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            </div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} />
            <div><Label>Published Date</Label><Input type="date" value={form.publishedAt} onChange={sf("publishedAt")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ann-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="ann-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Announcement?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── EVENTS TAB ───────────────────────────────────────────────────────────────

type EvForm = { title: string; description: string; date: string; category: string; imageUrl: string; imageAlt: string; isPublished: boolean; sortOrder: string };
const emptyEv = (): EvForm => ({ title: "", description: "", date: "", category: "College Function", imageUrl: "", imageAlt: "", isPublished: false, sortOrder: "0" });
const toEvForm = (r: any): EvForm => ({ title: r.title ?? "", description: r.description ?? "", date: r.date ?? "", category: r.category ?? "College Function", imageUrl: r.imageUrl ?? "", imageAlt: r.imageAlt ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

const EVENT_CATEGORIES = ["Sports", "National Day", "College Function", "Academic", "Official Visit"];

function EventsTab() {
  const qk = ["/admin/website/events"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/events") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/events", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/events/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/events/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<EvForm>(emptyEv());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/events/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof EvForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyEv(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toEvForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: form.title.trim(), description: form.description.trim() || undefined, date: form.date.trim(), category: form.category, imageUrl: form.imageUrl.trim() || undefined, imageAlt: form.imageAlt.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "title", label: "Title", width: 240, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "category", label: "Category", width: 140, render: r => <Badge variant="outline">{r.category || "—"}</Badge> },
    { key: "date", label: "Date", width: 130, render: r => <span className="text-sm">{r.date || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Event</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No events yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Event</div>
            <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={sf("description")} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Display Date *</Label><Input value={form.date} onChange={sf("date")} placeholder="e.g. March 2026" required /></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Image" />
            <div><Label>Image Alt Text</Label><Input value={form.imageAlt} onChange={sf("imageAlt")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ev-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="ev-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Event?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── HERO HEADERS TAB ─────────────────────────────────────────────────────────
// Multiple hero headers render as a rotating slideshow at the top of the homepage.

type HeroForm = { title: string; subtitle: string; imageUrl: string; buttonLabel: string; buttonLink: string; isPublished: boolean; sortOrder: string };
const emptyHero = (): HeroForm => ({ title: "", subtitle: "", imageUrl: "", buttonLabel: "", buttonLink: "", isPublished: false, sortOrder: "0" });
const toHeroForm = (r: any): HeroForm => ({ title: r.title ?? "", subtitle: r.subtitle ?? "", imageUrl: r.imageUrl ?? "", buttonLabel: r.buttonLabel ?? "", buttonLink: r.buttonLink ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function HeroHeadersTab() {
  const qk = ["/admin/website/hero-headers"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/hero-headers") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/hero-headers", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/hero-headers/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/hero-headers/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<HeroForm>(emptyHero());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/hero-headers/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof HeroForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyHero(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toHeroForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      imageUrl: form.imageUrl.trim(),
      buttonLabel: form.buttonLabel.trim() || undefined,
      buttonLink: form.buttonLink.trim() || undefined,
      isPublished: form.isPublished,
      sortOrder: parseInt(form.sortOrder) || 0,
    };
    if (!body.imageUrl) { toast({ title: "Background image is required", variant: "destructive" }); return; }
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "imageUrl", label: "Preview", width: 80, render: r => r.imageUrl ? <img src={r.imageUrl} alt={r.title} className="h-10 w-14 object-cover rounded" /> : <span className="text-slate-400 text-xs">—</span> },
    { key: "title", label: "Heading", width: 220, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "subtitle", label: "Tagline", width: 220, render: r => <span className="text-sm text-slate-500">{r.subtitle || "—"}</span> },
    { key: "buttonLabel", label: "Button", width: 120, render: r => r.buttonLabel ? <Badge variant="outline">{r.buttonLabel}</Badge> : <span className="text-slate-400 text-xs">—</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Add one or more hero headers. When at least one is published, they rotate as a slideshow at the top of your homepage, replacing the single static hero.</p>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Hero Header</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No hero headers yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Hero Header</div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Background Image *" />
            <div><Label>Heading *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            <div><Label>Subheading / Tagline</Label><Input value={form.subtitle} onChange={sf("subtitle")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Button Label</Label><Input value={form.buttonLabel} onChange={sf("buttonLabel")} placeholder="Apply Now" /></div>
              <div><Label>Button Link</Label><Input value={form.buttonLink} onChange={sf("buttonLink")} placeholder="/admissions" /></div>
            </div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="hero-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="hero-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Hero Header?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── GALLERY TAB ──────────────────────────────────────────────────────────────

type GalForm = { title: string; category: string; imageUrl: string; imageAlt: string; author: string; isPublished: boolean; sortOrder: string };
const emptyGal = (): GalForm => ({ title: "", category: "College Functions", imageUrl: "", imageAlt: "", author: "", isPublished: false, sortOrder: "0" });
const toGalForm = (r: any): GalForm => ({ title: r.title ?? "", category: r.category ?? "College Functions", imageUrl: r.imageUrl ?? "", imageAlt: r.imageAlt ?? "", author: r.author ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

const DEFAULT_GALLERY_CATEGORIES = ["National Days", "Official Visits", "College Functions", "Sports", "Academic"];

function GalleryTab() {
  const qk = ["/admin/website/gallery"];
  const catQk = ["/admin/website/gallery-categories"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/gallery") });
  const { data: catData } = useQuery({ queryKey: catQk, queryFn: () => apiFetch("/api/admin/website/gallery-categories") });
  const GALLERY_CATEGORIES: string[] = Array.isArray(catData?.categories) && catData.categories.length > 0
    ? catData.categories : DEFAULT_GALLERY_CATEGORIES;
  const saveCatM = useMutation({
    mutationFn: (categories: string[]) => apiFetch("/api/admin/website/gallery-categories", { method: "PUT", body: JSON.stringify({ categories }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: catQk }); toast({ title: "Categories saved" }); setCatOpen(false); },
  });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/gallery", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/gallery/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/gallery/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<GalForm>(emptyGal());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [catList, setCatList] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const { toast } = useToast();

  function openManageCategories() {
    setCatList([...GALLERY_CATEGORIES]);
    setNewCat("");
    setCatOpen(true);
  }
  function addCat() {
    const v = newCat.trim();
    if (!v) return;
    if (catList.includes(v)) { toast({ title: "Already exists", variant: "destructive" }); return; }
    setCatList(l => [...l, v]);
    setNewCat("");
  }
  function removeCat(c: string) { setCatList(l => l.filter(x => x !== c)); }
  function moveCat(i: number, dir: -1 | 1) {
    setCatList(l => { const a = [...l]; [a[i], a[i + dir]] = [a[i + dir], a[i]]; return a; });
  }

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/gallery/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof GalForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyGal(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toGalForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: form.title.trim(), category: form.category, imageUrl: form.imageUrl.trim(), imageAlt: form.imageAlt.trim() || undefined, author: form.author.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "imageUrl", label: "Preview", width: 80, render: r => r.imageUrl ? <img src={r.imageUrl} alt={r.title} className="h-10 w-14 object-cover rounded" /> : <span className="text-slate-400 text-xs">—</span> },
    { key: "title", label: "Title", width: 220, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "category", label: "Category", width: 140, render: r => <Badge variant="outline">{r.category || "—"}</Badge> },
    { key: "author", label: "Author", width: 120, render: r => <span className="text-sm text-slate-500">{r.author || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={openManageCategories}><Settings2 className="h-4 w-4 mr-1" />Categories</Button>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Photo</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No gallery items yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Gallery Photo</div>
            <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Image *" />
            <div><Label>Alt Text</Label><Input value={form.imageAlt} onChange={sf("imageAlt")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GALLERY_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Author</Label><Input value={form.author} onChange={sf("author")} /></div>
            </div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="gal-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="gal-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Photo?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Gallery Categories</DialogTitle>
            <DialogDescription>Add, remove, or reorder the categories available when uploading gallery photos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {catList.map((c, i) => (
                <div key={c} className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2">
                  <span className="flex-1 text-sm font-medium">{c}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-700" disabled={i === 0} onClick={() => moveCat(i, -1)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-700" disabled={i === catList.length - 1} onClick={() => moveCat(i, 1)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeCat(c)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {catList.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No categories — add one below.</p>}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="New category name…"
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCat(); } }}
                className="h-9"
              />
              <Button type="button" size="sm" variant="outline" onClick={addCat} disabled={!newCat.trim()}>
                <Plus className="h-4 w-4 mr-1" />Add
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setCatOpen(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={saveCatM.isPending || catList.length === 0} onClick={() => saveCatM.mutate(catList)}>
                {saveCatM.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save Categories
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DOWNLOADS TAB ────────────────────────────────────────────────────────────

type DlForm = { title: string; subtitle: string; description: string; imageUrl: string; fileUrl: string; fileName: string; category: string; isPublished: boolean; sortOrder: string };
const emptyDl = (): DlForm => ({ title: "", subtitle: "", description: "", imageUrl: "", fileUrl: "", fileName: "", category: "", isPublished: false, sortOrder: "0" });
const toDlForm = (r: any): DlForm => ({ title: r.title ?? "", subtitle: r.subtitle ?? "", description: r.description ?? "", imageUrl: r.imageUrl ?? "", fileUrl: r.fileUrl ?? "", fileName: r.fileName ?? "", category: r.category ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function DownloadsTab() {
  const qk = ["/admin/website/downloads"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/downloads") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/downloads", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/downloads/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/downloads/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<DlForm>(emptyDl());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/downloads/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof DlForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyDl(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toDlForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: form.title.trim(), subtitle: form.subtitle.trim() || undefined, description: form.description.trim() || undefined, imageUrl: form.imageUrl.trim() || undefined, fileUrl: form.fileUrl.trim() || undefined, fileName: form.fileName.trim() || undefined, category: form.category.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "title", label: "Title", width: 220, render: r => <div><div className="font-medium text-sm">{r.title}</div>{r.subtitle && <div className="text-xs text-slate-500">{r.subtitle}</div>}</div> },
    { key: "fileName", label: "File Name", width: 200, render: r => <span className="text-xs text-slate-500 font-mono">{r.fileName || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Download</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No downloads yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Download</div>
            <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            <div><Label>Subtitle</Label><Input value={form.subtitle} onChange={sf("subtitle")} placeholder="e.g. For Classes 6th–9th" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={sf("description")} rows={2} /></div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} label="Preview Image" />
            <FileUploadField value={form.fileUrl} onChange={url => setForm(f => ({ ...f, fileUrl: url }))} fileNameValue={form.fileName} onFileNameChange={name => setForm(f => ({ ...f, fileName: name }))} label="File (download link)" />
            <div className="grid grid-cols-2 gap-3">
              <div><Label>File Name</Label><Input value={form.fileName} onChange={sf("fileName")} placeholder="form.pdf" /></div>
              <div><Label>Category</Label><Input value={form.category} onChange={sf("category")} /></div>
            </div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="dl-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="dl-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Download?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FACULTY TAB ──────────────────────────────────────────────────────────────

type FacForm = { name: string; department: string; subject: string; designation: string; photoUrl: string; isPublished: boolean; sortOrder: string };
const emptyFac = (): FacForm => ({ name: "", department: "Academics", subject: "", designation: "", photoUrl: "", isPublished: false, sortOrder: "0" });
const toFacForm = (r: any): FacForm => ({ name: r.name ?? "", department: r.department ?? "Academics", subject: r.subject ?? "", designation: r.designation ?? "", photoUrl: r.photoUrl ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

const DEPARTMENTS = ["Academics", "Science", "Humanities", "Mathematics", "Languages", "Physical Education", "Administration"];

function FacultyTab() {
  const qk = ["/admin/website/faculty"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/faculty") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/faculty", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/faculty/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/faculty/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FacForm>(emptyFac());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/faculty/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof FacForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyFac(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toFacForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name: form.name.trim(), department: form.department, subject: form.subject.trim() || undefined, designation: form.designation.trim() || undefined, photoUrl: form.photoUrl.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "photoUrl", label: "", width: 60, render: r => r.photoUrl ? <img src={r.photoUrl} alt={r.name} className="h-9 w-9 rounded-full object-cover object-top" onError={e => { (e.target as HTMLImageElement).src = "https://cadetcollegemurree.edu.pk/uploads/app_image/defualt.png"; }} /> : <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">{r.name?.[0]}</div> },
    { key: "name", label: "Name", width: 200, render: r => <span className="font-medium text-sm">{r.name}</span> },
    { key: "department", label: "Department", width: 140, render: r => <Badge variant="outline">{r.department || "—"}</Badge> },
    { key: "subject", label: "Subject", width: 150, render: r => <span className="text-sm text-slate-600">{r.subject || "—"}</span> },
    { key: "designation", label: "Designation", width: 150, render: r => <span className="text-sm text-slate-500">{r.designation || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Faculty</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No faculty members yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Faculty Member</div>
            <div><Label>Name *</Label><Input value={form.name} onChange={sf("name")} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Department</Label>
                <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject</Label><Input value={form.subject} onChange={sf("subject")} /></div>
            </div>
            <div><Label>Designation</Label><Input value={form.designation} onChange={sf("designation")} placeholder="e.g. Senior Teacher" /></div>
            <ImageUploadField value={form.photoUrl} onChange={url => setForm(f => ({ ...f, photoUrl: url }))} label="Photo" />
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="fac-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="fac-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Faculty Member?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FEE STRUCTURE TAB ────────────────────────────────────────────────────────

type FeeForm = { className: string; feeType: string; amount: string; currency: string; notes: string; isPublished: boolean; sortOrder: string };
const emptyFee = (): FeeForm => ({ className: "", feeType: "", amount: "0", currency: "PKR", notes: "", isPublished: false, sortOrder: "0" });
const toFeeForm = (r: any): FeeForm => ({ className: r.className ?? "", feeType: r.feeType ?? "", amount: String(r.amount ?? 0), currency: r.currency ?? "PKR", notes: r.notes ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function FeeStructureTab() {
  const qk = ["/admin/website/fee-structure"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/fee-structure") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/fee-structure", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/fee-structure/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/fee-structure/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FeeForm>(emptyFee());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/fee-structure/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof FeeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyFee(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toFeeForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { className: form.className.trim(), feeType: form.feeType.trim(), amount: parseInt(form.amount) || 0, currency: form.currency, notes: form.notes.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "className", label: "Class/Program", width: 140, render: r => <Badge variant="outline">{r.className}</Badge> },
    { key: "feeType", label: "Fee Type", width: 180, render: r => <span className="font-medium text-sm">{r.feeType}</span> },
    { key: "amount", label: "Amount", width: 130, render: r => <span className="font-semibold text-sm">{r.currency} {Number(r.amount).toLocaleString()}</span> },
    { key: "notes", label: "Notes", width: 200, render: r => <span className="text-sm text-slate-500">{r.notes || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Fee Item</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No fee items yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Fee Item</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Class/Program *</Label><Input value={form.className} onChange={sf("className")} placeholder="e.g. Class 6" required /></div>
              <div><Label>Fee Type *</Label><Input value={form.feeType} onChange={sf("feeType")} placeholder="e.g. Monthly Fee" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount *</Label><Input type="number" value={form.amount} onChange={sf("amount")} required /></div>
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PKR">PKR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={sf("notes")} rows={2} /></div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="fee-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="fee-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Fee Item?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── TESTIMONIALS TAB ─────────────────────────────────────────────────────────

type TestimonialForm = { name: string; role: string; quote: string; photoUrl: string; isPublished: boolean; sortOrder: string };
const emptyTestimonial = (): TestimonialForm => ({ name: "", role: "Cadet", quote: "", photoUrl: "", isPublished: false, sortOrder: "0" });
const toTestimonialForm = (r: any): TestimonialForm => ({ name: r.name ?? "", role: r.role ?? "", quote: r.quote ?? "", photoUrl: r.photoUrl ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function TestimonialsTab() {
  const qk = ["/admin/website/testimonials"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/testimonials") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/testimonials", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/testimonials/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/testimonials/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<TestimonialForm>(emptyTestimonial());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/testimonials/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof TestimonialForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyTestimonial(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toTestimonialForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { name: form.name.trim(), role: form.role.trim(), quote: form.quote.trim(), photoUrl: form.photoUrl.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "photoUrl", label: "Photo", width: 60, render: r => r.photoUrl ? <img src={r.photoUrl} alt={r.name} className="h-9 w-9 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} /> : <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">{r.name?.[0]}</div> },
    { key: "name", label: "Name", width: 180, render: r => <div><div className="font-medium text-sm">{r.name}</div><div className="text-xs text-slate-500">{r.role}</div></div> },
    { key: "quote", label: "Quote", width: 300, render: r => <span className="text-sm text-slate-500 truncate block max-w-xs">{String(r.quote || "").slice(0, 80) || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Testimonial</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No testimonials yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Testimonial</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={sf("name")} required /></div>
              <div><Label>Role</Label><Input value={form.role} onChange={sf("role")} placeholder="e.g. Cadet, Alumni, Parent" /></div>
            </div>
            <div><Label>Quote *</Label><Textarea value={form.quote} onChange={sf("quote")} rows={5} required placeholder="Their testimonial…" /></div>
            <ImageUploadField value={form.photoUrl} onChange={url => setForm(f => ({ ...f, photoUrl: url }))} label="Photo" />
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="test-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="test-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Testimonial?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── ALUMNI TAB ───────────────────────────────────────────────────────────────

const ALUMNI_CATEGORIES = [
  { value: "armed_forces",   label: "Armed Forces" },
  { value: "medical",        label: "Medicine" },
  { value: "engineering",    label: "Engineering & Tech" },
  { value: "civil_services", label: "Civil Services" },
  { value: "academia",       label: "Academia & Research" },
];

type AlumnusForm = {
  name: string; batch: string; category: string; role: string; organization: string;
  location: string; quote: string; story: string; achievements: string; badge: string;
  photoUrl: string; featured: boolean; isPublished: boolean; sortOrder: string;
};
const emptyAlumnus = (): AlumnusForm => ({
  name: "", batch: "", category: "academia", role: "", organization: "", location: "",
  quote: "", story: "", achievements: "", badge: "", photoUrl: "", featured: false,
  isPublished: false, sortOrder: "0",
});
const toAlumnusForm = (r: any): AlumnusForm => ({
  name: r.name ?? "", batch: r.batch ?? "", category: r.category ?? "academia",
  role: r.role ?? "", organization: r.organization ?? "", location: r.location ?? "",
  quote: r.quote ?? "", story: r.story ?? "", achievements: r.achievements ?? "",
  badge: r.badge ?? "", photoUrl: r.photoUrl ?? "", featured: !!r.featured,
  isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0),
});

function AlumniTab() {
  const qk = ["/admin/website/alumni"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/alumni") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/alumni", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/alumni/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/alumni/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<AlumnusForm>(emptyAlumnus());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/alumni/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof AlumnusForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyAlumnus(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toAlumnusForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(), batch: form.batch.trim(), category: form.category,
      role: form.role.trim(), organization: form.organization.trim(), location: form.location.trim(),
      quote: form.quote.trim(), story: form.story.trim(), achievements: form.achievements.trim(),
      badge: form.badge.trim() || undefined, photoUrl: form.photoUrl.trim() || undefined,
      featured: form.featured, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0,
    };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const catLabel = (v: string) => ALUMNI_CATEGORIES.find(c => c.value === v)?.label ?? v;

  const cols: ColDef<any>[] = [
    { key: "photoUrl", label: "Photo", width: 60, render: r => r.photoUrl ? <img src={r.photoUrl} alt={r.name} className="h-9 w-9 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} /> : <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold">{r.name?.[0]}</div> },
    { key: "name", label: "Name", width: 200, render: r => <div><div className="font-medium text-sm">{r.name}</div><div className="text-xs text-slate-500">{r.role || catLabel(r.category)}</div></div> },
    { key: "batch", label: "Batch", width: 130, render: r => <span className="text-sm text-slate-500">{r.batch || "—"}</span> },
    { key: "category", label: "Category", width: 150, render: r => <Badge variant="outline" className="text-xs">{catLabel(r.category)}</Badge> },
    { key: "featured", label: "Featured", width: 90, render: r => r.featured ? <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Featured</Badge> : <span className="text-slate-300">—</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Alumnus</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No alumni stories yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Alumnus</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={sf("name")} required /></div>
              <div><Label>Batch</Label><Input value={form.batch} onChange={sf("batch")} placeholder="e.g. Class of 2005" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALUMNI_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Role / Title</Label><Input value={form.role} onChange={sf("role")} placeholder="e.g. Consultant Surgeon" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Organization</Label><Input value={form.organization} onChange={sf("organization")} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={sf("location")} /></div>
            </div>
            <div><Label>Quote</Label><Textarea value={form.quote} onChange={sf("quote")} rows={2} placeholder="A short pull-quote…" /></div>
            <div><Label>Story</Label><Textarea value={form.story} onChange={sf("story")} rows={7} placeholder="One paragraph per blank line…" /></div>
            <div><Label>Achievements</Label><Textarea value={form.achievements} onChange={sf("achievements")} rows={5} placeholder="One achievement per line…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Honour badge (optional)</Label><Input value={form.badge} onChange={sf("badge")} placeholder="e.g. Sword of Honour" /></div>
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            </div>
            <ImageUploadField value={form.photoUrl} onChange={url => setForm(f => ({ ...f, photoUrl: url }))} label="Photo" />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="alum-feat" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} />
              <label htmlFor="alum-feat" className="text-sm font-medium cursor-pointer">Featured story (shown at the top)</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="alum-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="alum-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Alumnus?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FEATURES TAB ─────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  "Dumbbell","Trophy","Monitor","GraduationCap","BookOpen","FlaskConical",
  "Globe","UserCheck","Download","Images","CalendarDays","Star","Building2",
  "Shield","Briefcase","Award","Link","Users","Heart","Zap","Target","Clock",
  "Stethoscope","Plane","ChevronRight","ArrowRight","CheckCircle","Lightbulb",
  "Cpu","Code","BarChart","PenTool","Palette","Music","Camera","Wifi",
];

type FeatureForm = { iconName: string; title: string; description: string; isPublished: boolean; sortOrder: string };
const emptyFeature = (): FeatureForm => ({ iconName: "Star", title: "", description: "", isPublished: false, sortOrder: "0" });
const toFeatureForm = (r: any): FeatureForm => ({ iconName: r.iconName ?? "Star", title: r.title ?? "", description: r.description ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function FeaturesTab() {
  const qk = ["/admin/website/features"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/features") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/features", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/features/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/features/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FeatureForm>(emptyFeature());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/features/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof FeatureForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyFeature(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toFeatureForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { iconName: form.iconName, title: form.title.trim(), description: form.description.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "iconName", label: "Icon", width: 100, render: r => <Badge variant="outline" className="font-mono text-xs">{r.iconName}</Badge> },
    { key: "title", label: "Title", width: 220, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "description", label: "Description", width: 300, render: r => <span className="text-sm text-slate-500 truncate block max-w-xs">{String(r.description || "").slice(0, 80) || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Feature</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No features yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Feature</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon Name</Label>
                <IconSelect value={form.iconName} onChange={v => setForm(f => ({ ...f, iconName: v }))} options={ICON_OPTIONS} />
              </div>
              <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={sf("description")} rows={4} /></div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="feat-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="feat-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Feature?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FACILITIES TAB ───────────────────────────────────────────────────────────

type FacilityForm = { iconName: string; title: string; description: string; imageUrl: string; isPublished: boolean; sortOrder: string };
const emptyFacilityItem = (): FacilityForm => ({ iconName: "Building2", title: "", description: "", imageUrl: "", isPublished: false, sortOrder: "0" });
const toFacilityForm = (r: any): FacilityForm => ({ iconName: r.iconName ?? "Building2", title: r.title ?? "", description: r.description ?? "", imageUrl: r.imageUrl ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function FacilitiesTab() {
  const qk = ["/admin/website/facilities"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/facilities") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/facilities", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/facilities/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/facilities/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FacilityForm>(emptyFacilityItem());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/facilities/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof FacilityForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyFacilityItem(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toFacilityForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { iconName: form.iconName, title: form.title.trim(), description: form.description.trim() || undefined, imageUrl: form.imageUrl.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "iconName", label: "Icon", width: 100, render: r => <Badge variant="outline" className="font-mono text-xs">{r.iconName}</Badge> },
    { key: "title", label: "Title", width: 200, render: r => <span className="font-medium text-sm">{r.title}</span> },
    { key: "imageUrl", label: "Image", width: 80, render: r => r.imageUrl ? <img src={r.imageUrl} alt="" className="h-8 w-12 object-cover rounded" /> : <span className="text-slate-400 text-xs">—</span> },
    { key: "description", label: "Description", width: 240, render: r => <span className="text-sm text-slate-500 truncate block max-w-xs">{String(r.description || "").slice(0, 60) || "—"}</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Facility</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No facilities yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Facility</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon Name</Label>
                <IconSelect value={form.iconName} onChange={v => setForm(f => ({ ...f, iconName: v }))} options={ICON_OPTIONS} />
              </div>
              <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={sf("description")} rows={3} /></div>
            <ImageUploadField value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} />
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="facil-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="facil-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Facility?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── QUICK LINKS TAB ──────────────────────────────────────────────────────────

type QuickLinkForm = { iconName: string; title: string; description: string; cta: string; href: string; isExternal: boolean; isPublished: boolean; sortOrder: string };
const emptyQuickLink = (): QuickLinkForm => ({ iconName: "Link", title: "", description: "", cta: "Learn More", href: "/", isExternal: false, isPublished: false, sortOrder: "0" });
const toQuickLinkForm = (r: any): QuickLinkForm => ({ iconName: r.iconName ?? "Link", title: r.title ?? "", description: r.description ?? "", cta: r.cta ?? "Learn More", href: r.href ?? "/", isExternal: !!r.isExternal, isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function QuickLinksTab() {
  const qk = ["/admin/website/quick-links"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/quick-links") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/quick-links", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/quick-links/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/quick-links/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<QuickLinkForm>(emptyQuickLink());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/quick-links/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof QuickLinkForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyQuickLink(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toQuickLinkForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { iconName: form.iconName, title: form.title.trim(), description: form.description.trim() || undefined, cta: form.cta.trim() || "Learn More", href: form.href.trim() || "/", isExternal: form.isExternal, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "iconName", label: "Icon", width: 100, render: r => <Badge variant="outline" className="font-mono text-xs">{r.iconName}</Badge> },
    { key: "title", label: "Title", width: 180, render: r => <div><div className="font-medium text-sm">{r.title}</div><div className="text-xs text-slate-500 font-mono truncate max-w-[160px]">{r.href}</div></div> },
    { key: "cta", label: "CTA", width: 120, render: r => <span className="text-sm text-slate-600">{r.cta}</span> },
    { key: "isExternal", label: "External", width: 90, render: r => r.isExternal ? <Badge className="bg-blue-100 text-blue-700 border-blue-200">Yes</Badge> : <Badge variant="outline" className="text-slate-400">No</Badge> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Quick Link</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No quick links yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Quick Link</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon Name</Label>
                <IconSelect value={form.iconName} onChange={v => setForm(f => ({ ...f, iconName: v }))} options={ICON_OPTIONS} />
              </div>
              <div><Label>Title *</Label><Input value={form.title} onChange={sf("title")} required /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={sf("description")} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CTA Label *</Label><Input value={form.cta} onChange={sf("cta")} placeholder="e.g. Apply Now" required /></div>
              <div><Label>Link / URL *</Label><Input value={form.href} onChange={sf("href")} placeholder="/admissions or https://…" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ql-ext" checked={form.isExternal} onChange={e => setForm(f => ({ ...f, isExternal: e.target.checked }))} />
                <label htmlFor="ql-ext" className="text-sm font-medium cursor-pointer">External link (opens new tab)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ql-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
                <label htmlFor="ql-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Quick Link?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── MENU MANAGER TAB ─────────────────────────────────────────────────────────
// Builds the public website's top navigation: top-level links, one level of
// dropdown children, and the navbar CTA button. Links point at a chosen site
// page or a custom/external URL.

const MENU_PAGES = [
  { value: "/",              label: "Home" },
  { value: "/about",         label: "About Us" },
  { value: "/admissions",    label: "Online Admission" },
  { value: "/status",        label: "Check Status" },
  { value: "/gallery",       label: "Gallery" },
  { value: "/events",        label: "Events" },
  { value: "/teachers",      label: "Teachers" },
  { value: "/downloads",     label: "Downloads" },
  { value: "/contact",       label: "Contact Us" },
  { value: "/alumni",        label: "Alumni Stories" },
  { value: "/results",       label: "Results" },
  { value: "/fee-structure", label: "Fee Structure" },
  { value: "/privacy",       label: "Privacy Policy" },
  { value: "/terms",         label: "Terms" },
] as const;

type MenuItem = {
  id: string; parentId: string | null; location?: string; label: string;
  linkType: "page" | "url"; target: string; openInNewTab: boolean;
  isCta: boolean; isPublished: boolean; sortOrder: number;
};

type MenuForm = { label: string; linkType: "page" | "url"; target: string; openInNewTab: boolean; isPublished: boolean };
const emptyMenuForm = (): MenuForm => ({ label: "", linkType: "page", target: "/", openInNewTab: false, isPublished: true });

const MENU_TOP_LEVEL = "__top__";

function pageLabel(target: string): string {
  return MENU_PAGES.find(p => p.value === target)?.label ?? target;
}

function MenuSortableRow({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };
  const handle = (
    <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none" title="Drag to reorder" tabIndex={-1}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
}

function MenuTab() {
  const qk = ["/admin/website/menu"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/menu") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/menu", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/menu/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/menu/${id}`, { method: "DELETE" }), onSuccess: inv });
  const reorderM = useMutation({
    mutationFn: (order: string[]) => apiFetch("/api/admin/website/menu/reorder", { method: "PATCH", body: JSON.stringify({ order }) }),
    onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); inv(); },
    onSuccess: inv,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const all: MenuItem[] = (Array.isArray(data) ? data : []).filter(m => (m.location ?? "header") !== "footer");
  const cta = all.find(m => m.isCta) ?? null;
  const topLevel = all.filter(m => !m.isCta && !m.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenOf = (pid: string) => all.filter(m => !m.isCta && m.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [parentForNew, setParentForNew] = useState<string | null>(null);
  const [editingCta, setEditingCta] = useState(false);
  const [form, setForm] = useState<MenuForm>(emptyMenuForm());
  const [delId, setDelId] = useState<string | null>(null);

  const editingHasChildren = editing ? childrenOf(editing.id).length > 0 : false;
  const parentOptions = topLevel.filter(t => t.id !== editing?.id);

  function reorder(ids: string[]) {
    qc.setQueryData(qk, (prev: MenuItem[] = []) => prev.map(m => {
      const idx = ids.indexOf(m.id);
      return idx >= 0 ? { ...m, sortOrder: idx } : m;
    }));
    reorderM.mutate(ids);
  }
  function handleDragEnd(siblings: MenuItem[]) {
    return (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = siblings.map(i => i.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0) return;
      reorder(arrayMove(ids, oldIndex, newIndex));
    };
  }

  function openAddTop() { setEditing(null); setParentForNew(null); setEditingCta(false); setForm(emptyMenuForm()); setDialogOpen(true); }
  function openAddChild(pid: string) { setEditing(null); setParentForNew(pid); setEditingCta(false); setForm(emptyMenuForm()); setDialogOpen(true); }
  function openEdit(m: MenuItem) {
    setEditing(m); setParentForNew(m.parentId); setEditingCta(m.isCta);
    setForm({ label: m.label, linkType: m.linkType, target: m.target, openInNewTab: m.openInNewTab, isPublished: m.isPublished });
    setDialogOpen(true);
  }
  function openCta() {
    if (cta) { openEdit(cta); return; }
    setEditing(null); setParentForNew(null); setEditingCta(true);
    setForm({ label: "Result", linkType: "page", target: "/results", openInNewTab: false, isPublished: true });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) { toast({ title: "Label is required", variant: "destructive" }); return; }
    const body: any = {
      label: form.label.trim(),
      linkType: form.linkType,
      target: form.target.trim() || (form.linkType === "page" ? "/" : ""),
      openInNewTab: form.linkType === "url" ? form.openInNewTab : false,
      isPublished: form.isPublished,
    };
    if (!editing) {
      body.parentId = editingCta ? null : parentForNew;
      body.isCta = editingCta;
      const siblings = editingCta ? [] : parentForNew ? childrenOf(parentForNew) : topLevel;
      body.sortOrder = editingCta ? 999 : parseInt(nextSortOrder(siblings)) || 0;
    }
    const oldParent = editing && !editing.isCta ? editing.parentId : null;
    const newParent = editingCta ? null : parentForNew;
    const parentChanged = !!editing && !editing.isCta && oldParent !== newParent;
    if (parentChanged) body.parentId = newParent;
    try {
      if (editing) {
        await updateM.mutateAsync({ id: editing.id, d: body });
        if (parentChanged) {
          // Recompute sortOrder for both the old and new sibling groups.
          const oldGroup = (oldParent ? childrenOf(oldParent) : topLevel).filter(s => s.id !== editing.id).map(s => s.id);
          const newGroup = [...(newParent ? childrenOf(newParent) : topLevel).filter(s => s.id !== editing.id).map(s => s.id), editing.id];
          if (oldGroup.length) await reorderM.mutateAsync(oldGroup);
          await reorderM.mutateAsync(newGroup);
        }
        toast({ title: "Updated" });
      }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setDialogOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  function LinkInfo({ m }: { m: MenuItem }) {
    return (
      <span className="text-xs text-slate-500 font-mono inline-flex items-center gap-1">
        {m.linkType === "url"
          ? <><ExternalLink className="h-3 w-3" />{m.target || "—"}</>
          : <>{pageLabel(m.target)} <span className="text-slate-300">({m.target})</span></>}
      </span>
    );
  }

  function RowActions({ m, canAddChild }: { m: MenuItem; canAddChild: boolean }) {
    return (
      <div className="flex gap-1 items-center">
        {!m.isPublished && <Badge variant="outline" className="text-slate-400 mr-1">Draft</Badge>}
        {canAddChild && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openAddChild(m.id)}>
            <Plus className="h-3 w-3 mr-1" />Sub-item
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">Loading…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">Build your website's top navigation. Drag to reorder. Add sub-items to create a dropdown menu.</p>
        <Button size="sm" onClick={openAddTop}><Plus className="h-4 w-4 mr-1" />Add Menu Item</Button>
      </div>

      {/* Top-level items + their dropdown children */}
      {topLevel.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">No menu items yet</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(topLevel)}>
          <SortableContext items={topLevel.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {topLevel.map(item => {
                const kids = childrenOf(item.id);
                return (
                  <MenuSortableRow key={item.id} id={item.id}>
                    {(handle) => (
                      <div className="rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {handle}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {item.label}
                              {kids.length > 0 && <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-200">Dropdown · {kids.length}</Badge>}
                            </div>
                            {kids.length === 0 && <LinkInfo m={item} />}
                          </div>
                          <RowActions m={item} canAddChild={true} />
                        </div>

                        {kids.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/60 pl-8 pr-3 py-2">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(kids)}>
                              <SortableContext items={kids.map(k => k.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1.5">
                                  {kids.map(kid => (
                                    <MenuSortableRow key={kid.id} id={kid.id}>
                                      {(kh) => (
                                        <div className="flex items-center gap-3 px-2 py-1.5 rounded border border-slate-200 bg-white">
                                          {kh}
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm">{kid.label}</div>
                                            <LinkInfo m={kid} />
                                          </div>
                                          <RowActions m={kid} canAddChild={false} />
                                        </div>
                                      )}
                                    </MenuSortableRow>
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          </div>
                        )}
                      </div>
                    )}
                  </MenuSortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* CTA button */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Call-to-action Button</div>
            {cta ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-100 text-amber-800 px-3 py-1 text-sm font-bold">{cta.label}</span>
                <LinkInfo m={cta} />
                {!cta.isPublished && <Badge variant="outline" className="text-slate-400">Draft</Badge>}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No CTA button configured.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={openCta}>{cta ? <><Pencil className="h-3.5 w-3.5 mr-1" />Edit CTA</> : <><Plus className="h-4 w-4 mr-1" />Add CTA</>}</Button>
            {cta && <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDelId(cta.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} {editingCta ? "CTA Button" : parentForNew ? "Sub-item" : "Menu Item"}</DialogTitle>
            <DialogDescription>{editingCta ? "The highlighted button at the end of the navigation bar." : parentForNew ? "A dropdown item shown under its parent." : "A top-level navigation link. Add sub-items to it to turn it into a dropdown."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Label *</Label><Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. About Us" required /></div>
            {editing && !editingCta && (
              <div>
                <Label>Placement</Label>
                <Select
                  value={parentForNew ?? MENU_TOP_LEVEL}
                  onValueChange={v => setParentForNew(v === MENU_TOP_LEVEL ? null : v)}
                  disabled={editingHasChildren}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MENU_TOP_LEVEL}>Top level (its own menu item)</SelectItem>
                    {parentOptions.map(p => <SelectItem key={p.id} value={p.id}>Inside “{p.label}” dropdown</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">
                  {editingHasChildren
                    ? "This item has sub-items, so it must stay at the top level. Move its sub-items out first to nest it."
                    : "Move this item into a dropdown, or back out to the top level."}
                </p>
              </div>
            )}
            <div>
              <Label>Link type</Label>
              <Select
                value={form.linkType}
                onValueChange={(v: "page" | "url") => setForm(f => ({
                  ...f, linkType: v,
                  target: v === "page" ? (MENU_PAGES.some(p => p.value === f.target) ? f.target : "/") : (MENU_PAGES.some(p => p.value === f.target) ? "" : f.target),
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Site page</SelectItem>
                  <SelectItem value="url">Custom / external URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.linkType === "page" ? (
              <div>
                <Label>Page</Label>
                <Select value={form.target} onValueChange={v => setForm(f => ({ ...f, target: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose a page" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {MENU_PAGES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div><Label>URL</Label><Input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="https://… or /some/path or a PDF link" /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="menu-newtab" checked={form.openInNewTab} onChange={e => setForm(f => ({ ...f, openInNewTab: e.target.checked }))} />
                  <label htmlFor="menu-newtab" className="text-sm font-medium cursor-pointer">Open in a new tab</label>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="menu-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="menu-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this menu item?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Deleting a parent also removes its sub-items from the menu.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => {
              const id = delId!;
              const kids = childrenOf(id);
              try {
                for (const k of kids) await deleteM.mutateAsync(k.id);
                await deleteM.mutateAsync(id);
                toast({ title: "Deleted" });
              } catch { toast({ title: "Error", variant: "destructive" }); }
              setDelId(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FOOTER LINKS TAB ─────────────────────────────────────────────────────────
// Manages footer link groups (siteMenuItems with location="footer"). A top-level
// row is a footer column heading; its children are the links shown under it.

type FooterForm = { label: string; linkType: "page" | "url"; target: string; openInNewTab: boolean; isPublished: boolean };
const emptyFooterForm = (): FooterForm => ({ label: "", linkType: "page", target: "/", openInNewTab: false, isPublished: true });

function FooterMenuTab() {
  const qk = ["/admin/website/menu"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/menu") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/menu", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/menu/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/menu/${id}`, { method: "DELETE" }), onSuccess: inv });
  const reorderM = useMutation({
    mutationFn: (order: string[]) => apiFetch("/api/admin/website/menu/reorder", { method: "PATCH", body: JSON.stringify({ order }) }),
    onError: () => { toast({ title: "Reorder failed", variant: "destructive" }); inv(); },
    onSuccess: inv,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const all: MenuItem[] = (Array.isArray(data) ? data : []).filter(m => m.location === "footer");
  const groups = all.filter(m => !m.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const childrenOf = (pid: string) => all.filter(m => m.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [parentForNew, setParentForNew] = useState<string | null>(null); // null => group; else => link
  const [form, setForm] = useState<FooterForm>(emptyFooterForm());
  const [delId, setDelId] = useState<string | null>(null);

  // A "group" row is a heading only (no link fields shown); a "link" row has a parent.
  const isGroup = !editing ? parentForNew === null : !editing.parentId;

  function reorder(ids: string[]) {
    qc.setQueryData(qk, (prev: MenuItem[] = []) => prev.map(m => {
      const idx = ids.indexOf(m.id);
      return idx >= 0 ? { ...m, sortOrder: idx } : m;
    }));
    reorderM.mutate(ids);
  }
  function handleDragEnd(siblings: MenuItem[]) {
    return (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = siblings.map(i => i.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex < 0 || newIndex < 0) return;
      reorder(arrayMove(ids, oldIndex, newIndex));
    };
  }

  function openAddGroup() { setEditing(null); setParentForNew(null); setForm(emptyFooterForm()); setDialogOpen(true); }
  function openAddLink(pid: string) { setEditing(null); setParentForNew(pid); setForm(emptyFooterForm()); setDialogOpen(true); }
  function openEdit(m: MenuItem) {
    setEditing(m); setParentForNew(m.parentId);
    setForm({ label: m.label, linkType: m.linkType, target: m.target, openInNewTab: m.openInNewTab, isPublished: m.isPublished });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) { toast({ title: "Label is required", variant: "destructive" }); return; }
    const body: any = {
      label: form.label.trim(),
      isPublished: form.isPublished,
      location: "footer",
    };
    if (isGroup) {
      // Group headings don't carry a real link.
      body.linkType = "page";
      body.target = "/";
      body.openInNewTab = false;
    } else {
      body.linkType = form.linkType;
      body.target = form.target.trim() || (form.linkType === "page" ? "/" : "");
      body.openInNewTab = form.linkType === "url" ? form.openInNewTab : false;
    }
    if (!editing) {
      body.parentId = parentForNew;
      const siblings = parentForNew ? childrenOf(parentForNew) : groups;
      body.sortOrder = parseInt(nextSortOrder(siblings)) || 0;
    }
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setDialogOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  function LinkInfo({ m }: { m: MenuItem }) {
    return (
      <span className="text-xs text-slate-500 font-mono inline-flex items-center gap-1">
        {m.linkType === "url"
          ? <><ExternalLink className="h-3 w-3" />{m.target || "—"}</>
          : <>{pageLabel(m.target)} <span className="text-slate-300">({m.target})</span></>}
      </span>
    );
  }

  if (isLoading) {
    return <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">Loading…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">Manage your website footer's link columns. Each group is a heading; add links under it. Drag to reorder.</p>
        <Button size="sm" onClick={openAddGroup}><Plus className="h-4 w-4 mr-1" />Add Link Group</Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-slate-200 p-8 text-center text-slate-400 text-sm">No footer link groups yet</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(groups)}>
          <SortableContext items={groups.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {groups.map(group => {
                const kids = childrenOf(group.id);
                return (
                  <MenuSortableRow key={group.id} id={group.id}>
                    {(handle) => (
                      <div className="rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          {handle}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {group.label}
                              <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-200">Column · {kids.length}</Badge>
                            </div>
                          </div>
                          <div className="flex gap-1 items-center">
                            {!group.isPublished && <Badge variant="outline" className="text-slate-400 mr-1">Draft</Badge>}
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openAddLink(group.id)}>
                              <Plus className="h-3 w-3 mr-1" />Link
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(group)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(group.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>

                        {kids.length > 0 && (
                          <div className="border-t border-slate-100 bg-slate-50/60 pl-8 pr-3 py-2">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(kids)}>
                              <SortableContext items={kids.map(k => k.id)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1.5">
                                  {kids.map(kid => (
                                    <MenuSortableRow key={kid.id} id={kid.id}>
                                      {(kh) => (
                                        <div className="flex items-center gap-3 px-2 py-1.5 rounded border border-slate-200 bg-white">
                                          {kh}
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm">{kid.label}</div>
                                            <LinkInfo m={kid} />
                                          </div>
                                          <div className="flex gap-1 items-center">
                                            {!kid.isPublished && <Badge variant="outline" className="text-slate-400 mr-1">Draft</Badge>}
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(kid)}><Pencil className="h-3.5 w-3.5" /></Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(kid.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                          </div>
                                        </div>
                                      )}
                                    </MenuSortableRow>
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          </div>
                        )}
                      </div>
                    )}
                  </MenuSortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Add"} {isGroup ? "Link Group" : "Footer Link"}</DialogTitle>
            <DialogDescription>{isGroup ? "A footer column. Its label is the heading; add links under it." : "A link shown under its footer column heading."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>{isGroup ? "Heading *" : "Label *"}</Label><Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={isGroup ? "e.g. Quick Links" : "e.g. About Us"} required /></div>
            {!isGroup && (
              <>
                <div>
                  <Label>Link type</Label>
                  <Select
                    value={form.linkType}
                    onValueChange={(v: "page" | "url") => setForm(f => ({
                      ...f, linkType: v,
                      target: v === "page" ? (MENU_PAGES.some(p => p.value === f.target) ? f.target : "/") : (MENU_PAGES.some(p => p.value === f.target) ? "" : f.target),
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page">Site page</SelectItem>
                      <SelectItem value="url">Custom / external URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.linkType === "page" ? (
                  <div>
                    <Label>Page</Label>
                    <Select value={form.target} onValueChange={v => setForm(f => ({ ...f, target: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choose a page" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {MENU_PAGES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div><Label>URL</Label><Input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="https://… or /some/path or a PDF link" /></div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="footer-newtab" checked={form.openInNewTab} onChange={e => setForm(f => ({ ...f, openInNewTab: e.target.checked }))} />
                      <label htmlFor="footer-newtab" className="text-sm font-medium cursor-pointer">Open in a new tab</label>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="footer-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="footer-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this footer item?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Deleting a group also removes all links inside it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => {
              const id = delId!;
              const kids = childrenOf(id);
              try {
                for (const k of kids) await deleteM.mutateAsync(k.id);
                await deleteM.mutateAsync(id);
                toast({ title: "Deleted" });
              } catch { toast({ title: "Error", variant: "destructive" }); }
              setDelId(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── EXAM RESULTS TAB ─────────────────────────────────────────────────────────

type ResultForm = { examName: string; className: string; academicYear: string; resultDate: string; downloadUrl: string; notes: string; isPublished: boolean; sortOrder: string };
const emptyResult = (): ResultForm => ({ examName: "", className: "", academicYear: new Date().getFullYear().toString(), resultDate: "", downloadUrl: "", notes: "", isPublished: false, sortOrder: "0" });
const toResultForm = (r: any): ResultForm => ({ examName: r.examName ?? "", className: r.className ?? "", academicYear: r.academicYear ?? "", resultDate: r.resultDate ?? "", downloadUrl: r.downloadUrl ?? "", notes: r.notes ?? "", isPublished: !!r.isPublished, sortOrder: String(r.sortOrder ?? 0) });

function ResultsTab() {
  const qk = ["/admin/website/results"];
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: qk });
  const { data = [], isLoading } = useQuery({ queryKey: qk, queryFn: () => apiFetch("/api/admin/website/results") });
  const createM = useMutation({ mutationFn: (d: any) => apiFetch("/api/admin/website/results", { method: "POST", body: JSON.stringify(d) }), onSuccess: inv });
  const updateM = useMutation({ mutationFn: ({ id, d }: any) => apiFetch(`/api/admin/website/results/${id}`, { method: "PATCH", body: JSON.stringify(d) }), onSuccess: inv });
  const deleteM = useMutation({ mutationFn: (id: string) => apiFetch(`/api/admin/website/results/${id}`, { method: "DELETE" }), onSuccess: inv });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<ResultForm>(emptyResult());
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const allRows: any[] = Array.isArray(data) ? data : [];
  const { items, handleReorder } = useSortableTab(qk, "/api/admin/website/results/reorder", allRows);
  const rows = search ? items.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : items;

  const sf = (k: keyof ResultForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm({ ...emptyResult(), sortOrder: nextSortOrder(items) }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toResultForm(r)); setOpen(true); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { examName: form.examName.trim(), className: form.className.trim(), academicYear: form.academicYear.trim(), resultDate: form.resultDate.trim() || undefined, downloadUrl: form.downloadUrl.trim() || undefined, notes: form.notes.trim() || undefined, isPublished: form.isPublished, sortOrder: parseInt(form.sortOrder) || 0 };
    try {
      if (editing) { await updateM.mutateAsync({ id: editing.id, d: body }); toast({ title: "Updated" }); }
      else { await createM.mutateAsync(body); toast({ title: "Created" }); }
      setOpen(false);
    } catch { toast({ title: "Error", variant: "destructive" }); }
  }

  const cols: ColDef<any>[] = [
    { key: "examName", label: "Exam", width: 200, render: r => <span className="font-medium text-sm">{r.examName || "—"}</span> },
    { key: "className", label: "Class/Program", width: 130, render: r => <span className="font-medium text-sm">{r.className}</span> },
    { key: "academicYear", label: "Year", width: 90, render: r => <Badge variant="outline">{r.academicYear || "—"}</Badge> },
    { key: "resultDate", label: "Result Date", width: 110, render: r => <span className="text-sm text-slate-600">{r.resultDate || "—"}</span> },
    { key: "downloadUrl", label: "Download", width: 90, render: r => r.downloadUrl ? <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">PDF ↗</a> : <span className="text-slate-400 text-xs">—</span> },
    { key: "isPublished", label: "Status", width: 110, render: r => <PublishedBadge v={r.isPublished} /> },
    { key: "_actions", label: "", width: 90, render: r => (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Result</Button>
      </div>
      <SortableTable items={rows} columns={cols} onReorder={handleReorder} isLoading={isLoading} emptyTitle="No exam results yet" searchActive={!!search}
        editingId={open && editing ? editing.id : null} addingActive={open && !editing} renderEditor={() => (
          <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-sky-50/40">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{editing ? "Edit" : "Add"} Exam Result</div>
            <div><Label>Exam Name *</Label><Input value={form.examName} onChange={sf("examName")} placeholder="e.g. Federal Board of Secondary Education" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Class/Program *</Label><Input value={form.className} onChange={sf("className")} placeholder="e.g. Class 10 (Matric)" required /></div>
              <div><Label>Academic Year *</Label><Input value={form.academicYear} onChange={sf("academicYear")} placeholder="e.g. 2023-24" required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Result Date</Label><Input value={form.resultDate} onChange={sf("resultDate")} placeholder="e.g. 15 July 2024" /></div>
              <div><Label>Download URL</Label><Input value={form.downloadUrl} onChange={sf("downloadUrl")} placeholder="https://…/results.pdf" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={sf("notes")} rows={3} placeholder="Additional notes…" /></div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sortOrder} onChange={sf("sortOrder")} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="res-pub" checked={form.isPublished} onChange={e => setForm(f => ({ ...f, isPublished: e.target.checked }))} />
              <label htmlFor="res-pub" className="text-sm font-medium cursor-pointer">Published (visible on website)</label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createM.isPending || updateM.isPending}>{(createM.isPending || updateM.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
            </div>
          </form>
        )} />
      <AlertDialog open={!!delId} onOpenChange={o => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Result?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={async () => { await deleteM.mutateAsync(delId!); setDelId(null); toast({ title: "Deleted" }); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const THEMES = [
  {
    key: "gccm",
    name: "GCCM",
    full: "Girls Cadet College Murree",
    desc: "Forest green & crimson — logo-accurate badge colours",
    primary: "#245430",
    accent: "#C41230",
    secondary: "#1A3D22",
    bg: "#ffffff",
    headingFont: "Raleway, sans-serif",
  },
  {
    key: "pakmil",
    name: "Parade Ground",
    full: "Pakistan Military",
    desc: "Bottle green, crimson & gold — condensed, regimental",
    primary: "#01411C",
    accent: "#C8102E",
    secondary: "#046A38",
    bg: "#ffffff",
    headingFont: "Oswald, sans-serif",
  },
];

// ─── COLOUR PALETTE ───────────────────────────────────────────────────────────
// ─── Site palette catalogue ────────────────────────────────────────────────────
// Pre-authored site palettes. Each entry sets the four global brand colour keys
// (primary, secondary, accent, surfaceDark). All bg+text pairs in the preview
// are WCAG AA compliant — picked colours always produce legible text.

const PALETTE_COLOR_KEYS = [
  "color_primary", "color_secondary", "color_accent", "color_surface_dark",
] as const;


type SitePalette = {
  id: string;
  name: string;
  desc: string;
  primary: string;
  secondary: string;
  accent: string;
  surfaceDark: string;
};

const SITE_PALETTES: SitePalette[] = [
  { id: "forest-green",  name: "Forest Green",  desc: "Military green",        primary: "#064A1A", secondary: "#198754", accent: "#16a34a", surfaceDark: "#021a0a" },
  { id: "navy-gold",     name: "Navy & Gold",   desc: "Traditional & refined", primary: "#1a3a6b", secondary: "#2e5fad", accent: "#d97706", surfaceDark: "#0a1a35" },
  { id: "maroon-gold",   name: "Maroon & Gold", desc: "Regal & prestigious",   primary: "#7f1d1d", secondary: "#b91c1c", accent: "#d4af37", surfaceDark: "#2d0a0a" },
  { id: "charcoal-sky",  name: "Charcoal & Sky",desc: "Modern & clean",        primary: "#1e293b", secondary: "#334155", accent: "#0ea5e9", surfaceDark: "#0f172a" },
  { id: "olive-amber",   name: "Olive & Amber", desc: "Earthy & warm",         primary: "#3d4a1a", secondary: "#5c6e2e", accent: "#d4851a", surfaceDark: "#1a1f0a" },
  { id: "slate-blue",    name: "Slate Blue",    desc: "Professional & calm",   primary: "#2d3561", secondary: "#4a5599", accent: "#d97706", surfaceDark: "#111428" },
  { id: "teal-orange",   name: "Teal & Orange", desc: "Fresh & vibrant",       primary: "#0d5c63", secondary: "#1a8a96", accent: "#ea580c", surfaceDark: "#042428" },
  { id: "deep-purple",   name: "Deep Purple",   desc: "Bold & distinctive",    primary: "#2d1b69", secondary: "#4a3ca0", accent: "#f59e0b", surfaceDark: "#120b2d" },
  { id: "pakmil-green",  name: "Pakmil Green",  desc: "Pakistan Military",     primary: "#01411C", secondary: "#046A38", accent: "#C8102E", surfaceDark: "#010f07" },
  { id: "gccm-forest",   name: "GCCM Forest",   desc: "Logo-accurate — green ring + crimson badge", primary: "#245430", secondary: "#1A3D22", accent: "#C41230", surfaceDark: "#0a1f12" },
  { id: "gccm-crimson",  name: "GCCM Crimson",  desc: "Red-forward — bold crimson nav & hero",       primary: "#C41230", secondary: "#245430", accent: "#C9A227", surfaceDark: "#0a1f12" },
  { id: "gccm-heritage", name: "GCCM Heritage", desc: "Green & ceremonial gold — prestige look",      primary: "#245430", secondary: "#1A3D22", accent: "#C9A227", surfaceDark: "#0a1f12" },
  { id: "gccm-deep",     name: "GCCM Deep",     desc: "Darker forest green with vivid crimson",      primary: "#1A3D22", secondary: "#122B18", accent: "#E02020", surfaceDark: "#0D2010" },
];

function normHex(v: string | undefined): string | null {
  if (!v) return null;
  const h = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : null;
}

// Pick a readable (dark or white) text colour for a given background hex.
function readableText(hex: string): string {
  const m = (normHex(hex) ?? "#000000").slice(1);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * lin(parseInt(m.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(m.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(m.slice(4, 6), 16));
  return L > 0.179 ? "#1f2937" : "#ffffff";
}

// ─── Site palette card ─────────────────────────────────────────────────────────
function SitePaletteCard({
  palette,
  active,
  onClick,
}: {
  palette: SitePalette;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={palette.name}
      className={`relative w-full rounded-xl overflow-hidden border-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        active
          ? "border-sky-500 shadow-lg shadow-sky-100 ring-1 ring-sky-300"
          : "border-transparent hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {/* Navbar strip */}
      <div
        className="flex items-center justify-between px-2.5 py-2"
        style={{ background: palette.primary }}
      >
        <span className="text-[10px] font-bold truncate" style={{ color: readableText(palette.primary) }}>
          Your School
        </span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ml-1"
          style={{ background: palette.accent, color: readableText(palette.accent) }}
        >
          Apply
        </span>
      </div>
      {/* Body */}
      <div className="bg-white px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: palette.accent }}>
          Welcome
        </p>
        <p className="text-[10px] font-semibold leading-tight" style={{ color: palette.primary }}>
          Excellence in Education
        </p>
        <span
          className="inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded"
          style={{ background: palette.secondary, color: readableText(palette.secondary) }}
        >
          Learn more
        </span>
      </div>
      {/* Footer strip */}
      <div className="px-2.5 py-1.5" style={{ background: palette.surfaceDark }}>
        <span className="text-[9px]" style={{ color: readableText(palette.surfaceDark) }}>
          © Your School
        </span>
      </div>
      {/* Name + badge */}
      <div className="bg-slate-50 border-t border-slate-100 px-2.5 py-1.5 flex items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-800 truncate">{palette.name}</p>
          <p className="text-[10px] text-slate-400 truncate">{palette.desc}</p>
        </div>
        {active && (
          <span className="shrink-0 flex items-center justify-center h-4 w-4 rounded-full bg-sky-500">
            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="currentColor">
              <path d="M10 3L5 9 2 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
        )}
      </div>
    </button>
  );
}

function ColorPaletteEditor({
  theme, draft, setDraft,
}: {
  theme: string;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const anyOverride = PALETTE_COLOR_KEYS.some(k => !!normHex(draft[k]));
  const { toast } = useToast();

  function applyPalette(p: SitePalette) {
    setDraft(d => ({
      ...d,
      color_primary:      p.primary,
      color_secondary:    p.secondary,
      color_accent:       p.accent,
      color_surface_dark: p.surfaceDark,
    }));
  }

  function resetAll() {
    setDraft(d => {
      const next = { ...d };
      PALETTE_COLOR_KEYS.forEach(k => { next[k] = ""; });
      return next;
    });
  }

  // Detect the currently active palette (primary + accent both match).
  const activePaletteId =
    SITE_PALETTES.find(
      p =>
        normHex(draft.color_primary) === p.primary.toLowerCase() &&
        normHex(draft.color_accent) === p.accent.toLowerCase(),
    )?.id ??
    // Also match theme defaults when no override is set.
    SITE_PALETTES.find(p => p.id === theme + "-green" || p.id === theme + "-crimson" || p.id === theme)?.id ??
    null;

  // Resolved colours for the live preview bar.
  const resolved = {
    primary:     normHex(draft.color_primary)      ?? "#064A1A",
    accent:      normHex(draft.color_accent)       ?? "#16a34a",
    secondary:   normHex(draft.color_secondary)    ?? "#198754",
    surfaceDark: normHex(draft.color_surface_dark) ?? "#021a0a",
  };

  return (
    <div className="bg-card border border-slate-200 rounded-xl p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-3">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Colour Palette</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pick a brand palette — all colours are pre-tested for contrast and legibility.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAll}
          disabled={!anyOverride}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to theme
        </button>
      </div>

      {/* Palette gallery */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {SITE_PALETTES.map(p => (
          <SitePaletteCard
            key={p.id}
            palette={p}
            active={activePaletteId === p.id}
            onClick={() => applyPalette(p)}
          />
        ))}
      </div>

      {/* Live preview strip */}
      <div className="rounded-lg overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: resolved.primary }}>
          <span className="text-sm font-bold" style={{ color: readableText(resolved.primary) }}>Your School</span>
          <span
            className="text-xs font-semibold px-3 py-1 rounded"
            style={{ background: resolved.accent, color: readableText(resolved.accent) }}
          >
            Apply Now
          </span>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: resolved.accent }}>
            Welcome
          </p>
          <p className="text-sm font-semibold" style={{ color: resolved.primary }}>
            Excellence in education
          </p>
          <span
            className="inline-block text-[11px] font-medium px-2.5 py-1 rounded mt-2"
            style={{ background: resolved.secondary, color: readableText(resolved.secondary) }}
          >
            Learn more
          </span>
        </div>
        <div className="px-4 py-2.5" style={{ background: resolved.surfaceDark }}>
          <span className="text-[11px]" style={{ color: readableText(resolved.surfaceDark) }}>Footer · © Your School</span>
        </div>
      </div>
    </div>
  );
}

function ThemePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {THEMES.map(theme => {
        const active = value === theme.key;
        return (
          <button
            key={theme.key}
            type="button"
            onClick={() => onChange(theme.key)}
            className={`text-left rounded-xl border-2 overflow-hidden transition-all focus:outline-none ${
              active
                ? "border-sky-500 shadow-lg shadow-sky-100 scale-[1.02]"
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            }`}
          >
            {/* Colour header bar */}
            <div
              className="h-14 w-full relative"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
            >
              {/* Accent stripe at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-2.5" style={{ background: theme.accent }} />
              {/* Name on the bar */}
              <div className="absolute inset-0 flex items-center px-4 pb-2">
                <span
                  className="text-white font-bold text-lg tracking-wide drop-shadow"
                  style={{ fontFamily: theme.headingFont }}
                >
                  {theme.name}
                </span>
              </div>
              {/* Selected checkmark */}
              {active && (
                <div className="absolute top-2 right-2 h-6 w-6 bg-sky-500 rounded-full flex items-center justify-center shadow">
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white fill-current"><path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                </div>
              )}
            </div>
            {/* Card body */}
            <div className="bg-white px-4 py-3">
              <p className="text-xs font-semibold text-slate-700 truncate">{theme.full}</p>
              <p className="text-xs text-slate-400 mt-0.5">{theme.desc}</p>
              {/* Mini swatch row */}
              <div className="flex gap-1.5 mt-2">
                {[theme.primary, theme.secondary, theme.accent].map((c, i) => (
                  <span key={i} className="h-3 w-6 rounded-sm inline-block border border-black/10" style={{ background: c }} />
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── SITE SETTINGS TAB ────────────────────────────────────────────────────────

type SettingRow = { key: string; value: string; label: string; category: string; inputType: string; sortOrder: number };

const CATEGORY_LABELS: Record<string, string> = {
  contact:    "Contact Information",
  stats:      "College Stats",
  identity:   "College Identity",
  links:      "Links & Downloads",
  admissions: "Admissions",
  social:     "Social Media Links",
  seo:        "SEO & Domain",
};

function SiteSettingsTab() {
  const qk = ["/admin/website/settings"];
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery<SettingRow[]>({
    queryKey: qk,
    queryFn:  () => apiFetch("/api/admin/website/settings"),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rows.length > 0 && Object.keys(draft).length === 0) {
      const init: Record<string, string> = {};
      rows.forEach(r => { init[r.key] = r.value; });
      setDraft(init);
    }
  }, [rows]);

  // Mirror the selected theme to module scope so preview/edit links can pin it
  // in the URL — the public site then paints the right theme on first render.
  useEffect(() => {
    setActiveWebsiteTheme(draft["site_theme"] ?? null);
  }, [draft["site_theme"]]);

  const saveM = useMutation({
    mutationFn: () => apiFetch("/api/admin/website/settings", {
      method: "PUT",
      body: JSON.stringify({ updates: Object.entries(draft).map(([key, value]) => ({ key, value })) }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk });
      toast({ title: "Settings saved", description: "All website settings have been updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const byCategory = rows.reduce<Record<string, SettingRow[]>>((acc, r) => {
    if (r.key === "site_theme") return acc;
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  const categories = Object.keys(CATEGORY_LABELS).filter(c => byCategory[c]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Site Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Edit contact details, stats, and global content shown across the website.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={previewLiveSite}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Preview Website
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending} className="gap-2">
            {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save All Settings
          </Button>
        </div>
      </div>

      {/* ── Theme Picker ── */}
      <div className="bg-card border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
          Website Theme
        </h3>
        <p className="text-xs text-slate-500">Choose the visual identity for the public website. Changes take effect immediately after saving.</p>
        <ThemePicker
          value={draft["site_theme"] ?? "gccm"}
          onChange={v => setDraft(d => ({ ...d, site_theme: v }))}
        />
      </div>

      {/* ── Colour Palette ── */}
      <ColorPaletteEditor
        theme={draft["site_theme"] ?? "gccm"}
        draft={draft}
        setDraft={setDraft}
      />

      {categories.map(category => (
        <div key={category} className="bg-card border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="grid grid-cols-1 gap-5">
            {byCategory[category].map(row => (
              <div key={row.key}>
                <Label className="text-slate-700 mb-1.5 block">
                  {row.label}
                  <span className="ml-2 text-xs text-slate-400 font-normal font-mono">{row.key}</span>
                </Label>
                {row.category === "links" ? (
                  <FileUploadField
                    hideLabel
                    value={draft[row.key] ?? ""}
                    onChange={v => setDraft(d => ({ ...d, [row.key]: v }))}
                  />
                ) : row.inputType === "textarea" ? (
                  <Textarea
                    value={draft[row.key] ?? ""}
                    onChange={e => setDraft(d => ({ ...d, [row.key]: e.target.value }))}
                    rows={3}
                    className="resize-none"
                  />
                ) : (
                  <Input
                    type={row.inputType === "url" ? "url" : "text"}
                    value={draft[row.key] ?? ""}
                    onChange={e => setDraft(d => ({ ...d, [row.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-2">
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending} size="lg" className="gap-2">
          {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

type TenantOption = { id: string; name: string; slug: string; domain: string | null; siteTheme: string | null; isActive: boolean };

function TenantSelector() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selected, setSelected] = useState<string>(getSelectedTenant() ?? "");

  useEffect(() => {
    apiFetch("/api/admin/website/tenants")
      .then((data: TenantOption[]) => {
        if (Array.isArray(data)) {
          setTenants(data);
          // Default selection to the first tenant if none persisted yet.
          if (!getSelectedTenant() && data.length > 0) {
            setSelected(data[0].id);
            setSelectedTenant(data[0].id);
          }
          // Seed the module-level theme mirror from the selected tenant's saved
          // theme so preview/edit links carry ?theme= even before the Site
          // Settings tab (which refines it from the unsaved draft) is opened.
          const current = getSelectedTenant();
          const active = data.find(t => t.id === current) ?? data[0];
          if (active?.siteTheme) setActiveWebsiteTheme(active.siteTheme);
          setActiveWebsiteSlug(active?.slug ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // Only super-admins managing more than one tenant need the switcher.
  if (tenants.length < 2) return null;

  return (
    <div className="ml-auto flex items-center gap-2">
      <Building2 className="h-4 w-4 text-slate-400" />
      <Select
        value={selected}
        onValueChange={(val) => {
          setSelected(val);
          setSelectedTenant(val);
          // Reload so every query refetches scoped to the new tenant.
          window.location.reload();
        }}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select tenant" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}{!t.isActive ? " (inactive)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Build a public-website URL for the selected tenant on THIS deployment.
// Uses the tenant's slug as a path prefix (e.g. /ccm/, /gccm/) so the gateway
// routes to the correct tenant without needing a ?tenant= override. Falls back
// to ?tenant=UUID only when the slug is not yet known (initial load race).
// The admin token still rides as ?token= (embedded iframes) or #cms=/#preview=
// (full-page tabs) so the CMS edit toolbar and read-only preview authorize.
function publicSiteUrl(path = "", hash = "", token = ""): string {
  const apiBase = (import.meta.env.VITE_API_BASE as string) || "";
  const base = apiBase || window.location.origin;
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  // Pin the selected theme so the public site paints it on first render
  // instead of flashing its default theme until the settings fetch resolves.
  if (activeWebsiteTheme) params.set("theme", activeWebsiteTheme);
  // Use slug-based routing when available; fall back to ?tenant= override.
  const slug = activeWebsiteSlug;
  if (!slug) {
    const tenant = getSelectedTenant();
    if (tenant) params.set("tenant", tenant);
  }
  const qs = params.toString();
  const prefix = slug ? `${slug}/` : "";
  return `${base}/${prefix}${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

// Open the public website in inline CMS-edit mode (admin token passed in hash so
// the server honors the ?tenant= override and the edit toolbar appears).
function openLiveSite() {
  const token = getToken() ?? "";
  window.open(publicSiteUrl("", `cms=${encodeURIComponent(token)}`), "_blank", "noopener");
}

// Open the public website as a normal visitor would see it (no edit toolbar). The
// admin token rides in a #preview= hash purely so the server honors the ?tenant=
// override on a real tenant domain — it authorizes reads only, no edit affordances.
function previewLiveSite() {
  const token = getToken() ?? "";
  window.open(publicSiteUrl("", `preview=${encodeURIComponent(token)}`), "_blank", "noopener");
}

// Where each content section appears on the public website. Sections with a
// dedicated route open that page; homepage-only sections open the home page and
// scroll to the matching anchor (ids added to the corresponding <section>s).
const SECTION_PREVIEW: Record<SectionKey, { path: string; hash?: string }> = {
  "hero-headers":   { path: "" },
  events:           { path: "events" },
  gallery:          { path: "gallery" },
  faculty:          { path: "teachers" },
  facilities:       { path: "", hash: "facilities" },
  downloads:        { path: "downloads" },
  alumni:           { path: "alumni" },
  announcements:    { path: "", hash: "announcements" },
  results:          { path: "results" },
  "fee-structure":  { path: "fee-structure" },
  features:         { path: "", hash: "features" },
  testimonials:     { path: "", hash: "testimonials" },
  "quick-links":    { path: "", hash: "quicklinks" },
  "footer-links":   { path: "" },
  menu:             { path: "" },
  "site-settings":  { path: "" },
  "seo-visitors":   { path: "" },
};

// Build the public-website URL where the given section is displayed (tenant-scoped).
// Embedded in an admin iframe (same-origin in production), so the token rides in
// the query string to authorize the ?tenant= override for super-admins.
function sectionPreviewUrl(key: SectionKey) {
  const target = SECTION_PREVIEW[key];
  return publicSiteUrl(target.path, target.hash, getToken() ?? "");
}

// In-admin popup that embeds the live public website (scrollable) at the section's
// page/anchor so admins can preview a section without a full-site redirect.
function SectionPreviewDialog({
  sectionKey,
  onClose,
}: {
  sectionKey: SectionKey | null;
  onClose: () => void;
}) {
  const open = sectionKey !== null;
  const label = sectionKey ? SECTIONS.find(s => s.key === sectionKey)?.label ?? "" : "";
  const url = sectionKey ? sectionPreviewUrl(sectionKey) : "";
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFailed(false);
    // Stop the spinner if the embedded site never finishes loading.
    const t = setTimeout(() => setLoading(false), 12000);
    return () => clearTimeout(t);
  }, [sectionKey, open]);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0" data-testid="dialog-section-preview">
        <DialogHeader className="border-b border-slate-100 px-5 pb-3 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-sky-600" />
            {label} — live preview
          </DialogTitle>
          <DialogDescription className="text-xs">
            A snapshot of how this section looks on your live website.
          </DialogDescription>
        </DialogHeader>
        <div className="relative bg-slate-100" style={{ height: "75dvh" }}>
          {loading && !failed && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500">
              <p>Couldn’t load the preview here.</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-sky-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in a new tab instead
              </a>
            </div>
          )}
          {open && !failed && (
            <iframe
              key={url}
              src={url}
              title={`${label} preview`}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true); }}
              className="h-full w-full border-0"
              data-testid="iframe-section-preview"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-sky-600"
            data-testid="link-section-preview-newtab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Default section: a guided launcher for editing website text & images inline.
function InlineEditPanel() {
  const tips = [
    { icon: Pencil, title: "Edit any text", body: "Click a heading or paragraph on the live site and type. Click away to save." },
    { icon: ImageIcon, title: "Replace images", body: "Hover an image and choose “Change image” to upload a new one." },
    { icon: Eye, title: "Preview vs. edit", body: "Toggle between editing and preview from the toolbar at the bottom of the site." },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-6">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-sky-100 flex items-center justify-center">
            <Pencil className="h-5 w-5 text-sky-700" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Edit text &amp; images directly on your website</h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Open the live website in edit mode, then click any text to change it or hover an image to replace it.
              Edits save automatically and appear on the public site right away.
            </p>
          </div>
        </div>
        <div className="mt-5 md:pl-[60px]">
          <Button onClick={openLiveSite} size="lg" className="gap-2" data-testid="button-launch-inline">
            <ExternalLink className="h-4 w-4" />
            Open Website to Edit
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tips.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-card p-4 space-y-2">
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
              <Icon className="h-4 w-4 text-slate-600" />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
            <p className="text-xs text-slate-500">{body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Structured content — Events, Gallery, Teachers, Downloads and more — is managed from the sections in the left menu.
      </p>
    </div>
  );
}

// ─── SEO & VISITORS ───────────────────────────────────────────────────────────
// A self-contained dashboard with two views: visitor analytics (page views the
// public site reports via the /api/website/track beacon) and an on-demand SEO
// health check (run server-side against the public site's initial HTML). Google-
// connected features (Search Console / Analytics / PageSpeed) show graceful
// "not connected" states until an integration is wired up.

type SeoStatus = "pass" | "warn" | "fail";
type SeoCheck = { id: string; label: string; status: SeoStatus; detail: string };
type SeoPage = { path: string; status: number; score: number; checks: SeoCheck[] };
type SeoReport = {
  baseUrl: string | null;
  homeStatus?: number;
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number; avgScore: number };
  siteWide: SeoCheck[];
  pages: SeoPage[];
  note?: string;
};
type AnalyticsSummary = {
  totals: { views: number; visitors: number };
  trend: { day: string; views: number; visitors: number }[];
  topPages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
  countries: { country: string; views: number }[];
  devices: { device: string; views: number }[];
};

const RANGE_PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

function rangeParams(days: number): string {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `from=${fmt(from)}&to=${fmt(to)}`;
}

function StatPill({ status }: { status: SeoStatus }) {
  const map = {
    pass: { Icon: CheckCircle2, cls: "text-emerald-600" },
    warn: { Icon: AlertTriangle, cls: "text-amber-500" },
    fail: { Icon: XCircle, cls: "text-rose-600" },
  } as const;
  const { Icon, cls } = map[status];
  return <Icon className={`h-4 w-4 shrink-0 ${cls}`} />;
}

function deviceIcon(device: string) {
  if (device === "mobile") return Smartphone;
  if (device === "tablet") return LucideIcons.Tablet;
  if (device === "bot") return LucideIcons.Bot;
  return Monitor;
}

function BarRow({ label, value, max, icon: Icon }: { label: string; value: number; max: number; icon?: React.ComponentType<{ className?: string }> }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className="truncate text-sm text-slate-700" title={label}>{label}</span>
      </div>
      <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-slate-100 sm:block">
        <div className="h-full rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-800">{value.toLocaleString()}</span>
    </div>
  );
}

function GoogleNotConnectedCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <Globe className="h-4 w-4 text-slate-400" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
            <Badge variant="outline" className="text-slate-500">Not connected</Badge>
          </div>
          <p className="text-xs text-slate-500">{description}</p>
          <Button size="sm" variant="outline" className="mt-2 gap-1.5" disabled>
            <Link2 className="h-3.5 w-3.5" />
            Connect Google (coming soon)
          </Button>
        </div>
      </div>
    </div>
  );
}

function VisitorsView() {
  const [days, setDays] = useState(30);
  const [eventsPage, setEventsPage] = useState(1);

  const summaryQ = useQuery<AnalyticsSummary>({
    queryKey: ["/admin/website/analytics/summary", days],
    queryFn: () => apiFetch(`/api/admin/website/analytics/summary?${rangeParams(days)}`),
  });
  const eventsQ = useQuery<{ total: number; page: number; pageSize: number; rows: any[] }>({
    queryKey: ["/admin/website/analytics/events", days, eventsPage],
    queryFn: () => apiFetch(`/api/admin/website/analytics/events?${rangeParams(days)}&page=${eventsPage}&pageSize=10`),
  });

  const s = summaryQ.data;
  const maxPage = s ? Math.max(1, ...s.topPages.map(p => p.views)) : 1;
  const maxRef = s ? Math.max(1, ...s.referrers.map(p => p.views)) : 1;
  const maxCountry = s ? Math.max(1, ...s.countries.map(p => p.views)) : 1;
  const maxDevice = s ? Math.max(1, ...s.devices.map(p => p.views)) : 1;
  const totalPages = eventsQ.data ? Math.max(1, Math.ceil(eventsQ.data.total / eventsQ.data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Page views collected from your live website. No external account required.</p>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => { setDays(p.days); setEventsPage(1); }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${days === p.days ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              data-testid={`button-range-${p.days}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {summaryQ.isLoading ? (
        <div className="rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-400 animate-pulse">Loading visitor data…</div>
      ) : summaryQ.isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600">Failed to load visitor data.</div>
      ) : s ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Eye className="h-3.5 w-3.5" />Page Views</div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{s.totals.views.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Users className="h-3.5 w-3.5" />Unique Visitors</div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{s.totals.visitors.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><TrendingUp className="h-3.5 w-3.5" />Views / Visitor</div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{s.totals.visitors ? (s.totals.views / s.totals.visitors).toFixed(1) : "0"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Top Page</div>
              <p className="mt-2 truncate text-lg font-bold text-slate-900" title={s.topPages[0]?.path}>{s.topPages[0]?.path ?? "—"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Traffic over time</h3>
            {s.trend.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No visits recorded in this period yet.</div>
            ) : (
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <AreaChart data={s.trend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="vVisitors" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} width={40} />
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Area type="monotone" dataKey="views" name="Views" stroke="#0ea5e9" strokeWidth={2} fill="url(#vViews)" />
                    <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#6366f1" strokeWidth={2} fill="url(#vVisitors)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Top pages</h3>
              <div className="space-y-2.5">
                {s.topPages.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p>
                  : s.topPages.slice(0, 8).map(p => <BarRow key={p.path} label={p.path} value={p.views} max={maxPage} />)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Top referrers</h3>
              <div className="space-y-2.5">
                {s.referrers.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p>
                  : s.referrers.slice(0, 8).map(r => <BarRow key={r.host} label={r.host} value={r.views} max={maxRef} icon={Link2} />)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Devices</h3>
              <div className="space-y-2.5">
                {s.devices.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p>
                  : s.devices.map(d => <BarRow key={d.device} label={d.device.charAt(0).toUpperCase() + d.device.slice(1)} value={d.views} max={maxDevice} icon={deviceIcon(d.device)} />)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Countries</h3>
              <div className="space-y-2.5">
                {s.countries.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p>
                  : s.countries.slice(0, 8).map(c => <BarRow key={c.country} label={c.country} value={c.views} max={maxCountry} icon={LucideIcons.MapPin} />)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Recent visits</h3>
            {eventsQ.data && eventsQ.data.rows.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">Page</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Device</th>
                        <th className="py-2">Country</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventsQ.data.rows.map(r => (
                        <tr key={r.id} className="border-b border-slate-50">
                          <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="py-2 pr-3 font-medium text-slate-700">{r.path}</td>
                          <td className="py-2 pr-3 text-slate-500">{r.referrerHost || "Direct"}</td>
                          <td className="py-2 pr-3 capitalize text-slate-500">{r.deviceType}{r.browser ? ` · ${r.browser}` : ""}</td>
                          <td className="py-2 text-slate-500">{r.country || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>{eventsQ.data.total.toLocaleString()} total visits</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7" disabled={eventsPage <= 1} onClick={() => setEventsPage(p => Math.max(1, p - 1))}>Prev</Button>
                    <span>Page {eventsPage} / {totalPages}</span>
                    <Button size="sm" variant="outline" className="h-7" disabled={eventsPage >= totalPages} onClick={() => setEventsPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">No visits recorded yet.</p>
            )}
          </div>

          <GoogleNotConnectedCard
            title="Google Analytics"
            description="Connect Google Analytics for cross-device sessions, engagement time, conversions and demographics alongside this built-in tracking."
          />
        </>
      ) : null}
    </div>
  );
}

function SeoView() {
  const [report, setReport] = useState<SeoReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPage, setOpenPage] = useState<string | null>(null);
  const { toast } = useToast();

  async function runCheck() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/admin/website/seo/check");
      setReport(data);
    } catch (e: any) {
      setError(e?.message || "Failed to run SEO check");
      toast({ title: "SEO check failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runCheck(); /* eslint-disable-next-line */ }, []);

  const scoreColor = (n: number) => n >= 80 ? "text-emerald-600" : n >= 50 ? "text-amber-500" : "text-rose-600";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">On-page &amp; site-wide SEO health, checked against your live site’s initial HTML.</p>
        <Button size="sm" onClick={runCheck} disabled={loading} className="gap-1.5" data-testid="button-run-seo-check">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Checking…" : "Re-run check"}
        </Button>
      </div>

      {loading && !report ? (
        <div className="rounded-lg border border-slate-200 p-10 text-center text-sm text-slate-400 animate-pulse">Running SEO checks against your website…</div>
      ) : error && !report ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600">{error}</div>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Gauge className="h-3.5 w-3.5" />Avg page score</div>
              <p className={`mt-2 text-2xl font-bold ${scoreColor(report.summary.avgScore)}`}>{report.summary.avgScore}<span className="text-base text-slate-400">/100</span></p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Passing</div>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{report.summary.pass}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Warnings</div>
              <p className="mt-2 text-2xl font-bold text-amber-500">{report.summary.warn}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><XCircle className="h-3.5 w-3.5 text-rose-600" />Failing</div>
              <p className="mt-2 text-2xl font-bold text-rose-600">{report.summary.fail}</p>
            </div>
          </div>

          {report.note && (
            <p className="text-xs text-slate-400">
              {report.note}{report.baseUrl ? ` · Checked ${report.baseUrl}` : ""}
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Site-wide checks</h3>
            <div className="space-y-2">
              {report.siteWide.map(c => (
                <div key={c.id} className="flex items-start gap-2.5 rounded-md px-1 py-1.5">
                  <StatPill status={c.status} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-slate-700">{c.label}</span>
                    <span className="ml-2 text-xs text-slate-400">{c.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">Pages ({report.pages.length})</h3>
            {report.pages.length === 0 ? (
              <p className="text-sm text-slate-400">No pages were checked.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {report.pages.map(p => {
                  const open = openPage === p.path;
                  return (
                    <div key={p.path}>
                      <button
                        onClick={() => setOpenPage(open ? null : p.path)}
                        className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
                        data-testid={`button-seo-page-${p.path}`}
                      >
                        <span className={`w-10 shrink-0 text-sm font-bold tabular-nums ${scoreColor(p.score)}`}>{p.score}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{p.path}</span>
                        <span className="hidden gap-1 sm:flex">
                          {p.checks.filter(c => c.status === "fail").length > 0 && <Badge variant="outline" className="text-rose-600 border-rose-200">{p.checks.filter(c => c.status === "fail").length} fail</Badge>}
                          {p.checks.filter(c => c.status === "warn").length > 0 && <Badge variant="outline" className="text-amber-600 border-amber-200">{p.checks.filter(c => c.status === "warn").length} warn</Badge>}
                        </span>
                        <span className="text-xs text-slate-400">{p.status || "—"}</span>
                      </button>
                      {open && (
                        <div className="space-y-2 bg-slate-50/60 px-3 py-3">
                          {p.checks.map(c => (
                            <div key={c.id} className="flex items-start gap-2.5">
                              <StatPill status={c.status} />
                              <div className="min-w-0 flex-1">
                                <span className="text-sm text-slate-700">{c.label}</span>
                                <span className="ml-2 text-xs text-slate-400">{c.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GoogleNotConnectedCard
              title="Google Search Console"
              description="Connect Search Console to see impressions, clicks, average position and the exact queries bringing visitors from Google."
            />
            <GoogleNotConnectedCard
              title="PageSpeed Insights"
              description="Connect PageSpeed Insights for Core Web Vitals (LCP, CLS, INP) and Google’s real-world performance scores."
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function SeoVisitorsTab() {
  const [view, setView] = useState<"seo" | "visitors">("visitors");
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          onClick={() => setView("visitors")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === "visitors" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          data-testid="button-view-visitors"
        >
          <BarChart3 className="h-4 w-4" />Visitors
        </button>
        <button
          onClick={() => setView("seo")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === "seo" ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          data-testid="button-view-seo"
        >
          <Gauge className="h-4 w-4" />SEO Status
        </button>
      </div>
      {view === "visitors" ? <VisitorsView /> : <SeoView />}
    </div>
  );
}


// ─── SECTION TAB ROUTER ───────────────────────────────────────────────────────

function SectionTabContent({ sectionKey }: { sectionKey: SectionKey }) {
  if (sectionKey === "menu")          return <MenuTab />;
  if (sectionKey === "hero-headers")  return <HeroHeadersTab />;
  if (sectionKey === "announcements") return <AnnouncementsTab />;
  if (sectionKey === "events")        return <EventsTab />;
  if (sectionKey === "gallery")       return <GalleryTab />;
  if (sectionKey === "downloads")     return <DownloadsTab />;
  if (sectionKey === "faculty")       return <FacultyTab />;
  if (sectionKey === "fee-structure") return <FeeStructureTab />;
  if (sectionKey === "testimonials")  return <TestimonialsTab />;
  if (sectionKey === "alumni")        return <AlumniTab />;
  if (sectionKey === "features")      return <FeaturesTab />;
  if (sectionKey === "facilities")    return <FacilitiesTab />;
  if (sectionKey === "quick-links")   return <QuickLinksTab />;
  if (sectionKey === "footer-links")  return <FooterMenuTab />;
  if (sectionKey === "results")       return <ResultsTab />;
  if (sectionKey === "site-settings") return <SiteSettingsTab />;
  if (sectionKey === "seo-visitors")  return <SeoVisitorsTab />;
  return null;
}

// ─── SECTION CARD BODY VARIANTS ───────────────────────────────────────────────

function InlineSectionBody({ desc }: { desc: string }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-sky-100 flex items-center justify-center">
          <Pencil className="h-4 w-4 text-sky-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Edited directly on the live website</p>
          <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
        </div>
      </div>
      <Button onClick={openLiveSite} size="sm" className="gap-2">
        <ExternalLink className="h-3.5 w-3.5" />
        Open Inline Editor
      </Button>
    </div>
  );
}

function ExternalSectionBody({ moduleLabel, href, desc }: { moduleLabel: string; href: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center">
          <ExternalLink className="h-4 w-4 text-slate-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Managed in {moduleLabel}</p>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
      </div>
      <a href={href}>
        <Button size="sm" variant="outline" className="gap-2">
          <ExternalLink className="h-3.5 w-3.5" />
          Go to {moduleLabel}
        </Button>
      </a>
    </div>
  );
}

// ─── ACCORDION CARD ───────────────────────────────────────────────────────────

function SectionAccordionCard({
  spec, expanded, onToggle, onPreview,
}: {
  spec: SectionSpec;
  expanded: boolean;
  onToggle: () => void;
  onPreview?: (key: SectionKey) => void;
}) {
  const label = spec.type === "editor"
    ? (SECTIONS.find(s => s.key === spec.key)?.label ?? spec.key)
    : spec.label;
  const Icon = spec.type === "editor"
    ? (SECTIONS.find(s => s.key === spec.key)?.icon ?? LucideIcons.Layers)
    : spec.icon;
  const sectionKey = spec.type === "editor" ? spec.key : null;

  const [hovered, setHovered] = useState(false);
  const [thumbReady, setThumbReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const previewUrl = sectionKey ? sectionPreviewUrl(sectionKey) : null;
  const canThumb = !!previewUrl && !!sectionKey;

  return (
    <div
      className={`rounded-xl border bg-white transition-shadow ${expanded ? "border-sky-200 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
      onMouseEnter={() => {
        if (canThumb) { setHovered(true); setThumbReady(true); }
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row — not a single <button> so the iframe thumbnail can live alongside (iframes inside <button> are invalid HTML) */}
      <div className="flex w-full items-center gap-2 px-4 py-3.5">
        {/* Main toggle area */}
        <button
          type="button"
          className="flex flex-1 items-center gap-3 min-w-0 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate text-sm font-semibold text-slate-800">{label}</span>
        </button>

        {/* Mini-preview thumbnail — lazy: iframe src only set after first hover */}
        {canThumb && (
          <div
            aria-hidden="true"
            className={`relative shrink-0 overflow-hidden rounded border bg-slate-100 transition-all duration-200 ${
              hovered ? "w-[120px] opacity-100 border-slate-300" : "w-0 opacity-0 border-transparent"
            }`}
            style={{ height: 68 }}
            title={`${label} — live site preview`}
          >
            {thumbFailed ? (
              <div className="flex h-full w-[120px] items-center justify-center gap-1 text-xs text-slate-400">
                <ExternalLink className="h-3 w-3" />
                <span>No preview</span>
              </div>
            ) : thumbReady ? (
              <iframe
                src={previewUrl}
                style={{
                  width: 1200,
                  height: 680,
                  transform: "scale(0.1)",
                  transformOrigin: "top left",
                  border: "none",
                  pointerEvents: "none",
                }}
                onError={() => setThumbFailed(true)}
                tabIndex={-1}
                aria-hidden="true"
                title={`${label} preview thumbnail`}
              />
            ) : null}
          </div>
        )}

        {/* Eye / full-preview button */}
        {sectionKey && onPreview && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onPreview(sectionKey); }}
            title={`Preview "${label}" on the website`}
            aria-label={`Preview ${label}`}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-sky-600 transition-colors"
            data-testid={`button-preview-section-${sectionKey}`}
          >
            <Eye className="h-4 w-4" />
          </button>
        )}

        {/* Chevron toggle */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
          className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4">
          {spec.type === "editor"   && <SectionTabContent sectionKey={spec.key} />}
          {spec.type === "inline"   && <InlineSectionBody desc={spec.desc} />}
          {spec.type === "external" && <ExternalSectionBody moduleLabel={spec.moduleLabel} href={spec.href} desc={spec.desc} />}
        </div>
      )}
    </div>
  );
}

// ─── PAGE VIEW ────────────────────────────────────────────────────────────────

function PageView({ page, defaultOpen, onPreview }: {
  page: PageDef;
  defaultOpen?: string | null;
  onPreview: (key: SectionKey) => void;
}) {
  // For single-section pages, auto-expand. Otherwise expand by key match or nothing.
  const autoFirst: string | null =
    page.sections.length === 1
      ? (page.sections[0].type === "editor" ? page.sections[0].key : page.sections[0].label)
      : (defaultOpen ?? null);

  const [open, setOpen] = useState<string | null>(autoFirst);

  useEffect(() => {
    if (defaultOpen) setOpen(defaultOpen);
  }, [defaultOpen]);

  function sectionId(s: SectionSpec): string {
    return s.type === "editor" ? s.key : s.label;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-800">{page.label} Page</h2>
        <p className="text-xs text-slate-500 mt-0.5">{page.desc}</p>
      </div>
      {page.sections.map(spec => {
        const id = sectionId(spec);
        return (
          <SectionAccordionCard
            key={id}
            spec={spec}
            expanded={open === id}
            onToggle={() => setOpen(p => p === id ? null : id)}
            onPreview={onPreview}
          />
        );
      })}
    </div>
  );
}

// ─── SITE-WIDE FULL-WIDTH VIEW ────────────────────────────────────────────────

function SiteWideEditorView({ sectionKey, onPreview }: { sectionKey: SectionKey; onPreview: (key: SectionKey) => void }) {
  const sw = SITE_WIDE.find(s => s.key === sectionKey);
  const label = sw?.label ?? sectionKey;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{label}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Site-wide — applies to every page of your website.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => onPreview(sectionKey)} data-testid={`button-preview-section-${sectionKey}`}>
          <Eye className="h-4 w-4" />
          Preview
        </Button>
      </div>
      <SectionTabContent sectionKey={sectionKey} />
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function WebsitePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);

  // Back-compat: ?section=key or ?tab=key → map to new ?page= scheme
  const sectionParam = params.get("section") ?? params.get("tab");
  let requestedPage = params.get("page");
  let requestedOpen = params.get("open");

  if (!requestedPage && sectionParam) {
    if (sectionParam === "inline") {
      requestedPage = "inline";
    } else {
      const mapped = SECTION_TO_PAGE[sectionParam as SectionKey];
      if (mapped) {
        requestedPage = mapped;
        // If the mapped page is the same as the sectionKey, it's a site-wide editor — no open param needed
        if (mapped !== sectionParam) requestedOpen = sectionParam;
      }
    }
  }

  const activePage = requestedPage ?? "home";
  const pageDef = PAGES.find(p => p.key === activePage) ?? null;
  const siteWideDef = SITE_WIDE.find(sw => sw.key === activePage) ?? null;

  const [previewKey, setPreviewKey] = useState<SectionKey | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "#0ea5e920" }}>
          <Globe className="h-5 w-5" style={{ color: "#0ea5e9" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Website Content</h1>
          <p className="text-sm text-slate-500">Edit website text &amp; images inline, or manage content sections</p>
        </div>
        <TenantSelector />
        <Button variant="outline" className="ml-auto gap-2" onClick={previewLiveSite} data-testid="button-preview-website">
          <Eye className="h-4 w-4" />
          Preview Website
        </Button>
        <Button variant="outline" className="gap-2" onClick={openLiveSite} data-testid="button-edit-live-site">
          <ExternalLink className="h-4 w-4" />
          Edit Website Inline
        </Button>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* Left sidebar */}
        <nav className="flex shrink-0 flex-col md:w-52">
          <a
            href="?page=inline"
            className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${
              activePage === "inline"
                ? "bg-sky-50 text-sky-700"
                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Pencil className="h-4 w-4 shrink-0" />
            Edit Inline
          </a>

          <p className="px-3.5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pages</p>
          {PAGES.map(p => {
            const Icon = p.icon;
            const active = activePage === p.key;
            return (
              <a key={p.key} href={`?page=${p.key}`}
                className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-sky-50 text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {p.label}
              </a>
            );
          })}

          <p className="px-3.5 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Site-wide</p>
          {SITE_WIDE.map(sw => {
            const Icon = sw.icon;
            const active = activePage === sw.key;
            return (
              <a key={sw.key} href={`?page=${sw.key}`}
                className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-sky-50 text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sw.label}
              </a>
            );
          })}
        </nav>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {activePage === "inline" && <InlineEditPanel />}
          {pageDef && (
            <PageView page={pageDef} defaultOpen={requestedOpen} onPreview={setPreviewKey} />
          )}
          {siteWideDef && (
            <SiteWideEditorView sectionKey={siteWideDef.key} onPreview={setPreviewKey} />
          )}
          {!pageDef && !siteWideDef && activePage !== "inline" && (
            <PageView page={PAGES[0]} defaultOpen={null} onPreview={setPreviewKey} />
          )}
        </div>
      </div>

      <SectionPreviewDialog sectionKey={previewKey} onClose={() => setPreviewKey(null)} />
    </div>
  );
}
