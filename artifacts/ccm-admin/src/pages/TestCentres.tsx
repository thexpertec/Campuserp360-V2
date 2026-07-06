import { useState, useMemo, useRef } from "react";
import { formatPhone } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminTestCentres,
  getListAdminTestCentresQueryKey,
  getListActiveTestCentresQueryKey,
  useCreateAdminTestCentre,
  useUpdateAdminTestCentre,
  useDeleteAdminTestCentre,
  type TestCentre,
  type TestCentreInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  MapPin, Plus, Minus, Pencil, Trash2, Loader2, Phone, User, Mail, Hash,
  Building2, Download, ArrowUpDown, ArrowUp, ArrowDown, Rows3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Local pref hook ──────────────────────────────────────────────────────────

function useLocalPref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : fallback; }
    catch { return fallback; }
  });
  function update(v: T) { setVal(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  return [val, update];
}

// ─── Density ──────────────────────────────────────────────────────────────────

type Density = "compact" | "comfortable" | "spacious";

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact",     label: "Compact"     },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious",    label: "Spacious"    },
];

const DENSITY_PY: Record<Density, string> = {
  compact:     "[&>td]:py-1",
  comfortable: "[&>td]:py-2.5",
  spacious:    "[&>td]:py-4",
};

function DensityMenu({ density, setDensity }: { density: Density; setDensity: (d: Density) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs">
          <Rows3 className="h-3.5 w-3.5" /> Density
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400">Row density</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DENSITY_OPTIONS.map(o => (
          <DropdownMenuItem key={o.value} onClick={() => setDensity(o.value)}
            className={cn("text-xs font-medium", density === o.value && "font-bold text-indigo-600")}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Sort helpers ──────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null;

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
  if (sortDir === "asc")  return <ArrowUp   className="ml-1 h-3 w-3 inline text-indigo-500" />;
  return <ArrowDown className="ml-1 h-3 w-3 inline text-indigo-500" />;
}

// ─── Types & form ─────────────────────────────────────────────────────────────

type VenueType = "test" | "interview" | "both";

const VENUE_TYPE_OPTIONS: { value: VenueType; label: string; color: string }[] = [
  { value: "test",      label: "Entry Test Only",  color: "bg-violet-100 text-violet-800" },
  { value: "interview", label: "Interview Only",    color: "bg-cyan-100 text-cyan-800" },
  { value: "both",      label: "Test & Interview", color: "bg-emerald-100 text-emerald-800" },
];

type TCRow = {
  _rowId: string;
  name: string;
  city: string;
  centreCode: string;
  address: string;
  focalPerson: string;
  phone: string;
  venueType: VenueType;
  active: boolean;
  sortOrder: string;
};

function mkTCRow(): TCRow {
  return { _rowId: crypto.randomUUID(), name: "", city: "", centreCode: "", address: "", focalPerson: "", phone: "", venueType: "test", active: true, sortOrder: "0" };
}

function tcPayload(row: TCRow): TestCentreInput {
  return {
    name:        row.name.trim(),
    city:        row.city.trim(),
    centreCode:  row.centreCode.trim().toUpperCase() || undefined,
    address:     row.address.trim() || undefined,
    focalPerson: row.focalPerson.trim() || undefined,
    phone:       row.phone.trim() || undefined,
    venueType:   row.venueType,
    active:      row.active,
    sortOrder:   Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TestCentres() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: centres, isLoading } = useListAdminTestCentres();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<TestCentre | null>(null);
  const [rows, setRows]             = useState<TCRow[]>([mkTCRow()]);
  const [busy, setBusy]             = useState(false);
  const gridRef                     = useRef<HTMLDivElement>(null);
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [density, setDensity]       = useLocalPref<Density>("ccm_tc_density_v1", "comfortable");
  const [sortCol, setSortCol]       = useState("name");
  const [sortDir, setSortDir]       = useState<SortDir>("asc");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListAdminTestCentresQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListActiveTestCentresQueryKey() });
  }

  const createMutation = useCreateAdminTestCentre();
  const updateMutation = useUpdateAdminTestCentre();
  const deleteMutation = useDeleteAdminTestCentre({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Centre removed" }); },
      onError: () => toast({ title: "Could not delete", description: "Please try again.", variant: "destructive" }),
    },
  });

  function openAdd() { setEditing(null); setRows([mkTCRow()]); setDialogOpen(true); }
  function openEdit(centre: TestCentre) {
    setEditing(centre);
    setRows([{ _rowId: crypto.randomUUID(), name: centre.name, city: centre.city, centreCode: centre.centreCode ?? "", address: centre.address ?? "", focalPerson: centre.focalPerson ?? "", phone: centre.phone ?? "", venueType: (centre.venueType as VenueType) ?? "test", active: centre.active, sortOrder: String(centre.sortOrder ?? 0) }]);
    setDialogOpen(true);
  }
  function updRow(rowId: string, k: keyof TCRow, v: string | boolean) {
    setRows(p => p.map(r => r._rowId === rowId ? { ...r, [k]: v } : r));
  }
  function addRow() { setRows(p => [...p, mkTCRow()]); }
  function removeRow(rowId: string) { setRows(p => p.length > 1 ? p.filter(r => r._rowId !== rowId) : p); }
  function focusCell(ri: number, ci: number) {
    gridRef.current?.querySelector<HTMLElement>(`[data-r="${ri}"][data-c="${ci}"]`)?.focus();
  }
  function nav(e: React.KeyboardEvent, ri: number, ci: number) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, ci), 20); } else focusCell(ri + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (ri > 0) focusCell(ri - 1, ci); }
    else if (e.key === "Enter") { e.preventDefault(); if (ri === rows.length - 1) { addRow(); setTimeout(() => focusCell(ri + 1, 0), 20); } else focusCell(ri + 1, 0); }
  }

  async function handleSave() {
    const valid = rows.filter(r => r.name.trim() && r.city.trim() && r.centreCode.trim());
    if (!valid.length) { toast({ title: "Name, City and Code are required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: tcPayload(valid[0]) });
        toast({ title: "Centre updated" });
      } else {
        for (const row of valid) await createMutation.mutateAsync({ data: tcPayload(row) });
        toast({ title: `${valid.length} centre${valid.length > 1 ? "s" : ""} added` });
      }
      invalidate(); setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Could not save", description: err?.response?.data?.error ?? "Check the name is unique.", variant: "destructive" });
    } finally { setBusy(false); }
  }

  function cycleSort(col: string) {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); return; }
    if (sortDir === "asc")  { setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortCol("name"); setSortDir("asc"); }
  }

  function exportCSV() {
    const header = ["Code","Centre Name","City","Address","Focal Person","Phone","Email","Status"].join(",");
    const rows = (centres ?? []).map(c => [
      c.centreCode ?? "",
      c.name,
      c.city,
      c.address ?? "",
      c.focalPerson ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.active ? "Active" : "Inactive",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: `entry-test-centres-${new Date().toISOString().slice(0,10)}.csv` }).click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported", description: `${rows.length} centres` });
  }

  const filtered = useMemo(() => {
    let list = centres ?? [];
    if (filterActive === "active")   list = list.filter(c => c.active);
    if (filterActive === "inactive") list = list.filter(c => !c.active);
    return [...list].sort((a, b) => {
      let av = "", bv = "";
      if (sortCol === "name")        { av = a.name;        bv = b.name; }
      else if (sortCol === "city")   { av = a.city;        bv = b.city; }
      else if (sortCol === "code")   { av = a.centreCode ?? ""; bv = b.centreCode ?? ""; }
      const cmp = av.localeCompare(bv);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [centres, filterActive, sortCol, sortDir]);

  const totalActive   = (centres ?? []).filter(c => c.active).length;
  const totalInactive = (centres ?? []).filter(c => !c.active).length;

  function Th({ col, children, className }: { col?: string; children: React.ReactNode; className?: string }) {
    if (!col) return <th className={cn("px-3 py-2.5 text-left", className)}>{children}</th>;
    return (
      <th
        className={cn("px-3 py-2.5 text-left cursor-pointer select-none hover:text-slate-700 transition-colors", className)}
        onClick={() => cycleSort(col)}
      >
        {children}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </th>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entry Test Centres</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage centres where the entry test is conducted. Active centres appear in the admit card and schedule dialogs.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Centre
        </Button>
      </div>

      {/* KPI strip */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-3 text-sm flex-1">
            <span className="text-slate-500">
              <span className="font-bold text-slate-800">{(centres ?? []).length}</span> centres
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">
              <span className="font-bold text-emerald-700">{totalActive}</span> active
            </span>
            {totalInactive > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400 text-xs">{totalInactive} inactive</span>
              </>
            )}
          </div>
          {/* Status filter pills */}
          <div className="flex items-center gap-1.5">
            {([
              { value: "all",      label: "All"      },
              { value: "active",   label: "Active"   },
              { value: "inactive", label: "Inactive" },
            ] as const).map(f => (
              <button key={f.value} onClick={() => setFilterActive(f.value)}
                className={cn("px-3 py-1 rounded-full text-xs font-semibold transition-colors",
                  filterActive === f.value
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-slate-50/60">
          <div className="flex items-center gap-1.5">
            <DensityMenu density={density} setDensity={setDensity} />
            <div className="h-4 w-px bg-slate-200" />
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-slate-600 font-semibold text-xs" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            {isLoading ? "Loading…" : `${filtered.length} centres`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold">
                <th className="px-3 py-2.5 text-center w-10">#</th>
                <Th col="code"  className="min-w-[90px]">Code</Th>
                <Th col="name"  className="min-w-[180px]">Centre Name</Th>
                <Th col="city"  className="min-w-[110px]">City</Th>
                <th className="px-3 py-2.5 text-left min-w-[200px]">Address</th>
                <th className="px-3 py-2.5 text-left min-w-[130px]">Focal Person</th>
                <th className="px-3 py-2.5 text-left min-w-[130px]">Phone</th>
                <th className="px-3 py-2.5 text-center min-w-[80px]">Status</th>
                <th className="px-3 py-2.5 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><Skeleton className="h-4 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <MapPin className="h-10 w-10 text-slate-200" />
                      <p className="font-semibold text-slate-500">
                        {(centres ?? []).length === 0 ? "No centres yet" : "No centres match this filter"}
                      </p>
                      {(centres ?? []).length === 0 && (
                        <Button size="sm" onClick={openAdd}>
                          <Plus className="mr-2 h-4 w-4" /> Add First Centre
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((centre, idx) => (
                  <tr key={centre.id} className={cn("border-b border-slate-100 hover:bg-slate-50/70 transition-colors", DENSITY_PY[density])}>
                    <td className="px-3 py-2.5 text-center text-slate-400 text-xs font-semibold">{idx + 1}</td>

                    <td className="px-3 py-2.5">
                      {centre.centreCode ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md">
                          <Hash className="h-3 w-3" />{centre.centreCode}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        <span className="font-semibold text-slate-800">{centre.name}</span>
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 text-slate-600">
                        <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        {centre.city}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-slate-500 text-xs max-w-[220px]">
                      <span className="line-clamp-2">{centre.address || <span className="text-slate-300">—</span>}</span>
                    </td>

                    <td className="px-3 py-2.5">
                      {centre.focalPerson ? (
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <User className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span>{centre.focalPerson}</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      {centre.phone ? (
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                          <Phone className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span>{centre.phone}</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <Badge className={cn(
                        "text-xs border-0 font-semibold",
                        centre.active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-100"
                      )}>
                        {centre.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-indigo-600"
                          onClick={() => openEdit(centre)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{centre.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the centre. Existing applications keep their stored centre name. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: centre.id })}
                              >Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Spreadsheet Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[1120px] w-[96vw] p-0 gap-0 overflow-hidden">

          <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">{editing ? "Edit Centre" : "Add Test Centres"}</h2>
              <p className="text-sm text-slate-500 mt-0.5">{editing ? "Update centre details." : "Add multiple test centres at once — each row becomes one centre."}</p>
            </div>
            {!editing && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 font-mono shrink-0 ml-4">
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">↑↓</span> rows &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Tab</span> columns &nbsp;
                <span className="bg-white border border-slate-200 rounded px-1 py-0.5">Enter</span> next row
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[44vh] overflow-y-auto" ref={gridRef}>
            <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ minWidth: 190 }} /><col style={{ minWidth: 110 }} /><col style={{ minWidth: 100 }} />
                <col style={{ minWidth: 180 }} /><col style={{ minWidth: 130 }} /><col style={{ minWidth: 130 }} />
                <col style={{ minWidth: 140 }} /><col style={{ width: 62 }} /><col style={{ width: 62 }} />
                <col style={{ width: 38 }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b-2 border-slate-200 select-none">
                  <th className="py-2.5 text-center text-[10px] text-slate-400 border-r border-slate-200">#</th>
                  {[
                    { l: "Name", req: true }, { l: "City", req: true }, { l: "Code (mono)", req: true },
                    { l: "Address" }, { l: "Focal Person" }, { l: "Phone" },
                    { l: "Venue Type" }, { l: "Sort" }, { l: "Active" },
                  ].map(({ l, req }) => (
                    <th key={l} className="px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-r border-slate-200 last:border-r-0 whitespace-nowrap">
                      {l}{req && <span className="text-red-400 ml-0.5">*</span>}
                    </th>
                  ))}
                  <th className="border-l border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={row._rowId} className={cn("border-b border-slate-100", ri % 2 === 0 ? "bg-white" : "bg-slate-50/30")}>
                    <td className="text-center text-[11px] text-slate-400 border-r border-slate-100 select-none font-mono">{ri + 1}</td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={0} value={row.name} placeholder="e.g. Islamabad Hall"
                        onChange={e => updRow(row._rowId, "name", e.target.value)} onKeyDown={e => nav(e, ri, 0)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={1} value={row.city} placeholder="Islamabad"
                        onChange={e => updRow(row._rowId, "city", e.target.value)} onKeyDown={e => nav(e, ri, 1)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={2} value={row.centreCode} placeholder="ISB-01"
                        onChange={e => updRow(row._rowId, "centreCode", e.target.value.toUpperCase())} onKeyDown={e => nav(e, ri, 2)}
                        className="w-full h-9 px-2.5 text-sm font-mono uppercase bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={3} value={row.address} placeholder="Full address"
                        onChange={e => updRow(row._rowId, "address", e.target.value)} onKeyDown={e => nav(e, ri, 3)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={4} value={row.focalPerson} placeholder="Contact name"
                        onChange={e => updRow(row._rowId, "focalPerson", e.target.value)} onKeyDown={e => nav(e, ri, 4)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={5} value={row.phone} placeholder="0300-0000000" maxLength={12}
                        onChange={e => updRow(row._rowId, "phone", formatPhone(e.target.value))} onKeyDown={e => nav(e, ri, 5)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors placeholder:text-slate-300" />
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <select data-r={ri} data-c={6} value={row.venueType}
                        onChange={e => updRow(row._rowId, "venueType", e.target.value as VenueType)}
                        className="w-full h-9 px-2.5 text-sm bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors cursor-pointer pr-1">
                        {VENUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="p-0 border-r border-slate-100">
                      <input data-r={ri} data-c={7} type="number" min={0} value={row.sortOrder}
                        onChange={e => updRow(row._rowId, "sortOrder", e.target.value)} onKeyDown={e => nav(e, ri, 7)}
                        className="w-full h-9 px-2.5 text-sm text-right bg-transparent border-0 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-300 transition-colors" />
                    </td>
                    <td className="border-r border-slate-100 text-center align-middle">
                      <input data-r={ri} data-c={8} type="checkbox" checked={row.active}
                        onChange={e => updRow(row._rowId, "active", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 accent-emerald-600 cursor-pointer" />
                    </td>
                    <td className="text-center align-middle">
                      <button onClick={() => removeRow(row._rowId)} disabled={rows.length === 1}
                        className="h-9 w-9 flex items-center justify-center mx-auto text-slate-300 hover:text-red-500 disabled:opacity-0 disabled:cursor-not-allowed transition-colors">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!editing && (
            <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60">
              <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition-colors font-medium">
                <Plus className="h-3.5 w-3.5" /> Add Row
              </button>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
            {(() => {
              const ready = rows.filter(r => r.name.trim() && r.city.trim() && r.centreCode.trim()).length;
              return (
                <>
                  <p className="text-xs text-slate-400">
                    {ready > 0 ? <><span className="font-semibold text-slate-700">{ready}</span> of {rows.length} rows ready</> : <span className="text-amber-500">Fill Name + City + Code to enable save</span>}
                  </p>
                  <div className="flex gap-2.5">
                    <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>Cancel</Button>
                    <Button onClick={handleSave} disabled={busy || ready === 0}>
                      {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      {editing ? "Save Changes" : `Save ${ready} Centre${ready !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
