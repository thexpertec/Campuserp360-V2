import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminSportsCategories, getListAdminSportsCategoriesQueryKey,
  useCreateAdminSportsCategory, useUpdateAdminSportsCategory, useDeleteAdminSportsCategory,
  useListAdminSportsVenues, getListAdminSportsVenuesQueryKey,
  useCreateAdminSportsVenue, useUpdateAdminSportsVenue, useDeleteAdminSportsVenue,
} from "@workspace/api-client-react";
import { Trophy, MapPin } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "categories", label: "Sport Categories" },
  { key: "venues",     label: "Venues & Grounds" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function SportCategoriesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminSportsCategories();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminSportsCategoriesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Sport / Activity", type: "text", required: true, placeholder: "e.g. Cricket, Football, Swimming", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Sport"
      description="Define sports and co-curricular activities offered at the college."
      icon={Trophy}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminSportsCategory({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminSportsCategory({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminSportsCategory({ mutation: { onSuccess: inv } })}
    />
  );
}

function VenuesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminSportsVenues();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminSportsVenuesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Venue / Ground Name", type: "text", required: true, placeholder: "e.g. Main Cricket Ground, Indoor Hall", maxLength: 120 },
    { key: "venueType", label: "Type", type: "text", placeholder: "outdoor / indoor / pool / court", maxLength: 30, defaultValue: "outdoor" },
    { key: "capacity", label: "Spectator Capacity", type: "number", defaultValue: "0" },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Venue"
      description="Register sports grounds, courts and indoor facilities with type and capacity."
      icon={MapPin}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminSportsVenue({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminSportsVenue({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminSportsVenue({ mutation: { onSuccess: inv } })}
    />
  );
}

export function SportsSetupTab() {
  const [sub, setSub] = useState<Subtab>("categories");
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
                ? "border-green-500 text-green-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "categories" && <SportCategoriesTab />}
      {sub === "venues"     && <VenuesTab />}
    </div>
  );
}
