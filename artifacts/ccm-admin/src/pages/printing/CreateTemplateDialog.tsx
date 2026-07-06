import { useState } from "react";
import { GraduationCap, Briefcase, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { customDefFromRow, TEMPLATE_PURPOSES, type CustomDocTypeDef, type TemplateCategory } from "./doc-types";

const auth = () => ({
  Authorization: `Bearer ${localStorage.getItem("ccm_admin_token") ?? ""}`,
  "X-Tenant-Id": localStorage.getItem("ccm_admin_website_tenant") || "ccm",
});

export default function CreateTemplateDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (def: CustomDocTypeDef) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("student");
  const [purpose, setPurpose] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setCategory("student"); setPurpose(""); };

  const handleConfirm = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      toast({ title: "Name required", description: "Please enter a template name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // If a purpose is selected, check whether another template already holds it.
      if (purpose) {
        const checkRes = await fetch(`/api/print-templates/active-by-purpose/${encodeURIComponent(purpose)}`);
        if (checkRes.ok) {
          const existing = await checkRes.json() as { name?: string };
          const purposeLabel = TEMPLATE_PURPOSES.find(p => p.slug === purpose)?.label ?? purpose;
          const confirmed = window.confirm(
            `"${purposeLabel}" is currently assigned to "${existing.name ?? "another template"}". ` +
            `Assigning it to this new template will remove it from the existing one. Continue?`
          );
          if (!confirmed) return;
        }
      }

      const body: Record<string, unknown> = { name: cleanName, category };
      if (purpose) body.purpose = purpose;

      const res = await fetch(`/api/admin/print-templates`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Create failed", description: err.error ?? `Server returned ${res.status}`, variant: "destructive" });
        return;
      }
      const row = await res.json() as { type: string; name: string; category?: string; purpose?: string | null };
      onCreated(customDefFromRow(row));
      reset();
      onOpenChange(false);
      toast({ title: "Template created", description: `"${row.name}" is ready to edit.` });
    } catch {
      toast({ title: "Create failed", description: "Network error — please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const CATEGORY_OPTIONS: { id: TemplateCategory; label: string; icon: React.ElementType; hint: string }[] = [
    { id: "applicant", label: "Applicants",       icon: Users,        hint: "Applicant & entry-test fields" },
    { id: "student",   label: "Enrolled Students", icon: GraduationCap, hint: "Student fields" },
    { id: "employee",  label: "Employees",         icon: Briefcase,    hint: "Payroll & HR fields" },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!saving) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="tpl-name" className="text-xs text-muted-foreground">Template Name</Label>
            <Input
              id="tpl-name"
              className="mt-1"
              placeholder="e.g. Bonafide Certificate"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const active = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-3 py-3 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[10px] opacity-70">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Category determines which placeholder tags are available in the editor and cannot be changed later.
            </p>
          </div>

          <div>
            <Label htmlFor="tpl-purpose" className="text-xs text-muted-foreground">Used for <span className="opacity-60">(optional)</span></Label>
            <select
              id="tpl-purpose"
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
              Assigning a purpose makes the system use this template automatically wherever that document is produced. At most one template can hold a given purpose.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={saving}>{saving ? "Creating…" : "Create Template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
