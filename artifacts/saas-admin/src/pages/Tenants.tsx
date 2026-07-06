import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Layout } from "@/components/Layout";
import {
  Building2, Plus, Loader2, ChevronRight,
  CheckCircle2, XCircle, ExternalLink,
} from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  basic:    "bg-slate-700 text-slate-200",
  standard: "bg-blue-900/60 text-blue-200",
  premium:  "bg-amber-900/60 text-amber-200",
};

function CreateTenantModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "", slug: "", contactEmail: "", domain: "", plan: "basic" as "basic" | "standard" | "premium", isActive: true,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.createTenant({
        name: form.name,
        slug: form.slug,
        contactEmail: form.contactEmail || undefined,
        domain: form.domain || undefined,
        plan: form.plan,
        isActive: form.isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to create tenant");
    },
  });

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleNameChange = (name: string) => {
    setForm((f) => ({ ...f, name, slug: autoSlug(name) }));
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-5">Create New Tenant</h2>
        {error && (
          <div className="mb-4 bg-red-950/60 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Tenant Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Cadet College Murree"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Slug / Subdomain Key *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="cadet-college-murree"
            />
            <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, and hyphens only.</p>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Contact Email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin@school.edu.pk"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Custom Domain</label>
            <input
              type="text"
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="school.edu.pk"
            />
            <p className="text-xs text-slate-500 mt-1">Bare domain only — no https:// or www. Also link it in the deployment's domain settings.</p>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value as "basic" | "standard" | "premium" }))}
              className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded accent-indigo-500"
            />
            <label htmlFor="isActive" className="text-sm text-slate-300">Active (can be impersonated)</label>
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
            disabled={mutation.isPending || !form.name || !form.slug}
            className="flex-1 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create Tenant
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Tenants() {
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);

  const { data: tenants, isLoading, error } = useQuery({
    queryKey: ["tenants"],
    queryFn:  () => api.listTenants(),
  });

  const impersonateMutation = useMutation({
    mutationFn: (tenantId: string) => api.impersonate(tenantId),
    onSuccess: (data) => {
      localStorage.setItem("ccm_admin_token", data.token);
      localStorage.setItem("ccm_admin_user", JSON.stringify({
        username: `saas@${data.tenant.slug}`,
        name: `SaaS Admin (${data.tenant.name})`,
        isSuperAdmin: true,
        tenantId: data.tenant.id,
      }));
      window.open("/admin/", "_blank");
    },
  });

  return (
    <Layout>
      {showCreate && <CreateTenantModal onClose={() => setShowCreate(false)} />}

      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Building2 className="h-6 w-6 text-indigo-400" />
              Tenants
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {tenants ? `${tenants.length} tenant${tenants.length !== 1 ? "s" : ""} registered` : ""}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4" />
            New Tenant
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-3" />
            Loading tenants…
          </div>
        )}

        {error && (
          <div className="bg-red-950/60 border border-red-800 rounded-xl px-5 py-4 text-red-300 text-sm">
            Failed to load tenants. {error instanceof ApiError ? error.message : ""}
          </div>
        )}

        {tenants && tenants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Building2 className="h-12 w-12 mb-4 opacity-30" />
            <p className="font-medium">No tenants yet</p>
            <p className="text-sm mt-1">Create your first tenant to get started.</p>
          </div>
        )}

        {tenants && tenants.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Slug</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/tenants/${t.id}`)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-900/60 border border-indigo-700/40 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white text-sm">{t.name}</p>
                          {t.contactEmail && (
                            <p className="text-xs text-slate-500">{t.contactEmail}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-xs text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded">{t.slug}</code>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${PLAN_COLORS[t.plan] ?? "bg-slate-700 text-slate-200"}`}>
                        {t.plan}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {t.isActive ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                          <CheckCircle2 className="h-4 w-4" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-slate-500 text-sm">
                          <XCircle className="h-4 w-4" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            impersonateMutation.mutate(t.id);
                          }}
                          disabled={!t.isActive || impersonateMutation.isPending}
                          title="Enter tenant admin dashboard"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-700/70 text-emerald-300 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {impersonateMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3 w-3" />
                          )}
                          Enter
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/tenants/${t.id}`);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
