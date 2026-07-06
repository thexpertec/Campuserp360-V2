import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminLibraryCategories, getListAdminLibraryCategoriesQueryKey,
  useCreateAdminLibraryCategory, useUpdateAdminLibraryCategory, useDeleteAdminLibraryCategory,
  useListAdminLibraryPublishers, getListAdminLibraryPublishersQueryKey,
  useCreateAdminLibraryPublisher, useUpdateAdminLibraryPublisher, useDeleteAdminLibraryPublisher,
} from "@workspace/api-client-react";
import { Tag, BookMarked } from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "@/pages/academic/CatalogTab";
import { useState } from "react";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { key: "categories", label: "Book Categories" },
  { key: "publishers", label: "Publishers" },
] as const;
type Subtab = (typeof SUBTABS)[number]["key"];

function CategoriesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminLibraryCategories();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminLibraryCategoriesQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Category", type: "text", required: true, placeholder: "e.g. Fiction, Science, Reference", maxLength: 120 },
    { key: "description", label: "Description", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Book Category"
      description="Classify library books into categories such as Fiction, Science, History, Reference, etc."
      icon={Tag}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminLibraryCategory({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminLibraryCategory({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminLibraryCategory({ mutation: { onSuccess: inv } })}
    />
  );
}

function PublishersTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminLibraryPublishers();
  const inv = () => qc.invalidateQueries({ queryKey: getListAdminLibraryPublishersQueryKey() });
  const fields: FieldDef[] = [
    { key: "name", label: "Publisher Name", type: "text", required: true, placeholder: "e.g. Oxford University Press", maxLength: 120 },
    { key: "city", label: "City", type: "text", placeholder: "e.g. Karachi", maxLength: 80 },
    { key: "description", label: "Notes", type: "textarea", inTable: false },
  ];
  return (
    <CatalogTab
      entityLabel="Publisher"
      description="Maintain a list of book publishers and their cities for cataloguing."
      icon={BookMarked}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminLibraryPublisher({ mutation: { onSuccess: inv } })}
      updateMutation={useUpdateAdminLibraryPublisher({ mutation: { onSuccess: inv } })}
      deleteMutation={useDeleteAdminLibraryPublisher({ mutation: { onSuccess: inv } })}
    />
  );
}

export function LibrarySetupTab() {
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
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "categories" && <CategoriesTab />}
      {sub === "publishers" && <PublishersTab />}
    </div>
  );
}
