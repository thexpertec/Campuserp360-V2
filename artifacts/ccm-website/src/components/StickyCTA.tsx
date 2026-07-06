import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { GraduationCap, ArrowRight, CalendarClock } from "lucide-react";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import { useSiteSettings } from "@/lib/site-settings";
import { formatDateLong } from "@/lib/locale";

export default function StickyCTA() {
  const [visible, setVisible] = useState(false);
  const [location] = useLocation();
  const onPortal = location.startsWith("/portal");
  const onAdmissions = location === "/admissions";
  const inIframe = typeof window !== "undefined" && window.self !== window.top;
  const blocks = usePageBlocks("global");
  const settings = useSiteSettings();
  const deadlineText = settings.admissions_deadline
    ? ` Last date: ${formatDateLong(settings.admissions_deadline)}.`
    : " Last date: 31 October 2026.";

  useEffect(() => {
    const heroSelector = "[data-hero-sentinel]";
    const footerEl = document.querySelector("footer");
    const visibility = { hero: true, footer: false };

    const update = () => {
      const next = !visibility.hero && !visibility.footer;
      setVisible(next);
      document.body.dataset.ctaVisible = next ? "true" : "false";
      window.dispatchEvent(new CustomEvent("sticky-cta-visibility", { detail: next }));
    };

    const heroObserver = new IntersectionObserver(
      (entries) => {
        visibility.hero = entries.some((e) => e.isIntersecting);
        update();
      },
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );

    const footerObserver = new IntersectionObserver(
      (entries) => {
        visibility.footer = entries.some((e) => e.isIntersecting);
        update();
      },
      { threshold: 0 },
    );

    const observeAll = () => {
      heroObserver.disconnect();
      document.querySelectorAll(heroSelector).forEach((el) => heroObserver.observe(el));
    };

    observeAll();
    if (footerEl) footerObserver.observe(footerEl);

    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      heroObserver.disconnect();
      footerObserver.disconnect();
      mo.disconnect();
    };
  }, []);

  if (onPortal || inIframe) return null;

  function handleClick(e: React.MouseEvent) {
    if (!onAdmissions) return;
    e.preventDefault();
    // Click the "Apply Online" tab to make it active (handles both fresh & submitted states)
    const applyTab = document.querySelector('[data-testid="tab-apply"]') as HTMLElement | null;
    if (applyTab) {
      applyTab.click();
      applyTab.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // Fallback: scroll to the form if the tab isn't found
      const form = document.querySelector('[data-testid="admission-form"]') as HTMLElement | null;
      form?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div
      aria-hidden={!visible}
      className={`fixed left-0 right-0 bottom-0 z-40 pointer-events-none transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      data-testid="sticky-cta"
    >
      <div className="pointer-events-auto bg-[#021a0a] border-t border-accent/30 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-3.5 flex items-center gap-3 md:gap-5">
          {/* Icon badge */}
          <div className="hidden sm:flex w-11 h-11 rounded-xl bg-accent items-center justify-center flex-shrink-0 shadow-lg shadow-accent/30">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>

          {/* Copy */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-accent text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-0.5">
              <CalendarClock className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <EditableText as="span" page="global" blockKey="sticky_cta_eyebrow" value={blocks.sticky_cta_eyebrow || "Admissions Open — Intake 2026-27"} />
            </div>
            <div className="text-white text-sm md:text-base font-semibold leading-tight truncate">
              <EditableText as="span" className="hidden sm:inline" page="global" blockKey="sticky_cta_title" value={blocks.sticky_cta_title || "Secure your seat at Cadet College Murree."} />
              <EditableText as="span" className="sm:hidden" page="global" blockKey="sticky_cta_title_mobile" value={blocks.sticky_cta_title_mobile || "Apply for Intake 2026-27"} />
              <EditableText as="span" className="hidden md:inline text-white/70 font-normal" page="global" blockKey="sticky_cta_deadline" value={blocks.sticky_cta_deadline || deadlineText} />
            </div>
          </div>

          {/* CTA */}
          <Link
            href="/admissions"
            onClick={handleClick}
            className="flex-shrink-0 inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm md:text-base px-4 md:px-6 py-2.5 md:py-3 rounded-lg shadow-lg shadow-accent/20 transition-colors"
            data-testid="sticky-cta-apply"
          >
            <EditableText as="span" page="global" blockKey="sticky_cta_button" value={blocks.sticky_cta_button || "Apply Now"} />
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
