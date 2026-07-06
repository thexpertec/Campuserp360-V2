import { useState, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, ChevronRight } from "lucide-react";
import { TimetableSetupTab } from "./timetable/TimetableSetupTab";
import { ClassSubjectsTab } from "./timetable/ClassSubjectsTab";
import { TeacherLoadTab } from "./timetable/TeacherLoadTab";
import { TimetableGridTab } from "./timetable/TimetableGridTab";
import { TimetableDashboard } from "./timetable/TimetableDashboard";
import { TimetableMasterTab } from "./timetable/TimetableMasterTab";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Failed");
  return json as T;
}

const STEP_TABS = [
  { key: "class-subjects", label: "Class/Program Subjects",  step: 1 },
  { key: "teachers",       label: "Teacher Load",            step: 2 },
  { key: "periods",        label: "Period Setup",            step: 3 },
  { key: "schedule",       label: "Class/Program Timetable", step: 4 },
] as const;

export default function Timetable() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";
  const [globalClassId, setGlobalClassId] = useState("");

  const { data: classesData } = useQuery({
    queryKey: ["timetable-global-classes"],
    queryFn: () => apiFetch<any>("/api/admin/classes?pageSize=200"),
  });
  const classes: { id: string; name: string; code: string }[] = useMemo(() => {
    const d = classesData as any;
    return Array.isArray(d?.classes) ? d.classes : Array.isArray(d) ? d : [];
  }, [classesData]);
  const selectedClass = classes.find(c => c.id === globalClassId);

  const showClassSelector = tab !== "periods" && tab !== "dashboard" && tab !== "master";
  const showStepFlow      = tab !== "periods" && tab !== "dashboard" && tab !== "master";

  const tabProps = { classId: globalClassId, onClassChange: setGlobalClassId };

  const PAGE: Record<string, { title: string; subtitle: string }> = {
    dashboard:        { title: "Timetable",                  subtitle: "Overview of period coverage, teacher load and class timetable status." },
    master:           { title: "Campus Master Timetable",    subtitle: "All classes at a glance — rows are classes, columns are lecture periods." },
    schedule:         { title: "Class/Program Timetable",    subtitle: "View, edit and auto-generate the weekly timetable." },
    periods:          { title: "Period Setup",               subtitle: "Define the daily period structure — times, breaks, assembly and lecture slots." },
    "class-subjects": { title: "Class/Program Subjects",     subtitle: "Assign subjects to each class and set periods per week." },
    teachers:         { title: "Teacher Load",               subtitle: "Assign which subjects each teacher delivers per class." },
  };
  const cfg = PAGE[tab] ?? PAGE.dashboard;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* ── Header + global class selector ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">{cfg.title}</h1>
          <p className="text-muted-foreground mt-1">{cfg.subtitle}</p>
        </div>

        {showClassSelector && (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex-shrink-0">
            <GraduationCap className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Active class:</span>
            <Select value={globalClassId} onValueChange={setGlobalClassId}>
              <SelectTrigger className="h-8 w-44 text-sm border-0 shadow-none focus:ring-0 px-1">
                <SelectValue placeholder="Pick a class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.filter(c => !!c.id).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClass && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs flex-shrink-0">
                {selectedClass.name}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Setup flow hint (steps 1→2→3) — shown on non-dashboard, non-periods tabs ── */}
      {showStepFlow && (
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {STEP_TABS.map((t, i, arr) => (
            <span key={t.key} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded-full font-medium ${
                tab === t.key ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500"
              }`}>
                {t.step}. {t.label}
              </span>
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
            </span>
          ))}
        </div>
      )}

      {/* ── Tab content ── */}
      {tab === "dashboard"       && <TimetableDashboard />}
      {tab === "master"          && <TimetableMasterTab />}
      {tab === "schedule"        && <TimetableGridTab  {...tabProps} />}
      {tab === "periods"         && <TimetableSetupTab />}
      {tab === "class-subjects"  && <ClassSubjectsTab  {...tabProps} />}
      {tab === "teachers"        && <TeacherLoadTab    {...tabProps} />}
    </div>
  );
}
