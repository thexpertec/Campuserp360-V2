import { useQueryClient } from "@tanstack/react-query";
import { useListAdminStoreUnits, getListAdminStoreUnitsQueryKey, useCreateAdminStoreUnit, useUpdateAdminStoreUnit, useDeleteAdminStoreUnit } from "@workspace/api-client-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { Ruler } from "lucide-react";

export function StoreUnitsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminStoreUnits();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminStoreUnitsQueryKey() });
  const fields: FieldDef[] = [
    { key: "name",        label: "Unit Name", type: "text",     required: true, placeholder: "e.g. Pieces, Metres, Kilograms", maxLength: 120 },
    { key: "symbol",      label: "Symbol",    type: "text",     placeholder: "e.g. pcs, m, kg", maxLength: 20 },
    { key: "description", label: "Notes",     type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Unit of Measure"
      description="Define units of measure used for stock items (Pieces, Metres, Litres, Kilograms, etc.)."
      icon={Ruler}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminStoreUnit({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminStoreUnit({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminStoreUnit({ mutation: { onSuccess: inv } })}
    />
  );
}
