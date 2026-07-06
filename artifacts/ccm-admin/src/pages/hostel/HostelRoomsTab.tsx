import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListAdminHostelRoomTypes } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Building2, Search, Layers } from "lucide-react";
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

interface Block { id: string; name: string; }
interface Room {
  id: string; blockId: string; blockName: string | null;
  roomNumber: string; floor: number; capacity: number;
  status: string; notes: string | null; occupiedCount: number;
  roomTypeId: string | null; roomTypeName: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 text-green-700",
  occupied: "bg-blue-100 text-blue-700",
  full: "bg-orange-100 text-orange-700",
  maintenance: "bg-red-100 text-red-700",
};

type F = { blockId: string; roomNumber: string; floor: string; capacity: string; status: string; notes: string; roomTypeId: string };
const empty = (): F => ({ blockId: "", roomNumber: "", floor: "1", capacity: "2", status: "available", notes: "", roomTypeId: "" });
const toForm = (r: Room): F => ({ blockId: r.blockId, roomNumber: r.roomNumber, floor: String(r.floor ?? 1), capacity: String(r.capacity ?? 2), status: r.status ?? "available", notes: r.notes ?? "", roomTypeId: r.roomTypeId ?? "" });

// ── Bulk add dialog ─────────────────────────────────────────────────────────────
function BulkAddDialog({ open, onClose, blocks, onSaved }: {
  open: boolean; onClose: () => void; blocks: Block[]; onSaved: () => void;
}) {
  const [blockId, setBlockId] = useState("__none__");
  const [floor, setFloor] = useState("1");
  const [capacity, setCapacity] = useState("2");
  const [prefix, setPrefix] = useState("");
  const [fromNumber, setFromNumber] = useState("101");
  const [count, setCount] = useState("10");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  function reset() { setBlockId("__none__"); setFloor("1"); setCapacity("2"); setPrefix(""); setFromNumber("101"); setCount("10"); }

  const preview = Array.from({ length: Math.min(5, Number(count) || 0) }, (_, i) =>
    `${prefix}${Number(fromNumber) + i}`
  );

  async function handleSave() {
    if (blockId === "__none__" || !blockId) return;
    const n = Number(count) || 0;
    if (n < 1 || n > 200) { toast({ variant: "destructive", title: "Count must be 1–200" }); return; }
    setSaving(true);
    try {
      await apiFetch("/api/admin/hostel/rooms/bulk", {
        method: "POST",
        body: JSON.stringify({ blockId, floor: Number(floor) || 1, capacity: Number(capacity) || 2, prefix, fromNumber: Number(fromNumber) || 1, count: n }),
      });
      toast({ title: `${n} rooms created` });
      onSaved();
      onClose();
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Add Rooms</DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">Create a batch of rooms in one go.</p>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label>Block *</Label>
            <Select value={blockId} onValueChange={setBlockId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select block…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Select —</SelectItem>
                {blocks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Floor</Label>
              <Input type="number" min="1" className="mt-1" value={floor} onChange={e => setFloor(e.target.value)} />
            </div>
            <div>
              <Label>Beds / Room</Label>
              <Input type="number" min="1" className="mt-1" value={capacity} onChange={e => setCapacity(e.target.value)} />
            </div>
            <div>
              <Label>How Many</Label>
              <Input type="number" min="1" max="200" className="mt-1" value={count} onChange={e => setCount(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Room Prefix</Label>
              <Input className="mt-1" placeholder="e.g. A, B, leave blank" value={prefix} onChange={e => setPrefix(e.target.value)} />
            </div>
            <div>
              <Label>Starting Number</Label>
              <Input type="number" min="1" className="mt-1" value={fromNumber} onChange={e => setFromNumber(e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          {Number(count) > 0 && (
            <div className="rounded-lg bg-slate-50 border border-border px-3 py-2">
              <p className="text-xs text-slate-500 mb-1">Preview: <span className="font-medium text-slate-700">
                {preview.join(", ")}{Number(count) > 5 ? ` … (+${Number(count) - 5} more)` : ""}
              </span></p>
              <p className="text-xs text-slate-400">{count} rooms · {capacity} beds each · Floor {floor}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button disabled={blockId === "__none__" || !count || saving} onClick={handleSave}>
            {saving ? "Creating…" : `Create ${count} Rooms`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function HostelRoomsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterBlock, setFilterBlock] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: rooms = [], isLoading } = useQuery<Room[]>({
    queryKey: ["hostel-rooms"],
    queryFn: () => apiFetch("/api/admin/hostel/rooms"),
    staleTime: 15_000,
  });

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["hostel-blocks"],
    queryFn: () => apiFetch("/api/admin/hostel/blocks"),
    staleTime: 60_000,
  });

  const { data: roomTypes = [] } = useListAdminHostelRoomTypes();

  const inv = () => qc.invalidateQueries({ queryKey: ["hostel-rooms"] });

  const saveMut = useMutation({
    mutationFn: (data: F) => editing
      ? apiFetch(`/api/admin/hostel/rooms/${editing.id}`, { method: "PUT", body: JSON.stringify({ ...data, floor: Number(data.floor), capacity: Number(data.capacity), roomTypeId: data.roomTypeId || null }) })
      : apiFetch("/api/admin/hostel/rooms", { method: "POST", body: JSON.stringify({ ...data, floor: Number(data.floor), capacity: Number(data.capacity), roomTypeId: data.roomTypeId || null }) }),
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Room updated" : "Room added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/hostel/rooms/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Room deleted" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function openAdd() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: Room) { setEditing(r); setForm(toForm(r)); setOpen(true); }
  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  // When editing and block changes, pre-select it in the form
  useEffect(() => {
    if (!editing && blocks.length === 1) setF("blockId", blocks[0].id);
  }, [blocks]);

  const blockNames = [...new Map(rooms.filter(r => r.blockName).map(r => [r.blockId, r.blockName!])).entries()];

  const filtered = rooms.filter(r => {
    if (filterBlock !== "__all__" && r.blockId !== filterBlock) return false;
    if (filterStatus !== "__all__" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.roomNumber.toLowerCase().includes(q) || (r.blockName ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const totalBeds = filtered.reduce((s, r) => s + (r.capacity ?? 0), 0);
  const totalOccupied = filtered.reduce((s, r) => s + (r.occupiedCount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">All hostel rooms across dormitory blocks.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Layers className="mr-1.5 h-4 w-4" /> Bulk Add
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Room
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rooms…" className="pl-8 h-9 text-sm" />
        </div>
        <Select value={filterBlock} onValueChange={setFilterBlock}>
          <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="All Blocks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Blocks</SelectItem>
            {blockNames.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
            <SelectItem value="full">Full</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Block","Room No.","Type","Floor","Capacity","Occupied","Available","Status",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded-full animate-pulse w-2/3" /></td></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-14 text-center">
                  <Building2 className="h-10 w-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">
                    {rooms.length === 0
                      ? <>No rooms yet — use <strong>Bulk Add</strong> to create a whole block at once.</>
                      : "No rooms match your filters."}
                  </p>
                </td></tr>
              ) : filtered.map(r => {
                const avail = Math.max(0, (r.capacity ?? 0) - (r.occupiedCount ?? 0));
                const pct = r.capacity > 0 ? Math.round((r.occupiedCount / r.capacity) * 100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-slate-600">{r.blockName ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{r.roomNumber}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{r.roomTypeName ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.floor}</td>
                    <td className="px-3 py-2.5 text-slate-700 tabular-nums">{r.capacity}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-green-500")} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-700 font-medium">{r.occupiedCount}</span>
                      </div>
                    </td>
                    <td className={cn("px-3 py-2.5 font-semibold tabular-nums", avail === 0 ? "text-red-500" : avail <= 1 ? "text-amber-600" : "text-green-700")}>{avail}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600")}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 text-xs text-muted-foreground flex gap-4">
            <span>{filtered.length} room{filtered.length !== 1 ? "s" : ""}</span>
            <span>{totalBeds} beds total</span>
            <span>{totalOccupied} occupied</span>
            <span className="text-green-700 font-medium">{totalBeds - totalOccupied} available</span>
          </div>
        )}
      </div>

      {/* Bulk add */}
      <BulkAddDialog open={bulkOpen} onClose={() => setBulkOpen(false)} blocks={blocks} onSaved={inv} />

      {/* Single add/edit */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Room" : "Add Room"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Block *</Label>
              <Select value={form.blockId || "__none__"} onValueChange={v => setF("blockId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select block…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select —</SelectItem>
                  {blocks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Room Number *</Label>
                <Input required className="mt-1" value={form.roomNumber} onChange={e => setF("roomNumber", e.target.value)} placeholder="e.g. 101" />
              </div>
              <div>
                <Label>Floor</Label>
                <Input type="number" min="1" className="mt-1" value={form.floor} onChange={e => setF("floor", e.target.value)} />
              </div>
              <div>
                <Label>Capacity</Label>
                <Input type="number" min="1" className="mt-1" value={form.capacity} onChange={e => setF("capacity", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Room Type</Label>
              <Select value={form.roomTypeId || "__none__"} onValueChange={v => setF("roomTypeId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(roomTypes as any[]).map((rt: any) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setF("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.blockId || !form.roomNumber || saveMut.isPending}
              onClick={() => saveMut.mutate(form)}
            >
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete room?</AlertDialogTitle>
            <AlertDialogDescription>All bed allocations for this room will also be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
