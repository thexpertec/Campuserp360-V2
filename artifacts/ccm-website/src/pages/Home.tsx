import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { use3DTilt } from "@/lib/animations";
import LiveAdmissionsCounter from "@/components/LiveAdmissionsCounter";
import { useSiteSettings, useSiteBaseUrl } from "@/lib/site-settings";
import { usePageBlocks } from "@/lib/usePageBlocks";
import EditableText from "@/components/cms/EditableText";
import EditableSetting from "@/components/cms/EditableSetting";
import EditableImage from "@/components/cms/EditableImage";
import SectionColor from "@/components/cms/SectionColor";
import { useEditMode } from "@/lib/edit-mode";
import { useTenantResource } from "@/lib/tenant-cache";
import {
  Dumbbell,
  Trophy,
  Monitor,
  BookOpen,
  FlaskConical,
  Globe,
  GraduationCap,
  ChevronRight,
  AlertCircle,
  Quote,
  UserCheck,
  Download,
  Images,
  CalendarDays,
  Shield,
  Briefcase,
  Stethoscope,
  Plane,
  Users,
  Award,
  ArrowRight,
  Clock,
  Newspaper,
  Camera,
  Signature,
  Star,
  Building2,
  Link as LucideLink,
  Heart,
  Zap,
  Target,
  CheckCircle,
  Lightbulb,
  BarChart,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Dumbbell, Trophy, Monitor, BookOpen, FlaskConical, Globe, GraduationCap,
  UserCheck, Download, Images, CalendarDays, Shield, Briefcase, Stethoscope,
  Plane, Users, Award, Star, Building2, Link: LucideLink, Heart, Zap, Target,
  CheckCircle, Lightbulb, BarChart, Quote, Camera, Newspaper,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Star;
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const clipReveal = {
  hidden: { clipPath: "inset(100% 0 0 0)", opacity: 0 },
  visible: {
    clipPath: "inset(0% 0 0 0)",
    opacity: 1,
    transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] as const },
  },
};

type QuickLinkItem = { iconName: string; title: string; description: string; cta: string; href: string; isExternal?: boolean };
type FeatureItem   = { iconName: string; title: string; description: string };
type FacilityItem  = { iconName: string; title: string; description: string };
type TestimonialItem = { name: string; role: string; photoUrl?: string | null; quote: string };
type HeroSlide = { id: string; title: string; subtitle?: string | null; imageUrl: string; buttonLabel?: string | null; buttonLink?: string | null };

// Stats are now populated dynamically from site settings (see useStats() inside Home component)



const miniNavLinks = [
  { label: "About", href: "/about" },
  { label: "Admissions", href: "/admissions" },
  { label: "Events", href: "/events" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contact", href: "/contact" },
];

// ─── 3D-tilt Quick Link Card ──────────────────────────────────────────────────
function QuickLinkCard({
  ql,
  index,
}: {
  ql: QuickLinkItem;
  index: number;
}) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(8);
  const Icon = getIcon(ql.iconName);
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      data-testid={`quicklink-card-${index}`}
      className="p-7 bg-card hover:bg-primary/5 transition-colors duration-200 group text-center cursor-default"
    >
      <div className="w-14 h-14 mx-auto mb-4 border-2 border-primary rounded-lg flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-200">
        <Icon className="w-7 h-7 text-primary group-hover:text-primary-foreground transition-colors duration-200" />
      </div>
      <h3 className="font-bold text-primary text-base mb-2">{ql.title}</h3>
      <p className="text-foreground/75 text-sm leading-relaxed mb-4">{ql.description}</p>
      {ql.isExternal ? (
        <a
          href={ql.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-semibold text-accent hover:text-primary border border-accent hover:border-primary px-4 py-1.5 rounded-full transition-all duration-200"
          data-testid={`button-quicklink-${index}`}
        >
          {ql.cta}
        </a>
      ) : (
        <Link
          href={ql.href}
          className="inline-block text-sm font-semibold text-accent hover:text-primary border border-accent hover:border-primary px-4 py-1.5 rounded-full transition-all duration-200"
          data-testid={`button-quicklink-${index}`}
        >
          {ql.cta}
        </Link>
      )}
    </motion.div>
  );
}

// ─── 3D-tilt Feature Card ─────────────────────────────────────────────────────
function FeatureCard({
  feature,
  index,
}: {
  feature: FeatureItem;
  index: number;
}) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(10);
  const Icon = getIcon(feature.iconName);
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      data-testid={`feature-card-${index}`}
      className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-primary/30 transition-all duration-300 cursor-default"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
        style={{ background: "var(--icon-bg-color)" }}
      >
        <Icon className="w-6 h-6" style={{ color: "var(--icon-fg-color)" }} />
      </div>
      <h3 className="font-bold text-primary text-lg mb-3">{feature.title}</h3>
      <p className="text-foreground/75 text-sm leading-relaxed">{feature.description}</p>
    </motion.div>
  );
}

// ─── 3D-tilt Facility Card ────────────────────────────────────────────────────
function FacilityCard({
  facility,
  index,
}: {
  facility: FacilityItem;
  index: number;
}) {
  const { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave } = use3DTilt(10);
  const Icon = getIcon(facility.iconName);
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" as const }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      data-testid={`facility-card-${index}`}
      className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 cursor-default"
    >
      <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <h3 className="font-bold text-primary-foreground text-lg mb-3">{facility.title}</h3>
      <p className="text-primary-foreground/80 text-sm leading-relaxed">{facility.description}</p>
    </motion.div>
  );
}

interface SiteAnnouncement {
  id: string;
  title: string;
  body: string | null;
  priority: string | null;
}

