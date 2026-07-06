import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminSyllabusUnits, getListAdminSyllabusUnitsQueryKey,
  useCreateAdminSyllabusUnit, useUpdateAdminSyllabusUnit, useDeleteAdminSyllabusUnit,
  useListAdminSyllabusTopics, getListAdminSyllabusTopicsQueryKey,
  useCreateAdminSyllabusTopic, useUpdateAdminSyllabusTopic, useDeleteAdminSyllabusTopic,
  useListAdminClasses, useListAdminSubjects,
} from "@workspace/api-client-react";
import { BookOpen, List, LayoutList } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BulkAddUnitsDialog, BulkAddTopicsDialog } from "./SyllabusBulkDialogs";

const SUBTABS = [
  { key: "units",  label: "Syllabus Units" },
  { key: "topics", label: "Topics" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function UnitsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminSyllabusUnits();
  const { data: classes } = useListAdminClasses();
  const { data: subjects } = useListAdminSubjects();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [classFilter, setClassFilter] = useState("");
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminSyllabusUnitsQueryKey() });

  const classOptions = useMemo(
    () => (classes ?? []).map((c: any) => ({ value: String(c.code), label: String(c.name) })),
    [classes],
  );
  const subjectOptions = useMemo(
    () => (subjects ?? []).map((s: any) => ({ value: String(s.code), label: String(s.name) })),
    [subjects],
  );

  const filteredUnits = useMemo(() => {
    if (!classFilter) return data as any;
    return (data as any[] ?? []).filter((u: any) => u.classCode === classFilter);
  }, [data, classFilter]);

  const fields: FieldDef[] = useMemo(() => [
    { key: "classCode",   label: "Class/Program",   type: "select" as const, required: true,
      options: classOptions.length > 0 ? classOptions : [{ value: "", label: "No classes — configure in Academic Setup" }] },
    { key: "subjectCode", label: "Subject", type: "select" as const, required: true,
      options: subjectOptions.length > 0 ? subjectOptions : [{ value: "", label: "No subjects — configure in Academic Setup" }] },
    { key: "title",       label: "Unit Title", type: "text" as const, required: true, placeholder: "e.g. Unit 1: Prose", maxLength: 200 },
    { key: "description", label: "Description", type: "textarea" as const, inTable: false },
  ], [classOptions, subjectOptions]);

  return (
    <>
      <BulkAddUnitsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        classes={classOptions}
        subjects={subjectOptions}
        onSaved={inv}
      />

      {/* Class filter */}
      {classOptions.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Filter by Class</span>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="h-8 text-sm border border-border rounded-md px-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Classes</option>
            {classOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {classFilter && (
            <button
              type="button"
              onClick={() => setClassFilter("")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <CatalogTab
        entityLabel="Syllabus Unit"
        description="Define curriculum units grouped by class and subject. Each unit groups related topics together."
        icon={BookOpen}
        fields={fields}
        items={filteredUnits as CatalogItem[] | undefined}
        isLoading={isLoading}
        getName={(i) => String(i.title)}
        createMutation={useCreateAdminSyllabusUnit({ mutation: { onSuccess: inv } })}
        updateMutation={useUpdateAdminSyllabusUnit({ mutation: { onSuccess: inv } })}
        deleteMutation={useDeleteAdminSyllabusUnit({ mutation: { onSuccess: inv } })}
        extraActions={
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}
            className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50">
            <LayoutList className="h-3.5 w-3.5" /> Add Multiple Units
          </Button>
        }
      />
    </>
  );
}

function TopicsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminSyllabusTopics();
  const { data: units } = useListAdminSyllabusUnits();
  const { data: classes } = useListAdminClasses();
  const { data: subjects } = useListAdminSubjects();
  const [bulkOpen, setBulkOpen] = useState(false);
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminSyllabusTopicsQueryKey() });

  const classOptions = useMemo(
    () => (classes ?? []).map((c: any) => ({ value: String(c.code), label: String(c.name) })),
    [classes],
  );
  const subjectOptions = useMemo(
    () => (subjects ?? []).map((s: any) => ({ value: String(s.code), label: String(s.name) })),
    [subjects],
  );
  const unitOptions = useMemo(
    () => (Array.isArray(units) ? (units as any[]) : []).map((u: any) => ({
      id: String(u.id),
      classCode: String(u.classCode),
      subjectCode: String(u.subjectCode),
      title: String(u.title),
    })),
    [units],
  );

  const unitSelectOptions = useMemo(
    () => unitOptions.map(u => ({ value: u.id, label: `${u.classCode} · ${u.subjectCode} · ${u.title}` })),
    [unitOptions],
  );

  const fields: FieldDef[] = useMemo(() => [
    { key: "unitId", label: "Unit", type: "select" as const, required: true,
      options: unitSelectOptions.length > 0 ? unitSelectOptions : [{ value: "", label: "No units — add units first" }] },
    { key: "title",  label: "Topic Title", type: "text" as const, required: true, placeholder: "e.g. Chapter 1: The Lost Treasure", maxLength: 200 },
    { key: "description", label: "Notes", type: "textarea" as const, inTable: false },
  ], [unitSelectOptions]);

  return (
    <>
      <BulkAddTopicsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        units={unitOptions}
        classes={classOptions}
        subjects={subjectOptions}
        onSaved={inv}
      />
      <CatalogTab
        entityLabel="Topic"
        description="Individual topics within a syllabus unit. Attach each topic to its parent unit."
        icon={List}
        fields={fields}
        items={data as CatalogItem[] | undefined}
        isLoading={isLoading}
        getName={(i) => String(i.title)}
        createMutation={useCreateAdminSyllabusTopic({ mutation: { onSuccess: inv } })}
        updateMutation={useUpdateAdminSyllabusTopic({ mutation: { onSuccess: inv } })}
        deleteMutation={useDeleteAdminSyllabusTopic({ mutation: { onSuccess: inv } })}
        extraActions={
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}
            className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50">
            <LayoutList className="h-3.5 w-3.5" /> Add Multiple Topics
          </Button>
        }
      />
    </>
  );
}

export function SyllabusSetupTab() {
  const [sub, setSub] = useState<Subtab>("units");
  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-border mb-6">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              sub === t.key
                ? "border-violet-500 text-violet-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "units"  && <UnitsTab />}
      {sub === "topics" && <TopicsTab />}
    </div>
  );
}
