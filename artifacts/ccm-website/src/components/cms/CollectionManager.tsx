import { useEffect, useState } from "react";
import { useEditMode } from "@/lib/edit-mode";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, ArrowLeft,
  UploadCloud, X,
} from "lucide-react";
import { RESOURCES, resourceByPath, type FieldDef, type ResourceDef } from "./resource-schemas";

type Row = Record<string, any> & { id: string; sortOrder?: number };

function emptyForm(def: ResourceDef): Row {
  const out: Row = { id: "", isPublished: true };
  for (const f of def.fields) {
    if (f.type === "boolean") out[f.name] = f.name === "isPublished" ? true : false;
    else out[f.name] = "";
  }
  return out;
}

function UploadField({
  field, value, fileName, onChange, onFileName,
}: {
  field: FieldDef; value: string; fileName?: string;
  onChange: (url: string) => void; onFileName?: (name: string) => void;
}) {
  const { uploadFile } = useEditMode();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isImage = field.type === "image";
  const accept = isImage
    ? "image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
    : "application/pdf,.doc,.docx,.xls,.xlsx";

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadFile(file);
      onChange(url);
      if (!isImage && onFileName && !fileName) onFileName(file.name);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      {isImage && value && (
        <div className="relative inline-block">
          <img src={value} alt="preview" className="h-20 w-32 rounded border object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button type="button" onClick={() => onChange("")}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or upload →" className="flex-1 text-sm" />
        <Button type="button" variant="outline" size="sm" disabled={busy} asChild>
          <label className="cursor-pointer">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            <span className="ml-1.5">{busy ? "Uploading…" : "Upload"}</span>
            <input type="file" accept={accept} className="hidden" onChange={handle} />
          </label>
        </Button>
      </div>
    </div>
  );
}

export default function CollectionManager({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { adminFetch } = useEditMode();
  const { toast } = useToast();

  const [path, setPath] = useState<string>(RESOURCES[0]!.path);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "form">("list");
  const [form, setForm] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  const def = resourceByPath(path)!;

  async function loadItems(p = path) {
    setLoading(true);
    try {
      const rows = (await adminFetch(`/api/admin/website/${p}`)) as Row[] | null;
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e?.message, variant: "destructive" });
      setItems([]);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setView("list");
    loadItems(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, path]);

  function handleClose(v: boolean) {
    if (!v && changed) {
      // Reload so the live page sections reflect the new content.
      window.location.reload();
      return;
    }
    onOpenChange(v);
  }

  function startAdd() { setForm(emptyForm(def)); setView("form"); }
  function startEdit(row: Row) { setForm({ ...emptyForm(def), ...row }); setView("form"); }

  async function save() {
    if (!form) return;
    for (const f of def.fields) {
      if (f.required && !String(form[f.name] ?? "").trim()) {
        toast({ title: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }
    const payload: Record<string, any> = {};
    for (const f of def.fields) {
      let v = form[f.name];
      if (f.type === "number") v = v === "" || v == null ? null : Number(v);
      payload[f.name] = v;
    }
    setSaving(true);
    try {
      if (form.id) {
        await adminFetch(`/api/admin/website/${path}/${form.id}`, {
          method: "PATCH", body: JSON.stringify(payload),
        });
      } else {
        await adminFetch(`/api/admin/website/${path}`, {
          method: "POST", body: JSON.stringify(payload),
        });
      }
      setChanged(true);
      toast({ title: "Saved" });
      setView("list");
      await loadItems();
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete this ${def.singular.toLowerCase()}?`)) return;
    try {
      await adminFetch(`/api/admin/website/${path}/${row.id}`, { method: "DELETE" });
      setChanged(true);
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(next, 0, moved!);
    setItems(reordered);
    setChanged(true);
    try {
      await adminFetch(`/api/admin/website/${path}/reorder`, {
        method: "PATCH", body: JSON.stringify({ order: reordered.map((r) => r.id) }),
      });
    } catch (e: any) {
      toast({ title: "Reorder failed", description: e?.message, variant: "destructive" });
      loadItems();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage content sections</DialogTitle>
          <DialogDescription>
            Add, edit, delete and reorder list content shown across the website.
            Changes save to the live site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label className="shrink-0 text-sm">Section</Label>
          <Select value={path} onValueChange={(v) => { setPath(v); setView("list"); }}>
            <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESOURCES.map((r) => (
                <SelectItem key={r.path} value={r.path}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {view === "list" && (
            <Button size="sm" className="ml-auto" onClick={startAdd}>
              <Plus className="mr-1 h-4 w-4" /> Add {def.singular.toLowerCase()}
            </Button>
          )}
        </div>

        {view === "list" ? (
          <div className="space-y-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No {def.label.toLowerCase()} yet. Click “Add”.
              </p>
            ) : (
              items.map((row, i) => (
                <div key={row.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  {def.imageField && row[def.imageField] && (
                    <img src={row[def.imageField]} alt="" className="h-10 w-14 rounded object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {row[def.titleField] || "(untitled)"}
                      {row.isPublished === false && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Hidden
                        </span>
                      )}
                    </p>
                    {def.subtitleField && (
                      <p className="truncate text-xs text-muted-foreground">{row[def.subtitleField]}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0}
                      onClick={() => move(i, -1)} title="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === items.length - 1}
                      onClick={() => move(i, 1)} title="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => startEdit(row)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => remove(row)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          form && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setView("list")}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
              </Button>
              {def.fields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <Label className="text-sm">
                    {f.label}{f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {f.type === "boolean" ? (
                    <div className="flex items-center gap-2">
                      <Switch checked={!!form[f.name]}
                        onCheckedChange={(c) => setForm({ ...form, [f.name]: c })} />
                    </div>
                  ) : f.type === "textarea" ? (
                    <Textarea value={form[f.name] ?? ""} rows={3}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                  ) : f.type === "image" || f.type === "file" ? (
                    <UploadField field={f} value={form[f.name] ?? ""}
                      fileName={form.fileName}
                      onChange={(url) => setForm({ ...form, [f.name]: url })}
                      onFileName={(name) => setForm((cur) => cur ? { ...cur, fileName: name } : cur)} />
                  ) : (
                    <Input type={f.type === "number" ? "number" : "text"}
                      value={form[f.name] ?? ""} placeholder={f.placeholder}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setView("list")}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
                </Button>
              </div>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
