import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type TenantModuleItem } from "@/lib/api";
import { Layout } from "@/components/Layout";
import {
  ArrowLeft, Building2, Users, ExternalLink, Loader2,
  Plus, KeyRound, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Save, Puzzle, Trash2, TriangleAlert, ShieldCheck, Shield,
} from "lucide-react";

function CreateAdminModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ username: "", password: "", fullName: "", email: "", role: "admin" });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.createTenantAdmin(tenantId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-admins", tenantId] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create admin"),
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-5">Create Admin User</h2>
        {error && (
          <div className="mb-4 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Full Name *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Administrator"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Username *</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password * (min 6 chars)</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="strong-password"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin@school.edu.pk"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Role</label>
            <input
              type="text"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.username || !form.password || !form.fullName}
            className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Admin
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({
  tenantId,
  adminId,
  adminName,
  onClose,
}: {
  tenantId: string;
  adminId: string;
  adminName: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.resetTenantAdminPassword(tenantId, adminId, password),
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed"),
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-1">Reset Password</h2>
        <p className="text-slate-400 text-sm mb-5">Set a new password for <strong className="text-white">{adminName}</strong></p>
        {error && (
          <div className="mb-4 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        {success ? (
          <div className="text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-white font-semibold">Password updated!</p>
            <button onClick={onClose} className="mt-4 px-6 py-2 rounded-lg bg-slate-700 text-white text-sm">Close</button>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm text-slate-300 mb-1">New Password (min 6 chars)</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="new-password"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || password.length < 6}
                className="flex-1 h-10 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeleteTenantModal({
  tenant,
  onClose,
  onDeleted,
}: {
  tenant: { id: string; name: string; slug: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [slugConfirm, setSlugConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.deleteTenant(tenant.id, password),
    onSuccess: () => onDeleted(),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to delete school"),
  });

  const canSubmit = slugConfirm === tenant.slug && password.length >= 1 && !mutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-red-800/60 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-red-950/60 border border-red-700/40 flex items-center justify-center shrink-0">
            <TriangleAlert className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Delete School</h2>
            <p className="text-xs text-slate-400">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-5">
          All data for <span className="font-semibold text-white">{tenant.name}</span> will be
          permanently deleted — admins, settings, HR records, finance data, and more.
        </p>

        {error && (
          <div className="mb-4 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Type the school slug to confirm: <code className="text-red-300 bg-red-950/40 px-1 rounded">{tenant.slug}</code>
            </label>
            <input
              type="text"
              value={slugConfirm}
              onChange={(e) => setSlugConfirm(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder={tenant.slug}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Admin password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Your SaaS admin password"
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 h-10 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 h-10 rounded-lg bg-red-700 hover:bg-red-600 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [resetAdminId, setResetAdminId] = useState<{ id: string; name: string } | null>(null);
  const [promotingAdminId, setPromotingAdminId] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; slug: string; contactEmail: string; domain: string; plan: string; isActive: boolean } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [modulesDraft, setModulesDraft] = useState<TenantModuleItem[] | null>(null);
  const [modulesSaved, setModulesSaved] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn:  () => api.getTenant(id!),
    enabled: !!id,
  });

  const { data: admins, isLoading: adminsLoading } = useQuery({
    queryKey: ["tenant-admins", id],
    queryFn:  () => api.listTenantAdmins(id!),
    enabled: !!id,
  });

  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ["tenant-modules", id],
    queryFn:  () => api.getTenantModules(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (modulesData?.modules && !modulesDraft) {
      setModulesDraft(modulesData.modules);
    }
  }, [modulesData]);

  const saveModulesMutation = useMutation({
    mutationFn: () => api.updateTenantModules(
      id!,
      (modulesDraft ?? modulesData?.modules ?? []).map((m: TenantModuleItem) => ({
        key: m.key,
        enabled: m.enabled,
        config: m.config,
      })),
    ),
    onSuccess: (data) => {
      setModulesDraft(data.modules);
      setModulesSaved(true);
      setModulesError(null);
      queryClient.invalidateQueries({ queryKey: ["tenant-modules", id] });
      setTimeout(() => setModulesSaved(false), 3000);
    },
    onError: (err) => setModulesError(err instanceof ApiError ? err.message : "Failed to save modules"),
  });

  const displayModules: TenantModuleItem[] = modulesDraft ?? modulesData?.modules ?? [];

  const updateMutation = useMutation({
    mutationFn: () => api.updateTenant(id!, {
      name:         editForm!.name,
      slug:         editForm!.slug,
      contactEmail: editForm!.contactEmail || undefined,
      domain:       editForm!.domain,
      plan:         editForm!.plan as "basic" | "standard" | "premium",
      isActive:     editForm!.isActive,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setEditMode(false);
      setEditError(null);
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Failed to save changes"),
  });

  const setRoleMutation = useMutation({
    mutationFn: ({ adminId, role }: { adminId: string; role: "admin" | "super_admin" }) =>
      api.setTenantAdminRole(id!, adminId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-admins", id] });
      setPromotingAdminId(null);
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: () => api.impersonate(id!),
    onSuccess: (data) => {
      // Pass the token via URL query params so the ccm-admin (different port /
      // origin) can bootstrap its session even though localStorage is
      // origin-scoped. VITE_ADMIN_URL is derived at build time from
      // REPLIT_DEV_DOMAIN: {id}--8099.{cluster}.replit.dev
      const adminBase = (import.meta.env.VITE_ADMIN_URL as string) || "";
      const params = new URLSearchParams({
        impersonate: data.token,
        impersonateName: `SaaS Admin (${data.tenant.name})`,
        impersonateSlug: data.tenant.slug,
        impersonateTenantId: String(data.tenant.id),
      });
      window.open(`${adminBase}/?${params.toString()}`, "_blank");
    },
  });

  if (tenantLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-3" /> Loading…
        </div>
      </Layout>
    );
  }

  if (!tenant) {
    return (
      <Layout>
        <div className="text-center py-20 text-slate-400">Tenant not found.</div>
      </Layout>
    );
  }

  const startEdit = () => {
    setEditForm({
      name:         tenant.name,
      slug:         tenant.slug,
      contactEmail: tenant.contactEmail ?? "",
      domain:       tenant.domain ?? "",
      plan:         tenant.plan,
      isActive:     tenant.isActive,
    });
    setEditError(null);
    setEditMode(true);
  };

  return (
    <Layout>
      {showCreateAdmin && id && (
        <CreateAdminModal tenantId={id} onClose={() => setShowCreateAdmin(false)} />
      )}
      {resetAdminId && id && (
        <ResetPasswordModal
          tenantId={id}
          adminId={resetAdminId.id}
          adminName={resetAdminId.name}
          onClose={() => setResetAdminId(null)}
        />
      )}
      {showDelete && (
        <DeleteTenantModal
          tenant={tenant}
          onClose={() => setShowDelete(false)}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ["tenants"] });
            setLocation("/tenants");
          }}
        />
      )}

      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setLocation("/tenants")}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenants
        </button>

        {/* Tenant Info Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-900/60 border border-indigo-700/40 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
                <code className="text-sm text-indigo-300">{tenant.slug}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => impersonateMutation.mutate()}
                disabled={!tenant.isActive || impersonateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700/50 hover:bg-emerald-700/80 text-emerald-300 text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {impersonateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Enter Admin Dashboard
              </button>
              {!editMode && (
                <button
                  onClick={startEdit}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-medium transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {editMode && editForm ? (
            <div className="mt-6 grid grid-cols-2 gap-4">
              {editError && (
                <div className="col-span-2 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
                  {editError}
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, name: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Slug</label>
                <input
                  value={editForm.slug}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="my-school"
                />
                <p className="text-xs text-amber-500/80 mt-1">
                  ⚠ Changing the slug renames the website URL path (e.g. /ccm/ → /new-slug/). Update TENANT_SLUGS in start-prod.sh and redeploy.
                </p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, contactEmail: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Custom Domain</label>
                <input
                  type="text"
                  value={editForm.domain}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, domain: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="school.edu.pk"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Bare domain only — no <code>https://</code> or <code>www.</code> Visitors on this domain see this tenant's site.
                  You must also link the domain in the deployment's domain settings (and add the DNS records) for it to resolve.
                </p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Plan</label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, plan: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => f && ({ ...f, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded accent-indigo-500"
                />
                <label htmlFor="edit-active" className="text-sm text-slate-300">Active</label>
              </div>
              <div className="col-span-2 flex gap-3">
                <button
                  onClick={() => setEditMode(false)}
                  className="flex-1 h-10 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Contact Email</p>
                <p className="text-sm text-slate-200">{tenant.contactEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Custom Domain</p>
                {tenant.domain ? (
                  <a
                    href={`https://${tenant.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
                  >
                    {tenant.domain}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">—</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Plan</p>
                <p className="text-sm text-slate-200 capitalize">{tenant.plan}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                {tenant.isActive ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-slate-500 text-sm">
                    <XCircle className="h-4 w-4" /> Inactive
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Created</p>
                <p className="text-sm text-slate-200">{new Date(tenant.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Admin Users */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              Admin Users
              {admins && (
                <span className="text-xs text-slate-500 font-normal">({admins.length})</span>
              )}
            </h2>
            <button
              onClick={() => setShowCreateAdmin(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 text-xs font-semibold transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Admin
            </button>
          </div>

          {adminsLoading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          )}

          {admins && admins.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No admin users yet. Create one to get started.</p>
            </div>
          )}

          {admins && admins.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-white text-sm">{a.fullName}</p>
                      {a.email && <p className="text-xs text-slate-500">{a.email}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs text-slate-300">{a.username}</code>
                    </td>
                    <td className="px-6 py-4">
                      {a.role === "super_admin" ? (
                        <span className="flex items-center gap-1 text-purple-400 text-xs font-semibold">
                          <ShieldCheck className="h-3.5 w-3.5" /> Super Admin
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 capitalize">{a.role}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {a.isActive ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500 text-xs">
                          <XCircle className="h-3.5 w-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {a.role === "super_admin" ? (
                          <button
                            onClick={() => {
                              setPromotingAdminId(a.id);
                              setRoleMutation.mutate({ adminId: a.id, role: "admin" });
                            }}
                            disabled={promotingAdminId === a.id && setRoleMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {promotingAdminId === a.id && setRoleMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Shield className="h-3.5 w-3.5" />}
                            Demote
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setPromotingAdminId(a.id);
                              setRoleMutation.mutate({ adminId: a.id, role: "super_admin" });
                            }}
                            disabled={promotingAdminId === a.id && setRoleMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-900/60 text-purple-400 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {promotingAdminId === a.id && setRoleMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <ShieldCheck className="h-3.5 w-3.5" />}
                            Make Super Admin
                          </button>
                        )}
                        <button
                          onClick={() => setResetAdminId({ id: a.id, name: a.fullName })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/60 text-amber-400 text-xs font-medium transition-colors"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modules & Features */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mt-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Puzzle className="h-4 w-4 text-indigo-400" />
              Modules &amp; Features
            </h2>
            <div className="flex items-center gap-2">
              {modulesSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              <button
                onClick={() => saveModulesMutation.mutate()}
                disabled={saveModulesMutation.isPending || modulesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {saveModulesMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </button>
            </div>
          </div>

          {modulesError && (
            <div className="mx-6 mt-4 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">{modulesError}</div>
          )}

          {modulesLoading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          )}

          {!modulesLoading && displayModules.length > 0 && (
            <div className="divide-y divide-slate-800">
              {displayModules.map((mod) => (
                <div key={mod.key} className="px-6 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-white">{mod.label}</span>
                      <code className="text-[10px] text-slate-500 font-mono">{mod.key}</code>
                    </div>
                    <p className="text-xs text-slate-500">{mod.description}</p>
                    {mod.enabled && mod.configFields && mod.configFields.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-4">
                        {mod.configFields.map((field) => (
                          <div key={field.key} className="flex flex-col gap-1">
                            <label className="text-[10px] text-slate-400 font-medium">{field.label}</label>
                            <input
                              type="number"
                              min={field.min ?? 0}
                              value={(mod.config[field.key] as number) ?? field.default}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setModulesDraft((prev) =>
                                  (prev ?? displayModules).map((m) =>
                                    m.key === mod.key
                                      ? { ...m, config: { ...m.config, [field.key]: val } }
                                      : m,
                                  ),
                                );
                              }}
                              className="w-32 h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setModulesDraft((prev) =>
                        (prev ?? displayModules).map((m) =>
                          m.key === mod.key ? { ...m, enabled: !m.enabled } : m,
                        ),
                      );
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
                      mod.enabled ? "bg-indigo-600" : "bg-slate-700"
                    }`}
                    role="switch"
                    aria-checked={mod.enabled}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                        mod.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-slate-900 border border-red-900/40 rounded-2xl overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-red-900/30 flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Danger Zone</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Delete this school</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Permanently removes all data — admins, settings, HR records, and finance data. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-red-400 hover:text-red-300 text-sm font-semibold transition-colors shrink-0 ml-6"
            >
              <Trash2 className="h-4 w-4" />
              Delete School
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
