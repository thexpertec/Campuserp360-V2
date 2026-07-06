import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminMedicalMedicineCategories, getListAdminMedicalMedicineCategoriesQueryKey,
  useCreateAdminMedicalMedicineCategory, useUpdateAdminMedicalMedicineCategory, useDeleteAdminMedicalMedicineCategory,
  useListAdminMedicalMedicines, getListAdminMedicalMedicinesQueryKey,
  useCreateAdminMedicalMedicine, useUpdateAdminMedicalMedicine, useDeleteAdminMedicalMedicine,
  useListAdminMedicalConditions, getListAdminMedicalConditionsQueryKey,
  useCreateAdminMedicalCondition, useUpdateAdminMedicalCondition, useDeleteAdminMedicalCondition,
} from "@workspace/api-client-react";
import { Tag, Pill, Stethoscope } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "medicine-categories", label: "Medicine Categories" },
  { key: "medicines",           label: "Medicine Catalog" },
  { key: "conditions",          label: "Conditions" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function MedicineCategoriesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminMedicalMedicineCategories();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminMedicalMedicineCategoriesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Category", type: "text", required: true, placeholder: "e.g. Antibiotics, Analgesics", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Medicine Category"
      description="Classify medicines into pharmacological groups (Antibiotics, Analgesics, Vitamins, etc.)."
      icon={Tag}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminMedicalMedicineCategory({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminMedicalMedicineCategory({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminMedicalMedicineCategory({ mutation: { onSuccess: inv } })}
    />
  );
}

function MedicinesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminMedicalMedicines();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminMedicalMedicinesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Medicine Name", type: "text", required: true, placeholder: "e.g. Paracetamol 500mg", maxLength: 120 },
    { key: "unit", label: "Unit", type: "text", placeholder: "tablet / capsule / ml / mg", maxLength: 40, defaultValue: "tablet" },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Medicine"
      description="Drug and medicine catalog used in the sick bay for dispensing and stock management."
      icon={Pill}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminMedicalMedicine({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminMedicalMedicine({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminMedicalMedicine({ mutation: { onSuccess: inv } })}
    />
  );
}

function ConditionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminMedicalConditions();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminMedicalConditionsQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Condition / Diagnosis", type: "text", required: true, placeholder: "e.g. Fever, Fracture, Food Poisoning", maxLength: 120 },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Condition"
      description="Medical condition and diagnosis types used when recording sick bay patient visits."
      icon={Stethoscope}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminMedicalCondition({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminMedicalCondition({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminMedicalCondition({ mutation: { onSuccess: inv } })}
    />
  );
}

export function MedicalSetupTab() {
  const [sub, setSub] = useState<Subtab>("medicine-categories");
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
                ? "border-red-500 text-red-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "medicine-categories" && <MedicineCategoriesTab />}
      {sub === "medicines"           && <MedicinesTab />}
      {sub === "conditions"          && <ConditionsTab />}
    </div>
  );
}
