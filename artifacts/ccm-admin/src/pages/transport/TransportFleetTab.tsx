import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Bus, Car, Truck, Search, ArrowRight } from "lucide-react";
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

interface Vehicle {
  id: string; regNo: string; make: string; model: string;
  vehicleType: string; capacity: number; active: boolean; description: string | null;
}
interface Trip {
  id: string; tripDate: string; status: string;
  vehicleId: string | null; routeName: string | null;
  routeOrigin: string | null; routeDestination: string | null; driverName: string | null;
}

function VehicleIcon({ type }: { type: string }) {
  if (type === "car") return <Car className="h-5 w-5 text-blue-600" />;
  if (type === "van") return <Truck className="h-5 w-5 text-indigo-600" />;
  return <Bus className="h-5 w-5 text-blue-600" />;
}

type F = { regNo: string; make: string; model: string; vehicleType: string; capacity: string; description: string; active: string };
const empty = (): F => ({ regNo: "", make: "", model: "", vehicleType: "bus", capacity: "40", description: "", active: "true" });
const toForm = (v: Vehicle): F => ({ regNo: v.regNo, make: v.make, model: v.model, vehicleType: v.vehicleType, capacity: String(v.capacity), description: v.description ?? "", active: String(v.active) });

export function TransportFleetTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ["transport-vehicles"],
    queryFn: () => apiFetch("/api/admin/transport/vehicles"),
    staleTime: 30_000,
  });

  const { data: todayTrips = [] } = useQuery<Trip[]>({
    queryKey: ["transport-trips", today],
    queryFn: () => apiFetch(`/api/admin/transport/trips?date=${today}`),
    staleTime: 15_000,
  });

  const inv = () => qc.invalidateQueries({ queryKey: ["transport-vehicles"] });

  const saveMut = useMutation({
    mutationFn: (f: F) => {
      const body = { regNo: f.regNo, make: f.make, model: f.model, vehicleType: f.vehicleType, capacity: Number(f.capacity) || 0, description: f.description || null, active: f.active === "true" };
      return editing
        ? apiFetch(`/api/admin/transport/vehicles/${editing.id}`, { method: "PUT", body: JSON.stringify(body) })
        : apiFetch("/api/admin/transport/vehicles", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { inv(); setOpen(false); toast({ title: editing ? "Vehicle updated" : "Vehicle added" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/transport/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); setDeleteId(null); toast({ title: "Vehicle removed" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filtered = vehicles.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.regNo.toLowerCase().includes(q) || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || v.vehicleType.toLowerCase().includes(q);
  });

  function getActiveTrip(vehicleId: string) {
    return todayTrips.find(t => t.vehicleId === vehicleId && (t.status === "in-progress" || t.status === "scheduled"));
  }

  const activeCount = vehicles.filter(v => v.active).length;
  const onTripCount = todayTrips.filter(t => t.status === "in-progress").map(t => t.vehicleId).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Vehicles", value: vehicles.length, color: "text-slate-800" },
          { label: "Active",         value: activeCount,     color: "text-green-700" },
          { label: "On Trip Today",  value: onTripCount,     color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-white p-3 text-center shadow-sm">
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reg no, make, model…" className="pl-8 h-9 text-sm" />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setForm(empty()); setOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle
        </Button>
      </div>

      {/* Fleet grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-16 text-center shadow-sm">
          <Bus className="h-12 w-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-500">{vehicles.length === 0 ? "No vehicles registered yet." : "No vehicles match your search."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(v => {
            const trip = getActiveTrip(v.id);
            const isOnTrip = !!trip && trip.status === "in-progress";
            return (
              <div key={v.id} className={cn("rounded-xl border bg-white p-4 shadow-sm relative", isOnTrip ? "border-amber-300 bg-amber-50/30" : "border-border")}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", isOnTrip ? "bg-amber-100" : "bg-blue-50")}>
                      <VehicleIcon type={v.vehicleType} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 font-mono">{v.regNo}</p>
                      <p className="text-xs text-slate-500">{v.make} {v.model}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditing(v); setForm(toForm(v)); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(v.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>

                {/* Chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{v.vehicleType}</span>
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{v.capacity} seats</span>
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", v.active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500")}>{v.active ? "Active" : "Inactive"}</span>
                </div>

                {/* Current trip */}
                {trip ? (
                  <div className={cn("rounded-lg px-3 py-2 text-xs", isOnTrip ? "bg-amber-100 text-amber-800" : "bg-slate-50 text-slate-600")}>
                    <p className="font-semibold">{isOnTrip ? "🚌 On Trip" : "📅 Scheduled Today"}</p>
                    <p className="mt-0.5">{trip.routeName ?? "Route TBD"}</p>
                    {trip.routeOrigin && trip.routeDestination && (
                      <p className="flex items-center gap-1 opacity-70">{trip.routeOrigin} <ArrowRight className="h-3 w-3" /> {trip.routeDestination}</p>
                    )}
                    {trip.driverName && <p className="opacity-70">{trip.driverName}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No trips today</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div>
              <Label>Registration Number *</Label>
              <Input className="mt-1 font-mono" value={form.regNo} onChange={e => setF("regNo", e.target.value)} placeholder="e.g. LEA-1234" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Make</Label>
                <Input className="mt-1" value={form.make} onChange={e => setF("make", e.target.value)} placeholder="e.g. Toyota" />
              </div>
              <div>
                <Label>Model</Label>
                <Input className="mt-1" value={form.model} onChange={e => setF("model", e.target.value)} placeholder="e.g. Coaster" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.vehicleType} onValueChange={v => setF("vehicleType", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bus">Bus</SelectItem>
                    <SelectItem value="van">Van / Hiace</SelectItem>
                    <SelectItem value="car">Car / Jeep</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Seating Capacity</Label>
                <Input type="number" min="1" className="mt-1" value={form.capacity} onChange={e => setF("capacity", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.active} onValueChange={v => setF("active", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.description} onChange={e => setF("description", e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.regNo || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Add Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete vehicle?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
