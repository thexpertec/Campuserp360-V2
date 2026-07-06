import { useState, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearchAdminGuardians, useCreateAdminGuardian, getSearchAdminGuardiansQueryKey } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Search, UserPlus, X, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone, formatCnic } from "@/lib/format";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type GuardianOption = {
  id: string;
  familyId: string;
  name: string;
  cnic: string | null;
  phone: string | null;
  email: string | null;
};

type Props = {
  value?: GuardianOption | null;
  onChange: (g: GuardianOption | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  variant?: "default" | "inline";
};

type CreateForm = {
  name: string;
  cnic: string;
  phone: string;
  email: string;
};

const emptyCreate: CreateForm = { name: "", cnic: "", phone: "", email: "" };

export function GuardianPicker({ value, onChange, placeholder = "Search by name, CNIC, or phone…", className, disabled, variant = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const debouncedQ = useDebounce(query, 280);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchParams = { q: debouncedQ, limit: 10 };
  const { data, isFetching } = useSearchAdminGuardians(
    searchParams,
    { query: { enabled: debouncedQ.length >= 2, queryKey: getSearchAdminGuardiansQueryKey(searchParams) } },
  );
  const items: GuardianOption[] = (data?.items ?? []) as GuardianOption[];

  const createMutation = useCreateAdminGuardian();

  function handleSelect(g: GuardianOption) {
    onChange(g);
    setQuery("");
    setOpen(false);
    setShowCreate(false);
    setCreateForm(emptyCreate);
    setConflictMsg(null);
    setConflictId(null);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
  }

  function openCreate() {
    setShowCreate(true);
    setCreateForm({ name: query.length >= 2 ? query : "", cnic: "", phone: "", email: "" });
    setConflictMsg(null);
    setConflictId(null);
  }

  async function handleCreate() {
    setConflictMsg(null);
    setConflictId(null);
    try {
      const result = await createMutation.mutateAsync({
        data: {
          name: createForm.name.trim(),
          cnic: createForm.cnic.trim() || undefined,
          phone: createForm.phone.trim() || undefined,
          email: createForm.email.trim() || undefined,
        },
      });
      handleSelect({
        id: result.id,
        familyId: result.familyId,
        name: result.name,
        cnic: result.cnic ?? null,
        phone: result.phone ?? null,
        email: result.email ?? null,
      });
    } catch (err: any) {
      const body = err?.response?.data ?? err?.data ?? {};
      if (body.existingId) {
        setConflictMsg(body.error ?? "Duplicate entry");
        setConflictId(body.existingId);
      } else {
        setConflictMsg(err?.message ?? "Failed to create guardian");
      }
    }
  }

  async function handleSelectExisting() {
    if (!conflictId) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/guardians/${conflictId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Not found");
      const g = await res.json();
      handleSelect({ id: g.id, familyId: g.familyId, name: g.name, cnic: g.cnic, phone: g.phone, email: g.email });
    } catch {
      setConflictMsg("Could not load the existing guardian. Search for them instead.");
    }
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setShowCreate(false); setConflictMsg(null); } }}>
      <PopoverTrigger asChild>
        {variant === "inline" ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className={cn(
              "flex h-full w-full items-center gap-1.5 px-2 text-sm bg-transparent border-0 outline-none",
              "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-0",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          >
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            {value ? (
              <>
                <span className="flex-1 text-left truncate text-xs font-medium">{value.name}</span>
                {!disabled && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleClear(); }}
                    className="rounded-sm opacity-60 hover:opacity-100 cursor-pointer shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-xs truncate">Guardian…</span>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background",
              "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          >
            {value ? (
              <>
                <span className="flex-1 text-left truncate font-medium">{value.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">{value.familyId}</span>
                {!disabled && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleClear(); }}
                    className="ml-1 rounded-sm opacity-70 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground flex-1 text-left">{placeholder}</span>
            )}
            {!value && <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-80 p-3 space-y-3" align="start" sideOffset={4}>
        {!showCreate ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type name, CNIC, or phone…"
                className="pl-8 h-8 text-sm"
              />
              {isFetching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {debouncedQ.length >= 2 && (
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {items.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleSelect(g)}
                    className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors"
                  >
                    <Check className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{g.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {g.familyId}{g.cnic ? ` · ${g.cnic}` : ""}{g.phone ? ` · ${g.phone}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
                {items.length === 0 && !isFetching && (
                  <p className="text-[12px] text-muted-foreground text-center py-2">No guardians found</p>
                )}
              </div>
            )}

            <div className="pt-1 border-t border-border">
              <Button type="button" variant="ghost" size="sm" className="w-full h-8 text-xs gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={openCreate}>
                <UserPlus className="h-3.5 w-3.5" />
                Add new guardian
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-indigo-500" />
                New Guardian
              </p>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setShowCreate(false); setConflictMsg(null); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {conflictMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-2">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[12px] text-red-700">{conflictMsg}</p>
                </div>
                {conflictId && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs w-full border-red-200 text-red-600 hover:bg-red-50" onClick={handleSelectExisting}>
                    Select existing record instead
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Name *</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">CNIC</Label>
                <Input value={createForm.cnic} onChange={(e) => setCreateForm((f) => ({ ...f, cnic: formatCnic(e.target.value) }))} placeholder="XXXXX-XXXXXXX-X" maxLength={15} className="h-8 text-sm font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Phone</Label>
                <Input value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="0300-0000000" maxLength={12} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Email</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="h-8 text-sm" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { setShowCreate(false); setConflictMsg(null); }}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="flex-1 h-8 text-xs" disabled={!createForm.name.trim() || createMutation.isPending} onClick={handleCreate}>
                {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create & Select"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