// ─── PAKMIL "Parade Ground" hero — stacked & centered on mobile, and a
// two-column split (parade content left, framed campus banner right) on desktop,
// while reusing the exact same CMS block keys so content stays in parity. ──────
function PakmilHero({ homeBlocks, settings }: { homeBlocks: Record<string, string>; settings: Record<string, string> }) {
  return (
    <SectionColor
      page="home" scope="hero" label="Hero" kind="hero"
      className="relative overflow-hidden"
      style={{ background: "var(--hero-gradient)" }}
      data-testid="home-hero"
      data-hero-sentinel
    >
      {/* Chevron twill overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "var(--hero-pattern-image)",
          backgroundSize: "16px 16px",
          opacity: "var(--hero-pattern-opacity, 0.05)",
        }}
        aria-hidden="true"
      />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-accent/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-16 md:py-20 lg:py-24 grid lg:grid-cols-2 lg:gap-12 lg:items-start">

        {/* Left column — parade content (centered on mobile, left-aligned on desktop) */}
        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">

        {/* Emblem medallion */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-6 rounded-full p-1.5"
          style={{ background: "var(--pakmil-gold)" }}
        >
          <div className="bg-white rounded-full p-2">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Cadet College Murree official crest"
              width={84}
              height={84}
              className="h-20 w-20 rounded-full object-contain"
            />
          </div>
        </motion.div>

        {/* Tricolor flag ribbon */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex h-1.5 w-40 overflow-hidden rounded-full mb-6"
          aria-hidden="true"
        >
          <span className="flex-[7]" style={{ background: "var(--pakmil-green)" }} />
          <span className="flex-1 bg-white" />
          <span className="flex-[2]" style={{ background: "var(--pakmil-red)" }} />
        </motion.div>

        {/* Eyebrow badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 px-4 py-1.5 rounded-full mb-6"
        >
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <EditableText as="span" page="home" blockKey="hero_badge" value={homeBlocks.hero_badge || "Est. August 2002 — Murree Hills"} className="text-accent text-xs md:text-sm font-semibold uppercase tracking-wider" />
        </motion.div>

        {/* Main heading */}
        <div style={{ overflow: "hidden" }}>
          <motion.h1
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 }}
            className="font-bold text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mb-5 leading-[1.02]"
            style={{ color: "var(--hero-fg)" }}
          >
            <EditableText as="span" page="home" blockKey="hero_title" value={homeBlocks.hero_title || (settings.site_theme === "ccm" ? "Cadet College Murree" : "")} />
          </motion.h1>
        </div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="text-xl md:text-2xl font-medium mb-4 italic"
          style={{ color: "var(--hero-fg)" }}
        >
          <EditableText as="span" page="home" blockKey="hero_tagline" value={homeBlocks.hero_tagline || "Proud To Be HILLIANS"} />
        </motion.p>

        {/* Sub-description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="text-base md:text-lg mb-8 leading-relaxed max-w-2xl"
          style={{ color: "var(--hero-fg-muted)" }}
        >
          <EditableText as="span" multiline page="home" blockKey="hero_subdesc" value={homeBlocks.hero_subdesc || "A premier military educational institution producing educated, motivated and spirited cadets — following the noble traditions of the Pakistan Army."} />
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
        >
          <Button
            asChild
            size="lg"
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-base px-7 font-semibold shadow-xl shadow-accent/20 uppercase tracking-wide"
            data-testid="button-hero-apply"
          >
            <Link href="/admissions"><EditableText as="span" page="home" blockKey="hero_cta_primary" value={homeBlocks.hero_cta_primary || "Apply Now — 2026-27"} /></Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="text-base px-7 font-semibold backdrop-blur uppercase tracking-wide"
            style={{
              borderColor: "var(--hero-btn-outline-border)",
              background: "var(--hero-btn-outline-bg)",
              color: "var(--hero-btn-outline-fg)",
            }}
            data-testid="button-hero-about"
          >
            <Link href="/about"><EditableText as="span" page="home" blockKey="hero_cta_secondary" value={homeBlocks.hero_cta_secondary || "Learn More"} /></Link>
          </Button>
        </motion.div>

        {/* Honour-roll stat ribbon */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="mt-12 w-full grid grid-cols-3 divide-x"
          style={{ borderColor: "var(--hero-stats-border)" }}
        >
          {[
            { v: homeBlocks.hero_stat_years_value || settings.alumni_stat_years, vk: "hero_stat_years_value", l: homeBlocks.hero_stat_years_label || "Years", lk: "hero_stat_years_label" },
            { v: homeBlocks.hero_stat_classes_value || "6–11", vk: "hero_stat_classes_value", l: homeBlocks.hero_stat_classes_label || "Classes", lk: "hero_stat_classes_label" },
            { v: homeBlocks.hero_stat_boarding_value || "100%", vk: "hero_stat_boarding_value", l: homeBlocks.hero_stat_boarding_label || "Boarding", lk: "hero_stat_boarding_label" },
          ].map((s) => (
            <div key={s.vk} className="px-3" style={{ borderColor: "var(--hero-stats-border)" }}>
              <div className="text-2xl md:text-3xl font-bold text-accent"><EditableText as="span" page="home" blockKey={s.vk} value={s.v} /></div>
              <div className="text-[10px] md:text-xs uppercase tracking-wider font-medium mt-1" style={{ color: "var(--hero-fg-muted)" }}><EditableText as="span" page="home" blockKey={s.lk} value={s.l} /></div>
            </div>
          ))}
        </motion.div>

        </div>
        {/* End left column */}

        {/* Right column — framed campus banner */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="relative mt-14 lg:mt-0 w-full"
        >
          <div className="absolute -top-3 -left-3 w-16 h-16 border-t-4 border-l-4 pointer-events-none" style={{ borderColor: "var(--pakmil-gold)" }} />
          <div className="absolute -bottom-3 -right-3 w-16 h-16 border-b-4 border-r-4 pointer-events-none" style={{ borderColor: "var(--pakmil-gold)" }} />
          <div className="relative overflow-hidden shadow-2xl ring-1 ring-white/10">
            <EditableImage
              page="home"
              blockKey="hero_image"
              src={homeBlocks.hero_image || null}
              alt="Cadet College Murree admin block — the iconic campus building in the Murree Hills"
              width={1100}
              height={420}
              imgClassName="w-full h-[260px] sm:h-[340px] lg:h-[520px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

            {/* Floating badge — bottom-left of image (content parity with default hero) */}
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur px-4 py-2.5 shadow-lg flex items-center gap-3 text-left">
              <div className="w-9 h-9 bg-primary flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-accent" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-foreground/85 font-semibold leading-none mb-0.5">Admissions</div>
                <div className="text-sm font-bold text-primary leading-tight">Open for 2026-27</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Medal-gold honour ribbon */}
      <div
        style={{
          height: "var(--hero-accent-stripe-height, 0px)",
          background: "var(--hero-accent-stripe-color, transparent)",
        }}
      />
    </SectionColor>
  );
}


export default function Home() {
  // All home content is loaded through the per-tenant localStorage cache so a
  // refresh paints THIS tenant's data on the first frame. Cold start is an empty
  // array — never another tenant's hardcoded fallback (which caused the CCM flash).
  const latestNews = useTenantResource<any[]>(
    "home-news", "/api/website/events", [],
    d => (Array.isArray(d) ? d.slice(0, 3) : []),
    false, true,
  );
  const galleryTeaser = useTenantResource<any[]>(
    "home-gallery", "/api/website/gallery", [],
    d => (Array.isArray(d) ? d.slice(0, 6) : []),
    false, true,
  );
  const announcements = useTenantResource<SiteAnnouncement[]>(
    "announcements", "/api/website/announcements", [],
    d => (Array.isArray(d) ? (d as SiteAnnouncement[]) : []),
    false, true,
  );
  const quickLinks = useTenantResource<QuickLinkItem[]>(
    "quick-links", "/api/website/quick-links", [],
    d => (Array.isArray(d) ? (d as QuickLinkItem[]) : []),
    false, true,
  );
  const features = useTenantResource<FeatureItem[]>(
    "features", "/api/website/features", [],
    d => (Array.isArray(d) ? (d as FeatureItem[]) : []),
    false, true,
  );
  const facilities = useTenantResource<FacilityItem[]>(
    "facilities", "/api/website/facilities", [],
    d => (Array.isArray(d) ? (d as FacilityItem[]) : []),
    false, true,
  );
  const testimonials = useTenantResource<TestimonialItem[]>(
    "testimonials", "/api/website/testimonials", [],
    d => (Array.isArray(d) ? (d as TestimonialItem[]) : []),
    false, true,
  );
  const heroSlides = useTenantResource<HeroSlide[]>(
    "hero-headers", "/api/website/hero-headers", [],
    d => (Array.isArray(d) ? (d as HeroSlide[]) : []),
  );
  const settings = useSiteSettings();
  const baseUrl = useSiteBaseUrl();

  const homeBlocks = usePageBlocks("home");
  const { enabled: editEnabled } = useEditMode();
  const [msgExpanded, setMsgExpanded] = useState(false);
  const isPakmil = settings.site_theme === "pakmil";
  // The bundled "Cadet College Murree" copy is only correct for the CCM tenant.
  // For every other tenant it must never appear — not even for the frame before
  // page-blocks resolve (the flash this guards against). The theme is known
  // synchronously (URL/cache), so gate on it: non-CCM tenants get an empty
  // fallback instead of CCM's name flashing while their own content loads.
  const ccmName = settings.site_theme === "ccm" ? "Cadet College Murree" : "";

  // Tenant-driven document head — derived from the current tenant's cached page
  // blocks + settings so the title/meta never hardcode (and flash) CCM branding.
  const heroTitle = (homeBlocks.hero_title ?? "").trim();
  const heroTagline = (homeBlocks.hero_tagline ?? "").trim();
  const pageTitle = [heroTitle, heroTagline].filter(Boolean).join(" | ") || "Admissions Open";
  const pageDesc = settings.college_description || (homeBlocks.hero_subdesc ?? "");

  const admissionDeadline = settings.admissions_deadline
    ? new Date(settings.admissions_deadline + "T23:59:59+05:00")
    : new Date("2026-10-31T23:59:59+05:00");

  // Parse a stored stat setting into a number, tolerating thousands separators
  // and a trailing "+" (e.g. "1,700+" → 1700). Falls back when unset/invalid.
  const statNumeric = (raw: string | undefined, fallback: number): number => {
    const digits = (raw ?? "").replace(/[^0-9]/g, "");
    if (digits === "") return fallback;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const stats: { settingKey: string; value: string; numeric?: number; suffix?: string; label: string; labelKey: string }[] = [
    { settingKey: "alumni_stat_founded",      value: settings.alumni_stat_founded,      numeric: statNumeric(settings.alumni_stat_founded, 2002), label: "Year Founded", labelKey: "stat_label_founded" },
    { settingKey: "alumni_stat_graduates",    value: settings.alumni_stat_graduates,    numeric: statNumeric(settings.alumni_stat_graduates, 1000), suffix: (settings.alumni_stat_graduates ?? "").includes("+") ? "+" : "", label: "Cadets Graduated", labelKey: "stat_label_graduates" },
    { settingKey: "alumni_stat_years",        value: settings.alumni_stat_years,        numeric: statNumeric(settings.alumni_stat_years, 24),   suffix: (settings.alumni_stat_years ?? "").includes("+") ? "+" : "",  label: "Years of Excellence", labelKey: "stat_label_years" },
    { settingKey: "alumni_stat_armed_forces", value: settings.alumni_stat_armed_forces, numeric: statNumeric(settings.alumni_stat_armed_forces, 350), suffix: (settings.alumni_stat_armed_forces ?? "").includes("+") ? "+" : "", label: "In Armed Forces", labelKey: "stat_label_armed_forces" },
  ];

  return (
    <>
      <StickyMiniNav heroKey={`${heroSlides.length > 0}-${isPakmil}`} />
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={`${baseUrl}/`} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={`${baseUrl}/`} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_PK" />
        <meta property="og:site_name" content={heroTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
      </Helmet>

      <div className="flex flex-col">

        {/* ===== HERO SECTION ===== published hero headers → rotating slideshow; else pakmil → centered parade layout; others → two-column split */}
        {heroSlides.length > 0 ? (
          <HeroSlideshow slides={heroSlides} />
        ) : isPakmil ? (
          <PakmilHero homeBlocks={homeBlocks} settings={settings} />
        ) : (
        <SectionColor
          page="home" scope="hero" label="Hero" kind="hero"
          className="relative overflow-hidden"
          style={{ background: "var(--hero-gradient)" }}
          data-testid="home-hero"
          data-hero-sentinel
        >
          {/* Decorative pattern overlay — crosshatch (CCM) or dot-grid (GCCM) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "var(--hero-pattern-image)",
              backgroundSize: "22px 22px",
              opacity: "var(--hero-pattern-opacity, 0.06)",
            }}
            aria-hidden="true"
          />
          {/* Soft accent glow */}
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full bg-secondary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-20 lg:py-24">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">

              {/* LEFT — Text content */}
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-center lg:text-left order-2 lg:order-1"
              >
                {/* Eyebrow badge */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 px-4 py-1.5 rounded-full mb-6"
                >
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <EditableText as="span" page="home" blockKey="hero_badge" value={homeBlocks.hero_badge || "Est. August 2002 — Murree Hills"} className="text-accent text-xs md:text-sm font-semibold uppercase tracking-wider" />
                </motion.div>

                {/* Main heading — clip-path reveal */}
                <div style={{ overflow: "hidden" }}>
                  <motion.h1
                    initial={{ y: "110%" }}
                    animate={{ y: "0%" }}
                    transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.15 }}
                    className="font-bold text-4xl sm:text-5xl lg:text-6xl xl:text-7xl mb-5 leading-[1.05]"
                    style={{ color: "var(--hero-fg)" }}
                  >
                    <EditableText as="span" page="home" blockKey="hero_title" value={homeBlocks.hero_title || ccmName} />
                  </motion.h1>
                </div>

                {/* Tagline */}
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.35 }}
                  className="text-xl md:text-2xl font-medium mb-4 italic"
                  style={{ color: "var(--hero-fg)" }}
                >
                  <EditableText as="span" page="home" blockKey="hero_tagline" value={homeBlocks.hero_tagline || "Proud To Be HILLIANS"} />
                </motion.p>

                {/* Sub-description */}
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.45 }}
                  className="text-base md:text-lg mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0"
                  style={{ color: "var(--hero-fg-muted)" }}
                >
                  <EditableText as="span" multiline page="home" blockKey="hero_subdesc" value={homeBlocks.hero_subdesc || "A premier military educational institution producing educated, motivated and spirited cadets — following the noble traditions of the Pakistan Army."} />
                </motion.p>

                {/* CTAs */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.55 }}
                  className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
                >
                  <Button
                    asChild
                    size="lg"
                    className="bg-accent hover:bg-accent/90 text-accent-foreground text-base px-7 font-semibold shadow-xl shadow-accent/20"
                    data-testid="button-hero-apply"
                  >
                    <Link href="/admissions"><EditableText as="span" page="home" blockKey="hero_cta_primary" value={homeBlocks.hero_cta_primary || "Apply Now — 2026-27"} /></Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="text-base px-7 font-semibold backdrop-blur"
                    style={{
                      borderColor: "var(--hero-btn-outline-border)",
                      background: "var(--hero-btn-outline-bg)",
                      color: "var(--hero-btn-outline-fg)",
                    }}
                    data-testid="button-hero-about"
                  >
                    <Link href="/about"><EditableText as="span" page="home" blockKey="hero_cta_secondary" value={homeBlocks.hero_cta_secondary || "Learn More"} /></Link>
                  </Button>
                </motion.div>

                {/* Mini stats */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.7 }}
                  className="mt-10 grid grid-cols-3 gap-4 pt-8 border-t max-w-md mx-auto lg:mx-0"
                  style={{ borderColor: "var(--hero-stats-border)" }}
                >
                  <div className="text-center lg:text-left">
                    <div className="text-2xl md:text-3xl font-bold text-accent"><EditableText as="span" page="home" blockKey="hero_stat_years_value" value={homeBlocks.hero_stat_years_value || settings.alumni_stat_years} /></div>
                    <div className="text-[10px] md:text-xs uppercase tracking-wider font-medium mt-1" style={{ color: "var(--hero-fg-muted)" }}><EditableText as="span" page="home" blockKey="hero_stat_years_label" value={homeBlocks.hero_stat_years_label || "Years"} /></div>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="text-2xl md:text-3xl font-bold text-accent"><EditableText as="span" page="home" blockKey="hero_stat_classes_value" value={homeBlocks.hero_stat_classes_value || "6–11"} /></div>
                    <div className="text-[10px] md:text-xs uppercase tracking-wider font-medium mt-1" style={{ color: "var(--hero-fg-muted)" }}><EditableText as="span" page="home" blockKey="hero_stat_classes_label" value={homeBlocks.hero_stat_classes_label || "Classes"} /></div>
                  </div>
                  <div className="text-center lg:text-left">
                    <div className="text-2xl md:text-3xl font-bold text-accent"><EditableText as="span" page="home" blockKey="hero_stat_boarding_value" value={homeBlocks.hero_stat_boarding_value || "100%"} /></div>
                    <div className="text-[10px] md:text-xs uppercase tracking-wider font-medium mt-1" style={{ color: "var(--hero-fg-muted)" }}><EditableText as="span" page="home" blockKey="hero_stat_boarding_label" value={homeBlocks.hero_stat_boarding_label || "Boarding"} /></div>
                  </div>
                </motion.div>
              </motion.div>

              {/* RIGHT — Image with parallax */}
              <motion.div
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }}
                className="relative order-1 lg:order-2"
              >
                {/* Accent corner shapes — animated */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                  className="absolute -top-4 -left-4 w-20 h-20 border-t-4 border-l-4 border-accent rounded-tl-3xl pointer-events-none"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                  className="absolute -bottom-4 -right-4 w-20 h-20 border-b-4 border-r-4 border-accent rounded-br-3xl pointer-events-none"
                />

                <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  <EditableImage
                    page="home"
                    blockKey="hero_image"
                    src={homeBlocks.hero_image || null}
                    alt="Cadet College Murree admin block — the iconic campus building in the Murree Hills"
                    width={720}
                    height={540}
                    imgClassName="w-full h-[320px] sm:h-[400px] lg:h-[520px] object-cover"
                  />
                  {/* Subtle bottom shadow for text legibility on small screens */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />

                  {/* Floating badge — bottom-left of image */}
                  <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-foreground/85 font-semibold leading-none mb-0.5">Admissions</div>
                      <div className="text-sm font-bold text-primary leading-tight">Open for 2026-27</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
          {/* Accent stripe — GCCM: bold crimson bar (girlscadetcollege.com red stripe); CCM: hidden */}
          <div
            style={{
              height: "var(--hero-accent-stripe-height, 0px)",
              background: "var(--hero-accent-stripe-color, transparent)",
            }}
          />
        </SectionColor>
        )}

        {/* ===== 4 QUICK-LINK CARDS ===== */}
        <SectionColor page="home" scope="quicklinks" label="Quick Links" kind="light" className="relative z-20 -mt-1 bg-background border-b border-border" id="quicklinks" data-testid="home-quicklinks">
          <div className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border border border-border rounded-none md:rounded-xl overflow-hidden shadow-lg">
            {quickLinks.map((ql, i) => (
              <QuickLinkCard key={i} ql={ql} index={i} />
            ))}
          </div>
        </SectionColor>

        {/* ===== LIVE ADMISSIONS COUNTER — real-time, polls every 20s ===== */}
        <LiveAdmissionsCounter />

        {/* ===== STATS STRIP — animated count-up ===== */}
        <SectionColor page="home" scope="stats" label="Stats Strip" kind="dark" className="bg-primary" data-testid="home-stats">
          <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                data-testid={`stat-${i}`}
              >
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                  {editEnabled ? (
                    <EditableSetting
                      settingKey={stat.settingKey}
                      value={(stat.value && stat.value.trim() !== "") ? stat.value : `${stat.numeric ?? ""}${stat.suffix ?? ""}`}
                    />
                  ) : stat.numeric !== undefined ? (
                    <CountUp to={stat.numeric} suffix={stat.suffix} />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="text-xs uppercase tracking-widest text-white/85 font-medium">
                  <EditableText as="span" page="home" blockKey={stat.labelKey} value={homeBlocks[stat.labelKey] || stat.label} />
                </div>
              </motion.div>
            ))}
          </div>
        </SectionColor>

        {/* ===== WELCOME / ABOUT SNIPPET ===== */}
        <SectionColor page="home" scope="welcome" label="Welcome" kind="light" className="py-24 px-4" data-testid="home-welcome">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-14 items-start">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.12 } },
              }}
            >
              <motion.p
                variants={fadeUp}
                className="uppercase tracking-widest font-semibold text-sm mb-3"
                style={{ color: "var(--heading-accent)" }}
              >
                <EditableText as="span" page="home" blockKey="welcome_eyebrow" value={homeBlocks.welcome_eyebrow || "Our Institution"} />
              </motion.p>
              <div style={{ overflow: "hidden" }}>
                <motion.h2
                  variants={{
                    hidden: { y: "110%", opacity: 0 },
                    visible: { y: "0%", opacity: 1, transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] as const } },
                  }}
                  className="text-3xl md:text-4xl font-bold text-primary mb-4 leading-tight"
                >
                  <EditableText as="span" page="home" blockKey="welcome_heading" value={homeBlocks.welcome_heading || "Welcome to Cadet College Murree"} />
                </motion.h2>
              </div>
              <motion.h3
                variants={fadeUp}
                className="text-xl font-bold text-primary mb-6 italic"
              >
                <EditableText as="span" page="home" blockKey="welcome_subheading" value={homeBlocks.welcome_subheading || "Proud To Be HILLIANS"} />
              </motion.h3>
              <p className="text-foreground/80 leading-relaxed mb-5">
                <EditableText as="span" multiline page="home" blockKey="welcome_body1" value={homeBlocks.welcome_body1 || "Cadet College Murree is established as an educational institute, aiming at excellence in education to benefit the community. Notwithstanding the educational and economical constraints, the college has set its inviolate goals to produce educated, motivated and spirited cadets."} />
              </p>
              <p className="text-foreground/80 leading-relaxed mb-8">
                <EditableText as="span" multiline page="home" blockKey="welcome_body2" value={homeBlocks.welcome_body2 || "Inaugurated in August 2002, Cadet College Murree is an independent College which provides training and education following the military traditions and customs of the Pakistan Army. Cadet College Murree, governed by the Board of Directors, is a non profit, interdenominational institution, and is not an official activity of the Pakistan Armed Forces."} />
              </p>
              <Button
                asChild
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                data-testid="button-learn-about"
              >
                <Link href="/about" className="flex items-center gap-2">
                  About the College <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="relative"
            >
              <EditableImage
                page="home"
                blockKey="welcome_image"
                src={homeBlocks.welcome_image || null}
                alt="Welcome to Cadet College Murree — cadets in uniform on the college campus"
                loading="lazy"
                width={700}
                height={500}
                imgClassName="w-full h-[420px] object-cover rounded-2xl shadow-xl"
              />
              <div className="absolute -bottom-5 -left-5 bg-primary text-primary-foreground p-5 rounded-xl shadow-lg border border-primary-foreground/10">
                <div className="text-2xl font-bold text-accent">{settings.alumni_stat_years}</div>
                <div className="text-xs text-primary-foreground/80 font-medium">Years of Excellence</div>
              </div>
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== PRINCIPAL'S WELCOME ===== */}
        <SectionColor
          page="home" scope="principal" label="Principal's Message" kind="light"
          className="relative py-20 md:py-24 px-4 overflow-hidden"
          style={{ background: "var(--section-warm-bg)" }}
          data-testid="home-principal"
        >
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, var(--principal-dot-color) 1px, transparent 0)",
              backgroundSize: "30px 30px",
            }}
            aria-hidden="true"
          />
          <div className="relative max-w-6xl mx-auto grid md:grid-cols-[280px_1fr] gap-10 md:gap-14 items-start">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative mx-auto md:mx-0"
            >
              <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-accent/30 via-secondary/20 to-primary/20 blur-2xl" />
              <div className="relative w-56 h-56 md:w-64 md:h-64 rounded-full overflow-hidden border-[6px] border-white shadow-2xl shadow-primary/15 bg-primary">
                <EditableImage
                  page="home"
                  blockKey="principal_image"
                  src={homeBlocks.principal_image || null}
                  alt="Principal of Cadet College Murree"
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover"
                  placeholder={
                    <div className="w-full h-full flex items-center justify-center text-white text-6xl md:text-7xl font-bold tracking-wider">P</div>
                  }
                />
              </div>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-[10px] uppercase tracking-widest font-bold px-4 py-1.5 rounded-full shadow-lg">
                The Principal
              </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
              <p className="uppercase tracking-widest font-semibold text-sm mb-3" style={{ color: "var(--heading-accent)" }}><EditableText as="span" page="home" blockKey="principal_eyebrow" value={homeBlocks.principal_eyebrow || "A Message from the Principal"} /></p>
              <h2 className="text-3xl md:text-4xl font-bold text-primary mb-6 leading-tight">
                <EditableText as="span" page="home" blockKey="principal_heading" value={homeBlocks.principal_heading || "\"Shaping minds, building character — one Hillian at a time.\""} />
              </h2>
              <p className="text-foreground/85 leading-relaxed mb-4">
                <EditableText as="span" multiline page="home" blockKey="principal_body1" value={homeBlocks.principal_body1 || "At Cadet College Murree, education is more than textbooks and examinations — it is the disciplined pursuit of excellence in mind, body and spirit. We are committed to nurturing young men who will lead with integrity, serve with honour, and stand tall as proud Hillians wherever life takes them."} />
              </p>
              <AnimatePresence>
                {msgExpanded && (
                  <motion.p
                    key="principal-body2"
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: "auto", marginBottom: "2rem" }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="text-foreground/85 leading-relaxed overflow-hidden"
                  >
                    <EditableText as="span" multiline page="home" blockKey="principal_body2" value={homeBlocks.principal_body2 || "Every cadet who walks through our gates inherits a tradition over two decades in the making. Our doors, our faculty, and our hearts are open to families who share this vision."} />
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <Signature className="w-8 h-8 text-primary" />
                  <div>
                    <div className="font-bold text-primary"><EditableText as="span" page="home" blockKey="principal_name" value={homeBlocks.principal_name || "Brig. (R) Muhammad Asif"} /></div>
                    <div className="text-xs text-foreground/65 uppercase tracking-widest"><EditableText as="span" page="home" blockKey="principal_role" value={homeBlocks.principal_role || "Principal, CCM"} /></div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-primary text-primary hover:bg-primary hover:text-primary-foreground flex items-center gap-2"
                  data-testid="button-read-principal"
                  onClick={() => setMsgExpanded(v => !v)}
                >
                  {msgExpanded ? "Show Less" : <>Read Full Message <ArrowRight className="w-4 h-4" /></>}
                </Button>
              </div>
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== ANNOUNCEMENT OF ADMISSIONS ===== */}
        <SectionColor page="home" scope="announcements" label="Announcements" kind="dark" className="py-20 px-4" style={{ background: "var(--surface-dark)" }} id="announcements" data-testid="home-announcements">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-10"
            >
              <p className="uppercase tracking-widest font-semibold text-sm mb-3" style={{ color: "var(--heading-accent)" }}><EditableText as="span" page="home" blockKey="announce_eyebrow" value={homeBlocks.announce_eyebrow || "Important Notice"} /></p>
              <h2 className="text-2xl md:text-3xl font-bold text-white"><EditableText as="span" page="home" blockKey="announce_heading" value={homeBlocks.announce_heading || "Announcement of Admissions"} /></h2>
              <p className="text-white/75 mt-3 max-w-2xl mx-auto text-sm">
                <EditableText as="span" multiline page="home" blockKey="announce_subtitle" value={homeBlocks.announce_subtitle || "The College normally announces its admissions twice a year as per the tentative schedule below, through advertisement in the leading newspapers of the country."} />
              </p>
            </motion.div>

            {/* Dynamic announcements from CMS */}
            {announcements.length > 0 && (
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={staggerContainer}
                className="mb-10 space-y-3"
                data-testid="home-dynamic-announcements"
              >
                {announcements.slice(0, 3).map((ann) => (
                  <motion.div
                    key={ann.id}
                    variants={fadeUp}
                    className={`flex gap-3 items-start rounded-xl px-5 py-4 border backdrop-blur ${
                      ann.priority === "high"
                        ? "bg-accent/10 border-accent/30"
                        : ann.priority === "urgent"
                        ? "bg-red-900/20 border-red-500/30"
                        : "bg-white/[0.04] border-white/15"
                    }`}
                  >
                    <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      ann.priority === "urgent" ? "bg-red-400 animate-pulse" : "bg-accent"
                    }`} />
                    <div>
                      <p className="text-white font-semibold text-sm">{ann.title}</p>
                      {ann.body && <p className="text-white/65 text-xs mt-1 leading-relaxed">{ann.body}</p>}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid sm:grid-cols-2 gap-6"
            >
              <motion.div
                variants={fadeUp}
                data-testid="announcement-card-0"
                className="bg-white/[0.04] border border-white/15 hover:border-accent/40 rounded-xl p-6 backdrop-blur transition-colors"
              >
                <h3 className="font-bold text-accent text-lg mb-4"><EditableText as="span" page="home" blockKey="announce_card_a" value={homeBlocks.announce_card_a || "a. Admissions in Class VI to IX"} /></h3>
                <ul className="space-y-2 mb-3">
                  {["Month October to November", "February to March"].map((s, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-white/90">
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                      <EditableText as="span" page="home" blockKey={`announce_card_a_item_${j}`} value={homeBlocks[`announce_card_a_item_${j}`] || s} />
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-white/55"><EditableText as="span" page="home" blockKey="announce_card_a_note" value={homeBlocks.announce_card_a_note || "Admitted twice a year"} /></p>
              </motion.div>
              <motion.div
                variants={fadeUp}
                data-testid="announcement-card-1"
                className="bg-white/[0.04] border border-white/15 hover:border-accent/40 rounded-xl p-6 backdrop-blur transition-colors"
              >
                <h3 className="font-bold text-accent text-lg mb-4"><EditableText as="span" page="home" blockKey="announce_card_b" value={homeBlocks.announce_card_b || "b. Admissions Open in Class XI"} /></h3>
                <ul className="space-y-2 mb-3">
                  <li className="flex items-center gap-2 text-sm text-white/90">
                    <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                    <EditableText as="span" page="home" blockKey="announce_card_b_item_0" value={homeBlocks.announce_card_b_item_0 || "In the month of May to June"} />
                  </li>
                </ul>
                <p className="text-xs text-white/55"><EditableText as="span" page="home" blockKey="announce_card_b_note" value={homeBlocks.announce_card_b_note || "Pre-Medical, Pre-Engineering, ICS — once a year"} /></p>
              </motion.div>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button asChild className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold shadow-lg shadow-accent/20" data-testid="button-go-admissions">
                <Link href="/admissions"><EditableText as="span" page="home" blockKey="announce_cta_details" value={homeBlocks.announce_cta_details || "View Full Admission Details"} /></Link>
              </Button>
              <Button asChild variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:border-white backdrop-blur flex items-center gap-2" data-testid="button-download-feestructure">
                <Link href="/fee-structure">
                  <EditableText as="span" page="home" blockKey="announce_cta_fee" value={homeBlocks.announce_cta_fee || "View Fee Structure"} />
                </Link>
              </Button>
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== KEY FEATURES ===== */}
        <SectionColor page="home" scope="features" label="Features" kind="light" className="py-24 px-4" id="features" data-testid="home-features">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-14"
            >
              <p className="uppercase tracking-widest font-semibold text-sm mb-3" style={{ color: "var(--heading-accent)" }}><EditableText as="span" page="home" blockKey="features_eyebrow" value={homeBlocks.features_eyebrow || "Life at CCM"} /></p>
              <h2 className="text-3xl md:text-4xl font-bold text-primary"><EditableText as="span" page="home" blockKey="features_heading" value={homeBlocks.features_heading || "A Complete Education"} /></h2>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {features.map((feature, i) => (
                <FeatureCard key={i} feature={feature} index={i} />
              ))}
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== LATEST NEWS & EVENTS ===== */}
        <SectionColor page="home" scope="news" label="News & Events" kind="light" className="py-24 px-4" style={{ background: "var(--section-warm-bg)" }} data-testid="home-news">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
            >
              <div>
                <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 px-3 py-1 rounded-full mb-4">
                  <Newspaper className="w-4 h-4 text-accent" />
                  <span className="text-accent text-xs font-bold uppercase tracking-wider"><EditableText as="span" page="home" blockKey="news_eyebrow" value={homeBlocks.news_eyebrow || "Latest News & Events"} /></span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-primary"><EditableText as="span" page="home" blockKey="news_heading" value={homeBlocks.news_heading || "What's happening at CCM"} /></h2>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground self-start md:self-auto"
                data-testid="button-view-all-events"
              >
                <Link href="/events" className="flex items-center gap-2">
                  View All Events <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-6"
            >
              {latestNews.map((n, i) => (
                <motion.article
                  key={i}
                  variants={fadeUp}
                  className="group bg-card border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 transition-all duration-300"
                  data-testid={`news-card-${i}`}
                >
                  <Link href="/events" className="block">
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      <img
                        src={(n as any).imageUrl ?? (n as any).image}
                        alt={n.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <span className="absolute top-3 left-3 bg-accent text-accent-foreground text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full shadow-md">
                        {n.category}
                      </span>
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-1.5 text-xs text-foreground/60 mb-2">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>{n.date}</span>
                      </div>
                      <h3 className="font-bold text-primary text-lg mb-2 leading-snug group-hover:text-accent transition-colors">
                        {n.title}
                      </h3>
                      <p className="text-foreground/75 text-sm leading-relaxed mb-4">{(n as any).description ?? (n as any).excerpt}</p>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                        Read more <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== CAMPUS FACILITIES ===== */}
        <SectionColor page="home" scope="facilities" label="Facilities" kind="dark" className="bg-primary py-24 px-4" id="facilities" data-testid="home-facilities">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-14"
            >
              <p className="uppercase tracking-widest font-semibold text-sm mb-3" style={{ color: "var(--heading-accent)" }}><EditableText as="span" page="home" blockKey="facilities_eyebrow" value={homeBlocks.facilities_eyebrow || "Infrastructure"} /></p>
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground"><EditableText as="span" page="home" blockKey="facilities_heading" value={homeBlocks.facilities_heading || "World-Class Campus Facilities"} /></h2>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {facilities.map((facility, i) => (
                <FacilityCard key={i} facility={facility} index={i} />
              ))}
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mt-10"
            >
              <Button
                asChild
                variant="outline"
                className="border-white text-white hover:bg-white/10"
                data-testid="button-explore-campus"
              >
                <Link href="/about" className="flex items-center gap-2">
                  Explore Campus <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== PHOTO GALLERY BENTO TEASER ===== */}
        <SectionColor page="home" scope="gallery_teaser" label="Photo Gallery" kind="light" className="py-24 px-4 bg-background" data-testid="home-gallery-teaser">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"
            >
              <div>
                <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 px-3 py-1 rounded-full mb-4">
                  <Camera className="w-4 h-4 text-accent" />
                  <span className="text-accent text-xs font-bold uppercase tracking-wider"><EditableText as="span" page="home" blockKey="gallery_eyebrow" value={homeBlocks.gallery_eyebrow || "Life in Pictures"} /></span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-primary"><EditableText as="span" page="home" blockKey="gallery_heading" value={homeBlocks.gallery_heading || "A glimpse inside Cadet College Murree"} /></h2>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground self-start md:self-auto"
                data-testid="button-view-gallery"
              >
                <Link href="/gallery" className="flex items-center gap-2">
                  Full Gallery <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </motion.div>

            {/* Bento grid */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid grid-cols-2 md:grid-cols-4 auto-rows-[180px] md:auto-rows-[220px] gap-3 md:gap-4"
            >
              {galleryTeaser.map((img, i) => {
                const layouts = [
                  "col-span-2 row-span-2",
                  "col-span-1 row-span-1 md:col-span-1",
                  "col-span-1 row-span-1 md:col-span-1",
                  "col-span-1 row-span-1 md:col-span-1",
                  "col-span-1 row-span-1 md:col-span-1",
                  "col-span-2 row-span-1 md:col-span-4 md:row-span-1",
                ];
                const directions = [
                  { x: -40, y: -40 }, { x: 40, y: 0 }, { x: 40, y: -30 },
                  { x: -40, y: 30 }, { x: -40, y: 0 }, { x: 0, y: 50 },
                ];
                const d = directions[i] ?? { x: 0, y: 30 };
                return (
                  <motion.figure
                    key={i}
                    variants={{
                      hidden: { opacity: 0, x: d.x, y: d.y, scale: 0.92 },
                      visible: {
                        opacity: 1, x: 0, y: 0, scale: 1,
                        transition: {
                          type: "spring" as const,
                          stiffness: 60,
                          damping: 18,
                          delay: i * 0.08,
                        },
                      },
                    }}
                    whileHover={{ scale: 1.02, zIndex: 10 }}
                    className={`relative group overflow-hidden rounded-2xl bg-muted ${layouts[i] ?? ""}`}
                    data-testid={`gallery-tile-${i}`}
                  >
                    <Link href="/gallery" className="block w-full h-full">
                      <motion.img
                        src={(img as any).imageUrl ?? (img as any).src}
                        alt={(img as any).imageAlt ?? (img as any).alt}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                        whileHover={{ scale: 1.12 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <motion.div
                        initial={{ y: 16, opacity: 0 }}
                        whileHover={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.28 }}
                        className="absolute bottom-0 left-0 right-0 p-4"
                      >
                        <p className="text-white text-xs md:text-sm font-semibold line-clamp-2">{img.imageAlt ?? img.title}</p>
                      </motion.div>
                    </Link>
                  </motion.figure>
                );
              })}
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== TESTIMONIALS — Slider ===== */}
        {testimonials.length > 0 && <TestimonialsSlider testimonials={testimonials} />}

        {/* ===== ALUMNI / HILLIANS NETWORK ===== */}
        <SectionColor
          page="home" scope="alumni" label="Alumni" kind="dark"
          className="relative py-24 px-4 overflow-hidden"
          style={{ background: "var(--alumni-section-bg)" }}
          data-testid="home-alumni"
        >
          {/* Decorative pattern */}
          <div
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 22px)",
            }}
            aria-hidden="true"
          />
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-7xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-14"
            >
              <div className="inline-flex items-center gap-2 bg-accent/15 border border-accent/30 px-4 py-1.5 rounded-full mb-5">
                <Award className="w-4 h-4 text-accent" />
                <EditableText as="span" page="home" blockKey="alumni_eyebrow" value={homeBlocks.alumni_eyebrow || "Our Alumni"} className="text-accent text-xs md:text-sm font-semibold uppercase tracking-wider" />
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
                <EditableText as="span" page="home" blockKey="alumni_heading" value={homeBlocks.alumni_heading || "Where Our Hillians Lead"} />
              </h2>
              <p className="text-white/85 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
                <EditableText as="span" multiline page="home" blockKey="alumni_body" value={homeBlocks.alumni_body || "For over two decades, Cadet College Murree has groomed young men into officers, professionals, and leaders serving Pakistan with distinction across every field."} />
              </p>
            </motion.div>

            {/* Career-path cards */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={staggerContainer}
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14"
            >
              {[
                {
                  icon: Shield,
                  field: "Armed Forces",
                  count: "350+",
                  desc: "Hillians commissioned across Pakistan Army, Navy & Air Force.",
                },
                {
                  icon: Briefcase,
                  field: "Civil Services",
                  count: "80+",
                  desc: "Officers serving in CSS cadres, foreign service & public administration.",
                },
                {
                  icon: Stethoscope,
                  field: "Medicine & Engineering",
                  count: "400+",
                  desc: "Doctors, engineers & scientists in leading institutions nationwide.",
                },
                {
                  icon: Plane,
                  field: "Global Careers",
                  count: "150+",
                  desc: "Hillians excelling in academia, tech & enterprise across the world.",
                },
              ].map((a, i) => {
                const Icon = a.icon;
                return (
                  <motion.div
                    key={i}
                    variants={fadeUp}
                    data-testid={`alumni-card-${i}`}
                    className="group relative bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-accent/40 rounded-2xl p-7 backdrop-blur transition-all duration-300"
                  >
                    <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-accent" />
                    </div>
                    <div className="text-3xl md:text-4xl font-bold text-white mb-1"><EditableText as="span" page="home" blockKey={`alumni_card_${i}_count`} value={homeBlocks[`alumni_card_${i}_count`] || a.count} /></div>
                    <div className="text-sm font-semibold text-accent uppercase tracking-wider mb-3"><EditableText as="span" page="home" blockKey={`alumni_card_${i}_field`} value={homeBlocks[`alumni_card_${i}_field`] || a.field} /></div>
                    <p className="text-white/80 text-sm leading-relaxed"><EditableText as="span" multiline page="home" blockKey={`alumni_card_${i}_desc`} value={homeBlocks[`alumni_card_${i}_desc`] || a.desc} /></p>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Alumni network band */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="relative bg-white/[0.05] border border-white/10 rounded-2xl p-7 md:p-10 backdrop-blur"
            >
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-accent flex items-center justify-center flex-shrink-0 shadow-xl shadow-accent/20">
                  <Users className="w-8 h-8 md:w-10 md:h-10 text-white" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
                    <EditableText as="span" page="home" blockKey="alumni_band_heading" value={homeBlocks.alumni_band_heading || "Join the Hillians Alumni Network"} />
                  </h3>
                  <p className="text-white/85 text-sm md:text-base leading-relaxed">
                    <EditableText as="span" multiline page="home" blockKey="alumni_band_body" value={homeBlocks.alumni_band_body || "Reconnect with classmates, mentor current cadets, and stay updated on reunions, events and college news from across Pakistan and around the world."} />
                  </p>
                </div>
                <Button
                  asChild
                  size="lg"
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-7 shadow-lg shadow-accent/20 w-full md:w-auto"
                  data-testid="button-alumni-register"
                >
                  <Link href="/contact"><EditableText as="span" page="home" blockKey="alumni_cta" value={homeBlocks.alumni_cta || "Register Now"} /></Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </SectionColor>

        {/* ===== CTA BANNER ===== */}
        <SectionColor
          page="home" scope="cta" label="CTA Banner" kind="light"
          className="relative py-20 md:py-24 px-4 overflow-hidden bg-[#f6f3ea]"
          data-testid="home-cta"
        >
          {/* Subtle texture */}
          <div
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, #064A1A 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
            aria-hidden="true"
          />
          {/* Soft color blooms */}
          <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-accent/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-4xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="relative bg-white border border-primary/15 rounded-3xl shadow-xl shadow-primary/[0.08] p-8 md:p-12 text-center"
            >
              {/* Top accent bar */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 h-1.5 w-24 rounded-full bg-gradient-to-r from-primary via-accent to-secondary" />

              <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/30 text-accent px-4 py-1.5 rounded-full mb-5">
                <AlertCircle className="w-4 h-4" />
                <EditableText as="span" page="home" blockKey="cta_eyebrow" value={homeBlocks.cta_eyebrow || "Important Notice"} className="text-xs md:text-sm font-bold uppercase tracking-wider" />
              </div>

              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-primary mb-4">
                <EditableText as="span" page="home" blockKey="cta_heading" value={homeBlocks.cta_heading || "Admissions Open — Intake 2026-27"} />
              </h2>
              <p className="text-foreground/85 mb-6 text-base md:text-lg max-w-2xl mx-auto">
                <EditableText as="span" multiline page="home" blockKey="cta_body" value={homeBlocks.cta_body || "Apply today for Classes 6th–11th. Last date: October 31, 2026."} />
              </p>

              {/* Live countdown */}
              <Countdown target={admissionDeadline} />

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mt-8">
                <Button
                  asChild
                  size="lg"
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold px-8 shadow-lg shadow-accent/25"
                  data-testid="button-cta-apply"
                >
                  <Link href="/admissions"><EditableText as="span" page="home" blockKey="cta_primary" value={homeBlocks.cta_primary || "Apply Online Now"} /></Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold"
                  data-testid="button-cta-contact"
                >
                  <Link href="/contact"><EditableText as="span" page="home" blockKey="cta_secondary" value={homeBlocks.cta_secondary || "Contact Admissions"} /></Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </SectionColor>
      </div>
    </>
  );
}

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, { duration: 1.8, ease: "easeOut" });
    const unsub = rounded.on("change", setDisplay);
    return () => {
      controls.stop();
      unsub();
    };
  }, [inView, mv, rounded, to]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

function Countdown({ target }: { target: Date }) {
  const calc = () => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      mins: Math.floor((diff / (1000 * 60)) % 60),
      secs: Math.floor((diff / 1000) % 60),
    };
  };
  const [t, setT] = useState(calc);
  const expired = t.days === 0 && t.hours === 0 && t.mins === 0 && t.secs === 0;
  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, expired]);

  const cells = [
    { v: t.days, l: "Days" },
    { v: t.hours, l: "Hours" },
    { v: t.mins, l: "Mins" },
    { v: t.secs, l: "Secs" },
  ];

  return (
    <div
      className="inline-flex items-center gap-2 sm:gap-3 bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3"
      data-testid="countdown"
      role="timer"
      aria-label={`Application deadline in ${t.days} days, ${t.hours} hours, ${t.mins} minutes`}
    >
      <Clock className="w-4 h-4 text-accent flex-shrink-0 hidden sm:block" />
      {cells.map((c, i) => (
        <div key={c.l} className="flex items-center gap-2 sm:gap-3">
          <div className="text-center min-w-[44px] sm:min-w-[56px]">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-primary tabular-nums leading-none">
              {String(c.v).padStart(2, "0")}
            </div>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-widest text-foreground/60 font-semibold mt-1">
              {c.l}
            </div>
          </div>
          {i < cells.length - 1 && <div className="text-primary/30 text-xl font-bold">:</div>}
        </div>
      ))}
    </div>
  );
}

function StickyMiniNav({ heroKey }: { heroKey: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Reset before (re)observing so a swapped-out sentinel can't leave the nav
    // stuck visible while the new observer attaches.
    setShow(false);
    const sentinel = document.querySelector("[data-hero-sentinel]");
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-80px 0px 0px 0px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
    // Re-observe when the hero variant swaps (e.g. slideshow loads), since the
    // old sentinel node is unmounted and the stale observer would otherwise
    // report "not intersecting" and wrongly reveal the nav at scroll top.
  }, [heroKey]);

  return (
    <div
      className={`fixed top-16 md:top-20 left-0 right-0 z-40 transition-all duration-300 ${
        show ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
      }`}
      data-testid="sticky-mini-nav"
      aria-hidden={!show}
      inert={show ? undefined : true}
    >
      <div className="bg-white/90 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {miniNavLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-primary/80 hover:text-primary hover:bg-primary/5 rounded-lg whitespace-nowrap transition-colors"
                data-testid={`mini-nav-${l.label.toLowerCase()}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Button
            asChild
            size="sm"
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold shadow-md flex-shrink-0"
            data-testid="mini-nav-apply"
          >
            <Link href="/admissions" className="flex items-center gap-1.5">
              Apply <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Slideshow — rotating full-width hero headers managed in the admin ────
function HeroSlideshow({ slides }: { slides: HeroSlide[] }) {
  const autoplay = useRef(
    Autoplay({ delay: 6000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  return (
    <SectionColor
      page="home" scope="hero" label="Hero" kind="hero"
      className="relative overflow-hidden"
      data-testid="home-hero"
      data-hero-sentinel
    >
      <Carousel
        opts={{ align: "start", loop: slides.length > 1 }}
        plugins={slides.length > 1 ? [autoplay.current] : []}
        className="w-full"
      >
        <CarouselContent className="ml-0">
          {slides.map((s, i) => {
            const link = (s.buttonLink ?? "").trim();
            const isExternal = /^https?:\/\//i.test(link);
            return (
              <CarouselItem key={s.id} className="pl-0 basis-full" data-testid={`hero-slide-${i}`}>
                <div className="relative h-[420px] sm:h-[500px] lg:h-[600px] w-full">
                  <img
                    src={s.imageUrl}
                    alt={s.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/45 to-black/20" aria-hidden="true" />
                  <div className="relative z-10 h-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col justify-center items-start text-left">
                    <motion.h1
                      key={`t-${s.id}`}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="font-bold text-white text-3xl sm:text-5xl lg:text-6xl max-w-3xl leading-[1.08] drop-shadow-lg"
                    >
                      {s.title}
                    </motion.h1>
                    {s.subtitle && (
                      <motion.p
                        key={`s-${s.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.15 }}
                        className="text-white/90 text-base sm:text-xl mt-5 max-w-2xl leading-relaxed drop-shadow"
                      >
                        {s.subtitle}
                      </motion.p>
                    )}
                    {s.buttonLabel && link && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="mt-8"
                      >
                        <Button
                          asChild
                          size="lg"
                          className="bg-accent hover:bg-accent/90 text-accent-foreground text-base px-7 font-semibold shadow-xl shadow-accent/20 uppercase tracking-wide"
                          data-testid={`hero-slide-cta-${i}`}
                        >
                          {isExternal
                            ? <a href={link} target="_blank" rel="noopener noreferrer">{s.buttonLabel}</a>
                            : <Link href={link}>{s.buttonLabel}</Link>}
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        {slides.length > 1 && (
          <>
            <CarouselPrevious
              className="left-4 h-11 w-11 border-white/40 bg-white/15 text-white hover:bg-white hover:text-primary backdrop-blur"
              data-testid="hero-prev"
            />
            <CarouselNext
              className="right-4 h-11 w-11 border-white/40 bg-white/15 text-white hover:bg-white hover:text-primary backdrop-blur"
              data-testid="hero-next"
            />
          </>
        )}
      </Carousel>
    </SectionColor>
  );
}

function TestimonialsSlider({ testimonials }: { testimonials: TestimonialItem[] }) {
  const homeBlocks = usePageBlocks("home");
  const autoplay = useRef(
    Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })
  );

  return (
    <SectionColor page="home" scope="testimonials" label="Testimonials" kind="light" className="py-24 px-4 bg-background" id="testimonials" data-testid="home-testimonials">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="text-center mb-14"
        >
          <p className="uppercase tracking-widest font-semibold text-sm mb-3" style={{ color: "var(--heading-accent)" }}><EditableText as="span" page="home" blockKey="testimonials_eyebrow" value={homeBlocks.testimonials_eyebrow || "Testimonials"} /></p>
          <h2 className="text-3xl md:text-4xl font-bold text-primary"><EditableText as="span" page="home" blockKey="testimonials_heading" value={homeBlocks.testimonials_heading || "What do people say about CCM?"} /></h2>
          <p className="text-foreground/85 mt-3"><EditableText as="span" multiline page="home" blockKey="testimonials_subtitle" value={homeBlocks.testimonials_subtitle || "Testimonials about Cadet College Murree"} /></p>
        </motion.div>

        <Carousel
          opts={{ align: "start", loop: true }}
          plugins={[autoplay.current]}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {testimonials.map((t, i) => (
              <CarouselItem
                key={i}
                className="pl-4 sm:basis-1/2 lg:basis-1/3"
                data-testid={`testimonial-card-${i}`}
              >
                <div className="h-full bg-card border border-border rounded-2xl p-7 flex flex-col hover:shadow-lg hover:border-primary/25 transition-all duration-300">
                  <Quote className="w-8 h-8 text-accent/30 mb-4 flex-shrink-0" />
                  <p className="text-foreground/85 text-sm leading-relaxed flex-1 mb-6 italic">
                    {t.quote}
                  </p>
                  <div className="flex items-center gap-4 pt-4 border-t border-border">
                    <img
                      src={t.photoUrl ?? undefined}
                      alt={`${t.name} — ${t.role} at Cadet College Murree`}
                      loading="lazy"
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover border-2 border-primary/20"
                    />
                    <div>
                      <div className="font-bold text-primary text-sm">{t.name}</div>
                      <div className="text-xs text-foreground/80">{t.role}</div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="flex items-center justify-center gap-3 mt-8">
            <CarouselPrevious
              className="static translate-y-0 h-11 w-11 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
              data-testid="testimonials-prev"
            />
            <CarouselNext
              className="static translate-y-0 h-11 w-11 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
              data-testid="testimonials-next"
            />
          </div>
        </Carousel>
      </div>
    </SectionColor>
  );
}
