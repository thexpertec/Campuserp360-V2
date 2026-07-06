import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useListAdminStoreTransactions, getListAdminStoreTransactionsQueryKey,
  useCreateAdminStoreTransaction, useUpdateAdminStoreTransaction, useDeleteAdminStoreTransaction,
  useListAdminStoreItems,
} from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { Plus, Pencil, Trash2, Loader2, Package, Search } from "lucide-react";
import { JEViewerButton } from "@/components/JEViewerButton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

const today = () => new Date().toISOString().slice(0, 10);
type F = { itemId: string; transactionType: string; quantity: string; transactionDate: string; reference: string; issuedTo: string; notes: string; vendorId: string };
const empty = (): F => ({ itemId: "", transactionType: "issue", quantity: "1", transactionDate: today(), reference: "", issuedTo: "", notes: "", vendorId: "" });
const toForm = (r: any): F => ({ itemId: r.itemId ?? "", transactionType: r.transactionType ?? "issue", quantity: String(r.quantity ?? 1), transactionDate: r.transactionDate ?? today(), reference: r.reference ?? "", issuedTo: r.issuedTo ?? "", notes: r.notes ?? "", vendorId: r.vendorId ?? "" });
const toBody = (f: F) => ({ itemId: f.itemId, transactionType: f.transactionType, quantity: Math.max(1, Number(f.quantity) || 1), transactionDate: f.transactionDate, reference: f.reference.trim() || undefined, issuedTo: f.issuedTo.trim() || undefined, notes: f.notes.trim() || undefined, vendorId: f.vendorId || undefined });

const TYPE_COLORS: Record<string, string> = { issue: "bg-orange-100 text-orange-700", receipt: "bg-green-100 text-green-700", return: "bg-blue-100 text-blue-700", adjustment: "bg-purple-100 text-purple-700" };

export function StoreTransactionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminStoreTransactions();
  const { data: items } = useListAdminStoreItems();
  const { data: vendors = [] } = useQuery<{ id: string; name: string; vendorCode: string }[]>({
    queryKey: ["admin-vendors"],
    queryFn: () => apiFetch("/api/admin/vendors"),
    staleTime: 60_000,
  });
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminStoreTransactionsQueryKey() });
  const createMut = useCreateAdminStoreTransaction({ mutation: { onSuccess: inv } });
  const updateMut = useUpdateAdminStoreTransaction({ mutation: { onSuccess: inv } });
  const deleteMut = useDeleteAdminStoreTransaction({ mutation: { onSuccess: inv } });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<F>(empty());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const { toast } = useToast();
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openAdd() { setEditing(null); setForm(empty()); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm(toForm(r)); setOpen(true); }
  function onClose() { setOpen(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId) { toast({ title: "Please select an item", variant: "destructive" }); return; }
    const body = toBody(form);
    if (editing) {
      updateMut.mutate({ id: editing.id, data: body }, { onSuccess: () => { toast({ title: "Transaction updated" }); onClose(); }, onError: (err) => toast({ title: "Failed to update transaction", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }) });
    } else {
      createMut.mutate({ data: body }, { onSuccess: () => { toast({ title: "Transaction recorded" }); onClose(); }, onError: (err) => toast({ title: "Failed to record transaction", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }) });
    }
  }

  const itemList = Array.isArray(items) ? items : [];
  const rows = (Array.isArray(data) ? data : []).filter(r => !searchQ || JSON.stringify(r).toLowerCase().includes(searchQ.toLowerCase()));

  const vendorMap = new Map(vendors.map(v => [v.id, v]));

  const cols: ColDef<any>[] = [
    { key: "transactionDate", label: "Date", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <span className="text-sm font-medium">{r.transactionDate || "—"}</span>, getText: r => r.transactionDate ?? "" },
    { key: "itemId", label: "Item", defaultVisible: true, defaultWidth: 200, render: r => { const it = itemList.find((x: any) => x.id === r.itemId); return <span className="text-sm">{(it as any)?.name ?? "—"}</span>; }, getText: r => r.itemId ?? "" },
    { key: "transactionType", label: "Type", sortable: true, defaultVisible: true, defaultWidth: 110, render: r => <Badge variant="outline" className={TYPE_COLORS[r.transactionType] ?? ""}>{r.transactionType || "—"}</Badge>, getText: r => r.transactionType ?? "" },
    { key: "quantity", label: "Qty", sortable: true, defaultVisible: true, defaultWidth: 80, render: r => <span className="text-sm font-medium">{r.quantity ?? "—"}</span>, getText: r => String(r.quantity ?? "") },
    { key: "vendorId", label: "Vendor", defaultVisible: true, defaultWidth: 160, render: r => <span className="text-sm text-slate-600">{r.vendorId ? (vendorMap.get(r.vendorId)?.name ?? "—") : "—"}</span>, getText: r => r.vendorId ? (vendorMap.get(r.vendorId)?.name ?? "") : "" },
    { key: "issuedTo", label: "Issued To", sortable: true, defaultVisible: true, defaultWidth: 160, render: r => <span className="text-sm text-slate-600">{r.issuedTo || "—"}</span>, getText: r => r.issuedTo ?? "" },
    { key: "reference", label: "Reference", defaultVisible: false, defaultWidth: 130, render: r => <span className="text-sm text-slate-500">{r.reference || "—"}</span>, getText: r => r.reference ?? "" },
    { key: "_actions", label: "", defaultVisible: true, defaultWidth: 110, render: r => (
      <div className="flex gap-1 items-center">
        <JEViewerButton sourceRefId={r.id} />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    ), getText: () => "" },
  ];

  return (
    <>
      <DataTable
        tableId="ccm_store_txn_v2"
        title="Store Transactions"
        subtitle="Issue, receipt and adjustment records"
        action={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" />Add Transaction</Button>}
        filters={
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search transactions…" className="pl-8 h-9 text-sm" />
          </div>
        }
        columns={cols} data={rows} total={rows.length} isLoading={isLoading} pageSize={50} clientPaginate
        emptyIcon={<div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center"><Package className="h-7 w-7 text-slate-300" /></div>}
        emptyTitle="No transactions yet" emptyDescription="Click Add Transaction to record the first store movement."
      />
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Item *</Label>
              <Select value={form.itemId} onValueChange={v => setForm(f => ({ ...f, itemId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>{itemList.map((it: any) => <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={form.transactionType} onValueChange={v => setForm(f => ({ ...f, transactionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issue">Issue</SelectItem>
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="return">Return</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input required type="number" min="1" value={form.quantity} onChange={set("quantity")} />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input required type="date" value={form.transactionDate} onChange={set("transactionDate")} />
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={form.reference} onChange={set("reference")} placeholder="Invoice / PO no." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={form.vendorId || "__none__"} onValueChange={v => setForm(f => ({ ...f, vendorId: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select vendor…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Issued To</Label>
              <Input value={form.issuedTo} onChange={set("issuedTo")} placeholder="Department or person name" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={set("notes")} placeholder="Optional notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Save Changes" : "Add Transaction"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete transaction?</AlertDialogTitle><AlertDialogDescription>This will remove the transaction record permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteMut.mutate({ id: deleteId! }, { onSuccess: () => { setDeleteId(null); toast({ title: "Transaction deleted" }); }, onError: (err) => toast({ title: "Failed to delete transaction", description: (err as any)?.data?.error ?? (err as Error)?.message, variant: "destructive" }) }); }} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
