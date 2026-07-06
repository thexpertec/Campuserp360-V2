import { useState } from "react";
import { formatDateTime } from "@/lib/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetContactSubmissions,
  useAdminUpdateContactSubmissionStatus,
  getAdminGetContactSubmissionsQueryKey,
  type ContactSubmission,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Mail, Phone, Search, MessageSquare, CheckCircle2, MailOpen,
  Inbox, X, Clock,
} from "lucide-react";
import { DataTable } from "@/components/DataTable";
import type { ColDef } from "@/components/DataTable/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StatusKey = "unread" | "read" | "handled";

const STATUS_META: Record<StatusKey, { label: string; cls: string }> = {
  unread:  { label: "Unread",  cls: "bg-indigo-100 text-indigo-700" },
  read:    { label: "Read",    cls: "bg-slate-100 text-slate-600"   },
  handled: { label: "Handled", cls: "bg-emerald-100 text-emerald-700" },
};

function fmtDate(iso: string | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateTime(d.toISOString());
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[(status as StatusKey)] ?? STATUS_META.read;
  return (
    <span className={cn("inline-flex text-[10px] px-1.5 py-0.5 rounded-md font-semibold", meta.cls)}>
      {meta.label}
    </span>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function SubmissionDialog({ row, onClose, onStatus, busy }: {
  row: ContactSubmission | null;
  onClose: () => void;
  onStatus: (status: StatusKey) => void;
  busy: boolean;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {row?.subject || "Contact Message"}
            {row && <StatusBadge status={row.status} />}
          </DialogTitle>
          <DialogDescription>
            {row ? `Received ${fmtDate(row.createdAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <span className="font-semibold w-16 text-slate-500">Name</span>
                {row.name}
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="font-semibold w-16 text-slate-500">Email</span>
                <a href={`mailto:${row.email}`} className="text-indigo-600 hover:underline flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />{row.email}
                </a>
              </div>
              {row.phone && (
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="font-semibold w-16 text-slate-500">Phone</span>
                  <a href={`tel:${row.phone}`} className="text-indigo-600 hover:underline flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />{row.phone}
                  </a>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {row.message}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {row.status !== "read" && (
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={() => onStatus("read")} className="gap-1.5">
                  <MailOpen className="h-3.5 w-3.5" /> Mark Read
                </Button>
              )}
              {row.status !== "unread" && (
                <Button variant="ghost" size="sm" disabled={busy}
                  onClick={() => onStatus("unread")} className="gap-1.5">
                  <Inbox className="h-3.5 w-3.5" /> Mark Unread
                </Button>
              )}
              {row.status !== "handled" && (
                <Button size="sm" disabled={busy}
                  onClick={() => onStatus("handled")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Handled
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ContactSubmissions() {
  const qc = useQueryClient();
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [active, setActive]   = useState<ContactSubmission | null>(null);

  const { data, isLoading } = useAdminGetContactSubmissions({
    query: { queryKey: getAdminGetContactSubmissionsQueryKey(), staleTime: 30_000 },
  });

  const statusMut = useAdminUpdateContactSubmissionStatus({
    mutation: {
      onSuccess: (updated) => {
        qc.invalidateQueries({ queryKey: getAdminGetContactSubmissionsQueryKey() });
        setActive((cur) => (cur && cur.id === updated.id ? updated : cur));
      },
      onError: (e: any) => alert(e?.message ?? "Failed to update status"),
    },
  });

  const rows = data ?? [];
  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.subject ?? "").toLowerCase().includes(q) ||
      (r.message ?? "").toLowerCase().includes(q)
    );
  });

  const unreadCount = rows.filter((r) => r.status === "unread").length;

  function setStatus(id: string, status: StatusKey) {
    statusMut.mutate({ id, data: { status } });
  }

  // Opening a message marks an unread one as read.
  function open(row: ContactSubmission) {
    setActive(row);
    if (row.status === "unread") setStatus(row.id, "read");
  }

  const COLUMNS: ColDef<ContactSubmission>[] = [
    {
      key: "status",
      label: "Status",
      sortable: true,
      defaultWidth: 90,
      render: (r) => <StatusBadge status={r.status} />,
      getText: (r) => r.status,
    },
    {
      key: "name",
      label: "Name",
      sortable: true,
      defaultWidth: 150,
      render: (r) => (
        <span className={cn("text-sm text-slate-800", r.status === "unread" && "font-semibold")}>
          {r.name}
        </span>
      ),
      getText: (r) => r.name,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      defaultWidth: 190,
      render: (r) => (
        <span className="text-xs text-slate-600 flex items-center gap-1">
          <Mail className="h-3 w-3 text-slate-300" />{r.email}
        </span>
      ),
      getText: (r) => r.email,
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      defaultWidth: 130,
      render: (r) => r.phone
        ? <span className="text-xs text-slate-600">{r.phone}</span>
        : <span className="text-slate-300 text-xs">—</span>,
      getText: (r) => r.phone ?? "",
    },
    {
      key: "subject",
      label: "Subject",
      sortable: true,
      defaultWidth: 170,
      render: (r) => r.subject
        ? <span className="text-xs text-slate-700">{r.subject}</span>
        : <span className="text-slate-300 text-xs">—</span>,
      getText: (r) => r.subject ?? "",
    },
    {
      key: "message",
      label: "Message",
      sortable: false,
      defaultWidth: 240,
      render: (r) => (
        <span className="text-xs text-slate-500 line-clamp-2 max-w-[230px]">{r.message}</span>
      ),
      getText: (r) => r.message ?? "",
    },
    {
      key: "createdAt",
      label: "Received",
      sortable: true,
      defaultWidth: 150,
      render: (r) => (
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-300" />{fmtDate(r.createdAt)}
        </span>
      ),
      getText: (r) => new Date(r.createdAt).toISOString(),
    },
  ];

  const FILTERS: Array<{ key: "all" | StatusKey; label: string }> = [
    { key: "all",     label: "All" },
    { key: "unread",  label: "Unread" },
    { key: "read",    label: "Read" },
    { key: "handled", label: "Handled" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        tableId="contact-submissions"
        title="Contact Submissions"
        subtitle={
          unreadCount > 0
            ? `Messages from the website Contact form · ${unreadCount} unread`
            : "Messages from the website Contact form"
        }
        columns={COLUMNS}
        data={visible}
        isLoading={isLoading}
        pageSize={50}
        clientPaginate
        exportFilename="contact-submissions"
        emptyIcon={<MessageSquare className="h-8 w-8 text-slate-200" />}
        emptyTitle="No messages"
        emptyDescription={q || statusFilter !== "all"
          ? "No messages match your filters."
          : "No contact-form messages yet."}
        filters={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-9 pl-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    "h-9 px-3 rounded-lg text-xs font-semibold transition-colors",
                    statusFilter === f.key
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        }
        rowActions={(r) => (
          <div className="flex items-center gap-1">
            <button
              title="View"
              onClick={(e) => { e.stopPropagation(); open(r); }}
              className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <MailOpen className="h-3.5 w-3.5" />
            </button>
            {r.status !== "handled" && (
              <button
                title="Mark handled"
                onClick={(e) => { e.stopPropagation(); setStatus(r.id, "handled"); }}
                className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      />

      <SubmissionDialog
        row={active}
        busy={statusMut.isPending}
        onClose={() => setActive(null)}
        onStatus={(s) => active && setStatus(active.id, s)}
      />
    </div>
  );
}
