import { useEffect, useState } from "react";
import {
  useListAdminClasses,
  useListAdminSubjects,
  useListAdminClassSubjects,
  getListAdminClassSubjectsQueryKey,
  useSetAdminClassSubjects,
  type Subject,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, BookOpen, CheckCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TYPE_COLORS: Record<string, string> = {
  theory:    "bg-blue-100 text-blue-800",
  practical: "bg-amber-100 text-amber-800",
  combined:  "bg-purple-100 text-purple-800",
};

export function ClassSubjectsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: classes, isLoading: classesLoading } = useListAdminClasses();
  const { data: allSubjects, isLoading: subjectsLoading } = useListAdminSubjects();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const classSubjectsQuery = useListAdminClassSubjects(selectedClassId);
  const assignedSubjects = selectedClassId ? classSubjectsQuery.data : undefined;
  const assignedLoading = selectedClassId ? classSubjectsQuery.isLoading : false;

  useEffect(() => {
    if (assignedSubjects) {
      setCheckedIds(new Set((assignedSubjects as Subject[]).map((s) => s.id)));
      setDirty(false);
    }
  }, [assignedSubjects]);

  const saveMutation = useSetAdminClassSubjects({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListAdminClassSubjectsQueryKey(selectedClassId) });
        setCheckedIds(new Set((data as Subject[]).map((s) => s.id)));
        setDirty(false);
        toast({ title: "Subjects saved" });
      },
      onError: () => toast({ title: "Could not save", variant: "destructive" }),
    },
  });

  function toggle(id: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setDirty(true);
  }

  function selectAll() {
    setCheckedIds(new Set((allSubjects ?? []).map((s) => s.id)));
    setDirty(true);
  }

  function clearAll() {
    setCheckedIds(new Set());
    setDirty(true);
  }

  function handleSave() {
    if (!selectedClassId) return;
    saveMutation.mutate({ classId: selectedClassId, data: { subjectIds: [...checkedIds] } });
  }

  const selectedClass = (classes ?? []).find((c) => c.id === selectedClassId);
  const loading = classesLoading || subjectsLoading;
  const subjects = allSubjects ?? [];

  const coreSubjects = subjects.filter((s) => !s.isElective);
  const electiveSubjects = subjects.filter((s) => s.isElective);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Select a class and choose which subjects are taught in it. Core and elective subjects are listed separately.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading ? (
            <Skeleton className="h-9 w-[220px]" />
          ) : (
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select a class…" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!selectedClassId ? (
        <div className="flex flex-col items-center justify-center h-52 text-muted-foreground border border-dashed border-border rounded-xl">
          <BookOpen className="h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium text-foreground">Select a class to assign subjects</p>
          <p className="text-sm mt-1">Choose a class from the dropdown above.</p>
        </div>
      ) : assignedLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 text-muted-foreground border border-dashed border-border rounded-xl">
          <BookOpen className="h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium text-foreground">No subjects defined yet</p>
          <p className="text-sm mt-1">Add subjects in the <strong>Subjects</strong> tab first.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground">{checkedIds.size}</strong> of {subjects.length} subjects selected for{" "}
                <strong className="text-foreground">{selectedClass?.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                <CheckCheck className="h-4 w-4 mr-1" /> All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="h-4 w-4 mr-1" /> None
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {coreSubjects.length > 0 && (
              <SubjectGroup
                title="Core Subjects"
                subjects={coreSubjects}
                checkedIds={checkedIds}
                onToggle={toggle}
              />
            )}
            {electiveSubjects.length > 0 && (
              <SubjectGroup
                title="Elective Subjects"
                subjects={electiveSubjects}
                checkedIds={checkedIds}
                onToggle={toggle}
              />
            )}
          </div>

          {dirty && (
            <div className="sticky bottom-0 bg-background/90 backdrop-blur border-t border-border pt-3 pb-1 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCheckedIds(new Set((assignedSubjects as Subject[] ?? []).map((s) => s.id)));
                    setDirty(false);
                  }}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubjectGroup({
  title, subjects, checkedIds, onToggle,
}: {
  title: string;
  subjects: Subject[];
  checkedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {subjects.map((s) => {
          const checked = checkedIds.has(s.id);
          return (
            <label
              key={s.id}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                checked
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => onToggle(s.id, Boolean(v))}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${TYPE_COLORS[s.type] ?? "bg-gray-100 text-gray-800"}`}
                  >
                    {s.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                  <span className="text-xs text-muted-foreground">· {s.maxMarks} marks</span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
