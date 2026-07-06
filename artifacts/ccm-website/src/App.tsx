import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { trackPageView } from "@/lib/track";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteSettingsProvider } from "@/lib/site-settings";
import { EditModeProvider } from "@/lib/edit-mode";
import { LocaleProvider } from "@/lib/locale-context";
import EditToolbar from "@/components/cms/EditToolbar";

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Admissions from "@/pages/Admissions";
import Gallery from "@/pages/Gallery";
import Events from "@/pages/Events";
import Contact from "@/pages/Contact";
import Teachers from "@/pages/Teachers";
import Downloads from "@/pages/Downloads";
import StatusTracker from "@/pages/StatusTracker";
import Alumni from "@/pages/Alumni";
import Careers from "@/pages/Careers";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import Results from "@/pages/Results";
import FeeStructure from "@/pages/FeeStructure";
import Portal from "@/pages/portal/Portal";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FooterGCCM from "@/components/FooterGCCM";
import WhatsAppButton from "@/components/WhatsAppButton";
import StickyCTA from "@/components/StickyCTA";
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";

function AnimatedRoutes() {
  const [location] = useLocation();
  const reduce = useReducedMotion();

  // Record a page view on every route change (self-contained visitor analytics).
  useEffect(() => {
    trackPageView(location || "/");
  }, [location]);
  // Collapse all /portal/* variants to a single animation key so that
  // navigating between portal sections doesn't trigger the page transition.
  const animKey = /^\/portal(\/|$)/.test(location) ? "/portal" : location;

  const variants = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 12, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -8, filter: "blur(4px)" },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={animKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        data-testid="page-transition"
      >
        <Switch location={location}>
          <Route path="/" component={Home} />
          <Route path="/about" component={About} />
          <Route path="/admissions" component={Admissions} />
          <Route path="/gallery" component={Gallery} />
          <Route path="/events" component={Events} />
          <Route path="/contact" component={Contact} />
          <Route path="/teachers" component={Teachers} />
          <Route path="/downloads" component={Downloads} />
          <Route path="/status" component={StatusTracker} />
          <Route path="/alumni" component={Alumni} />
          <Route path="/careers" component={Careers} />
          <Route path="/results" component={Results} />
          <Route path="/fee-structure" component={FeeStructure} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/portal" component={Portal} />
          <Route path="/portal/:section" component={Portal} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function Router() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <ScrollToTop />
      <Navbar />
      <main className="flex-1">
        <ErrorBoundary>
          <AnimatedRoutes />
        </ErrorBoundary>
      </main>
      {isGCCM ? <FooterGCCM /> : <Footer />}
      <WhatsAppButton />
      <StickyCTA />
    </div>
  );
}

// Determine the Router base from the tenant slug.
//
// Strategy (in priority order):
//   1. window.__TENANT_SLUG__ injected by the gateway or Vite dev plugin
//   2. URL pathname detection — when the gateway/plugin injection is missing
//      (e.g. a JWT token in the query string bypassed the dev plugin), infer
//      the tenant slug from the first path segment.  Accept any valid slug
//      pattern that is NOT a known page route so that /teachers is never
//      confused for a tenant.
//   3. Vite BASE_URL — for root deployments with no prefix.
//
// Belt-and-suspenders: if the browser URL is exactly /<slug> (no trailing
// slash), rewrite it to /<slug>/ so wouter's strip produces "/" not "".

// First path segments that are page routes (not tenant slugs).
const KNOWN_PAGE_ROUTES = new Set([
  "about", "admissions", "gallery", "events", "contact", "teachers",
  "downloads", "status", "alumni", "careers", "results", "fee-structure", "privacy",
  "terms", "portal",
]);

const routerBase: string = (() => {
  if (typeof window !== "undefined") {
    // Priority 1: injected slug
    const injected = (window as unknown as Record<string, unknown>)["__TENANT_SLUG__"] as string | undefined;
    const slug = injected ?? (() => {
      // Priority 2: detect from URL path first segment.
      // Accept any valid slug (starts with a letter, alphanumeric + hyphens,
      // 2–31 chars) that is NOT a known page route.
      const first = window.location.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[a-z][a-z0-9-]{1,30}$/.test(first) && !KNOWN_PAGE_ROUTES.has(first)
        ? first
        : undefined;
    })();

    if (slug) {
      const prefix = `/${slug}`;
      if (window.location.pathname === prefix) {
        window.history.replaceState(null, "", prefix + "/");
      }
      return prefix;
    }
  }
  return import.meta.env.BASE_URL.replace(/\/$/, "");
})();

const isGCCM = routerBase === "/gccm";

function App() {
  return (
    <HelmetProvider>
      <LocaleProvider>
        <TooltipProvider>
          <SiteSettingsProvider>
            <EditModeProvider>
              <WouterRouter base={routerBase}>
                <Router />
              </WouterRouter>
              <EditToolbar />
              <Toaster />
            </EditModeProvider>
          </SiteSettingsProvider>
        </TooltipProvider>
      </LocaleProvider>
    </HelmetProvider>
  );
}

export default App;
