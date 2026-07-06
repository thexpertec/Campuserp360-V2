import { formatCurrency } from "@/lib/locale";
import { useLocation } from "wouter";
import {
  useListAdminHrEmployeeSalaryTemplates,
  useListAdminEmployees,
  type EmployeeSalaryTemplate,
} from "@workspace/api-client-react";
import { UserCheck, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type EmployeeRow = {
  id: string;
  staffId: string;
  fullName: string;
  role: string | null;
  status: string;
};

// ── Main tab component (view-only reference) ──────────────────────────────────
export function EmployeeSalaryTemplatesTab() {
  const [, nav] = useLocation();
  const { data: templatesData, isLoading: loadingTemplates } = useListAdminHrEmployeeSalaryTemplates();
  const { data: empPage, isLoading: loadingEmployees } = useListAdminEmployees({ status: "all", pageSize: 500 });

  const templates = (templatesData ?? []) as EmployeeSalaryTemplate[];
  const employees = (empPage?.employees ?? []) as EmployeeRow[];

  const templateByEmpId = new Map(templates.map(t => [t.employeeId, t]));

  const computeTemplateTotals = (t: EmployeeSalaryTemplate) => {
    const items = t.items ?? [];
    const inc = items.filter(i => i.itemType === "incentive").reduce((s, i) =>
      s + (i.calculationType === "percentage" ? Math.round(t.basicSalary * i.value / 100) : i.value), 0);
    const ded = items.filter(i => i.itemType === "deduction").reduce((s, i) =>
      s + (i.calculationType === "percentage" ? Math.round(t.basicSalary * i.value / 100) : i.value), 0);
    return { inc, ded, net: t.basicSalary + inc - ded };
  };

  const isLoading = loadingTemplates || loadingEmployees;

  const configured = employees.filter(e => templateByEmpId.has(e.id));
  const unconfigured = employees.filter(e => !templateByEmpId.has(e.id));

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-semibold">Employee Salaries (Reference)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Read-only overview of each employee's salary setup.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full px-2 py-0.5 font-medium">{configured.length} configured</span>
          {unconfigured.length > 0 && (
            <span className="bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5 font-medium">{unconfigured.length} pending</span>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 mb-5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Salaries are defined in each employee's profile. Open an employee's profile and use the
          <strong> Salary</strong> tab to create or edit their salary configuration.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : employees.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <UserCheck className="h-10 w-10 opacity-20" />
          <p className="text-sm">No employees found. Add employees in the Staff Directory first.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Template</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Basic (PKR)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Incentives</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Deductions</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Net Salary</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Profile</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, i) => {
                const tpl = templateByEmpId.get(emp.id) ?? null;
                const totals = tpl ? computeTemplateTotals(tpl) : null;

                return (
                  <tr
                    key={emp.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/20 transition-colors",
                      i % 2 === 0 ? "" : "bg-muted/5",
                    )}
                  >
                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{emp.fullName}</div>
                      <div className="text-xs text-muted-foreground">{emp.staffId}{emp.role ? ` · ${emp.role}` : ""}</div>
                    </td>

                    {/* Template code */}
                    <td className="px-4 py-3">
                      {tpl ? (
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{tpl.templateCode}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Not configured</span>
                      )}
                    </td>

                    {/* Basic */}
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {tpl ? formatCurrency(tpl.basicSalary) : <span className="text-muted-foreground">—</span>}
                    </td>

                    {/* Incentives */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">
                      {totals && totals.inc > 0 ? `+${formatCurrency(totals.inc)}` : <span className="text-muted-foreground">—</span>}
                    </td>

                    {/* Deductions */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-rose-600">
                      {totals && totals.ded > 0 ? `−${formatCurrency(totals.ded)}` : <span className="text-muted-foreground">—</span>}
                    </td>

                    {/* Net */}
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                      {totals ? formatCurrency(totals.net) : <span className="text-muted-foreground font-normal">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                      {tpl ? (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          tpl.active ? "bg-green-50 border-green-200 text-green-700" : "bg-muted border-border text-muted-foreground",
                        )}>
                          {tpl.active ? "Active" : "Inactive"}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-amber-50 border-amber-200 text-amber-700">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Profile link */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => nav(`/employees/${emp.staffId}`)}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open employee profile to edit salary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
