import { useMemo, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminSectionAllocations,
  getListAdminSectionAllocationsQueryKey,
  useCreateAdminSectionAllocation,
  useDeleteAdminSectionAllocation,
  useListAdminApplications,
  getListAdminApplicationsQueryKey,
  useListAdminSections,
  useListAdminAcademicYears,
  type SectionAllocation,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LayoutGrid, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

type FormState = {
  referenceId: string;
  sectionId: string;
  academicYearId: string;
};

const emptyForm: FormState = { referenceId: "", sectionId: "", academicYearId: "" };

export function SectionAllocationTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [yearFilter, setYearFilter] = useState("all");
  const allocParams = yearFilter !== "all" ? { academicYearId: yearFilter } : undefined;
  const { data: allocations, isLoading } = useListAdminSectionAllocations(allocParams);
  const { data: sections } = useListAdminSections();
  const { data: years } = useListAdminAcademicYears();
  const yearInitRef = useRef(false);
  useEffect(() => {
    if (!yearInitRef.current && (years as any[])?.length) {
      yearInitRef.current = true;
      const def = (years as any[]).find(y => y.isDefault) ?? (years as any[])[0];
      if (def) setYearFilter(def.id);
    }
  }, [years]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);

  const appParams = { q: debouncedSearch || undefined, pageSize: 10, page: 1 };
  const { data: appPage, isLoading: appsLoading } = useListAdminApplications(
    appParams,
    { query: { enabled: dialogOpen, queryKey: getListAdminApplicationsQueryKey(appParams) } },
  );
  const applicants = appPage?.items ?? [];

  const selectedApplicant = useMemo(
    () => applicants.find((a) => a.referenceId === form.referenceId),
    [applicants, form.referenceId],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListAdminSectionAllocationsQueryKey() });
  }

  const createMutation = useCreateAdminSectionAllocation({
    mutation: {
      onSuccess: () => { invalidate(); setDialogOpen(false); toast({ title: "Applicant placed" }); },
      onError: () => toast({ title: "Could not place applicant", description: "They may already be placed for this year.", variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteAdminSectionAllocation({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Placement removed" }); },
      onError: () => toast({ title: "Could not remove", description: "Please try again.", variant: "destructive" }),
    },
  });

  function openAdd() {
    setForm(emptyForm);
    setSearch("");
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.referenceId || !form.sectionId || !form.academicYearId) {
      toast({ title: "Missing details", description: "Applicant, section and academic year are required.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ data: form });
  }

  const saving = createMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Place qualified applicants into a section for an academic year. The class is taken from the applicant's record.
        </p>
        <div className="flex items-center gap-2">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[170px]" data-testid="select-alloc-year-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {(years ?? []).map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openAdd} size="sm" data-testid="button-add-allocation">
            <Plus className="mr-2 h-4 w-4" /> Place Applicant
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (allocations ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <LayoutGrid className="h-10 w-10 mb-3 opacity-50" />
                      <p className="font-medium text-foreground">No placements yet</p>
                      <p className="text-sm mt-1">Place an applicant into a section to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (allocations ?? []).map((a: SectionAllocation) => (
                  <TableRow key={a.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{a.applicantName}</TableCell>
                    <TableCell className="font-mono text-xs">{a.referenceId}</TableCell>
                    <TableCell className="font-mono text-xs">{a.classCode}</TableCell>
                    <TableCell><Badge variant="outline">{a.sectionName}</Badge></TableCell>
                    <TableCell>{a.academicYearName}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${a.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove placement for “{a.applicantName}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the applicant from {a.sectionName} for {a.academicYearName}. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate({ id: a.id })}
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Place Applicant</DialogTitle>
            <DialogDescription>Search for an applicant, then choose a section and academic year.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="alloc-search">Search applicant</Label>
              <Input
                id="alloc-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or Applicant ID"
                data-testid="input-alloc-search"
              />
            </div>
            <div className="space-y-2">
              <Label>Applicant *</Label>
              <Select value={form.referenceId} onValueChange={(v) => setForm((f) => ({ ...f, referenceId: v }))}>
                <SelectTrigger data-testid="select-alloc-applicant">
                  <SelectValue placeholder={appsLoading ? "Loading…" : "Select an applicant"} />
                </SelectTrigger>
                <SelectContent>
                  {applicants.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No applicants found</div>
                  ) : (
                    applicants.map((a) => (
                      <SelectItem key={a.referenceId} value={a.referenceId}>
                        {a.fullName} · {a.referenceId}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedApplicant && (
                <p className="text-xs text-muted-foreground">
                  Class: <span className="font-mono">{selectedApplicant.classApplying}</span> · Status: {selectedApplicant.status}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Section *</Label>
                <Select value={form.sectionId} onValueChange={(v) => setForm((f) => ({ ...f, sectionId: v }))}>
                  <SelectTrigger data-testid="select-alloc-section">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sections ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Year *</Label>
                <Select value={form.academicYearId} onValueChange={(v) => setForm((f) => ({ ...f, academicYearId: v }))}>
                  <SelectTrigger data-testid="select-alloc-year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {(years ?? []).map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} data-testid="button-save-allocation">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place Applicant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
