import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Pill, AlertTriangle, Package, TrendingDown, Plus, Minus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface Medicine {
  id: string;
  name: string;
  unit: string;
  description: string | null;
  active: boolean;
  stockQuantity: number;
  reorderLevel: number;
  categoryId: string | null;
}

interface Category {
  id: string;
  name: string;
}

type AdjustType = "receive" | "dispense" | "return" | "write-off" | "set";

const ADJUST_TYPES: { value: AdjustType; label: string; icon: typeof Plus; sign: 1 | -1 | 0; color: string }[] = [
  { value: "receive",   label: "Receive Stock",      icon: Plus,        sign:  1, color: "text-emerald-600" },
  { value: "dispense",  label: "Dispense / Issue",   icon: Minus,       sign: -1, color: "text-amber-600"   },
  { value: "return",    label: "Return to Stock",    icon: RefreshCw,   sign:  1, color: "text-sky-600"     },
  { value: "write-off", label: "Write-off / Expired",icon: TrendingDown,sign: -1, color: "text-red-600"    },
  { value: "set",       label: "Set Quantity",       icon: Package,     sign:  0, color: "text-slate-600"   },
];

function stockStatus(qty: number, reorder: number): { label: string; cls: string; dot: string } {
  if (qty <= 0)          return { label: "Out of Stock", cls: "bg-red-50 text-red-700 border-red-200",    dot: "bg-red-500"    };
  if (qty <= reorder)    return { label: "Low Stock",    cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" };
  return                        { label: "In Stock",     cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AdjustStockDialog({ medicine, onDone, onClose }: { medicine: Medicine; onDone: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<AdjustType>("receive");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);

  const adjType = ADJUST_TYPES.find(a => a.value === type)!;
  const qtyNum = parseInt(qty, 10);
  const newStock = type === "set"
    ? (isNaN(qtyNum) ? medicine.stockQuantity : qtyNum)
    : medicine.stockQuantity + (isNaN(qtyNum) ? 0 : adjType.sign * qtyNum);

  async function handleSave() {
    if (isNaN(qtyNum) || qtyNum < 0) { toast({ title: "Enter a valid quantity", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/medical/medicines/${medicine.id}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ type, quantity: qtyNum }),
      });
      toast({ title: "Stock updated", description: `${medicine.name}: ${medicine.stockQuantity} → ${Math.max(0, newStock)} ${medicine.unit}(s)` });
      onDone();
    } catch {
      toast({ title: "Failed to update stock", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-red-500" /> Adjust Stock — {medicine.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Current Stock</p>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{medicine.stockQuantity} <span className="text-sm font-normal text-slate-400">{medicine.unit}(s)</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Reorder at</p>
              <p className="text-sm font-semibold text-slate-700">{medicine.reorderLevel} {medicine.unit}(s)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Adjustment Type</label>
            <Select value={type} onValueChange={v => setType(v as AdjustType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUST_TYPES.map(a => (
                  <SelectItem key={a.value} value={a.value}>
                    <span className={cn("font-medium", a.color)}>{a.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {type === "set" ? "New Quantity" : "Quantity"}
            </label>
            <Input
              type="number"
              min={0}
              value={qty}
              onChange={e => setQty(e.target.value)}
              placeholder={type === "set" ? "Enter exact quantity" : "Enter quantity"}
              autoFocus
            />
          </div>

          {qty && !isNaN(qtyNum) && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">New stock level</span>
              <span className={cn("text-lg font-bold tabular-nums", Math.max(0, newStock) === 0 ? "text-red-600" : Math.max(0, newStock) <= medicine.reorderLevel ? "text-amber-600" : "text-emerald-600")}>
                {Math.max(0, newStock)} {medicine.unit}(s)
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !qty || isNaN(qtyNum)} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? "Saving…" : "Update Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MedicalMedicationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");
  const [adjusting, setAdjusting] = useState<Medicine | null>(null);

  const { data: medicines = [], isLoading } = useQuery<Medicine[]>({
    queryKey: ["medical-medicines"],
    queryFn: () => apiFetch("/api/admin/medical/medicines"),
    staleTime: 30_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["medical-medicine-categories"],
    queryFn: () => apiFetch("/api/admin/medical/medicine-categories"),
    staleTime: 60_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["medical-medicines"] });
  }

  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  const filtered = medicines.filter(m => {
    if (!m.active) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "low")  return m.stockQuantity > 0 && m.stockQuantity <= m.reorderLevel;
    if (statusFilter === "out")  return m.stockQuantity <= 0;
    return true;
  });

  const totalActive = medicines.filter(m => m.active).length;
  const lowStock    = medicines.filter(m => m.active && m.stockQuantity > 0 && m.stockQuantity <= m.reorderLevel).length;
  const outOfStock  = medicines.filter(m => m.active && m.stockQuantity <= 0).length;
  const totalUnits  = medicines.filter(m => m.active).reduce((sum, m) => sum + m.stockQuantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Medicine Inventory</h2>
        <p className="text-sm text-slate-500 mt-0.5">Track stock levels, receive new supplies, and monitor dispensing.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Medicines"  value={isLoading ? "…" : totalActive}   icon={Pill}          color="text-red-600"    bg="bg-red-50"    />
        <StatCard label="Total Units"      value={isLoading ? "…" : totalUnits}    icon={Package}       color="text-indigo-600" bg="bg-indigo-50" sub="across all drugs" />
        <StatCard label="Low Stock"        value={isLoading ? "…" : lowStock}      icon={AlertTriangle} color="text-amber-600"  bg="bg-amber-50"  sub="at or below reorder level" />
        <StatCard label="Out of Stock"     value={isLoading ? "…" : outOfStock}    icon={TrendingDown}  color="text-red-700"    bg="bg-red-100"   />
      </div>

      {/* Alerts */}
      {(outOfStock > 0 || lowStock > 0) && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Stock Alert</p>
            <p className="text-amber-700 mt-0.5">
              {outOfStock > 0 && <><strong>{outOfStock}</strong> medicine{outOfStock !== 1 ? "s" : ""} out of stock.</>}
              {outOfStock > 0 && lowStock > 0 && " "}
              {lowStock > 0 && <><strong>{lowStock}</strong> medicine{lowStock !== 1 ? "s" : ""} at or below reorder level.</>}
              {" "}Update stock from the <strong>Adjust Stock</strong> button.
            </p>
          </div>
        </div>
      )}

      {/* Filters + table */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search medicine…" className="pl-8 h-8 text-sm" />
          </div>
          <div className="flex gap-1">
            {(["all", "low", "out"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                  statusFilter === s
                    ? s === "out" ? "bg-red-100 text-red-700" : s === "low" ? "bg-amber-100 text-amber-700" : "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {s === "all" ? "All" : s === "low" ? "Low Stock" : "Out of Stock"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Medicine</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">In Stock</th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Reorder At</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-slate-100 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                    {search || statusFilter !== "all" ? "No medicines match the current filter." : "No medicines in the catalog. Add some in Setup → Medicine Catalog."}
                  </td>
                </tr>
              ) : filtered.map(m => {
                const st = stockStatus(m.stockQuantity, m.reorderLevel);
                return (
                  <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 text-[13px]">{m.name}</p>
                      {m.description && <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-48">{m.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-600">
                      {m.categoryId ? (catMap[m.categoryId] ?? "—") : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 capitalize">{m.unit}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("text-base font-bold tabular-nums", m.stockQuantity <= 0 ? "text-red-600" : m.stockQuantity <= m.reorderLevel ? "text-amber-600" : "text-slate-800")}>
                        {m.stockQuantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-[12px] text-slate-500 tabular-nums">{m.reorderLevel}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border", st.cls)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setAdjusting(m)} className="h-7 px-2.5 text-xs gap-1">
                        <Package className="h-3 w-3" /> Adjust Stock
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adjusting && (
        <AdjustStockDialog
          medicine={adjusting}
          onDone={() => { invalidate(); setAdjusting(null); }}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}
