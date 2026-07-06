import { useEffect, useState } from "react";
import { formatPhone } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import LedgerStatement from "@/components/LedgerStatement";
import {
  Building2, Plus, Pencil, Trash2, Search, X, AlertCircle, BookOpenText,
  Phone, Mail, MapPin, ChevronDown, ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { DataTable } from "@/components/DataTable";
import type { ColDef } from "@/components/DataTable/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Vendor {
  id:            string;
  vendorCode:    string;
  name:          string;
  contactPerson: string | null;
  phone:         string | null;
  email:         string | null;
  address:       string | null;
  taxNo:         string | null;
  bankName:      string | null;
  accountNumber: string | null;
  active:        boolean;
  sortOrder:     number;
  notes:         string | null;
  coaId:         string | null;
  coaCode:       string | null;
  coaName:       string | null;
  createdAt:     string;
  updatedAt:     string;
}

// ─── API helper ────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-Id": tenant,
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

// ─── Vendor form panel ─────────────────────────────────────────────────────────

interface FormState {
  name:          string;
  contactPerson: string;
  phone:         string;
  email:         string;
  address:       string;
  taxNo:         string;
  bankName:      string;
  accountNumber: string;
  notes:         string;
  sortOrder:     string;
}

function emptyForm(v?: Vendor): FormState {
  return {
    name:          v?.name          ?? "",
    contactPerson: v?.contactPerson ?? "",
    phone:         v?.phone         ?? "",
    email:         v?.email         ?? "",
    address:       v?.address       ?? "",
    taxNo:         v?.taxNo         ?? "",
    bankName:      v?.bankName      ?? "",
    accountNumber: v?.accountNumber ?? "",
    notes:         v?.notes         ?? "",
    sortOrder:     String(v?.sortOrder ?? 0),
  };
}

