import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminTransportVehicles, getListAdminTransportVehiclesQueryKey,
  useCreateAdminTransportVehicle, useUpdateAdminTransportVehicle, useDeleteAdminTransportVehicle,
  useListAdminTransportRoutes, getListAdminTransportRoutesQueryKey,
  useCreateAdminTransportRoute, useUpdateAdminTransportRoute, useDeleteAdminTransportRoute,
} from "@workspace/api-client-react";
import { Bus, MapPin } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "vehicles", label: "Vehicles" },
  { key: "routes",   label: "Routes" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function VehiclesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminTransportVehicles();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminTransportVehiclesQueryKey() });
  const fields: FieldDef[] = [
    { key: "regNo", label: "Reg No.", type: "text", required: true, placeholder: "e.g. LEA-1234", maxLength: 30 },
    { key: "make", label: "Make", type: "text", placeholder: "e.g. Toyota", maxLength: 80 },
    { key: "model", label: "Model", type: "text", placeholder: "e.g. Coaster", maxLength: 80 },
    { key: "vehicleType", label: "Type", type: "text", placeholder: "bus / van / car", maxLength: 30, defaultValue: "bus" },
    { key: "capacity", label: "Capacity", type: "number", defaultValue: "0" },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Vehicle"
      description="Register college vehicles with registration number, make, model, type and capacity."
      icon={Bus}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.regNo ?? i.name)}
      createMutation={useCreateAdminTransportVehicle({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminTransportVehicle({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminTransportVehicle({ mutation: { onSuccess: inv } })}
    />
  );
}

function RoutesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminTransportRoutes();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminTransportRoutesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Route Name", type: "text", required: true, placeholder: "e.g. Rawalpindi Route", maxLength: 120 },
    { key: "origin", label: "Origin", type: "text", placeholder: "e.g. Murree", maxLength: 120 },
    { key: "destination", label: "Destination", type: "text", placeholder: "e.g. Rawalpindi", maxLength: 120 },
    { key: "description", label: "Notes / Stops", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Route"
      description="Define transport routes with origin, destination and pick-up/drop stops."
      icon={MapPin}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminTransportRoute({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminTransportRoute({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminTransportRoute({ mutation: { onSuccess: inv } })}
    />
  );
}

export function TransportSetupTab() {
  const [sub, setSub] = useState<Subtab>("vehicles");
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
                ? "border-sky-500 text-sky-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "vehicles" && <VehiclesTab />}
      {sub === "routes"   && <RoutesTab />}
    </div>
  );
}
