import { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import {
  useListAdminAcademicYears, getListAdminAcademicYearsQueryKey, getListActiveAcademicYearsQueryKey,
  useCreateAdminAcademicYear, useUpdateAdminAcademicYear, useDeleteAdminAcademicYear,
  useListAdminClassCategories, getListAdminClassCategoriesQueryKey, getListActiveClassCategoriesQueryKey,
  useCreateAdminClassCategory, useUpdateAdminClassCategory, useDeleteAdminClassCategory,
  useListAdminSections, getListAdminSectionsQueryKey, getListActiveSectionsQueryKey,
  useCreateAdminSection, useUpdateAdminSection, useDeleteAdminSection,
  useListAdminHouses, getListAdminHousesQueryKey, getListActiveHousesQueryKey,
  useCreateAdminHouse, useUpdateAdminHouse, useDeleteAdminHouse,
  useListAdminAcademicTerms, getListAdminAcademicTermsQueryKey, getListActiveAcademicTermsQueryKey,
  useCreateAdminAcademicTerm, useUpdateAdminAcademicTerm, useDeleteAdminAcademicTerm,
  useListAdminAffiliations, getListAdminAffiliationsQueryKey, getListActiveAffiliationsQueryKey,
  useCreateAdminAffiliation, useUpdateAdminAffiliation, useDeleteAdminAffiliation,
  useListAdminTermsConditions, getListAdminTermsConditionsQueryKey, getListActiveTermsConditionsQueryKey,
  useCreateAdminTermsCondition, useUpdateAdminTermsCondition, useDeleteAdminTermsCondition,
} from "@workspace/api-client-react";
import {
  CalendarRange, Layers, Grid2x2, Home, CalendarClock, Award, BookOpen, LayoutGrid, FileText,
} from "lucide-react";
import { CatalogTab, type CatalogItem, type FieldDef } from "./academic/CatalogTab";
import { ClassesTab } from "./academic/ClassesTab";
import { SubjectsTab } from "./academic/SubjectsTab";
import { AcademicSetupPage } from "./academic/AcademicSetupPage";

function AcademicYearsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminAcademicYears();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminAcademicYearsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveAcademicYearsQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "Year", type: "text", required: true, placeholder: "e.g. 2026-2027", maxLength: 120 },
  ];
  return (
    <CatalogTab
      entityLabel="Academic Year"
      description="Define the academic years applicants and classes are organised under."
      icon={CalendarRange}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminAcademicYear({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminAcademicYear({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminAcademicYear({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function CategoryTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminClassCategories();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminClassCategoriesQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveClassCategoriesQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "Category", type: "text", required: true, placeholder: "e.g. Cadet Wing", maxLength: 120 },
  ];
  return (
    <CatalogTab
      entityLabel="Category"
      description="Group classes into categories such as Cadet Wing or College Wing."
      icon={Layers}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminClassCategory({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminClassCategory({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminClassCategory({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function SectionTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminSections();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminSectionsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveSectionsQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "Section", type: "text", required: true, placeholder: "e.g. A", maxLength: 120 },
    { key: "capacity", label: "Capacity", type: "number" },
  ];
  return (
    <CatalogTab
      entityLabel="Section"
      description="Sections that qualified applicants can be placed into."
      icon={Grid2x2}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminSection({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminSection({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminSection({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function HousesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminHouses();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminHousesQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveHousesQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "House", type: "text", required: true, placeholder: "e.g. Jinnah House", maxLength: 120 },
    { key: "color", label: "Colour", type: "color", maxLength: 40 },
  ];
  return (
    <CatalogTab
      entityLabel="House"
      description="Houses used for inter-house activities and student grouping."
      icon={Home}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminHouse({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminHouse({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminHouse({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function TermsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminAcademicTerms();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminAcademicTermsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveAcademicTermsQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "Term", type: "text", required: true, placeholder: "e.g. First Semester", maxLength: 120 },
    { key: "kind", label: "Kind", type: "text", placeholder: "e.g. Semester / Annual", maxLength: 40 },
  ];
  return (
    <CatalogTab
      entityLabel="Term"
      description="Annual or semester terms used across the academic calendar."
      icon={CalendarClock}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminAcademicTerm({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminAcademicTerm({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminAcademicTerm({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function AffiliationsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminAffiliations();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminAffiliationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveAffiliationsQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "name", label: "Affiliation", type: "text", required: true, placeholder: "e.g. FBISE", maxLength: 120 },
    { key: "body", label: "Body", type: "textarea", placeholder: "Examining / affiliating body details", maxLength: 300 },
  ];
  return (
    <CatalogTab
      entityLabel="Affiliation"
      description="Examination boards and bodies the college is affiliated with."
      icon={Award}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.name)}
      createMutation={useCreateAdminAffiliation({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminAffiliation({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminAffiliation({ mutation: { onSuccess: invalidate } })}
    />
  );
}

function TermsConditionsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useListAdminTermsConditions();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListAdminTermsConditionsQueryKey() });
    qc.invalidateQueries({ queryKey: getListActiveTermsConditionsQueryKey() });
  };
  const fields: FieldDef[] = [
    { key: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Refund Policy", maxLength: 200 },
    { key: "content", label: "Content", type: "textarea", placeholder: "Full terms text shown to applicants", maxLength: 5000 },
  ];
  return (
    <CatalogTab
      entityLabel="Term & Condition"
      description="Terms and conditions shown to applicants during the application process."
      icon={FileText}
      fields={fields}
      items={data as CatalogItem[] | undefined}
      isLoading={isLoading}
      getName={(i) => String(i.title)}
      createMutation={useCreateAdminTermsCondition({ mutation: { onSuccess: invalidate } })}
      updateMutation={useUpdateAdminTermsCondition({ mutation: { onSuccess: invalidate } })}
      deleteMutation={useDeleteAdminTermsCondition({ mutation: { onSuccess: invalidate } })}
    />
  );
}

const TABS: { value: string; render: () => ReactNode }[] = [
  { value: "setup",           render: () => <AcademicSetupPage /> },
  { value: "years",           render: () => <AcademicYearsTab /> },
  { value: "category",        render: () => <CategoryTab /> },
  { value: "class",           render: () => <ClassesTab /> },
  { value: "section",         render: () => <SectionTab /> },
  { value: "subjects",        render: () => <SubjectsTab /> },
  { value: "houses",          render: () => <HousesTab /> },
  { value: "terms",           render: () => <TermsTab /> },
  { value: "affiliations",    render: () => <AffiliationsTab /> },
  { value: "tnc",             render: () => <TermsConditionsTab /> },
];

const TAB_LABELS: Record<string, string> = {
  setup: "Setup", years: "Academic Years", category: "Category", class: "Class/Program",
  section: "Section",
  subjects: "Subjects",
  houses: "Houses", terms: "Annual/Semester",
  affiliations: "Affiliations", tnc: "Term & Condition",
};

export default function Academic() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const activeTab = params.get("tab") ?? "setup";
  const current = TABS.find((t) => t.value === activeTab) ?? TABS[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Academic</h1>
        <p className="text-muted-foreground mt-1">
          {TAB_LABELS[activeTab] ?? "Academic"} — Manage academic years, classes, sections, houses and related settings.
        </p>
      </div>
      <div>{current.render()}</div>
    </div>
  );
}