function VendorPanel({ vendor, onSave, onClose, loading, error }: {
  vendor:  Vendor | null;
  onSave:  (data: Partial<Vendor>) => void;
  onClose: () => void;
  loading: boolean;
  error:   string | null;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(vendor ?? undefined));
  const [showBank, setShowBank] = useState(!!(vendor?.bankName || vendor?.accountNumber));

  function field(k: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  function submit() {
    if (!form.name.trim()) return;
    onSave({
      name:          form.name.trim(),
      contactPerson: form.contactPerson.trim() || undefined,
      phone:         form.phone.trim()         || undefined,
      email:         form.email.trim()         || undefined,
      address:       form.address.trim()       || undefined,
      taxNo:         form.taxNo.trim()         || undefined,
      bankName:      form.bankName.trim()      || undefined,
      accountNumber: form.accountNumber.trim() || undefined,
      notes:         form.notes.trim()         || undefined,
      sortOrder:     Number(form.sortOrder) || 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[480px] h-full bg-white shadow-2xl border-l border-border flex flex-col overflow-hidden">

        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {vendor ? "Edit Vendor" : "New Vendor"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {vendor ? `${vendor.vendorCode} · ${vendor.name}` : "Add a new supplier/vendor"}
            </p>
          </div>
          <button onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />{error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>Vendor Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={field("name")} placeholder="e.g. National Book Foundation" className="h-10" autoFocus={!vendor} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input value={form.contactPerson} onChange={field("contactPerson")} placeholder="Mr. Ahmed" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="0300-0000000" maxLength={12} className="h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={field("email")} placeholder="vendor@example.com" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <textarea value={form.address} onChange={field("address")} rows={2}
              placeholder="Street address, city…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors" />
          </div>
          <div className="space-y-1.5">
            <Label>NTN / Tax No</Label>
            <Input value={form.taxNo} onChange={field("taxNo")} placeholder="1234567-8" className="h-10" />
          </div>
          <button type="button"
            onClick={() => setShowBank(b => !b)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
            {showBank ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Bank / Payment Details
          </button>
          {showBank && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={form.bankName} onChange={field("bankName")} placeholder="HBL, UBL…" className="h-9 bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label>Account No / IBAN</Label>
                <Input value={form.accountNumber} onChange={field("accountNumber")} placeholder="PK00XXXX…" className="h-9 bg-white" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
            <textarea value={form.notes} onChange={field("notes")} rows={2}
              placeholder="Any notes about this vendor…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors" />
          </div>
          <div className="space-y-1.5">
            <Label>Sort Order</Label>
            <Input type="number" value={form.sortOrder} onChange={field("sortOrder")} className="h-10 w-24" placeholder="0" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !form.name.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5">
            {loading ? "Saving…" : vendor ? "Save Changes" : "Add Vendor"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Column definitions ─────────────────────────────────────────────────────────

const COLUMNS: ColDef<Vendor>[] = [
  {
    key: "vendorCode",
    label: "Code",
    sortable: true,
    defaultWidth: 90,
    render: (v) => <span className="font-mono text-xs text-slate-400">{v.vendorCode}</span>,
    getText: (v) => v.vendorCode,
  },
  {
    key: "name",
    label: "Name",
    sortable: true,
    defaultWidth: 180,
    render: (v) => <p className="text-sm font-semibold text-slate-800">{v.name}</p>,
    getText: (v) => v.name,
  },
  {
    key: "contactPerson",
    label: "Contact Person",
    sortable: true,
    defaultWidth: 140,
    render: (v) => <span className="text-xs text-slate-600">{v.contactPerson ?? <span className="text-slate-300">—</span>}</span>,
    getText: (v) => v.contactPerson ?? "",
  },
  {
    key: "phone",
    label: "Phone",
    sortable: true,
    defaultWidth: 130,
    render: (v) =>
      v.phone ? (
        <span className="text-xs text-slate-600 flex items-center gap-1">
          <Phone className="h-3 w-3 text-slate-300" />{v.phone}
        </span>
      ) : <span className="text-slate-300 text-xs">—</span>,
    getText: (v) => v.phone ?? "",
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
    defaultWidth: 160,
    render: (v) =>
      v.email ? (
        <span className="text-xs text-slate-600 flex items-center gap-1">
          <Mail className="h-3 w-3 text-slate-300" />{v.email}
        </span>
      ) : <span className="text-slate-300 text-xs">—</span>,
    getText: (v) => v.email ?? "",
  },
  {
    key: "address",
    label: "Address",
    sortable: true,
    defaultWidth: 160,
    render: (v) =>
      v.address ? (
        <span className="text-xs text-slate-500 flex items-start gap-1">
          <MapPin className="h-3 w-3 mt-0.5 text-slate-300 flex-shrink-0" />{v.address}
        </span>
      ) : <span className="text-slate-300 text-xs">—</span>,
    getText: (v) => v.address ?? "",
  },
  {
    key: "taxNo",
    label: "NTN",
    sortable: true,
    defaultWidth: 110,
    render: (v) => <span className="text-xs text-slate-500">{v.taxNo ?? <span className="text-slate-300">—</span>}</span>,
    getText: (v) => v.taxNo ?? "",
  },
  {
    key: "coa",
    label: "COA",
    sortable: true,
    defaultWidth: 140,
    render: (v) =>
      v.coaCode ? (
        <div className="space-y-0.5">
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-semibold font-mono">
            <CheckCircle2 className="h-2.5 w-2.5" />{v.coaCode}
          </span>
          {v.coaName && (
            <p className="text-[10px] text-slate-500 leading-tight max-w-[120px] truncate" title={v.coaName}>
              {v.coaName}
            </p>
          )}
        </div>
      ) : <span className="text-[10px] text-slate-300">—</span>,
    getText: (v) => [v.coaCode, v.coaName].filter(Boolean).join(" "),
  },
  {
    key: "active",
    label: "Status",
    sortable: true,
    defaultWidth: 90,
    render: (v) => (
      <span className={cn(
        "inline-flex text-[10px] px-1.5 py-0.5 rounded-md font-semibold",
        v.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}>
        {v.active ? "Active" : "Inactive"}
      </span>
    ),
    getText: (v) => v.active ? "Active" : "Inactive",
  },
];

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Vendors() {
  const qc = useQueryClient();

  const [search,       setSearch]       = useState("");
  const [panel,        setPanel]        = useState<{ vendor: Vendor | null } | null>(null);
  const [panelError,   setPanelError]   = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [ledgerVendor, setLedgerVendor] = useState<Vendor | null>(null);

  const { data, isLoading } = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn:  () => apiFetch<Vendor[]>("/api/admin/vendors"),
    staleTime: 30_000,
  });
  const vendors = data ?? [];

  // Deep-link support: /vendors?vendorId=<id> opens straight to that vendor's
  // edit panel, so JE drill-through links (vendor-bill / vendor-bill-pay) land
  // on the actual source record instead of just the list.
  useEffect(() => {
    const vendorId = new URLSearchParams(window.location.search).get("vendorId");
    if (!vendorId || !vendors.length) return;
    const v = vendors.find((x) => x.id === vendorId);
    if (v) { setPanelError(null); setPanel({ vendor: v }); }
  }, [vendors]);

  const createMut = useMutation({
    mutationFn: (body: any) => apiFetch("/api/admin/vendors", { method: "POST", body: JSON.stringify(body) }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setPanel(null); setPanelError(null); },
    onError:    (e: any) => setPanelError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiFetch(`/api/admin/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setPanel(null); setPanelError(null); },
    onError:    (e: any) => setPanelError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/vendors/${id}`, { method: "DELETE" }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ["vendors"] }); setDeleteTarget(null); },
    onError:    (e: any) => { setDeleteTarget(null); alert(e.message); },
  });

  const q = search.trim().toLowerCase();
  const visible = vendors.filter(v =>
    !q ||
    v.vendorCode.toLowerCase().includes(q) ||
    v.name.toLowerCase().includes(q) ||
    (v.contactPerson ?? "").toLowerCase().includes(q) ||
    (v.email ?? "").toLowerCase().includes(q)
  );

  const panelLoading = createMut.isPending || updateMut.isPending;

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        tableId="vendors"
        title="Vendors"
        subtitle="Manage suppliers and vendors. Each vendor gets an Accounts Payable sub-account in the COA."
        columns={COLUMNS}
        data={visible}
        isLoading={isLoading}
        pageSize={50}
        clientPaginate
        exportFilename="vendors"
        emptyIcon={<Building2 className="h-8 w-8 text-slate-200" />}
        emptyTitle="No vendors found"
        emptyDescription={q ? "No vendors match your search." : "No vendors yet. Add your first vendor to get started."}
        action={
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => { setPanelError(null); setPanel({ vendor: null }); }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Vendor
          </Button>
        }
        filters={
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vendors…"
              className="h-9 pl-9 text-sm"
            />
          </div>
        }
        rowActions={(v) => (
          <div className="flex items-center gap-1">
            <button
              title="Edit"
              onClick={() => { setPanelError(null); setPanel({ vendor: v }); }}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              title="Ledger"
              onClick={() => setLedgerVendor(v)}
              disabled={!v.coaId}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <BookOpenText className="h-3.5 w-3.5" />
            </button>
            <button
              title="Delete"
              onClick={() => setDeleteTarget(v)}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />

      {/* Add/Edit panel */}
      {panel && (
        <VendorPanel
          vendor={panel.vendor}
          onSave={data => {
            if (panel.vendor) updateMut.mutate({ id: panel.vendor.id, body: data });
            else              createMut.mutate(data);
          }}
          onClose={() => setPanel(null)}
          loading={panelLoading}
          error={panelError}
        />
      )}

      {/* Ledger */}
      <Dialog open={!!ledgerVendor} onOpenChange={o => { if (!o) setLedgerVendor(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vendor Ledger</DialogTitle>
          </DialogHeader>
          {ledgerVendor?.coaId && (
            <LedgerStatement
              coaId={ledgerVendor.coaId}
              title={`Vendor Ledger — ${ledgerVendor.name}`}
              headerFields={[
                { label: "Vendor Code", value: ledgerVendor.vendorCode },
                { label: "Contact Person", value: ledgerVendor.contactPerson ?? "—" },
                { label: "Phone", value: ledgerVendor.phone ?? "—" },
              ]}
              emptyStateHint="This vendor has no linked ledger account yet."
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
