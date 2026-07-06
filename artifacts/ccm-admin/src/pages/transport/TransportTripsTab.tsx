import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Bus, ChevronLeft, ChevronRight, CalendarDays,
  Play, CheckCheck, XCircle, Copy, ArrowRight,
} from "lucide-react";
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

interface Vehicle { id: string; regNo: string; make: string; model: string; capacity: number; vehicleType: string; }
interface Driver  { id: string; name: string; phone?: string; status: string; }
interface Route   { id: string; name: string; origin: string; destination: string; }
interface Trip {
  id: string; tripDate: string; departureTime: string | null; arrivalTime: string | null;
  status: string; passengerCount: number; notes: string | null;
  routeId: string | null;   routeName: string | null; routeOrigin: string | null; routeDestination: string | null;
  vehicleId: string | null; vehicleRegNo: string | null; vehicleCapacity: number | null;
  driverId: string | null;  driverName: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  scheduled:   { label: "Scheduled",   color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200" },
  "in-progress": { label: "In Progress", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  completed:   { label: "Completed",   color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  cancelled:   { label: "Cancelled",   color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
};

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}
function display(iso: string) {
  return formatDate(iso + "T00:00:00");
}

type F = {
  routeId: string; vehicleId: string; driverId: string; tripDate: string;
  departureTime: string; arrivalTime: string; status: string; passengerCount: string; notes: string;
};
function emptyForm(date: string): F {
  return { routeId: "", vehicleId: "", driverId: "", tripDate: date, departureTime: "", arrivalTime: "", status: "scheduled", passengerCount: "0", notes: "" };
}
function toForm(t: Trip): F {
  return { routeId: t.routeId ?? "", vehicleId: t.vehicleId ?? "", driverId: t.driverId ?? "", tripDate: t.tripDate, departureTime: t.departureTime ?? "", arrivalTime: t.arrivalTime ?? "", status: t.status, passengerCount: String(t.passengerCount ?? 0), notes: t.notes ?? "" };
}
function toBody(f: F) {
  return { routeId: f.routeId || null, vehicleId: f.vehicleId || null, driverId: f.driverId || null, tripDate: f.tripDate, departureTime: f.departureTime || null, arrivalTime: f.arrivalTime || null, status: f.status, passengerCount: Number(f.passengerCount) || 0, notes: f.notes.trim() || null };
}

export function TransportTripsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [date, setDate] = useState(fmt(new Date()));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState<F>(emptyForm(date));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  const todayIso = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));

  const invToday = () => qc.invalidateQueries({ queryKey: ["transport-trips", date] });
  const invDash  = () => qc.invalidateQueries({ queryKey: ["transport-trips-dash"] });

  // Today's trips
  const { data: trips = [], isLoading } = useQuery<Trip[]>({
    queryKey: ["transport-trips", date],
    queryFn: () => apiFetch(`/api/admin/transport/trips?date=${date}`),
    staleTime: 10_000,
  });

  // Yesterday's trips (for clone)
  const { data: yesterdayTrips = [] } = useQuery<Trip[]>({
    queryKey: ["transport-trips", yesterday],
    queryFn: () => apiFetch(`/api/admin/transport/trips?date=${yesterday}`),
    staleTime: 30_000,
    enabled: date === todayIso,
  });

  // Reference data
  const { data: vehicles = [] } = useQuery<Vehicle[]>({ queryKey: ["transport-vehicles"], queryFn: () => apiFetch("/api/admin/transport/vehicles"), staleTime: 60_000 });
  const { data: drivers = [] }  = useQuery<Driver[]>({ queryKey: ["transport-drivers"],  queryFn: () => apiFetch("/api/admin/transport/drivers"),  staleTime: 60_000 });
  const { data: routes = [] }   = useQuery<Route[]>({ queryKey: ["transport-routes"],   queryFn: () => apiFetch("/api/admin/transport/routes"),   staleTime: 60_000 });

  const activeDrivers = drivers.filter(d => d.status === "active");

