import { useState, useEffect } from "react";
import { formatDate as localeFormatDate } from "@/lib/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, Users, Eye, EyeOff } from "lucide-react";
import { getToken } from "@/lib/auth";

const API = (import.meta.env.VITE_API_BASE as string) || "";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken() ?? ""}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Request failed"), { status: res.status });
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

const MODULES = [
  { key: "finance",    label: "Finance / Accounts" },
  { key: "fees",       label: "Fee Management"     },
  { key: "exams",      label: "Exams & Results"    },
  { key: "payroll",    label: "Payroll / HR"       },
  { key: "admissions", label: "Admissions"         },
  { key: "settings",   label: "Settings"           },
  { key: "*",          label: "All Modules"        },
];

const PERMISSIONS = ["view", "draft", "post", "edit", "delete"] as const;
type Permission = typeof PERMISSIONS[number];

type UserRole = { module: string; permission: string };

interface AdminUser {
  id:           string;
  username:     string;
  fullName:     string;
  email:        string | null;
  isSuperAdmin: boolean;
  isActive:     boolean;
  lastLoginAt:  string | null;
  createdAt:    string;
  roles:        UserRole[];
}

type FormState = {
  username:     string;
  fullName:     string;
  email:        string;
  isSuperAdmin: boolean;
  isActive:     boolean;
  password:     string;
  confirmPassword: string;
  roles:        UserRole[];
};

