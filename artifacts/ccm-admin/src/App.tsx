import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { initAuth, clearAuth, getToken, AUTH_TOKEN_SET_EVENT } from "@/lib/auth";
import { Component, ReactNode, ErrorInfo, useState, useEffect, useContext, lazy, Suspense } from "react";
import { ModulesContext, type ModulesState } from "@/lib/modules-context";
import type { ServerModule } from "@/lib/module-visibility";
import ModuleDisabled from "@/pages/ModuleDisabled";
import { LocaleProvider } from "@/lib/locale-context";

const CHUNK_RELOAD_FLAG = "__ccm_chunk_reload__";

function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("error loading dynamically imported module") ||
    (error as any).name === "ChunkLoadError"
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; reloading: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null, reloading: false };
  }
  static getDerivedStateFromError(error: Error) {
    const reloading = isChunkLoadError(error) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG);
    return { error, reloading };
  }
  componentDidMount() {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  }
  componentDidCatch(_error: Error, info: ErrorInfo) {
    console.error("Page render error:", _error, info);
    if (isChunkLoadError(_error) && !sessionStorage.getItem(CHUNK_RELOAD_FLAG)) {
      sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
      window.location.reload();
    }
  }
  render() {
    const { error, reloading } = this.state;

    if (reloading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm">Updating, please wait…</p>
          </div>
        </div>
      );
    }

    if (error) {
      if (isChunkLoadError(error)) {
        return (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-slate-50">
            <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white shadow p-6 space-y-3">
              <p className="text-sm text-slate-700 font-medium">Could not load the latest version.</p>
              <p className="text-sm text-slate-500">Please reload the page to try again.</p>
              <button
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
                onClick={() => { sessionStorage.removeItem(CHUNK_RELOAD_FLAG); window.location.reload(); }}
              >
                Reload
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 bg-slate-50">
          <div className="max-w-lg w-full rounded-2xl border border-red-200 bg-white shadow p-6 space-y-3">
            <h1 className="text-lg font-bold text-red-600">Something went wrong</h1>
            <p className="text-sm text-slate-600">{error.message}</p>
            <pre className="text-xs bg-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap text-slate-500 max-h-48">
              {error.stack}
            </pre>
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"
              onClick={() => { this.setState({ error: null, reloading: false }); window.location.reload(); }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Login stays eager — it's the entry point for unauthenticated users and must
// render without waiting on a separate chunk.
import Login from "@/pages/Login";

// All other pages are code-split: each becomes its own chunk loaded on demand,
// so the initial bundle stays small and the first open is fast.
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Applications = lazy(() => import("@/pages/Applications"));
const ApplicationDetail = lazy(() => import("@/pages/ApplicationDetail"));
const TestCentres = lazy(() => import("@/pages/TestCentres"));
const Academic = lazy(() => import("@/pages/Academic"));
const Reports = lazy(() => import("@/pages/Reports"));
const MeritConfig = lazy(() => import("@/pages/MeritConfig"));
const Students = lazy(() => import("@/pages/Students"));
const StudentProfile = lazy(() => import("@/pages/StudentProfile"));
const Guardians = lazy(() => import("@/pages/Guardians"));
const GuardianDetail = lazy(() => import("@/pages/GuardianDetail"));
const Examinations = lazy(() => import("@/pages/Examinations"));
const Employees = lazy(() => import("@/pages/Employees"));
const EmployeeProfile = lazy(() => import("@/pages/EmployeeProfile"));
const FeeMaster = lazy(() => import("@/pages/FeeMaster"));
const FeeReports = lazy(() => import("@/pages/FeeReports"));
const FeeConcessions = lazy(() => import("@/pages/fee/FeeConcessions"));
const FineSetup = lazy(() => import("@/pages/FineSetup"));
const Finance = lazy(() => import("@/pages/Finance"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const VoucherPage = lazy(() =>
  import("@/pages/accounts/VoucherPage").then((m) => ({ default: m.VoucherPage })),
);
const Hostel = lazy(() => import("@/pages/Hostel"));
const Sports = lazy(() => import("@/pages/Sports"));
const HR = lazy(() => import("@/pages/HR"));
const Medical = lazy(() => import("@/pages/Medical"));
const Library = lazy(() => import("@/pages/Library"));
const Transport = lazy(() => import("@/pages/Transport"));
const Store = lazy(() => import("@/pages/Store"));
const Communication = lazy(() => import("@/pages/Communication"));
const GateSecurity = lazy(() => import("@/pages/GateSecurity"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const Syllabus = lazy(() => import("@/pages/Syllabus"));
const Printing = lazy(() => import("@/pages/Printing"));
const TemplateEditorPage = lazy(() => import("@/pages/printing/TemplateEditorPage"));
const MediaManager = lazy(() => import("@/pages/MediaManager"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const Events = lazy(() => import("@/pages/events/Events"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const ApprovalsInbox = lazy(() => import("@/pages/ApprovalsInbox"));
const SchoolCalendar = lazy(() => import("@/pages/SchoolCalendar"));
const WebsitePage = lazy(() => import("@/pages/WebsitePage"));
const ContactSubmissions = lazy(() => import("@/pages/ContactSubmissions"));

initAuth();

// ── Modules provider ──────────────────────────────────────────────────────────
// Fetches /api/admin/tenant/modules and exposes via ModulesContext.
// Re-fetches whenever the auth token becomes available (covers the login flow
// where the token isn't present on initial mount but is set after successful login).
// Fail-closed: loading=true until the first successful fetch, so gated() blocks
// protected routes until the server-authoritative list arrives.
function ModulesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModulesState>({ modules: [], loading: true });

  useEffect(() => {
    let cancelled = false;

    function fetchModules() {
      const token = getToken();
      if (!token) {
        // Not logged in yet — keep loading=true so gated() stays blocked.
        return;
      }
      const base = (import.meta.env.VITE_API_BASE as string) || "";
      const tenant = localStorage.getItem("ccm_admin_website_tenant") || "ccm";
      fetch(`${base}/api/admin/tenant/modules`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenant },
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => {
          if (cancelled) return;
          if (data?.modules && Array.isArray(data.modules)) {
            setState({ modules: data.modules as ServerModule[], loading: false });
          } else {
            // Unexpected shape — fail open only for loading, keep blocking via empty list
            setState({ modules: [], loading: false });
          }
        })
        .catch(() => {
          if (cancelled) return;
          // Fetch failed — fail-closed: keep loading false but modules empty so gated()
          // blocks all protected routes rather than silently allowing them through.
          setState({ modules: [], loading: false });
        });
    }

    // Fetch on mount (covers already-logged-in sessions)
    fetchModules();

    // Re-fetch when login completes in the same tab (setToken dispatches this event)
    window.addEventListener(AUTH_TOKEN_SET_EVENT, fetchModules);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_TOKEN_SET_EVENT, fetchModules);
    };
  }, []);

  return (
    <ModulesContext.Provider value={state}>
      {children}
    </ModulesContext.Provider>
  );
}

// Guard: only redirect once even when multiple concurrent queries return 401.
let _handlingUnauth = false;

function handleUnauthorized() {
  if (_handlingUnauth) return;
  _handlingUnauth = true;
  clearAuth();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  window.location.replace(`${base}/login`);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && "status" in error && (error as any).status === 401) {
          handleUnauthorized();
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      // Reuse cached data for 30s so navigating between pages doesn't refetch
      // unchanged lists on every mount. Views that need fresher data (e.g. live
      // counts after a mutation) invalidate their query keys explicitly.
      staleTime: 30_000,
    },
    mutations: {
      onError: (error: unknown) => {
        if (error instanceof Error && "status" in error && (error as any).status === 401) {
          handleUnauthorized();
        }
      },
    },
  },
});

// Shown inside the layout while a lazily-loaded page chunk is still downloading.
function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm gap-2">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      Loading…
    </div>
  );
}

function wrap(Page: React.ComponentType) {
  return () => (
    <AdminLayout>
      <Suspense fallback={<PageLoading />}>
        <Page />
      </Suspense>
    </AdminLayout>
  );
}

function gated(moduleKey: string, moduleName: string, Page: React.ComponentType) {
  return function GatedPage() {
    const { modules, loading } = useContext(ModulesContext);

    // Fail-closed: hold access until server permissions are loaded.
    if (loading) {
      return (
        <AdminLayout>
          <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Checking permissions…
          </div>
        </AdminLayout>
      );
    }

    // Fail-closed: if modules were fetched but this key is explicitly disabled, show gate.
    // If modules is empty after loading (fetch failed), treat as disabled to stay fail-closed.
    const mod = modules.find((m) => m.key === moduleKey);
    const isDisabled = modules.length === 0 || (mod !== undefined && !mod.enabled);

    if (isDisabled) {
      return (
        <AdminLayout>
          <ModuleDisabled moduleName={moduleName} />
        </AdminLayout>
      );
    }

    return (
      <AdminLayout>
        <Suspense fallback={<PageLoading />}>
          <Page />
        </Suspense>
      </AdminLayout>
    );
  };
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      {/* Live modules */}
      <Route path="/"                          component={wrap(Dashboard)} />
      <Route path="/admissions"                component={gated("admissions", "Admissions", Applications)} />
      <Route path="/applications"              component={gated("admissions", "Admissions", Applications)} />
      <Route path="/applications/:referenceId" component={gated("admissions", "Admissions", ApplicationDetail)} />
      <Route path="/test-centres"              component={gated("admissions", "Admissions", TestCentres)} />
      <Route path="/academic"                  component={gated("academics", "Academics", Academic)} />
      <Route path="/merit-config"              component={gated("admissions", "Admissions", MeritConfig)} />
      <Route path="/reports"                   component={wrap(Reports)} />

      {/* Stub modules */}
      <Route path="/timetable"          component={gated("academics", "Academics", Timetable)} />
      <Route path="/employees"          component={gated("hr", "Human Resources", Employees)} />
      <Route path="/employees/:staffId" component={gated("hr", "Human Resources", EmployeeProfile)} />
      <Route path="/students"           component={gated("academics", "Academics", Students)} />
      <Route path="/students/:applicantId" component={gated("academics", "Academics", StudentProfile)} />
      <Route path="/guardians"          component={gated("academics", "Academics", Guardians)} />
      <Route path="/guardians/:id"      component={gated("academics", "Academics", GuardianDetail)} />
      <Route path="/examinations"       component={gated("exams", "Exams & Results", Examinations)} />
      <Route path="/fee-master"         component={gated("fees", "Fees", FeeMaster)} />
      <Route path="/fee-reports"        component={gated("fees", "Fees", FeeReports)} />
      <Route path="/fee-concessions"    component={gated("fees", "Fees", FeeConcessions)} />
      <Route path="/fine-setup"         component={gated("fees", "Fees", FineSetup)} />
      <Route path="/finance"            component={gated("finance", "Finance", Finance)} />
      <Route path="/accounts"           component={gated("finance", "Finance", Accounts)} />
      <Route path="/receipt-voucher/:id" component={gated("finance", "Finance", () => <VoucherPage type="receipt" />)} />
      <Route path="/receipt-voucher"     component={gated("finance", "Finance", () => <VoucherPage type="receipt" />)} />
      <Route path="/payment-voucher/:id" component={gated("finance", "Finance", () => <VoucherPage type="payment" />)} />
      <Route path="/payment-voucher"     component={gated("finance", "Finance", () => <VoucherPage type="payment" />)} />
      <Route path="/vendors"            component={gated("finance", "Finance", Vendors)} />
      <Route path="/hostel"             component={gated("hostel", "Hostel", Hostel)} />
      <Route path="/sports"             component={gated("sports",        "Sports",        Sports)} />
      <Route path="/hr"                 component={gated("hr",            "Human Resources", HR)} />
      <Route path="/medical"            component={gated("health",        "Sick Bay",        Medical)} />
      <Route path="/library"            component={gated("library",       "Library",         Library)} />
      <Route path="/transport"          component={gated("transport",     "Transport",       Transport)} />
      <Route path="/store"              component={gated("inventory",     "Inventory",       Store)} />
      <Route path="/communication"      component={gated("communication", "Communication",   Communication)} />
      <Route path="/gate"               component={gated("gate_security", "Gate Security",   GateSecurity)} />
      <Route path="/syllabus"           component={gated("academics",     "Academics",       Syllabus)} />
      <Route path="/printing/templates" component={gated("batch_print",   "Batch Print",     TemplateEditorPage)} />
      <Route path="/printing"           component={gated("batch_print",   "Batch Print",     Printing)} />
      <Route path="/media"              component={gated("website",       "Website",         MediaManager)} />
      <Route path="/settings"           component={wrap(SettingsPage)} />
      <Route path="/events"             component={gated("events",        "Events",          Events)} />
      <Route path="/approvals"          component={gated("approvals",     "Approvals",       ApprovalsInbox)} />
      <Route path="/calendar"           component={wrap(SchoolCalendar)} />
      <Route path="/website/contact"    component={gated("website", "Website", ContactSubmissions)} />
      <Route path="/website"            component={gated("website", "Website", WebsitePage)} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Re-register auth getter on every render — defensive against edge cases
  // (e.g. workspace HMR reloading the api-client module and resetting its state).
  initAuth();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <ModulesProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </ModulesProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
