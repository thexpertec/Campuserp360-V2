import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminHrEmployeeSalaryTemplatesQueryKey,
  useCreateAdminHrEmployeeSalaryTemplate,
  useUpdateAdminHrEmployeeSalaryTemplate,
  useListAdminHrIncentiveTypes,
  useListAdminHrDeductionTypes,
  type EmployeeSalaryTemplate,
} from "@workspace/api-client-react";
import {
  Plus, Trash2, X, ChevronDown, ChevronRight,
  TrendingUp, Minus, Calendar, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
export type LineItem = {
  id: string;
  itemType: "incentive" | "deduction";
  name: string;
  calculationType: "fixed" | "percentage";
  value: number;
  sortOrder: number;
};

type FormState = {
  basicSalary: number;
  effectiveFrom: string;
  notes: string;
  active: boolean;
  leaveDeductEnabled: boolean;
  leaveDeductType: "per_day" | "percentage" | "fixed";
  leaveDeductValue: number;
  shortLeaveEnabled: boolean;
  shortLeaveThresholdMinutes: number;
  shortLeaveDeductType: "fixed" | "per_occurrence" | "percentage";
  shortLeaveDeductValue: number;
  items: LineItem[];
};

export type SalaryEmployeeRef = {
  id: string;
  staffId: string;
  fullName: string;
  role: string | null;
};

function emptyForm(): FormState {
  return {
    basicSalary: 0,
    effectiveFrom: "",
    notes: "",
    active: true,
    leaveDeductEnabled: true,
    leaveDeductType: "per_day",
    leaveDeductValue: 0,
    shortLeaveEnabled: false,
    shortLeaveThresholdMinutes: 30,
    shortLeaveDeductType: "fixed",
    shortLeaveDeductValue: 0,
    items: [],
  };
}

function mkItem(type: "incentive" | "deduction"): LineItem {
  return { id: crypto.randomUUID(), itemType: type, name: "", calculationType: "fixed", value: 0, sortOrder: 0 };
}

// ── Line items editor ──────────────────────────────────────────────────────────
function LineItemsEditor({
  type, items, onChange,
}: { type: "incentive" | "deduction"; items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  const filtered = items.filter(i => i.itemType === type);
  const label = type === "incentive" ? "Incentive" : "Deduction";
  const color = type === "incentive" ? "text-emerald-600" : "text-rose-600";
  const Icon = type === "incentive" ? TrendingUp : Minus;

  const { data: incentiveTypes = [] } = useListAdminHrIncentiveTypes();
  const { data: deductionTypes = [] } = useListAdminHrDeductionTypes();
  const masterTypes = type === "incentive" ? incentiveTypes : deductionTypes;

  function add() {
    onChange([...items, { ...mkItem(type), sortOrder: filtered.length }]);
  }
  function remove(id: string) {
    onChange(items.filter(i => i.id !== id));
  }
  function update(id: string, patch: Partial<LineItem>) {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", color)}>
          <Icon className="h-3.5 w-3.5" />
          {label}s
        </div>
        <button
          type="button" onClick={add}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary rounded-md px-2 py-0.5 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add {label}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
          No {label.toLowerCase()}s added yet — click Add {label} to add one.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, idx) => (
            <div key={item.id} className="grid grid-cols-[1fr_130px_100px_32px] gap-2 items-center">
              <div>
                {masterTypes.length > 0 ? (
                  <select
                    className="h-8 w-full text-xs border border-border rounded-md bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    value={item.name}
                    onChange={e => {
                      const val = e.target.value;
                      const master = (masterTypes as any[]).find((t: any) => t.name === val);
                      if (master) {
                        update(item.id, { name: master.name, calculationType: master.calculationType as "fixed" | "percentage", value: Number(master.defaultValue) || 0, sortOrder: idx });
                      } else {
                        update(item.id, { name: val });
                      }
                    }}
                  >
                    <option value="">— Select {label} —</option>
                    {(masterTypes as any[]).map((t: any) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="h-8 w-full text-xs border border-border rounded-md bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={`${label} name (e.g. ${type === "incentive" ? "House Rent Allowance" : "Income Tax"})`}
                    value={item.name}
                    onChange={e => update(item.id, { name: e.target.value, sortOrder: idx })}
                  />
                )}
              </div>
              <select
                className="h-8 text-xs border border-border rounded-md bg-background px-2"
                value={item.calculationType}
                onChange={e => update(item.id, { calculationType: e.target.value as "fixed" | "percentage" })}
              >
                <option value="fixed">Fixed (PKR)</option>
                <option value="percentage">% of Basic</option>
              </select>
              <Input
                type="number" min={0} className="h-8 text-xs"
                placeholder={item.calculationType === "percentage" ? "%" : "PKR"}
                value={item.value || ""}
                onChange={e => update(item.id, { value: Number(e.target.value), sortOrder: idx })}
              />
              <button type="button" onClick={() => remove(item.id)} className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal form ─────────────────────────────────────────────────────────────────
export function SalaryTemplateModal({
  employee,
  editing,
  onClose,
  onSaved,
}: {
  employee: SalaryEmployeeRef;
  editing: EmployeeSalaryTemplate | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: getListAdminHrEmployeeSalaryTemplatesQueryKey() });
    onSaved?.();
  };
  const createMut = useCreateAdminHrEmployeeSalaryTemplate({ mutation: { onSuccess: () => { inv(); onClose(); } } });
  const updateMut = useUpdateAdminHrEmployeeSalaryTemplate({ mutation: { onSuccess: () => { inv(); onClose(); } } });

  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState("");
  const [openSection, setOpenSection] = useState<string>("incentives");

  useEffect(() => {
    if (editing) {
      setForm({
        basicSalary: editing.basicSalary,
        effectiveFrom: editing.effectiveFrom ?? "",
        notes: editing.notes ?? "",
        active: editing.active,
        leaveDeductEnabled: editing.leaveDeductEnabled ?? true,
        leaveDeductType: (editing.leaveDeductType as any) ?? "per_day",
        leaveDeductValue: editing.leaveDeductValue ?? 0,
        shortLeaveEnabled: editing.shortLeaveEnabled ?? false,
        shortLeaveThresholdMinutes: editing.shortLeaveThresholdMinutes ?? 30,
        shortLeaveDeductType: (editing.shortLeaveDeductType as any) ?? "fixed",
        shortLeaveDeductValue: editing.shortLeaveDeductValue ?? 0,
        items: (editing.items ?? []).map(it => ({
          id: it.id,
          itemType: it.itemType as "incentive" | "deduction",
          name: it.name,
          calculationType: it.calculationType as "fixed" | "percentage",
          value: it.value,
          sortOrder: it.sortOrder,
        })),
      });
    } else {
      setForm(emptyForm());
    }
    setError("");
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<FormState>) => setForm(p => ({ ...p, ...patch }));

  const incentives = form.items.filter(i => i.itemType === "incentive");
  const deductions = form.items.filter(i => i.itemType === "deduction");
  const totalIncentives = incentives.reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round(form.basicSalary * i.value / 100) : i.value), 0);
  const totalDeductions = deductions.reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round(form.basicSalary * i.value / 100) : i.value), 0);
  const netSalary = form.basicSalary + totalIncentives - totalDeductions;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.basicSalary < 0) { setError("Basic salary cannot be negative."); return; }
    if (!Number.isInteger(form.basicSalary)) { setError("Basic salary must be a whole number (no decimals/paisa)."); return; }
    const namedItems = form.items.filter(i => i.name.trim());
    const fractionalItem = namedItems.find(i => !Number.isInteger(i.value));
    if (fractionalItem) {
      setError(`"${fractionalItem.name}" amount must be a whole number (no decimals).`);
      return;
    }
    const payload = {
      basicSalary: Math.round(form.basicSalary),
      effectiveFrom: form.effectiveFrom || undefined,
      notes: form.notes || undefined,
      active: form.active,
      leaveDeductEnabled: form.leaveDeductEnabled,
      leaveDeductType: form.leaveDeductType,
      leaveDeductValue: Math.round(form.leaveDeductValue),
      shortLeaveEnabled: form.shortLeaveEnabled,
      shortLeaveThresholdMinutes: Math.round(form.shortLeaveThresholdMinutes),
      shortLeaveDeductType: form.shortLeaveDeductType,
      shortLeaveDeductValue: Math.round(form.shortLeaveDeductValue),
      items: namedItems.map((it, idx) => ({
        itemType: it.itemType,
        name: it.name.trim(),
        calculationType: it.calculationType,
        value: Math.round(it.value),
        sortOrder: idx,
      })),
    };
    try {
      if (editing) {
        // The update endpoint's strict schema rejects employeeId (it cannot change),
        // so it is intentionally omitted from the payload despite the generated type.
        await updateMut.mutateAsync({ id: editing.id, data: payload as any });
      } else {
        await createMut.mutateAsync({ data: { ...payload, employeeId: employee.id } });
      }
    } catch (err: any) {
      const details = err?.response?.data?.details;
      setError(
        (typeof details === "string" ? details : err?.response?.data?.error) ??
        "Failed to save salary configuration.",
      );
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  function toggleSection(key: string) {
    setOpenSection(s => s === key ? "" : key);
  }

  const SectionHeader = ({ id, label, icon: Icon }: { id: string; label: string; icon: React.ElementType }) => (
    <button
      type="button"
      className="w-full flex items-center justify-between py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => toggleSection(id)}
    >
      <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
      {openSection === id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {editing ? "Edit Salary" : "Define Salary"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-semibold text-foreground">{employee.fullName}</span>
              <span className="mx-1.5 text-border">·</span>
              {employee.staffId}
              {employee.role && <><span className="mx-1.5 text-border">·</span>{employee.role}</>}
              {editing && <><span className="mx-1.5 text-border">·</span><code className="font-mono text-[10px]">{editing.templateCode}</code></>}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6 max-h-[80vh] overflow-y-auto">

            {/* ── Basic info ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Basic Salary (PKR) <span className="text-destructive">*</span></Label>
                <Input
                  type="number" min={0} className="mt-1 h-9 text-sm"
                  value={form.basicSalary || ""}
                  onChange={e => set({ basicSalary: Number(e.target.value) })}
                  placeholder="e.g. 50000"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Effective From</Label>
                <Input
                  type="date" className="mt-1 h-9 text-sm"
                  value={form.effectiveFrom}
                  onChange={e => set({ effectiveFrom: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <Label className="text-xs font-semibold">Notes</Label>
                <textarea
                  className="mt-1 w-full text-sm border border-border rounded-md bg-background px-3 py-2 resize-none h-16"
                  placeholder="Optional notes about this salary configuration"
                  value={form.notes}
                  onChange={e => set({ notes: e.target.value })}
                />
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="active-chk" className="h-4 w-4 accent-primary" checked={form.active} onChange={e => set({ active: e.target.checked })} />
                <Label htmlFor="active-chk" className="text-xs cursor-pointer">Salary Active</Label>
              </div>
            </div>

            {/* ── Incentives ── */}
            <div className="border-t border-border pt-4">
              <SectionHeader id="incentives" label="Incentives & Allowances" icon={TrendingUp} />
              {openSection === "incentives" && (
                <div className="mt-2">
                  <LineItemsEditor type="incentive" items={form.items} onChange={items => set({ items })} />
                  {incentives.filter(i => i.name.trim()).length > 0 && (
                    <p className="text-xs text-emerald-600 mt-2 text-right">
                      Total incentives: {formatCurrency(totalIncentives)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Deductions ── */}
            <div className="border-t border-border pt-4">
              <SectionHeader id="deductions" label="Deductions" icon={Minus} />
              {openSection === "deductions" && (
                <div className="mt-2">
                  <LineItemsEditor type="deduction" items={form.items} onChange={items => set({ items })} />
                  {deductions.filter(i => i.name.trim()).length > 0 && (
                    <p className="text-xs text-rose-600 mt-2 text-right">
                      Total deductions: {formatCurrency(totalDeductions)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Leave deduction rules ── */}
            <div className="border-t border-border pt-4">
              <SectionHeader id="leave" label="Leave Deduction Rules" icon={Calendar} />
              {openSection === "leave" && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="leave-enabled" className="h-4 w-4 accent-primary" checked={form.leaveDeductEnabled} onChange={e => set({ leaveDeductEnabled: e.target.checked })} />
                    <Label htmlFor="leave-enabled" className="text-xs cursor-pointer">Enable leave salary deductions</Label>
                  </div>
                  {form.leaveDeductEnabled && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Deduction Method</Label>
                        <select
                          className="mt-1 w-full h-8 text-xs border border-border rounded-md bg-background px-2"
                          value={form.leaveDeductType}
                          onChange={e => set({ leaveDeductType: e.target.value as any })}
                        >
                          <option value="per_day">Per Day (fixed PKR per day absent)</option>
                          <option value="percentage">Percentage (% of basic per day)</option>
                          <option value="fixed">Fixed (flat deduction per leave)</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {form.leaveDeductType === "per_day" ? "PKR per Day" : form.leaveDeductType === "percentage" ? "% of Basic per Day" : "Fixed Amount (PKR)"}
                        </Label>
                        <Input
                          type="number" min={0} className="mt-1 h-8 text-xs"
                          value={form.leaveDeductValue || ""}
                          onChange={e => set({ leaveDeductValue: Number(e.target.value) })}
                          placeholder={form.leaveDeductType === "percentage" ? "e.g. 3.33" : "e.g. 1500"}
                        />
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-md p-2">
                          {form.leaveDeductType === "per_day" && `Each absent day deducts ${formatCurrency(form.leaveDeductValue ?? 0)} from salary.`}
                          {form.leaveDeductType === "percentage" && `Each absent day deducts ${form.leaveDeductValue ?? 0}% of basic (${formatCurrency(Math.round((form.leaveDeductValue ?? 0) * form.basicSalary / 100))}) from salary.`}
                          {form.leaveDeductType === "fixed" && `Each leave request deducts a flat ${formatCurrency(form.leaveDeductValue ?? 0)} regardless of duration.`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Short leave rules ── */}
            <div className="border-t border-border pt-4">
              <SectionHeader id="short-leave" label="Short Leave Deduction Rules" icon={FileText} />
              {openSection === "short-leave" && (
                <div className="mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="sl-enabled" className="h-4 w-4 accent-primary" checked={form.shortLeaveEnabled} onChange={e => set({ shortLeaveEnabled: e.target.checked })} />
                    <Label htmlFor="sl-enabled" className="text-xs cursor-pointer">Enable short leave deductions</Label>
                  </div>
                  {form.shortLeaveEnabled && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                      <div>
                        <Label className="text-xs text-muted-foreground">Late Threshold (minutes)</Label>
                        <Input
                          type="number" min={1} max={480} className="mt-1 h-8 text-xs"
                          value={form.shortLeaveThresholdMinutes || ""}
                          onChange={e => set({ shortLeaveThresholdMinutes: Number(e.target.value) })}
                          placeholder="e.g. 30"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Arriving late by more than this triggers short leave.</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Deduction Type</Label>
                        <select
                          className="mt-1 w-full h-8 text-xs border border-border rounded-md bg-background px-2"
                          value={form.shortLeaveDeductType}
                          onChange={e => set({ shortLeaveDeductType: e.target.value as any })}
                        >
                          <option value="fixed">Fixed amount per occurrence</option>
                          <option value="per_occurrence">Per occurrence (same as fixed)</option>
                          <option value="percentage">Percentage of daily salary</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          {form.shortLeaveDeductType === "percentage" ? "% Deduction" : "PKR per Occurrence"}
                        </Label>
                        <Input
                          type="number" min={0} className="mt-1 h-8 text-xs"
                          value={form.shortLeaveDeductValue || ""}
                          onChange={e => set({ shortLeaveDeductValue: Number(e.target.value) })}
                          placeholder={form.shortLeaveDeductType === "percentage" ? "e.g. 50" : "e.g. 200"}
                        />
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-md p-2">
                          Coming in more than {form.shortLeaveThresholdMinutes} minutes late triggers a deduction of
                          {form.shortLeaveDeductType === "percentage"
                            ? ` ${form.shortLeaveDeductValue}% of the daily salary rate`
                            : ` ${formatCurrency(form.shortLeaveDeductValue ?? 0)}`} per occurrence.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Net salary summary ── */}
            <div className="border-t border-border pt-4 bg-muted/20 -mx-6 px-6 py-4 rounded-b-xl">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div>Basic: <span className="text-foreground font-medium">{formatCurrency(form.basicSalary)}</span></div>
                  {totalIncentives > 0 && <div className="text-emerald-600">+ Incentives: {formatCurrency(totalIncentives)}</div>}
                  {totalDeductions > 0 && <div className="text-rose-600">− Deductions: {formatCurrency(totalDeductions)}</div>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net Salary</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(netSalary)}</p>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border">
            {error && <p className="text-xs text-destructive flex-1">{error}</p>}
            {!error && <span />}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : editing ? "Update Salary" : "Save Salary"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
