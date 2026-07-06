import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit2, CalendarDays,
  Sun, Users, BarChart2, ListIcon,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, Legend,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? `Request failed (${res.status})`);
  return json as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Audience = "students" | "staff";
type HolidayCategory = "national" | "religious" | "event" | "institutional" | "other";

interface AcademicYear { id: string; name: string; active: boolean; isDefault: boolean }
interface WeekendConfig {
  yearId: string; audience: string;
  mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean;
  notes: string | null;
}
interface Holiday {
  id: string; yearId: string; audience: string; date: string;
  name: string; category: HolidayCategory; notes: string | null;
}
interface Stats {
  totalDays: number; weekendDays: number; holidayDays: number; workingDays: number;
  byMonth: { month: string; working: number; weekend: number; holiday: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_OF_WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const CATEGORIES: { value: HolidayCategory; label: string; color: string }[] = [
  { value: "national",      label: "National Day",   color: "#16a34a" },
  { value: "religious",     label: "Religious",      color: "#7c3aed" },
  { value: "event",         label: "Event",          color: "#0ea5e9" },
  { value: "institutional", label: "Institutional",  color: "#d97706" },
  { value: "other",         label: "Other",          color: "#64748b" },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const CHART_COLORS = { working: "#4ade80", weekend: "#94a3b8", holiday: "#f59e0b" };

// ── Holiday form dialog ───────────────────────────────────────────────────────
function HolidayDialog({
  open, onClose, yearId, audience, editing,
  onSaved,
}: {
  open: boolean; onClose: () => void; yearId: string; audience: Audience;
  editing: Holiday | null; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate]         = useState("");
  const [name, setName]         = useState("");
  const [category, setCategory] = useState<HolidayCategory>("other");
  const [notes, setNotes]       = useState("");

  useEffect(() => {
    if (open) {
      setDate(editing?.date ?? "");
      setName(editing?.name ?? "");
      setCategory((editing?.category as HolidayCategory) ?? "other");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        return apiFetch(`/api/admin/calendar/holidays/${editing.id}`, {
          method: "PUT", body: JSON.stringify({ date, name, category, notes: notes || null }),
        });
      } else {
        return apiFetch("/api/admin/calendar/holidays", {
          method: "POST",
          body: JSON.stringify({ yearId, audience, date, name, category, notes: notes || null }),
        });
      }
    },
    onSuccess: () => { toast({ title: editing ? "Holiday updated" : "Holiday added" }); onSaved(); onClose(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Holiday Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eid-ul-Fitr" className="h-9 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
            <Select value={category} onValueChange={v => setCategory(v as HolidayCategory)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details…" className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => mut.mutate()} disabled={!date || !name || mut.isPending}>
            {mut.isPending ? "Saving…" : editing ? "Update" : "Add Holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SchoolCalendar() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const today      = new Date();
  const [yearId, setYearId]     = useState("");
  const [audience, setAudience] = useState<Audience>("students");
  const [tab, setTab]           = useState<"calendar" | "list">("calendar");
  const [month, setMonth]       = useState(today.getMonth());
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editing, setEditing]         = useState<Holiday | null>(null);

  // Weekend config local state
  const [wknd, setWknd] = useState<Record<string, boolean>>({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: true, sun: true });

  // ── Data fetches ────────────────────────────────────────────────────────────
  const { data: years = [] } = useQuery<AcademicYear[]>({
    queryKey: ["academic-years"],
    queryFn: () => apiFetch("/api/admin/academic-years"),
  });

  // Auto-select default year
  useEffect(() => {
    if (years.length && !yearId) {
      const def = years.find(y => y.isDefault) ?? years[0];
      setYearId(def.id);
    }
  }, [years, yearId]);

  const { data: weekendCfg } = useQuery<WeekendConfig>({
    queryKey: ["cal-weekends", yearId, audience],
    queryFn: () => apiFetch(`/api/admin/calendar/weekends?yearId=${yearId}&audience=${audience}`),
    enabled: !!yearId,
  });

  useEffect(() => {
    if (weekendCfg) {
      setWknd({ mon: weekendCfg.mon, tue: weekendCfg.tue, wed: weekendCfg.wed, thu: weekendCfg.thu, fri: weekendCfg.fri, sat: weekendCfg.sat, sun: weekendCfg.sun });
    }
  }, [weekendCfg]);

  const { data: holidays = [] } = useQuery<Holiday[]>({
    queryKey: ["cal-holidays", yearId, audience],
    queryFn: () => apiFetch(`/api/admin/calendar/holidays?yearId=${yearId}&audience=${audience}`),
    enabled: !!yearId,
  });

  const yearName  = years.find(y => y.id === yearId)?.name ?? "";
  const fromYear  = parseInt(yearName.split("-")[0] ?? String(today.getFullYear())) || today.getFullYear();
  const statsFrom = `${fromYear}-01-01`;
  const statsTo   = `${fromYear}-12-31`;

  const { data: stats } = useQuery<Stats>({
    queryKey: ["cal-stats", yearId, audience, statsFrom, statsTo],
    queryFn: () => apiFetch(`/api/admin/calendar/stats?yearId=${yearId}&audience=${audience}&fromDate=${statsFrom}&toDate=${statsTo}`),
    enabled: !!yearId,
  });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveWeekendMut = useMutation({
    mutationFn: () => apiFetch("/api/admin/calendar/weekends", {
      method: "PUT",
      body: JSON.stringify({ yearId, audience, ...wknd }),
    }),
    onSuccess: () => {
      toast({ title: "Weekend config saved" });
      qc.invalidateQueries({ queryKey: ["cal-weekends", yearId, audience] });
      qc.invalidateQueries({ queryKey: ["cal-stats",    yearId, audience] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteHolidayMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/calendar/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Holiday removed" });
      qc.invalidateQueries({ queryKey: ["cal-holidays", yearId, audience] });
      qc.invalidateQueries({ queryKey: ["cal-stats",    yearId, audience] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Calendar helpers ─────────────────────────────────────────────────────────
  const daysInMonth   = new Date(calYear, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(calYear, month, 1).getDay();
  const monthStr      = `${calYear}-${String(month + 1).padStart(2, "0")}`;
  const todayStr      = today.toISOString().slice(0, 10);

  const holidayByDate = useMemo(() => {
    const m: Record<string, Holiday[]> = {};
    for (const h of holidays) (m[h.date] ??= []).push(h);
    return m;
  }, [holidays]);

  const isWeekendDay = (dateStr: string) => {
    const dow = new Date(dateStr + "T00:00:00").getDay();
    return wknd[DAYS_OF_WEEK[dow]] === true;
  };

  function prevMonth() {
    if (month === 0) { setCalYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setCalYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const invalidateHolidays = () => {
    qc.invalidateQueries({ queryKey: ["cal-holidays", yearId, audience] });
    qc.invalidateQueries({ queryKey: ["cal-stats",    yearId, audience] });
  };

  // Donut data
  const donutData = stats ? [
    { name: "Working",  value: stats.workingDays, color: CHART_COLORS.working  },
    { name: "Weekends", value: stats.weekendDays, color: CHART_COLORS.weekend  },
    { name: "Holidays", value: stats.holidayDays, color: CHART_COLORS.holiday  },
  ] : [];

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
            School Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure official weekends and public holidays per academic year</p>
        </div>
      </div>

      {/* ── Controls bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Year */}
        <Select value={yearId} onValueChange={setYearId}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="Select year…" />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Audience tabs */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(["students", "staff"] as Audience[]).map(a => (
            <button key={a} onClick={() => setAudience(a)}
              className={cn("px-4 py-1.5 text-sm font-medium transition-colors capitalize",
                audience === a ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
              <Users className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              {a === "students" ? "Students" : "Staff"}
            </button>
          ))}
        </div>

        {/* Sub-tabs */}
        <div className="ml-auto flex rounded-lg border border-slate-200 overflow-hidden">
          <button onClick={() => setTab("calendar")}
            className={cn("px-3.5 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5",
              tab === "calendar" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
            <CalendarDays className="h-3.5 w-3.5" /> Calendar
          </button>
          <button onClick={() => setTab("list")}
            className={cn("px-3.5 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5",
              tab === "list" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
            <ListIcon className="h-3.5 w-3.5" /> List & Charts
          </button>
        </div>
      </div>

      {!yearId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
          <CalendarDays className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select an academic year to begin</p>
        </div>
      ) : tab === "calendar" ? (
        /* ════════════════════════════════════════════════════════════════════
           CALENDAR VIEW
        ════════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left — month grid */}
          <div className="lg:col-span-2 space-y-3">
            {/* Month nav */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-3">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-slate-100 transition-colors">
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <h3 className="font-semibold text-slate-800">{MONTHS[month]} {calYear}</h3>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-slate-100 transition-colors">
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border">
                {DAY_LABELS.map(d => (
                  <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`e${i}`} className="min-h-[72px] border-b border-r border-border bg-muted/10" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day     = i + 1;
                  const dateStr = `${calYear}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  const isWknd  = isWeekendDay(dateStr);
                  const dayHols = (holidayByDate[dateStr] ?? []).filter(h => h.audience === audience || h.audience === "both");

                  return (
                    <div key={day}
                      className={cn(
                        "min-h-[72px] border-b border-r border-border p-1.5 relative",
                        isWknd && !dayHols.length ? "bg-slate-100/80" : "",
                        dayHols.length ? "bg-amber-50" : "",
                      )}>
                      <div className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1",
                        isToday ? "bg-indigo-600 text-white" : isWknd ? "text-slate-400" : "text-slate-700",
                      )}>
                        {day}
                      </div>
                      {isWknd && !dayHols.length && (
                        <div className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">Weekend</div>
                      )}
                      <div className="space-y-0.5">
                        {dayHols.slice(0, 2).map(h => {
                          const cat = CAT_MAP[h.category] ?? CAT_MAP.other;
                          return (
                            <div key={h.id}
                              className="text-[10px] font-medium rounded px-1 py-0.5 truncate text-white"
                              style={{ background: cat.color }}
                              title={h.name}>
                              {h.name}
                            </div>
                          );
                        })}
                        {dayHols.length > 2 && <div className="text-[10px] text-slate-400">+{dayHols.length - 2}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 flex-wrap px-1">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-3 w-3 rounded-sm bg-slate-200 border border-slate-300" />Weekend
              </span>
              {CATEGORIES.map(c => (
                <span key={c.value} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-3 w-3 rounded-sm" style={{ background: c.color }} />{c.label}
                </span>
              ))}
            </div>
          </div>

          {/* Right — config panels */}
          <div className="space-y-4">
            {/* Weekend setup */}
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sun className="h-4 w-4 text-amber-500" />Weekend Days
                </h4>
                <span className="text-[10px] text-slate-400 capitalize">{audience}</span>
              </div>
              <div className="p-4 space-y-2">
                {DAYS_OF_WEEK.map((d, i) => (
                  <label key={d} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!wknd[d]}
                      onChange={e => setWknd(w => ({ ...w, [d]: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className={cn("text-sm", wknd[d] ? "text-slate-800 font-medium" : "text-slate-500")}>
                      {DAY_LABELS[i]}
                    </span>
                    {wknd[d] && <span className="ml-auto text-[10px] text-emerald-600 font-medium">Off</span>}
                  </label>
                ))}
                <Button size="sm" className="w-full mt-3" onClick={() => saveWeekendMut.mutate()} disabled={saveWeekendMut.isPending}>
                  {saveWeekendMut.isPending ? "Saving…" : "Save Weekend Config"}
                </Button>
              </div>
            </div>

            {/* Holidays this month */}
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700">Holidays — {SHORT_MONTHS[month]}</h4>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {holidays
                  .filter(h => h.date.startsWith(monthStr) && (h.audience === audience || h.audience === "both"))
                  .length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No holidays this month</div>
                ) : (
                  holidays
                    .filter(h => h.date.startsWith(monthStr) && (h.audience === audience || h.audience === "both"))
                    .map(h => {
                      const cat = CAT_MAP[h.category] ?? CAT_MAP.other;
                      return (
                        <div key={h.id} className="px-4 py-2.5 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                              <span className="text-xs font-medium text-slate-700 truncate">{h.name}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {formatDate(h.date + "T00:00:00")}
                              {" · "}{cat.label}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => { setEditing(h); setDialogOpen(true); }}
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button onClick={() => deleteHolidayMut.mutate(h.id)}
                              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════════════════════════════
           LIST & CHARTS VIEW
        ════════════════════════════════════════════════════════════════════ */
        <div className="space-y-5">
          {/* Stats strip */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Days",   value: stats.totalDays,   color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200" },
                { label: "Working Days", value: stats.workingDays, color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200" },
                { label: "Weekend Days", value: stats.weekendDays, color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-200" },
                { label: "Holidays",     value: stats.holidayDays, color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
              ].map(s => (
                <div key={s.label} className={cn("rounded-xl border p-4 text-center", s.bg, s.border)}>
                  <p className={cn("text-3xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                  <p className="text-[11px] text-slate-400">{yearName}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts row */}
          {stats && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Donut */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                  <BarChart2 className="h-4 w-4 text-indigo-500" />
                  Year Overview — {yearName}
                </h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false} fontSize={10}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v} days`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1">
                  {donutData.map(d => (
                    <span key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      {d.name}: <b>{d.value}</b>
                    </span>
                  ))}
                </div>
              </div>

              {/* Monthly bar */}
              <div className="lg:col-span-3 rounded-xl border border-border bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Monthly Breakdown</h4>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tickFormatter={m => SHORT_MONTHS[parseInt(m.split("-")[1]) - 1] ?? m}
                      tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={m => SHORT_MONTHS[parseInt(m.split("-")[1]) - 1] ?? m}
                      formatter={(v: number, n: string) => [`${v} days`, n.charAt(0).toUpperCase() + n.slice(1)]} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="working"  stackId="a" fill={CHART_COLORS.working}  name="Working"  radius={[0,0,0,0]} />
                    <Bar dataKey="weekend"  stackId="a" fill={CHART_COLORS.weekend}  name="Weekend"  />
                    <Bar dataKey="holiday"  stackId="a" fill={CHART_COLORS.holiday}  name="Holiday"  radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Holidays table */}
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">
                All Holidays — {yearName} ({audience === "students" ? "Students" : "Staff"})
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {holidays.filter(h => h.audience === audience || h.audience === "both").length} entries
                </span>
              </h4>
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Holiday
              </Button>
            </div>

            {holidays.filter(h => h.audience === audience || h.audience === "both").length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                <CalendarDays className="h-8 w-8 opacity-30" />
                <p className="text-sm">No holidays defined yet for this year &amp; audience</p>
                <Button size="sm" variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add first holiday
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-border">
                    <tr>
                      {["Date", "Day", "Holiday Name", "Category", "Audience", "Notes", ""].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {holidays
                      .filter(h => h.audience === audience || h.audience === "both")
                      .map((h, idx) => {
                        const dt  = new Date(h.date + "T00:00:00");
                        const cat = CAT_MAP[h.category] ?? CAT_MAP.other;
                        return (
                          <tr key={h.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">
                              {formatDate(dt)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {DAY_LABELS[dt.getDay()]}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{h.name}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-medium"
                                style={{ background: cat.color }}>
                                {cat.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">{h.audience}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[200px] truncate">{h.notes ?? "—"}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1">
                                <button onClick={() => { setEditing(h); setDialogOpen(true); }}
                                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => deleteHolidayMut.mutate(h.id)}
                                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Holiday add/edit dialog */}
      <HolidayDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        yearId={yearId}
        audience={audience}
        editing={editing}
        onSaved={invalidateHolidays}
      />
    </div>
  );
}
