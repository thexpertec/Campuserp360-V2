import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TEMPLATE_PURPOSES } from "./doc-types";
import { patchTemplateCache } from "./templateCache";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

/** Minimal shape needed to edit either a custom template or a built-in one
 *  (built-ins have no icon/color/tagGroups/etc. to carry through the dialog). */
export type EditableTemplate = {
  id: string;
  label: string;
  purpose: string | null;
};

export type UpdatedTemplate = {
  id: string;
  name: string;
  purpose: string | null;
};

export default function EditTemplateDialog({
  open,
  onOpenChange,
  template,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: EditableTemplate;
  onUpdated: (updated: UpdatedTemplate) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(template.label);
  const [purpose, setPurpose] = useState<string>(template.purpose ?? "");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName(template.label);
    setPurpose(template.purpose ?? "");
  }

  const handleConfirm = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      toast({ title: "Name required", description: "Please enter a template name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const newPurpose = purpose || null;

      if (newPurpose && newPurpose !== template.purpose) {
        const checkRes = await fetch(`/api/print-templates/active-by-purpose/${encodeURIComponent(newPurpose)}`, {
          headers: auth(),
        });
        if (checkRes.ok) {
          const existing = await checkRes.json() as { name?: string };
          if (existing.name && existing.name !== template.label) {
            const purposeLabel = TEMPLATE_PURPOSES.find(p => p.slug === newPurpose)?.label ?? newPurpose;
            const confirmed = window.confirm(
              `"${purposeLabel}" is currently assigned to "${existing.name}". ` +
              `Assigning it here will remove it from the existing one. Continue?`
            );
            if (!confirmed) return;
          }
        }
      }

      const body: Record<string, string | null> = { name: cleanName, purpose: newPurpose };
      const res = await fetch(`/api/admin/print-templates/${template.id}`, {
        method: "PATCH",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Update failed", description: err.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }

      const row = await res.json() as { type: string; name: string; category?: string | null; purpose?: string | null };
      const updated: UpdatedTemplate = { id: template.id, name: row.name, purpose: row.purpose ?? null };
      patchTemplateCache(template.id, { name: updated.name, purpose: updated.purpose });
      onUpdated(updated);
      onOpenChange(false);
      toast({ title: "Template updated", description: `"${updated.name}" has been saved.` });
    } catch {
      toast({ title: "Update failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!saving) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-tpl-name" className="text-xs text-muted-foreground">Template Name</Label>
            <Input
              id="edit-tpl-name"
              className="mt-1"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="edit-tpl-purpose" className="text-xs text-muted-foreground">
              Used for <span className="opacity-60">(optional)</span>
            </Label>
            <select
              id="edit-tpl-purpose"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="">— None —</option>
              {TEMPLATE_PURPOSES.map(p => (
                <option key={p.slug} value={p.slug}>{p.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              At most one template can hold a given purpose. Assigning one here removes it from any previous holder.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
