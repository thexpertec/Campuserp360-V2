import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { BookOpen, BookMarked, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { LibraryBooksTab } from "./LibraryBooksTab";
import { LibraryIssuesTab } from "./LibraryIssuesTab";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

interface Book {
  id: string; title: string; author?: string;
  categoryName?: string | null;
  totalCopies?: number; availableCopies?: number;
}
interface Issue {
  id: string; bookId: string; bookTitle?: string | null;
  studentName?: string | null; applicantId?: string | null;
  issuedDate?: string; dueDate?: string; returnedDate?: string | null; status?: string;
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-5 py-4 flex items-center gap-4 shadow-sm">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export function LibraryDashboard({ tab = "dashboard" }: { tab?: string }) {
  if (tab === "catalog") return <LibraryBooksTab />;
  if (tab === "issues")  return <LibraryIssuesTab />;
  if (tab === "fines") {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Library Fines</h1>
          <p className="text-muted-foreground mt-1">Track and collect overdue fines from students.</p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Fines Management — Coming Soon</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Automated fine calculation and student-wise ledger will be available here.</p>
        </div>
      </div>
    );
  }

  const { data: books = [], isLoading: bLoading } = useQuery<Book[]>({
    queryKey: ["library-books-dash"],
    queryFn: () => apiFetch("/api/admin/library/books"),
    staleTime: 30_000,
  });
  const { data: issues = [], isLoading: iLoading } = useQuery<Issue[]>({
    queryKey: ["library-issues-dash"],
    queryFn: () => apiFetch("/api/admin/library/issues"),
    staleTime: 30_000,
  });

  const isLoading   = bLoading || iLoading;
  const totalTitles = books.length;
  const totalCopies = books.reduce((s, b) => s + (Number(b.totalCopies) || 1), 0);
  const totalAvail  = books.reduce((s, b) => s + (Number(b.availableCopies) || 0), 0);
  const issued      = issues.filter(i => i.status === "issued" || i.status === "overdue").length;
  const overdue     = issues.filter(i => i.status === "overdue").length;

  // By category — using joined categoryName
  const byCategory: Record<string, number> = {};
  books.forEach(b => {
    const cat = b.categoryName ?? "Uncategorized";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  });
  const categories = Object.entries(byCategory).sort(([, a], [, b]) => b - a).slice(0, 6);
  const catMax = Math.max(1, ...categories.map(([, v]) => v));

  // Active overdue issues for alert panel
  const overdueIssues = [...issues]
    .filter(i => i.status === "overdue")
    .slice(0, 6);

  // Recently issued (non-overdue, non-returned)
  const activeIssues = [...issues]
    .filter(i => i.status === "issued")
    .slice(0, 6);

  const panelIssues = overdueIssues.length > 0 ? overdueIssues : activeIssues;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Library</h2>
        <p className="text-sm text-slate-500 mt-0.5">Book catalog, issue tracking and overdue management.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Titles"    value={isLoading ? "…" : totalTitles} icon={BookOpen}     color="text-amber-600"  bg="bg-amber-50" />
        <StatCard label="Total Copies"    value={isLoading ? "…" : totalCopies} icon={BookMarked}   color="text-blue-600"   bg="bg-blue-50"
          sub={`${totalAvail} available`} />
        <StatCard label="Currently Out"   value={isLoading ? "…" : issued}      icon={RefreshCw}    color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard label="Overdue"         value={isLoading ? "…" : overdue}     icon={AlertTriangle} color="text-red-600"   bg="bg-red-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Category breakdown */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Books by Category</h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-full animate-pulse" />)}</div>
          ) : categories.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No books catalogued yet</p>
          ) : (
            <div className="space-y-3">
              {categories.map(([cat, cnt]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 font-medium w-28 flex-shrink-0 truncate">{cat}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${(cnt / catMax) * 100}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-6 text-right tabular-nums">{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue / Active issues */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            {overdueIssues.length > 0 ? "Overdue Books" : "Currently Issued"}
          </h3>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : panelIssues.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No active issues</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {panelIssues.map(i => {
                const isOD = i.status === "overdue";
                const daysLate = i.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(i.dueDate + "T00:00:00").getTime()) / 86_400_000)) : 0;
                return (
                  <div key={i.id} className="flex items-center gap-3 py-2">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${isOD ? "bg-red-500" : "bg-blue-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{i.bookTitle ?? "—"}</p>
                      <p className="text-xs text-slate-400">{i.studentName ?? "Unknown"}{i.applicantId ? ` · ${i.applicantId}` : ""}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                      isOD ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {isOD ? `${daysLate}d late` : `Due ${i.dueDate ?? "—"}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
