import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Landmark, Wallet, Plus, Pencil, Trash2,
  Check, X, Loader2, AlertCircle, CreditCard, Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

type AccountType = "cash" | "bank";

interface BankAccount {
  id: string;
  type: AccountType;
  bankName: string | null;
  accountTitle: string;
  ibanNumber: string | null;
  isActive: boolean;
  notes: string | null;
  sortOrder: number;
  coaId: string | null;
  createdAt: string;
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Inline form ──────────────────────────────────────────────────────────────

interface FormState {
  type: AccountType;
  bankName: string;
  accountTitle: string;
  ibanNumber: string;
  notes: string;
}

const BLANK: FormState = {
  type: "bank",
  bankName: "",
  accountTitle: "",
  ibanNumber: "",
  notes: "",
};

function AccountForm({
  initial = BLANK,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial?: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
      {/* Type toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Account Type</Label>
        <div className="flex gap-2">
          {(["bank", "cash"] as AccountType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setForm(p => ({ ...p, type: t }))}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all",
                form.type === t
                  ? "border-indigo-500 bg-indigo-600 text-white shadow"
                  : "border-border bg-white text-slate-600 hover:border-slate-400",
              )}>
              {t === "bank" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              {t === "bank" ? "Bank Account" : "Cash Account"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bank Name (only for bank) */}
        {form.type === "bank" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Bank Name</Label>
            <Input
              placeholder="e.g. HBL, UBL, MCB"
              value={form.bankName}
              onChange={e => set("bankName")(e.target.value)}
              className="h-9 text-sm bg-white"
            />
          </div>
        )}

        {/* Account Title */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Account Title <span className="text-red-500">*</span>
          </Label>
          <Input
            placeholder={form.type === "cash" ? "e.g. Petty Cash, Main Safe" : "e.g. CCM Tuition Fee Account"}
            value={form.accountTitle}
            onChange={e => set("accountTitle")(e.target.value)}
            className="h-9 text-sm bg-white"
          />
        </div>

        {/* IBAN / Account Number */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            {form.type === "bank" ? "IBAN / Account Number" : "Reference (optional)"}
          </Label>
          <Input
            placeholder={form.type === "bank" ? "PK36SCBL0000001123456702" : ""}
            value={form.ibanNumber}
            onChange={e => set("ibanNumber")(e.target.value)}
            className="h-9 text-sm bg-white font-mono tracking-wide"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Notes (optional)</Label>
          <Input
            placeholder="Any remarks…"
            value={form.notes}
            onChange={e => set("notes")(e.target.value)}
            className="h-9 text-sm bg-white"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={saving || !form.accountTitle.trim()}
          onClick={() => onSave(form)}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white h-8 px-4">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-8 px-4 text-slate-600">
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Account row ──────────────────────────────────────────────────────────────

function AccountRow({
  account,
  onEdit,
  onDelete,
  onToggle,
}: {
  account: BankAccount;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const isBank = account.type === "bank";
  return (
    <div className={cn(
      "group flex items-center gap-4 px-5 py-4 border-b border-border last:border-0 transition-colors hover:bg-slate-50/60",
      !account.isActive && "opacity-60",
    )}>
      {/* Icon */}
      <div className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
        isBank ? "bg-blue-100" : "bg-emerald-100",
      )}>
        {isBank
          ? <Building2 className="h-5 w-5 text-blue-600" />
          : <Wallet className="h-5 w-5 text-emerald-600" />}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900 text-sm">{account.accountTitle}</span>
          <Badge variant="secondary" className={cn(
            "text-[10px] font-bold px-1.5 py-0",
            isBank ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700",
          )}>
            {isBank ? "BANK" : "CASH"}
          </Badge>
          {!account.isActive && (
            <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 bg-slate-100 text-slate-500">INACTIVE</Badge>
          )}
        </div>
        {account.bankName && (
          <p className="text-xs text-slate-500 mt-0.5">{account.bankName}</p>
        )}
        {account.ibanNumber && (
          <p className="text-xs font-mono text-slate-500 mt-0.5 tracking-wide">{account.ibanNumber}</p>
        )}
        {account.notes && (
          <p className="text-xs text-slate-400 mt-0.5 italic">{account.notes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm" variant="ghost"
          onClick={onToggle}
          title={account.isActive ? "Deactivate" : "Activate"}
          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700">
          {account.isActive
            ? <Check className="h-3.5 w-3.5 text-emerald-500" />
            : <X className="h-3.5 w-3.5 text-slate-400" />}
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={onEdit}
          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm" variant="ghost"
          onClick={onDelete}
          className="h-8 w-8 p-0 text-slate-400 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BankAccounts() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAdd,   setShowAdd]   = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/api/admin/bank-accounts"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bank-accounts"] });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (f: FormState) => apiFetch("/api/admin/bank-accounts", {
      method: "POST",
      body: JSON.stringify({
        type: f.type,
        bankName: f.bankName,
        accountTitle: f.accountTitle,
        ibanNumber: f.ibanNumber,
        notes: f.notes,
      }),
    }),
    onSuccess: () => { setShowAdd(false); setFormError(null); invalidate(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, f }: { id: string; f: FormState }) =>
      apiFetch(`/api/admin/bank-accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: f.type,
          bankName: f.bankName,
          accountTitle: f.accountTitle,
          ibanNumber: f.ibanNumber,
          notes: f.notes,
        }),
      }),
    onSuccess: () => { setEditId(null); setFormError(null); invalidate(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/api/admin/bank-accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ variant: "destructive", title: "Failed to update account", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/admin/bank-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => { setDeleteId(null); invalidate(); },
    onError: (e: Error) => { setDeleteId(null); toast({ variant: "destructive", title: "Failed to delete account", description: e.message }); },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function editInitial(a: BankAccount): FormState {
    return {
      type: a.type,
      bankName: a.bankName ?? "",
      accountTitle: a.accountTitle,
      ibanNumber: a.ibanNumber ?? "",
      notes: a.notes ?? "",
    };
  }

  const toDelete = accounts.find(a => a.id === deleteId);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Cash & Bank Accounts</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure the accounts used for fee collection and expense recording.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowAdd(true); setEditId(null); setFormError(null); }}
          className="gap-1.5 bg-slate-900 hover:bg-slate-700 text-white h-9">
          <Plus className="h-4 w-4" /> Add Account
        </Button>
      </div>

      {/* Add form */}
      {showAdd && !editId && (
        <AccountForm
          onSave={f => createMut.mutate(f)}
          onCancel={() => { setShowAdd(false); setFormError(null); }}
          saving={createMut.isPending}
          error={formError}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Empty */}
      {!isLoading && accounts.length === 0 && !showAdd && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground rounded-2xl border-2 border-dashed border-border">
          <CreditCard className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">No accounts yet</p>
          <p className="text-xs text-slate-400">Add your cash drawers and bank accounts to start recording payments.</p>
          <Button
            size="sm" variant="outline"
            onClick={() => setShowAdd(true)}
            className="mt-1 gap-1.5">
            <Plus className="h-4 w-4" /> Add First Account
          </Button>
        </div>
      )}

      {/* Flat account list */}
      {accounts.length > 0 && (
        <div className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 border-b border-border">
            <Landmark className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-800">Accounts</span>
            <span className="ml-1 text-xs text-slate-500 bg-slate-200 rounded-full px-2 py-0.5 font-bold">{accounts.length}</span>
          </div>
          {accounts.map(a =>
            editId === a.id ? (
              <div key={a.id} className="px-5 py-4 border-b border-border last:border-0">
                <AccountForm
                  initial={editInitial(a)}
                  onSave={f => updateMut.mutate({ id: a.id, f })}
                  onCancel={() => { setEditId(null); setFormError(null); }}
                  saving={updateMut.isPending}
                  error={formError}
                />
              </div>
            ) : (
              <AccountRow
                key={a.id}
                account={a}
                onEdit={() => { setEditId(a.id); setShowAdd(false); setFormError(null); }}
                onDelete={() => setDeleteId(a.id)}
                onToggle={() => toggleMut.mutate({ id: a.id, isActive: !a.isActive })}
              />
            )
          )}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.accountTitle}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700 text-white">
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
