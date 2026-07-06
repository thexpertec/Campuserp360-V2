import { useSearch } from "wouter";
import { SyllabusDashboard } from "./syllabus/SyllabusDashboard";
import { SyllabusSetupTab } from "./syllabus/SyllabusSetupTab";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
import { BookMarked } from "lucide-react";

export default function Syllabus() {
  const search = useSearch();
  const tab = new URLSearchParams(search).get("tab") ?? "dashboard";

  if (tab === "setup" || tab === "syllabus") {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Syllabus — Setup</h1>
          <p className="text-muted-foreground mt-1">Configure subjects, topics and curriculum structure by class.</p>
        </div>
        <SyllabusSetupTab />
      </div>
    );
  }

  if (tab === "lesson-plans") {
    return (
      <ModulePlaceholder
        icon={BookMarked}
        module="Lesson Plans"
        activeTab="Lesson Plans"
        description="Teacher-authored lesson plans linked to syllabus units and academic weeks."
        color="bg-teal-100 text-teal-700"
        features={[
          { name: "Plan Builder", description: "Create structured lesson plans aligned to syllabus topics and learning objectives." },
          { name: "Week Mapping", description: "Map lesson plans to academic weeks and terms for organised delivery." },
          { name: "Review & Approval", description: "Subject heads can review and approve lesson plans before delivery." },
        ]}
      />
    );
  }

  return <SyllabusDashboard tab={tab} />;
}
