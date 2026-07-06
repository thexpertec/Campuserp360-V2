import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCnic, formatPhone } from "@/lib/format";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Bus, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface Driver {
  id: string; name: string; cnic: string | null; licenseNumber: string | null;
  licenseType: string; licenseExpiry: string | null; phone: string | null;
  address: string | null; status: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-slate-100 text-slate-600",
  suspended: "bg-red-100 text-red-700",
};

type F = { name: string; cnic: string; licenseNumber: string; licenseType: string; licenseExpiry: string; phone: string; address: string; status: string };
const empty = (): F => ({ name: "", cnic: "", licenseNumber: "", licenseType: "HTV", licenseExpiry: "", phone: "", address: "", status: "active" });
const toForm = (r: Driver): F => ({ name: r.name, cnic: r.cnic ?? "", licenseNumber: r.licenseNumber ?? "", licenseType: r.licenseType ?? "HTV", licenseExpiry: r.licenseExpiry ?? "", phone: r.phone ?? "", address: r.address ?? "", status: r.status });

function licenseStatus(expiry: string | null): "ok" | "expiring" | "expired" | "none" {
  if (!expiry) return "none";
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "ok";
}

export function TransportDriversTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["transport-drivers"],
    queryFn: () => apiFetch("/api/admin/transport/drivers"),
    staleTime: 30_000,
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["transport-drivers"] });

  const saveMut = useMutation({
    mutationFn: (f: F) => editing
      ? apiFetch(`/api/admin/transport/drivers/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...f, cnic: f.cnic || null, licenseNumber: f.licenseNumber || null, licenseExpiry: f.licenseExpiry || null, phone: f.phone || null, address: f.address || null }) })
      : apiFetch("/api/admin/transport/drivers", { method: "POST", body: JSON.stringify({ ...f, cnic: f.cnic || null, licenseNumber: f.licenseNumber || null, licenseExpiry: f.licenseExpiry || null, phone: f.phone || null, address: f.address || null }) }),
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Driver updated" : "Driver added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/transport/drivers/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Driver removed" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = drivers.filter(d => {
    if (filterStatus !== "__all__" && d.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || (d.cnic ?? "").includes(q) || (d.licenseNumber ?? "").toLowerCase().includes(q) || (d.phone ?? "").includes(q);
    }
    return true;
  });

  const expiringCount = drivers.filter(d => ["expiring", "expired"].includes(licenseStatus(d.licenseExpiry))).length;

  return (
    <div className="space-y-4">
      {/* Expiry warning banner */}
      {expiringCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>{expiringCount} driver license{expiringCount !== 1 ? "s" : ""}</strong> expire{expiringCount === 1 ? "s" : ""} soon or already expired — review below.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Registered drivers with license and contact details.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Driver
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, CNIC, license…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Driver","Phone","License No.","Type","Expiry","Status",""].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              [...Array(3)].map((_, i) => <tr key={i}><td colSpan={7} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>)
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-14 text-center">
                <Bus className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400">{drivers.length === 0 ? "No drivers yet — click Add Driver to register one." : "No drivers match your filters."}</p>
              </td></tr>
            ) : filtered.map(d => {
              const ls = licenseStatus(d.licenseExpiry);
              const daysLeft = d.licenseExpiry ? Math.floor((new Date(d.licenseExpiry).getTime() - Date.now()) / 86_400_000) : null;
              return (
                <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{d.name}</p>
                    {d.cnic && <p className="text-xs text-slate-400 font-mono">{d.cnic}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-xs">{d.phone ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{d.licenseNumber ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{d.licenseType}</td>
                  <td className="px-3 py-2.5">
                    {d.licenseExpiry ? (
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-xs", ls === "expired" ? "text-red-600 font-semibold" : ls === "expiring" ? "text-amber-600 font-semibold" : "text-slate-500")}>
                          {d.licenseExpiry}
                        </span>
                        {ls === "expired" && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">EXPIRED</span>}
                        {ls === "expiring" && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">{daysLeft}d left</span>}
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600")}>{d.status}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(d); setForm(toForm(d)); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            {filtered.length} driver{filtered.length !== 1 ? "s" : ""}
            {" · "}{drivers.filter(d => d.status === "active").length} active
          </div>
        )}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Driver" : "Add Driver"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Full Name *</Label>
              <Input className="mt-1" value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Driver full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNIC</Label>
                <Input className="mt-1" value={form.cnic} onChange={e => setF("cnic", formatCnic(e.target.value))} placeholder="XXXXX-XXXXXXX-X" maxLength={15} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1" value={form.phone} onChange={e => setF("phone", formatPhone(e.target.value))} placeholder="0XXX-XXXXXXX" maxLength={12} />
              </div>
              <div>
                <Label>License Number</Label>
                <Input className="mt-1" value={form.licenseNumber} onChange={e => setF("licenseNumber", e.target.value)} placeholder="License no." />
              </div>
              <div>
                <Label>License Type</Label>
                <Select value={form.licenseType} onValueChange={v => setF("licenseType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HTV">HTV — Heavy Transport</SelectItem>
                    <SelectItem value="LTV">LTV — Light Transport</SelectItem>
                    <SelectItem value="PSV">PSV — Public Service</SelectItem>
                    <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>License Expiry</Label>
                <Input type="date" className="mt-1" value={form.licenseExpiry} onChange={e => setF("licenseExpiry", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input className="mt-1" value={form.address} onChange={e => setF("address", e.target.value)} placeholder="Home address" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete driver?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