const emptyForm: FormState = {
  username: "", fullName: "", email: "",
  isSuperAdmin: false, isActive: true,
  password: "", confirmPassword: "",
  roles: [],
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??";
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return localeFormatDate(iso);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UsersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<FormState>(emptyForm);
  const [showPwd, setShowPwd]       = useState(false);
  const [activeTab, setActiveTab]   = useState<"details" | "roles">("details");

  const { data: users = [], isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn:  () => apiFetch("/api/admin/admin-users"),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/admin/admin-users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User created" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      apiFetch(`/api/admin/admin-users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User updated" });
      setDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/admin-users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setActiveTab("details");
    setDialogOpen(true);
  }

  function openEdit(u: AdminUser) {
    setEditingId(u.id);
    setForm({
      username: u.username, fullName: u.fullName, email: u.email ?? "",
      isSuperAdmin: u.isSuperAdmin, isActive: u.isActive,
      password: "", confirmPassword: "",
      roles: u.roles.slice(),
    });
    setActiveTab("details");
    setDialogOpen(true);
  }

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setRolePermission(module: string, permission: Permission, checked: boolean) {
    setForm((f) => {
      const filtered = f.roles.filter((r) => r.module !== module);
      if (checked) {
        return { ...f, roles: [...filtered, { module, permission }] };
      }
      return { ...f, roles: filtered };
    });
  }

  function getRoleForModule(module: string): Permission | null {
    return (form.roles.find((r) => r.module === module)?.permission ?? null) as Permission | null;
  }

  function handleSave() {
    if (!form.username.trim()) {
      toast({ title: "Missing field", description: "Username is required.", variant: "destructive" }); return;
    }
    if (!form.fullName.trim()) {
      toast({ title: "Missing field", description: "Full name is required.", variant: "destructive" }); return;
    }
    if (!editingId && !form.password.trim()) {
      toast({ title: "Password required", description: "Set a password for new users.", variant: "destructive" }); return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      toast({ title: "Password mismatch", description: "Passwords do not match.", variant: "destructive" }); return;
    }
    if (form.password && form.password.length < 6) {
      toast({ title: "Weak password", description: "Password must be at least 6 characters.", variant: "destructive" }); return;
    }

    const body: Record<string, unknown> = {
      username:     form.username.trim(),
      fullName:     form.fullName.trim(),
      email:        form.email.trim() || null,
      isSuperAdmin: form.isSuperAdmin,
      isActive:     form.isActive,
      roles:        form.roles,
    };
    if (form.password.trim()) body.password = form.password;

    if (editingId) {
      updateMutation.mutate({ id: editingId, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Named admin accounts for the maker-checker approval system. Super-admins bypass all module restrictions.
        </p>
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-2 h-4 w-4" /> Add User
        </Button>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Modules</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-destructive">
                  Failed to load users. {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-40 text-center">
                  <div className="flex flex-col items-center text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-40" />
                    <p className="font-medium text-foreground">No named users yet</p>
                    <p className="text-sm mt-1">The env-var admin account is always available as a fallback.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                        {initials(u.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{u.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{u.username}{u.email ? ` · ${u.email}` : ""}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {u.isSuperAdmin ? (
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Super Admin</Badge>
                  ) : u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No roles</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.roles.slice(0, 3).map((r) => (
                        <Badge
                          key={`${r.module}-${r.permission}`}
                          variant="secondary"
                          className={`text-xs ${
                            r.permission === "delete" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                            r.permission === "edit"   ? "bg-purple-100 text-purple-800 hover:bg-purple-100" :
                            r.permission === "post"   ? "bg-green-100 text-green-800 hover:bg-green-100" :
                            r.permission === "draft"  ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                            r.permission === "view"   ? "bg-slate-100 text-slate-700 hover:bg-slate-100" : ""
                          }`}
                        >
                          {r.module === "*" ? "All" : r.module} · {r.permission}
                        </Badge>
                      ))}
                      {u.roles.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{u.roles.length - 3}</Badge>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(u.lastLoginAt)}</TableCell>
                <TableCell>
                  {u.isActive
                    ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove "{u.fullName}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete their account and revoke access.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate(u.id)}
                          >Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit User" : "Add Admin User"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update this user's account details and module roles."
                : "Create a named admin account with module-level maker/checker roles."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b border-border mb-2">
            {(["details", "roles"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "details" ? "Account Details" : "Module Roles"}
              </button>
            ))}
          </div>

          {activeTab === "details" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Username *</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setF("username", e.target.value)}
                    placeholder="e.g. bursar"
                    disabled={!!editingId}
                    className={editingId ? "opacity-60" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={form.fullName} onChange={(e) => setF("fullName", e.target.value)} placeholder="Col. Ahmed Khan" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="user@ccm.edu.pk" />
              </div>
              <div className="space-y-2">
                <Label>{editingId ? "New Password (leave blank to keep current)" : "Password *"}</Label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setF("password", e.target.value)}
                    placeholder="Min. 6 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {form.password && (
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setF("confirmPassword", e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Super Admin</Label>
                  <p className="text-xs text-muted-foreground">Bypasses all module restrictions. Use sparingly.</p>
                </div>
                <Switch checked={form.isSuperAdmin} onCheckedChange={(v) => setF("isSuperAdmin", v)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label>Account Active</Label>
                  <p className="text-xs text-muted-foreground">Inactive accounts cannot log in.</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => setF("isActive", v)} />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  <strong>View</strong> — read-only. <strong>Draft</strong> — can create/submit entries for approval. <strong>Post</strong> — can approve and post entries made by others. <strong>Edit</strong> — can also edit posted entries. <strong>Delete</strong> — full access including deleting posted records.
                </p>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium w-[40%]">Module</th>
                      {PERMISSIONS.map((p) => (
                        <th key={p} className="text-center px-2 py-2 capitalize">{p}</th>
                      ))}
                      <th className="px-2 py-2 text-center w-[10%]">None</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {MODULES.map((m, idx) => {
                      const current = getRoleForModule(m.key);
                      return (
                        <tr key={m.key} className={`transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-3 py-2 font-medium text-sm">{m.label}</td>
                          {PERMISSIONS.map((p) => (
                            <td key={p} className="text-center px-2 py-2">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={current === p}
                                  onCheckedChange={(v) => setRolePermission(m.key, p, !!v)}
                                  className={`h-4 w-4 ${
                                    p === "delete" ? "data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600" :
                                    p === "edit"   ? "data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600" :
                                    p === "post"   ? "data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600" :
                                    p === "draft"  ? "data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" :
                                    "data-[state=checked]:bg-slate-500 data-[state=checked]:border-slate-500"
                                  }`}
                                />
                              </div>
                            </td>
                          ))}
                          <td className="text-center px-2 py-2">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={!current}
                                onCheckedChange={(v) => { if (v) { setForm((f) => ({ ...f, roles: f.roles.filter((r) => r.module !== m.key) })); } }}
                                className="h-4 w-4"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
