import { Link } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

interface PageHeroProps {
  title: ReactNode;
  breadcrumb: string;
}

export default function PageHero({ title, breadcrumb }: PageHeroProps) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.3]);

  const soldiers = [
    { tx: 60,   ty: 30, scale: 1.4, opacity: 0.12 },
    { tx: 190,  ty: 60, scale: 1.3, opacity: 0.10 },
    { tx: 340,  ty: 20, scale: 1.5, opacity: 0.10 },
    { tx: 510,  ty: 25, scale: 1.4, opacity: 0.12 },
    { tx: 670,  ty: 130, scale: 1.3, opacity: 0.08 },
    { tx: 820,  ty: 30, scale: 1.5, opacity: 0.10 },
    { tx: 990,  ty: 20, scale: 1.4, opacity: 0.09 },
    { tx: 1160, ty: 55, scale: 1.3, opacity: 0.10 },
    { tx: 1330, ty: 30, scale: 1.4, opacity: 0.11 },
  ];

  return (
    <div>
      <section
        ref={ref}
        data-hero-sentinel
        className="relative h-[200px] md:h-[240px] overflow-hidden flex items-center"
        style={{ background: "var(--page-hero-gradient)" }}
      >
        {/* Parallax background glow blobs */}
        <motion.div
          style={{ y: bgY }}
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute top-[-40px] left-[-60px] w-72 h-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute bottom-[-40px] right-[-40px] w-64 h-64 rounded-full bg-secondary/10 blur-3xl" />
        </motion.div>

        {/* Animated diagonal stripes */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 20px)",
          }}
          aria-hidden="true"
        />

        {/* SVG soldier silhouettes — staggered march-in */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1440 240"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {soldiers.map((s, i) => (
            <motion.g
              key={i}
              transform={`translate(${s.tx}, ${s.ty}) scale(${s.scale})`}
              fill={`rgba(255,255,255,${s.opacity})`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.6, ease: "easeOut" }}
            >
              <ellipse cx="16" cy="8" rx="6" ry="6" />
              <rect x="13" y="14" width="6" height="22" rx="2" />
              <rect x="6" y="16" width="20" height="3" rx="1" />
              <rect x="19" y="6" width="2" height="26" rx="1" />
              <rect x="10" y="36" width="4" height="14" rx="1" />
              <rect x="18" y="36" width="4" height="14" rx="1" />
            </motion.g>
          ))}
        </svg>

        {/* Page title — clip-path reveal */}
        <motion.div
          style={{ opacity }}
          className="relative z-10 px-6 md:px-12"
        >
          <div style={{ overflow: "hidden" }}>
            <motion.h1
              className="text-white font-bold text-3xl md:text-4xl"
              initial={{ y: "110%" }}
              animate={{ y: "0%" }}
              transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.1 }}
            >
              {title}
            </motion.h1>
          </div>
          <motion.div
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
            className="h-0.5 w-16 bg-accent mt-3 rounded-full"
          />
        </motion.div>
      </section>

      {/* Breadcrumbs */}
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
        className="bg-white border-b border-border px-6 md:px-12 py-2.5 flex items-center gap-2 text-sm"
        aria-label="Breadcrumb"
      >
        <Link href="/" className="text-foreground/75 hover:text-primary transition-colors font-medium uppercase tracking-wide">
          HOME
        </Link>
        <span className="text-foreground/40 font-medium">→</span>
        <span className="text-foreground/80 font-semibold uppercase tracking-wide">{breadcrumb}</span>
      </motion.nav>
    </div>
  );
}
