import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminHostelBlocks, getListAdminHostelBlocksQueryKey,
  useCreateAdminHostelBlock, useUpdateAdminHostelBlock, useDeleteAdminHostelBlock,
  useListAdminHostelRoomTypes, getListAdminHostelRoomTypesQueryKey,
  useCreateAdminHostelRoomType, useUpdateAdminHostelRoomType, useDeleteAdminHostelRoomType,
} from "@workspace/api-client-react";
import { Building2, BedDouble } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "blocks",     label: "Dormitory Blocks" },
  { key: "room-types", label: "Room Types" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function BlocksTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHostelBlocks();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHostelBlocksQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Block Name", type: "text", required: true, placeholder: "e.g. Block A", maxLength: 120 },
    { key: "blockType", label: "Type", type: "select", defaultValue: "boys", options: [{ value: "boys", label: "Boys" }, { value: "girls", label: "Girls" }, { value: "staff", label: "Staff" }] },
    { key: "floors", label: "Floors", type: "number", defaultValue: "1" },
    { key: "capacity", label: "Capacity", type: "number", defaultValue: "0" },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Dormitory Block"
      description="Boarding blocks, wings and dormitory buildings with capacity and type."
      icon={Building2}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHostelBlock({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHostelBlock({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHostelBlock({ mutation: { onSuccess: inv } })}
    />
  );
}

function RoomTypesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHostelRoomTypes();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminHostelRoomTypesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Room Type", type: "text", required: true, placeholder: "e.g. Dormitory, Single Room", maxLength: 120 },
    { key: "capacity", label: "Beds / Capacity", type: "number", defaultValue: "1" },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Room Type"
      description="Define room types such as dormitories, double rooms or private rooms with bed counts."
      icon={BedDouble}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHostelRoomType({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminHostelRoomType({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminHostelRoomType({ mutation: { onSuccess: inv } })}
    />
  );
}

export function HostelSetupTab() {
  const [sub, setSub] = useState<Subtab>("blocks");
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
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "blocks"     && <BlocksTab />}
      {sub === "room-types" && <RoomTypesTab />}
    </div>
  );
}
