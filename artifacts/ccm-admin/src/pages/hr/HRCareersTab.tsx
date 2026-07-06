import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": tenant,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface AppSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  positions: { positionId: string; title: string }[];
}

interface AppDetail extends AppSummary {
  fatherName: string | null;
  cnic: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
  education: string | null;
  experience: string | null;
  coverNote: string | null;
}

interface AppsPage {
  total: number;
  page: number;
  pageSize: number;
  items: AppSummary[];
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  new:         "bg-blue-100 text-blue-700",
  reviewed:    "bg-slate-100 text-slate-700",
  shortlisted: "bg-yellow-100 text-yellow-700",
  rejected:    "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize", STATUS_COLOURS[status] ?? "bg-slate-100 text-slate-700")}>
      {status}
    </span>
  );
}

// ── Position form dialog ──────────────────────────────────────────────────────

function PositionDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: Position | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle]         = useState(initial?.title ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? "0"));
  const [isActive, setIsActive]   = useState(initial?.isActive ?? true);
  const [saving, setSaving]       = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = { title: title.trim(), isActive, sortOrder: parseInt(sortOrder) || 0 };
      if (initial) {
        await apiFetch(`/api/admin/career-positions/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/admin/career-positions", { method: "POST", body: JSON.stringify(body) });
      }
      toast({ title: initial ? "Position updated" : "Position created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Position" : "New Position"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Title *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mathematics Teacher" />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Sort Order</label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-24" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700">Active (visible to applicants)</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Inline expanded application detail ────────────────────────────────────────

function AppExpandedRow({
  appId,
  onStatusChanged,
}: {
  appId: string;
  onStatusChanged: () => void;
}) {
  const { toast }   = useToast();
  const qc          = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const { data: app, isLoading } = useQuery<AppDetail>({
    queryKey: ["career-app-detail", appId],
    queryFn:  () => apiFetch(`/api/admin/career-applications/${appId}`),
  });

  async function handleUpdateStatus() {
    if (!newStatus || !app) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/career-applications/${appId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: "Status updated" });
      qc.invalidateQueries({ queryKey: ["career-app-detail", appId] });
      onStatusChanged();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <tr><td colSpan={5} className="px-4 py-4 text-sm text-slate-400 bg-slate-50">Loading…</td></tr>
    );
  }

  if (!app) return null;

  const fields: [string, string | null | undefined][] = [
    ["Father's Name", app.fatherName],
    ["CNIC",          app.cnic],
    ["Date of Birth", app.dob],
    ["Gender",        app.gender],
    ["Address",       app.address],
  ];

  return (
    <tr>
      <td colSpan={5} className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm mb-4">
          {fields.filter(([, v]) => v).map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-slate-400 mb-0.5">{label}</p>
              <p className="text-slate-700">{val}</p>
            </div>
          ))}
        </div>

        {app.positions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Positions of Interest</p>
            <div className="flex flex-wrap gap-1">
              {app.positions.map((p) => (
                <Badge key={p.positionId} variant="secondary" className="text-xs">{p.title}</Badge>
              ))}
            </div>
          </div>
        )}

        {app.education && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-0.5">Education</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{app.education}</p>
          </div>
        )}

        {app.experience && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-0.5">Experience</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{app.experience}</p>
          </div>
        )}

        {app.coverNote && (
          <div className="mb-3">
            <p className="text-xs text-slate-400 mb-0.5">Cover Note</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{app.coverNote}</p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200">
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Change status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleUpdateStatus} disabled={!newStatus || saving}>
            {saving ? "Saving…" : "Update Status"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Positions panel ───────────────────────────────────────────────────────────

function PositionsPanel() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; initial: Position | null }>({ open: false, initial: null });

  const { data: positions = [], isLoading } = useQuery<Position[]>({
    queryKey: ["career-positions-admin"],
    queryFn:  () => apiFetch("/api/admin/career-positions"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">Open Positions</h2>
        <Button size="sm" onClick={() => setDialog({ open: true, initial: null })}>
          <Plus className="h-4 w-4 mr-1" />
          Add Position
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : positions.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center">
          <p className="text-sm text-slate-400">No positions yet. Add one to let applicants tag their interest.</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Title</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500 w-24">Order</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{pos.title}</td>
                  <td className="px-4 py-2.5">
                    {pos.isActive
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-500">{pos.sortOrder}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setDialog({ open: true, initial: pos })}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PositionDialog
        key={dialog.initial?.id ?? "new"}
        open={dialog.open}
        initial={dialog.initial}
        onClose={() => setDialog({ open: false, initial: null })}
        onSaved={() => {
          setDialog({ open: false, initial: null });
          qc.invalidateQueries({ queryKey: ["career-positions-admin"] });
        }}
      />
    </div>
  );
}

// ── Applications panel ────────────────────────────────────────────────────────

function ApplicationsPanel() {
  const qc                      = useQueryClient();
  const [page, setPage]         = useState(1);
  const [q, setQ]               = useState("");
  const [status, setStatus]     = useState("");
  const [expandedId, setExpanded] = useState<string | null>(null);

  const pageSize = 20;

  const { data, isLoading } = useQuery<AppsPage>({
    queryKey: ["career-apps-admin", page, q, status],
    queryFn:  () => apiFetch(
      `/api/admin/career-applications?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`,
    ),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">Career Applications</h2>
        <span className="text-xs text-slate-400">{data?.total ?? 0} total</span>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search name, email, phone…"
          className="max-w-xs"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="shortlisted">Shortlisted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : !data?.items.length ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl py-10 text-center">
          <p className="text-sm text-slate-400">No applications yet.</p>
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Applicant</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Positions Tagged</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((app) => (
                  <Fragment key={app.id}>
                    <tr
                      className={cn(
                        "border-b border-slate-100 hover:bg-slate-50 cursor-pointer",
                        expandedId === app.id && "bg-slate-50",
                      )}
                      onClick={() => toggleExpand(app.id)}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{app.fullName}</p>
                        <p className="text-xs text-slate-400">{app.email}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        {app.positions.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {app.positions.slice(0, 2).map((p) => (
                              <Badge key={p.positionId} variant="secondary" className="text-xs">{p.title}</Badge>
                            ))}
                            {app.positions.length > 2 && (
                              <span className="text-xs text-slate-400">+{app.positions.length - 2}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={app.status} /></td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {expandedId === app.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />
                        }
                      </td>
                    </tr>

                    {expandedId === app.id && (
                      <AppExpandedRow
                        key={`${app.id}-detail`}
                        appId={app.id}
                        onStatusChanged={() => qc.invalidateQueries({ queryKey: ["career-apps-admin"] })}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-slate-400">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function HRCareersTab() {
  const [subTab, setSubTab] = useState<"applications" | "positions">("applications");

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-slate-200">
        {(["applications", "positions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors",
              subTab === t
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "positions" ? <PositionsPanel /> : <ApplicationsPanel />}
    </div>
  );
}
