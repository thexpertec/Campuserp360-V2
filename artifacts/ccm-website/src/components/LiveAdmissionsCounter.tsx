import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGetApplicationStats } from "@workspace/api-client-react";
import { Activity, ArrowRight, Clock, Flame, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageBlocks } from "@/lib/usePageBlocks";
import { useEditMode } from "@/lib/edit-mode";
import EditableText from "@/components/cms/EditableText";
import SectionColor from "@/components/cms/SectionColor";

const POLL_INTERVAL_MS = 20_000;

function formatRelative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "just now";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "just now";
  const diff = Math.max(0, nowMs - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// Parse an admin override block into a number. Empty/blank/invalid → fall back
// to the live value so clearing the field reverts to real data.
function overrideInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Returns a trimmed override string, or null when blank.
function overrideText(raw: string | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

function useAnimatedNumber(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target === value) return;
    fromRef.current = value;
    startRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // We intentionally only re-run when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}

/**
 * A value that is editable inline by an admin (CMS edit mode) but shows a
 * rich/animated display to ordinary visitors. In edit mode it becomes a
 * click-to-edit field bound to `blockKey`; saving a value overrides the live
 * number, clearing it reverts to live data.
 */
function EditableValue({
  page, blockKey, value, className, as = "span", children,
}: {
  page: string;
  blockKey: string;
  /** Text shown/edited in edit mode (the override, or the current live value). */
  value: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  /** The view-mode display (e.g. an animated number). */
  children: React.ReactNode;
}) {
  const { enabled } = useEditMode();
  if (enabled) {
    return <EditableText as={as} page={page} blockKey={blockKey} value={value} className={className} />;
  }
  return <>{children}</>;
}

export default function LiveAdmissionsCounter() {
  const blocks = usePageBlocks("home");
  const query = useGetApplicationStats({
    query: {
      queryKey: ["getApplicationStats"],
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });

  // Re-render every 30s so "last submitted X ago" stays fresh.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const stats = query.data;

  // Live values from the API.
  const liveTotal = stats?.totalThisSession ?? 0;
  const liveSeats = stats?.totalSeats ?? 350;
  const liveLast24 = stats?.submissions24h ?? 0;
  const liveLastAgo = formatRelative(stats?.lastSubmittedAt, nowMs);

  // Effective values: admin overrides take precedence over live data.
  const total = overrideInt(blocks.counter_override_total, liveTotal);
  const seats = overrideInt(blocks.counter_override_seats, liveSeats);
  const spotsLeft = overrideInt(blocks.counter_override_spots, Math.max(0, seats - total));
  const last24 = overrideInt(blocks.counter_override_24h, liveLast24);
  const lastAgo = overrideText(blocks.counter_override_last) ?? liveLastAgo;

  // Heading year: the API session ("Admissions 2026") drives it by default, but
  // an admin override (counter_override_year) takes precedence when set.
  const liveYear = stats?.session ? stats.session.replace(/^Admissions\s*/, "") : "2026";
  const year = overrideText(blocks.counter_override_year) ?? liveYear;

  const displayedTotal = useAnimatedNumber(total);
  const displayedSpots = useAnimatedNumber(spotsLeft);

  // Track previous total for the "+N new" pulse when polling brings in a fresh submission.
  const prevTotalRef = useRef<number | null>(null);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    if (prevTotalRef.current !== null && total > prevTotalRef.current) {
      const diff = total - prevTotalRef.current;
      prevTotalRef.current = total;
      setDelta(diff);
      const id = setTimeout(() => setDelta(0), 4000);
      return () => clearTimeout(id);
    }
    prevTotalRef.current = total;
    return undefined;
  }, [total]);

  const pct = useMemo(() => {
    if (!seats) return 0;
    return Math.min(100, Math.round((total / seats) * 100));
  }, [total, seats]);

  const urgent = spotsLeft <= 100;

  return (
    <SectionColor
      page="home" scope="live_counter" label="Live Counter" kind="dark"
      className="relative isolate overflow-hidden text-white"
      style={{
        background: "linear-gradient(135deg, var(--surface-dark) 0%, var(--color-primary) 55%, var(--surface-dark) 100%)",
      }}
      data-testid="home-live-counter"
    >
      {/* glow accents — use theme accent + secondary so they shift with the tenant palette */}
      <div className="pointer-events-none absolute -top-32 left-1/3 w-96 h-96 rounded-full blur-3xl" style={{ background: "var(--color-accent)", opacity: 0.15 }} />
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full blur-3xl" style={{ background: "var(--color-secondary)", opacity: 0.12 }} />
      {/* subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-16 grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
        {/* Left: live indicator + headline + CTA */}
        <div className="lg:col-span-2 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest">
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping" />
              <span className="relative w-2 h-2 rounded-full bg-rose-400" />
            </span>
            <EditableText as="span" page="home" blockKey="counter_live_badge" value={blocks.counter_live_badge || "Live · updates every 20s"} />
          </div>

          <h2 className="mt-4 text-3xl md:text-4xl xl:text-5xl font-bold leading-[1.1]">
            <EditableText as="span" page="home" blockKey="counter_heading_prefix" value={blocks.counter_heading_prefix || "Admissions"} />{" "}
            <EditableValue
              page="home"
              blockKey="counter_override_year"
              value={blocks.counter_override_year || liveYear}
              className="text-accent"
            >
              <span className="text-accent">{year}</span>
            </EditableValue>
            {" "}<EditableText as="span" page="home" blockKey="counter_heading_suffix" value={blocks.counter_heading_suffix || "is filling up — fast."} />
          </h2>
          <p className="mt-3 text-white/80 leading-relaxed max-w-md mx-auto lg:mx-0">
            <EditableText as="span" multiline page="home" blockKey="counter_body" value={blocks.counter_body || "Parents and aspirants across Pakistan are securing their place at Cadet College Murree right now. Don't watch the seats run out from the sidelines."} />
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold h-12 px-6 shadow-xl shadow-accent/20 gap-2"
            >
              <Link href="/admissions">
                <EditableText as="span" page="home" blockKey="counter_cta_primary" value={blocks.counter_cta_primary || "Apply now"} /> <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="bg-white/5 hover:bg-white/15 border-white/30 hover:border-white text-white hover:text-white font-semibold h-12 px-6 backdrop-blur"
            >
              <Link href="/status"><EditableText as="span" page="home" blockKey="counter_cta_secondary" value={blocks.counter_cta_secondary || "Check application status"} /></Link>
            </Button>
          </div>
        </div>

        {/* Right: the big counter card */}
        <div className="lg:col-span-3">
          <div className="relative rounded-3xl bg-white/[0.04] border border-white/15 backdrop-blur-md p-6 md:p-8 shadow-2xl">
            {/* Header row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-white/70 text-xs uppercase tracking-widest font-semibold">
                <Activity className="w-4 h-4 text-accent" />
                <EditableText as="span" page="home" blockKey="counter_label_received" value={blocks.counter_label_received || "Applications received this session"} />
              </div>
              <AnimatePresence>
                {delta > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.85 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-1 bg-accent/20 border border-accent/40 text-accent text-xs font-bold px-2.5 py-1 rounded-full"
                  >
                    <TrendingUp className="w-3 h-3" />+{delta} just now
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Big number */}
            <div className="flex items-end gap-3 mb-2">
              <EditableValue
                page="home"
                blockKey="counter_override_total"
                value={blocks.counter_override_total || String(total)}
                className="font-bold text-6xl md:text-7xl xl:text-8xl text-white tabular-nums leading-none drop-shadow-lg"
              >
                <motion.span
                  key={Math.floor(displayedTotal / 25)}
                  initial={{ opacity: 0.7, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="font-bold text-6xl md:text-7xl xl:text-8xl text-white tabular-nums leading-none drop-shadow-lg"
                  data-testid="live-counter-total"
                >
                  {displayedTotal.toLocaleString()}
                </motion.span>
              </EditableValue>
              <span className="text-white/70 text-lg md:text-xl font-medium pb-2">
                of{" "}
                <EditableValue
                  page="home"
                  blockKey="counter_override_seats"
                  value={blocks.counter_override_seats || String(seats)}
                >
                  {seats.toLocaleString()}
                </EditableValue>{" "}
                <EditableText as="span" page="home" blockKey="counter_word_seats" value={blocks.counter_word_seats || "seats"} />
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-2">
                <span><EditableText as="span" page="home" blockKey="counter_label_capacity" value={blocks.counter_label_capacity || "Capacity"} /></span>
                <span className={urgent ? "text-rose-300" : "text-white"}>
                  {pct}% <EditableText as="span" page="home" blockKey="counter_word_filled" value={blocks.counter_word_filled || "filled"} />
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.1, ease: "easeOut" }}
                  className={
                    "absolute inset-y-0 left-0 rounded-full " +
                    (urgent
                      ? "bg-gradient-to-r from-amber-400 via-rose-500 to-rose-600"
                      : "bg-gradient-to-r from-accent to-secondary")
                  }
                />
                {/* shimmer */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-full opacity-50 mix-blend-overlay"
                  style={{
                    backgroundImage:
                      "linear-gradient(110deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.6) 50%, rgba(255,255,255,0) 70%)",
                    backgroundSize: "200% 100%",
                    animation: "ccm-shimmer 2.4s linear infinite",
                  }}
                />
              </div>
            </div>

            {/* Sub-stats row */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <StatPill
                Icon={Flame}
                tone={urgent ? "danger" : "accent"}
                value={
                  <EditableValue
                    page="home"
                    blockKey="counter_override_spots"
                    value={blocks.counter_override_spots || String(spotsLeft)}
                  >
                    {displayedSpots.toLocaleString()}
                  </EditableValue>
                }
                label={
                  <EditableText as="span" page="home" blockKey="counter_label_spots" value={blocks.counter_label_spots || (urgent ? "spots left — hurry!" : "spots remaining")} />
                }
                testId="live-counter-spots"
              />
              <StatPill
                Icon={Users}
                tone="default"
                value={
                  <EditableValue
                    page="home"
                    blockKey="counter_override_24h"
                    value={blocks.counter_override_24h || String(last24)}
                  >
                    {last24.toLocaleString()}
                  </EditableValue>
                }
                label={
                  <EditableText as="span" page="home" blockKey="counter_label_24h" value={blocks.counter_label_24h || "in the last 24 hours"} />
                }
                testId="live-counter-24h"
              />
              <StatPill
                Icon={Clock}
                tone="default"
                value={
                  <EditableValue
                    page="home"
                    blockKey="counter_override_last"
                    value={blocks.counter_override_last || lastAgo}
                  >
                    {lastAgo}
                  </EditableValue>
                }
                label={
                  <EditableText as="span" page="home" blockKey="counter_label_last" value={blocks.counter_label_last || "last application"} />
                }
                testId="live-counter-last"
              />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ccm-shimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }
      `}</style>
    </SectionColor>
  );
}

function StatPill({
  Icon,
  value,
  label,
  tone,
  testId,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  value: React.ReactNode;
  label: React.ReactNode;
  tone: "default" | "accent" | "danger";
  testId?: string;
}) {
  const toneClass = tone === "danger" ? "text-rose-300" : "text-white";
  return (
    <div
      className="rounded-2xl bg-white/[0.05] border border-white/10 p-3 md:p-4 text-center"
      data-testid={testId}
    >
      <div className={"inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 mb-1.5 " + toneClass}>
        <Icon className="w-4 h-4" />
      </div>
      <div className={"text-lg md:text-2xl font-bold tabular-nums leading-tight " + toneClass}>{value}</div>
      <div className="text-[10px] md:text-[11px] uppercase tracking-wider text-white/65 font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}
