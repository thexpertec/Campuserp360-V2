import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminHrDepartments, getListAdminHrDepartmentsQueryKey,
  useCreateAdminHrDepartment, useUpdateAdminHrDepartment, useDeleteAdminHrDepartment,
  useListAdminHrDesignations, getListAdminHrDesignationsQueryKey,
  useCreateAdminHrDesignation, useUpdateAdminHrDesignation, useDeleteAdminHrDesignation,
  useListAdminHrIncentiveTypes, getListAdminHrIncentiveTypesQueryKey,
  useCreateAdminHrIncentiveType, useUpdateAdminHrIncentiveType, useDeleteAdminHrIncentiveType,
  useListAdminHrDeductionTypes, getListAdminHrDeductionTypesQueryKey,
  useCreateAdminHrDeductionType, useUpdateAdminHrDeductionType, useDeleteAdminHrDeductionType,
  useListAdminHrSalaryGrades,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/locale";
import { Building2, UserSquare2, TrendingUp, Minus, Layers, Info } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmployeeSalaryTemplatesTab } from "./EmployeeSalaryTemplatesTab";

const SUBTABS = [
  { key: "departments",        label: "Departments" },
  { key: "designations",       label: "Designations" },
  { key: "salary-templates",   label: "Salary Templates" },
  { key: "salary-grades",      label: "Salary Grades" },
  { key: "incentives",         label: "Incentives" },
  { key: "deductions",         label: "Deductions" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function DepartmentsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHrDepartments();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHrDepartmentsQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Department Name", type: "text", required: true, placeholder: "e.g. Administration", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", placeholder: "Optional notes", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Department"
      description="Define departments or divisions within the college (Administration, Academics, Support, etc.)."
      icon={Building2}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHrDepartment({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHrDepartment({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHrDepartment({ mutation: { onSuccess: inv } })}
    />
  );
}

function DesignationsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHrDesignations();
  const { data: depts = [] } = useListAdminHrDepartments();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHrDesignationsQueryKey() });
  const deptName = (id: unknown) => (depts as any[]).find((d: any) => d.id === id)?.name;
  const fields: FieldDef[] = [
    { key: "name", label: "Designation", type: "text", required: true, placeholder: "e.g. Principal", maxLength: 120 },
    {
      key: "departmentId", label: "Department", type: "select", emptyAsNull: true,
      options: [
        { value: "", label: "Any department" },
        ...(depts as any[]).map((d: any) => ({ value: String(d.id), label: String(d.name) })),
      ],
      renderCell: (item) => {
        const name = deptName(item.departmentId);
        return name
          ? <span>{name}</span>
          : <span className="text-muted-foreground">Any</span>;
      },
    },
    { key: "grade", label: "Grade / Scale", type: "text", placeholder: "e.g. BPS-20", maxLength: 60 },
    { key: "description", label: "Description", type: "textarea", placeholder: "Optional notes", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Designation"
      description="Job titles and roles assigned to staff members (Principal, Lecturer, Clerk, etc.)."
      icon={UserSquare2}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHrDesignation({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHrDesignation({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHrDesignation({ mutation: { onSuccess: inv } })}
    />
  );
}


function SalaryGradesTab() {
  const { data = [], isLoading } = useListAdminHrSalaryGrades();
  const grades = data as any[];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Layers className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-semibold">Salary Grades (Reference)</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Read-only reference of pay grades and their basic salary ranges.
      </p>
      <div className="flex items-start gap-2 mb-5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Grades are for reference only — each employee's actual salary is defined in their profile
          under the <strong>Salary</strong> tab.
        </p>
      </div>
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : grades.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <Layers className="h-10 w-10 opacity-20" />
          <p className="text-sm">No salary grades defined.</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Grade</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Basic Min (PKR)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Basic Max (PKR)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Description</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g: any, i: number) => (
                <tr key={g.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "" : "bg-muted/5")}>
                  <td className="px-4 py-3 font-medium text-foreground">{g.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(g.basicMin ?? 0)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(g.basicMax ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{g.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IncentivesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHrIncentiveTypes();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHrIncentiveTypesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Incentive Name", type: "text", required: true, placeholder: "e.g. House Rent Allowance", maxLength: 120 },
    { key: "category", label: "Category", type: "select", options: ["allowance", "bonus", "overtime", "other"], defaultValue: "allowance" },
    { key: "calculationType", label: "Calculation", type: "select", options: ["fixed", "percentage"], defaultValue: "fixed" },
    { key: "defaultValue", label: "Default Amount / %", type: "number", placeholder: "0", defaultValue: "0" },
    { key: "description", label: "Notes", type: "textarea", placeholder: "Optional notes", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Incentive"
      description="Define allowances, bonuses and other incentive types applied to staff salaries."
      icon={TrendingUp}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHrIncentiveType({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHrIncentiveType({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHrIncentiveType({ mutation: { onSuccess: inv } })}
    />
  );
}

function DeductionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHrDeductionTypes();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHrDeductionTypesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Deduction Name", type: "text", required: true, placeholder: "e.g. Income Tax", maxLength: 120 },
    { key: "category", label: "Category", type: "select", options: ["tax", "loan", "advance", "insurance", "other"], defaultValue: "tax" },
    { key: "calculationType", label: "Calculation", type: "select", options: ["fixed", "percentage"], defaultValue: "fixed" },
    { key: "defaultValue", label: "Default Amount / %", type: "number", placeholder: "0", defaultValue: "0" },
    { key: "description", label: "Notes", type: "textarea", placeholder: "Optional notes", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Deduction"
      description="Define taxes, loan repayments, advances and other deduction types applied to staff salaries."
      icon={Minus}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHrDeductionType({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHrDeductionType({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHrDeductionType({ mutation: { onSuccess: inv } })}
    />
  );
}

export function HRSetupTab() {
  const [sub, setSub] = useState<Subtab>("departments");
  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-border mb-6">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              sub === t.key
                ? "border-rose-500 text-rose-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "departments"      && <DepartmentsTab />}
      {sub === "designations"     && <DesignationsTab />}
      {sub === "salary-templates" && <EmployeeSalaryTemplatesTab />}
      {sub === "salary-grades"    && <SalaryGradesTab />}
      {sub === "incentives"       && <IncentivesTab />}
      {sub === "deductions"       && <DeductionsTab />}
    </div>
  );
}