  const saveMut = useMutation({
    mutationFn: (f: F) => editing
      ? apiFetch(`/api/admin/transport/trips/${editing.id}`, { method: "PUT", body: JSON.stringify(toBody(f)) })
      : apiFetch("/api/admin/transport/trips", { method: "POST", body: JSON.stringify(toBody(f)) }),
    onSuccess: () => { invToday(); invDash(); setOpen(false); toast({ title: editing ? "Trip updated" : "Trip logged" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/admin/transport/trips/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { invToday(); invDash(); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/transport/trips/${id}`, { method: "DELETE" }),
    onSuccess: () => { invToday(); invDash(); setDeleteId(null); toast({ title: "Trip removed" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  async function cloneYesterday() {
    if (yesterdayTrips.length === 0) return;
    setCloning(true);
    try {
      const payload = yesterdayTrips.map(t => ({
        routeId: t.routeId, vehicleId: t.vehicleId, driverId: t.driverId,
        tripDate: date, departureTime: t.departureTime, arrivalTime: t.arrivalTime,
        status: "scheduled", passengerCount: t.passengerCount, notes: t.notes,
      }));
      await apiFetch("/api/admin/transport/trips/bulk", { method: "POST", body: JSON.stringify({ trips: payload }) });
      invToday(); invDash();
      toast({ title: `${payload.length} trip${payload.length !== 1 ? "s" : ""} copied from yesterday` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Clone failed", description: e.message });
    } finally { setCloning(false); }
  }

  function openAdd() { setEditing(null); setForm(emptyForm(date)); setOpen(true); }
  function openEdit(t: Trip) { setEditing(t); setForm(toForm(t)); setOpen(true); }
  function setF(k: keyof F, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function navDate(delta: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(fmt(d));
  }

  // Stats
  const stats = useMemo(() => ({
    total: trips.length,
    completed: trips.filter(t => t.status === "completed").length,
    inProgress: trips.filter(t => t.status === "in-progress").length,
    scheduled: trips.filter(t => t.status === "scheduled").length,
    passengers: trips.reduce((s, t) => s + (t.passengerCount ?? 0), 0),
  }), [trips]);

  const canClone = date === todayIso && yesterdayTrips.length > 0 && trips.length === 0;

  return (
    <div className="space-y-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">{display(date)}</span>
          {date === todayIso && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Today</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-8 px-2 text-xs rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-700"
          />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navDate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {date !== todayIso && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDate(todayIso)}>
              Jump to Today
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {trips.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-slate-800" },
            { label: "In Progress", value: stats.inProgress, color: "text-amber-600" },
            { label: "Completed", value: stats.completed, color: "text-green-600" },
            { label: "Passengers", value: stats.passengers, color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-white px-4 py-3 text-center shadow-sm">
              <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Log Trip
        </Button>
        {canClone && (
          <Button size="sm" variant="outline" onClick={cloneYesterday} disabled={cloning}>
            <Copy className="mr-1.5 h-4 w-4" />
            {cloning ? "Cloning…" : `Clone Yesterday's ${yesterdayTrips.length} Trip${yesterdayTrips.length !== 1 ? "s" : ""}`}
          </Button>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {trips.length === 0 ? "No trips for this date" : `${trips.length} trip${trips.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Trips list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-xl border border-border bg-white py-16 text-center shadow-sm">
          <Bus className="h-12 w-12 mx-auto mb-3 text-slate-200" />
          <p className="text-sm text-slate-500 font-medium">No trips logged for {display(date)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {canClone
              ? "Click 'Clone Yesterday' to copy the previous day's schedule, or 'Log Trip' to add manually."
              : "Click 'Log Trip' to record a trip for this date."}
          </p>
          {canClone && (
            <Button size="sm" className="mt-4" variant="outline" onClick={cloneYesterday} disabled={cloning}>
              <Copy className="mr-1.5 h-4 w-4" />
              {cloning ? "Cloning…" : `Clone Yesterday (${yesterdayTrips.length} trips)`}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map(trip => {
            const s = STATUS_CONFIG[trip.status] ?? STATUS_CONFIG.scheduled;
            return (
              <div key={trip.id} className="rounded-xl border border-border bg-white px-4 py-3 shadow-sm flex items-center gap-4">
                {/* Route info */}
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Bus className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">
                      {trip.routeName ?? "Route TBD"}
                    </span>
                    {trip.routeOrigin && trip.routeDestination && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        {trip.routeOrigin} <ArrowRight className="h-3 w-3" /> {trip.routeDestination}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                    {trip.vehicleRegNo && <span className="font-mono">{trip.vehicleRegNo}</span>}
                    {trip.driverName && <span>{trip.driverName}</span>}
                    {trip.departureTime && <span>Dep: {trip.departureTime}</span>}
                    {trip.arrivalTime && <span>Arr: {trip.arrivalTime}</span>}
                    {trip.passengerCount > 0 && <span>{trip.passengerCount} pax</span>}
                  </div>
                </div>

                {/* Status chip */}
                <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0", s.color, s.bg, s.border)}>
                  {s.label}
                </span>

                {/* Quick actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {trip.status === "scheduled" && (
                    <Button
                      size="sm" variant="outline"
                      className="h-7 px-2 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => statusMut.mutate({ id: trip.id, status: "in-progress" })}
                      disabled={statusMut.isPending}
                    >
                      <Play className="h-3 w-3 mr-1" />Start
                    </Button>
                  )}
                  {trip.status === "in-progress" && (
                    <Button
                      size="sm" variant="outline"
                      className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => statusMut.mutate({ id: trip.id, status: "completed" })}
                      disabled={statusMut.isPending}
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />Complete
                    </Button>
                  )}
                  {(trip.status === "scheduled" || trip.status === "in-progress") && (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-xs text-red-500 hover:bg-red-50"
                      onClick={() => statusMut.mutate({ id: trip.id, status: "cancelled" })}
                      disabled={statusMut.isPending}
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(trip)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(trip.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log/Edit dialog */}
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Trip" : "Log Trip"}</DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">{display(form.tripDate)}</p>
          </DialogHeader>
          <div className="space-y-4 pt-1">

            {/* Date — only show for editing or if not on date view */}
            <div>
              <Label>Trip Date *</Label>
              <Input type="date" className="mt-1" value={form.tripDate} onChange={e => setF("tripDate", e.target.value)} />
            </div>

            {/* Route */}
            <div>
              <Label>Route</Label>
              <Select value={form.routeId || "__none__"} onValueChange={v => setF("routeId", v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select route…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {routes.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{r.origin && r.destination ? ` (${r.origin} → ${r.destination})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Vehicle */}
              <div>
                <Label>Vehicle</Label>
                <Select value={form.vehicleId || "__none__"} onValueChange={v => setF("vehicleId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.regNo}{v.make ? ` · ${v.make} ${v.model}` : ""}{v.capacity ? ` (${v.capacity} seats)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Driver */}
              <div>
                <Label>Driver</Label>
                <Select value={form.driverId || "__none__"} onValueChange={v => setF("driverId", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select driver…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {activeDrivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Times */}
              <div>
                <Label>Departure</Label>
                <Input type="time" className="mt-1" value={form.departureTime} onChange={e => setF("departureTime", e.target.value)} />
              </div>
              <div>
                <Label>Arrival</Label>
                <Input type="time" className="mt-1" value={form.arrivalTime} onChange={e => setF("arrivalTime", e.target.value)} />
              </div>

              {/* Passengers + status */}
              <div>
                <Label>Passengers</Label>
                <Input type="number" min="0" className="mt-1" value={form.passengerCount} onChange={e => setF("passengerCount", e.target.value)} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!form.tripDate || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Saving…" : editing ? "Save Changes" : "Log Trip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete trip record?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && delMut.mutate(deleteId)} disabled={delMut.isPending}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
