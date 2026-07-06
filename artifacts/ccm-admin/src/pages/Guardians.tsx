import { useState } from "react";
import { useLocation } from "wouter";
import { formatCnic, formatPhone } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, Plus, RefreshCw, Phone, CreditCard, MapPin,
  Loader2, Trash2, Edit2, ShieldAlert, ChevronRight,
} from "lucide-react";
import { DataTable } from "@/components/DataTable";
import type { ColDef } from "@/components/DataTable/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type GuardianSummary = {
  id: string;
  familyId: string;
  familySeq: number;
  name: string;
  cnic: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  children: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

type GuardianPage = {
  data: GuardianSummary[];
  total: number;
  page: number;
  pageSize: number;
};

type GuardianInput = {
  name: string;
  cnic?: string;
  phone?: string;
  city?: string;
  address?: string;
  notes?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = (await import("@/lib/auth")).getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error((e as any).error ?? "Request failed");
  }
  return res.json();
}

// ─── Guardian Form Dialog ─────────────────────────────────────────────────────

function GuardianFormDialog({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: GuardianSummary | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<GuardianInput>({
    name: initial?.name ?? "",
    cnic: initial?.cnic ?? "",
    phone: initial?.phone ?? "",
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    notes: initial?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  function set(field: keyof GuardianInput, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: GuardianInput = {
        name: form.name.trim(),
        cnic: form.cnic?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        city: form.city?.trim() || undefined,
        address: form.address?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };
      if (initial) {
        await apiFetch(`/api/admin/guardians/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast({ title: "Guardian updated" });
      } else {
        await apiFetch("/api/admin/guardians", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast({ title: "Guardian created" });
      }
      onSaved();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Guardian" : "Add New Guardian"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Muhammad Ali"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">CNIC</Label>
            <Input
              value={form.cnic}
              onChange={(e) => set("cnic", formatCnic(e.target.value))}
              placeholder="35200-1234567-8"
              maxLength={15}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => set("phone", formatPhone(e.target.value))}
              placeholder="0300-1234567"
              maxLength={12}
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">City</Label>
            <Input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Rawalpindi"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Address</Label>
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street / Area"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5 block">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any notes about this guardian…"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {initial ? "Save Changes" : "Create Guardian"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: ColDef<GuardianSummary>[] = [
  {
    key: "familyId",
    label: "Family ID",
    sortable: true,
    defaultWidth: 120,
    render: (g) => (
      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
        {g.familyId}
      </span>
    ),
    getText: (g) => g.familyId,
  },
  {
    key: "name",
    label: "Name",
    sortable: true,
    defaultWidth: 200,
    render: (g) => (
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
          {g.name.charAt(0).toUpperCase()}
        </span>
        <span className="font-semibold text-slate-800">{g.name}</span>
      </div>
    ),
    getText: (g) => g.name,
  },
  {
    key: "cnic",
    label: "CNIC",
    sortable: true,
    defaultWidth: 150,
    render: (g) =>
      g.cnic ? (
        <span className="font-mono text-xs text-slate-600 flex items-center gap-1">
          <CreditCard className="h-3 w-3 text-slate-400" />{g.cnic}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
    getText: (g) => g.cnic ?? "",
  },
  {
    key: "phone",
    label: "Phone",
    sortable: true,
    defaultWidth: 140,
    render: (g) =>
      g.phone ? (
        <span className="text-sm flex items-center gap-1">
          <Phone className="h-3 w-3 text-slate-400" />{g.phone}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
    getText: (g) => g.phone ?? "",
  },
  {
    key: "city",
    label: "City",
    sortable: true,
    defaultWidth: 130,
    render: (g) =>
      g.city ? (
        <span className="text-sm flex items-center gap-1">
          <MapPin className="h-3 w-3 text-slate-400" />{g.city}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
    getText: (g) => g.city ?? "",
  },
  {
    key: "childCount",
    label: "Children",
    sortable: true,
    defaultWidth: 260,
    render: (g) =>
      g.children.length === 0 ? (
        <span className="text-muted-foreground text-sm">—</span>
      ) : (
        <div className="flex flex-wrap gap-1 py-0.5">
          {g.children.map((c) => (
            <Badge key={c.id} variant="secondary" className="text-xs font-normal whitespace-nowrap">
              {c.name}
            </Badge>
          ))}
        </div>
      ),
    getText: (g) => String(g.children.length).padStart(6, "0"),
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Guardians() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [q, setQ]               = useState("");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const PAGE_SIZE               = 20;
  const [sortItems, setSortItems] = useState<{ key: string; dir: "asc" | "desc" }[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<GuardianSummary | null>(null);
  const [deleting, setDeleting] = useState<GuardianSummary | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const queryKey = ["admin-guardians", search, page, JSON.stringify(sortItems)];

  const { data, isLoading } = useQuery<GuardianPage>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("q", search);
      if (sortItems.length > 0) params.set("sort", sortItems.map(s => `${s.key}:${s.dir}`).join(","));
      return apiFetch(`/api/admin/guardians?${params}`);
    },
  });

  function handleSearch() {
    setSearch(q);
    setSortItems([]);
    setPage(1);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-guardians"] });
  }

  async function handleDelete(g: GuardianSummary) {
    try {
      await apiFetch(`/api/admin/guardians/${g.id}`, { method: "DELETE" });
      toast({ title: "Guardian deleted" });
      setDeleting(null);
      invalidate();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const result = await apiFetch<{ created: number; linked: number }>(
        "/api/admin/guardians/backfill",
        { method: "POST" },
      );
      toast({
        title: "Sibling detection complete",
        description: `Created ${result.created} guardian record${result.created !== 1 ? "s" : ""}, linked ${result.linked} student${result.linked !== 1 ? "s" : ""}.`,
      });
      invalidate();
    } catch (err: any) {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-6xl mx-auto">
      <DataTable
        tableId="guardians"
        title="Guardians / Parents"
        subtitle="Manage parent and guardian records. Each record can be linked to multiple siblings."
        columns={COLUMNS}
        data={data?.data ?? []}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={(p) => setPage(p)}
        sortState={sortItems}
        onSortChange={(newSort) => { setSortItems(newSort); setPage(1); }}
        exportFilename="guardians"
        emptyIcon={<Users className="h-10 w-10 text-slate-200" />}
        emptyTitle="No guardians found"
        emptyDescription={
          search
            ? "Try a different search term."
            : 'Click "Add Guardian" to create one, or "Detect Siblings" to pull from existing student data.'
        }
        action={
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-9"
              onClick={handleBackfill}
              disabled={backfilling}
              title="Scan all unlinked students and auto-group siblings by shared CNIC or father name"
            >
              {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Detect Siblings
            </Button>
            <Button
              size="sm"
              className="gap-2 h-9"
              onClick={() => { setEditing(null); setFormOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Guardian
            </Button>
          </div>
        }
        filters={
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Search name, CNIC, phone, Family ID…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={handleSearch}>
              Search
            </Button>
            {search && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => { setQ(""); setSearch(""); setPage(1); }}>
                Clear
              </Button>
            )}
          </div>
        }
        rowActions={(g) => (
          <div className="flex items-center gap-1">
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-white hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors"
              onClick={() => { setEditing(g); setFormOpen(true); }}
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-white hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              onClick={() => setDeleting(g)}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              className="h-7 w-7 flex items-center justify-center rounded-md border border-border bg-white hover:bg-slate-50 text-slate-400 hover:text-indigo-600 transition-colors"
              onClick={() => navigate(`/guardians/${g.id}`)}
              title="View detail"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />

      {/* Form dialog */}
      {formOpen && (
        <GuardianFormDialog
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); invalidate(); }}
          initial={editing}
        />
      )}

      {/* Delete confirm dialog */}
      {deleting && (
        <Dialog open onOpenChange={(v) => !v && setDeleting(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <ShieldAlert className="h-5 w-5" />
                Delete Guardian
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600 py-2">
              Delete <span className="font-semibold">{deleting.name}</span> ({deleting.familyId})?
              {deleting.children.length > 0 && (
                <span className="block mt-2 text-amber-600 font-medium text-xs">
                  This guardian has {deleting.children.length} linked student(s). Unlink them before deleting.
                </span>
              )}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleting)} disabled={deleting.children.length > 0}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
