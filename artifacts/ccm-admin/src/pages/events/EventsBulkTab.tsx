import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, ClipboardList, CheckCircle2, AlertTriangle } from "lucide-react";
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

interface EventConfig { venues: string[]; organizers: string[]; }

const TYPE_OPTS = [
  { value: "academic",  label: "Academic"  },
  { value: "cultural",  label: "Cultural"  },
  { value: "sports",    label: "Sports"    },
  { value: "ceremony",  label: "Ceremony"  },
  { value: "meeting",   label: "Meeting"   },
  { value: "holiday",   label: "Holiday"   },
  { value: "other",     label: "Other"     },
];
const STATUS_OPTS = [
  { value: "draft",     label: "Draft"     },
  { value: "published", label: "Published" },
];
const AUDIENCE_OPTS = [
  { value: "all",     label: "Everyone" },
  { value: "cadets",  label: "Cadets"   },
  { value: "staff",   label: "Staff"    },
  { value: "parents", label: "Parents"  },
];

type BulkRow = {
  id: number;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  startTime: string;
  venue: string;
  organizer: string;
  targetAudience: string;
  status: string;
};

let _id = 1;
const mkRow = (): BulkRow => ({
  id: _id++, title: "", eventType: "other",
  startDate: new Date().toISOString().slice(0, 10), endDate: "",
  startTime: "", venue: "", organizer: "", targetAudience: "all", status: "draft",
});

function Datalist({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map(o => <option key={o} value={o} />)}
    </datalist>
  );
}

export function EventsBulkTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<BulkRow[]>([mkRow(), mkRow(), mkRow()]);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  const { data: config } = useQuery<EventConfig>({
    queryKey: ["events-config"],
    queryFn: () => apiFetch("/api/admin/events/config"),
  });

  function setField(id: number, field: keyof BulkRow, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addRow() {
    setRows(prev => {
      const last = prev[prev.length - 1];
      const newRow = mkRow();
      if (last) {
        newRow.eventType = last.eventType;
        newRow.venue = last.venue;
        newRow.organizer = last.organizer;
        newRow.targetAudience = last.targetAudience;
        newRow.status = last.status;
        // Advance date by 1 day from last
        if (last.startDate) {
          const d = new Date(last.startDate + "T00:00:00");
          d.setDate(d.getDate() + 1);
          newRow.startDate = d.toISOString().slice(0, 10);
        }
      }
      return [...prev, newRow];
    });
  }

  const validRows = rows.filter(r => r.title.trim() && r.startDate);

  const bulkMutation = useMutation({
    mutationFn: () => apiFetch<{ created: number; errors: string[] }>("/api/admin/events/bulk", {
      method: "POST",
      body: JSON.stringify({
        events: validRows.map(r => ({
          title:          r.title.trim(),
          eventType:      r.eventType,
          startDate:      r.startDate,
          endDate:        r.endDate || undefined,
          startTime:      r.startTime || undefined,
          venue:          r.venue || undefined,
          organizer:      r.organizer || undefined,
          targetAudience: r.targetAudience,
          status:         r.status,
        })),
      }),
    }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["events-list"] });
      qc.invalidateQueries({ queryKey: ["events-stats"] });
      if (data.created > 0) {
        toast({ title: `${data.created} event${data.created !== 1 ? "s" : ""} created!` });
        setRows([mkRow(), mkRow(), mkRow()]);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const venueList = config?.venues ?? [];
  const orgList   = config?.organizers ?? [];

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Bulk Event Entry</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enter multiple events at once. Rows with no title or date are skipped.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
          <Button
            size="sm"
            disabled={validRows.length === 0 || bulkMutation.isPending}
            onClick={() => { setResult(null); bulkMutation.mutate(); }}
          >
            <Save className="h-4 w-4 mr-1" />
            {bulkMutation.isPending ? "Saving…" : `Save ${validRows.length} Event${validRows.length !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          result.created > 0 ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
        )}>
          {result.created > 0
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          }
          <div className="text-sm">
            {result.created > 0 && (
              <p className="font-semibold text-emerald-700">{result.created} event{result.created !== 1 ? "s" : ""} created successfully.</p>
            )}
            {result.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-amber-700 text-xs space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Datalists for suggestions */}
      <Datalist id="venue-list" options={venueList} />
      <Datalist id="org-list"   options={orgList} />

      {/* Table */}
      {rows.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
          <ClipboardList className="h-8 w-8 opacity-30" />
          <p className="text-sm">No rows — click "Add Row" to start</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-6">#</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[180px]">Title *</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-28">Type</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-32">Start Date *</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-32">End Date</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Time</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px]">Venue</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px]">Organiser</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Audience</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-24">Status</th>
                  <th className="px-3 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, idx) => {
                  const isEmpty = !row.title.trim() || !row.startDate;
                  return (
                    <tr key={row.id} className={cn("hover:bg-muted/10 transition-colors", isEmpty && "opacity-60")}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>

                      {/* Title */}
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          placeholder="Event title…"
                          value={row.title}
                          onChange={e => setField(row.id, "title", e.target.value)}
                        />
                      </td>

                      {/* Type */}
                      <td className="px-2 py-1.5">
                        <Select value={row.eventType} onValueChange={v => setField(row.id, "eventType", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Start Date */}
                      <td className="px-2 py-1.5">
                        <Input
                          type="date" className="h-8 text-sm"
                          value={row.startDate}
                          onChange={e => setField(row.id, "startDate", e.target.value)}
                        />
                      </td>

                      {/* End Date */}
                      <td className="px-2 py-1.5">
                        <Input
                          type="date" className="h-8 text-sm"
                          value={row.endDate}
                          onChange={e => setField(row.id, "endDate", e.target.value)}
                        />
                      </td>

                      {/* Time */}
                      <td className="px-2 py-1.5">
                        <Input
                          type="time" className="h-8 text-sm"
                          value={row.startTime}
                          onChange={e => setField(row.id, "startTime", e.target.value)}
                        />
                      </td>

                      {/* Venue */}
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          placeholder="Venue"
                          list="venue-list"
                          value={row.venue}
                          onChange={e => setField(row.id, "venue", e.target.value)}
                        />
                      </td>

                      {/* Organiser */}
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-sm"
                          placeholder="Organiser"
                          list="org-list"
                          value={row.organizer}
                          onChange={e => setField(row.id, "organizer", e.target.value)}
                        />
                      </td>

                      {/* Audience */}
                      <td className="px-2 py-1.5">
                        <Select value={row.targetAudience} onValueChange={v => setField(row.id, "targetAudience", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {AUDIENCE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Status */}
                      <td className="px-2 py-1.5">
                        <Select value={row.status} onValueChange={v => setField(row.id, "status", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Remove */}
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => removeRow(row.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add row footer */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4 mr-1" /> Add Row
        </Button>
        <span className="text-xs text-muted-foreground">
          {validRows.length} of {rows.length} row{rows.length !== 1 ? "s" : ""} ready to save
        </span>
      </div>
    </div>
  );
}
