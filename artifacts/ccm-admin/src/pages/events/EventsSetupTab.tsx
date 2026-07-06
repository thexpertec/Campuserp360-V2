import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, MapPin, Users, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface EventConfig {
  venues: string[];
  organizers: string[];
}

const QK = ["events-config"];

function ItemList({
  icon: Icon,
  title,
  description,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleAdd() {
    const val = input.trim();
    if (!val || items.includes(val)) return;
    onAdd(val);
    setInput("");
  }

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-slate-50/60">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 shrink-0">
          <Icon className="h-4 w-4 text-slate-600" />
        </span>
        <div>
          <p className="font-semibold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Add input */}
        <div className="flex gap-2">
          <Input
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1"
          />
          <Button size="sm" onClick={handleAdd} disabled={!input.trim()} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        {/* Items list */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No {title.toLowerCase()} added yet</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {items.map(item => (
              <div key={item} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-slate-50/50 px-3 py-2">
                <span className="text-sm font-medium text-foreground">{item}</span>
                <button
                  onClick={() => onRemove(item)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventsSetupTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<EventConfig>({
    queryKey: QK,
    queryFn: () => apiFetch("/api/admin/events/config"),
  });

  const [venues, setVenues] = useState<string[] | null>(null);
  const [organizers, setOrganizers] = useState<string[] | null>(null);

  const currentVenues = venues ?? config?.venues ?? [];
  const currentOrganizers = organizers ?? config?.organizers ?? [];

  // Sync from server when loaded
  if (config && venues === null) setVenues(config.venues);
  if (config && organizers === null) setOrganizers(config.organizers);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch<EventConfig>("/api/admin/events/config", {
      method: "POST",
      body: JSON.stringify({ venues: currentVenues, organizers: currentOrganizers }),
    }),
    onSuccess: (data) => {
      qc.setQueryData(QK, data);
      setVenues(data.venues);
      setOrganizers(data.organizers);
      toast({ title: "Setup saved", description: "Venues and organisers updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isDirty =
    JSON.stringify(currentVenues) !== JSON.stringify(config?.venues ?? []) ||
    JSON.stringify(currentOrganizers) !== JSON.stringify(config?.organizers ?? []);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">Loading setup…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Pre-define your campus <strong>venues</strong> and <strong>organisers</strong> here.
          They appear as quick-pick suggestions when creating or bulk-adding events — no more re-typing.
        </p>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button disabled={!isDirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ItemList
          icon={MapPin}
          title="Venues"
          description="Campus locations used for events"
          placeholder="e.g. Assembly Hall"
          items={currentVenues}
          onAdd={v => setVenues(prev => [...(prev ?? []), v])}
          onRemove={v => setVenues(prev => (prev ?? []).filter(x => x !== v))}
        />
        <ItemList
          icon={Users}
          title="Organisers"
          description="Departments or people who organise events"
          placeholder="e.g. Academic Department"
          items={currentOrganizers}
          onAdd={v => setOrganizers(prev => [...(prev ?? []), v])}
          onRemove={v => setOrganizers(prev => (prev ?? []).filter(x => x !== v))}
        />
      </div>
    </div>
  );
}
