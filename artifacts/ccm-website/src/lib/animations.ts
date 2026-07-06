import { useRef } from "react";
import {
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  type MotionValue,
} from "framer-motion";

// ─── Variant presets ─────────────────────────────────────────────────────────

export const springFadeUp = {
  hidden: { opacity: 0, y: 48 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

export const springFadeLeft = {
  hidden: { opacity: 0, x: -56 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

export const springFadeRight = {
  hidden: { opacity: 0, x: 56 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 72, damping: 18 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.82 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 110, damping: 20 },
  },
};

export const clipRevealUp = {
  hidden: { clipPath: "inset(100% 0 0 0)", opacity: 0 },
  visible: {
    clipPath: "inset(0% 0 0 0)",
    opacity: 1,
    transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] as const },
  },
};

export const clipRevealLeft = {
  hidden: { clipPath: "inset(0 100% 0 0)", opacity: 0 },
  visible: {
    clipPath: "inset(0 0% 0 0)",
    opacity: 1,
    transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] as const },
  },
};

export const flipInX = {
  hidden: { opacity: 0, rotateX: -25, y: 20, transformOrigin: "top center" },
  visible: {
    opacity: 1,
    rotateX: 0,
    y: 0,
    transition: { type: "spring" as const, stiffness: 90, damping: 16 },
  },
};

export const staggerContainer = (stagger = 0.1, delayChildren = 0) => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger, delayChildren } },
});

// ─── 3-D tilt hook ───────────────────────────────────────────────────────────

export function use3DTilt(strength = 12) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [strength, -strength]), {
    stiffness: 220,
    damping: 32,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-strength, strength]), {
    stiffness: 220,
    damping: 32,
  });
  const scale = useSpring(1, { stiffness: 220, damping: 32 });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
    scale.set(1.03);
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
    scale.set(1);
  }

  return { ref, rotateX, rotateY, scale, onMouseMove, onMouseLeave };
}

// ─── Parallax hook ───────────────────────────────────────────────────────────

export function useParallax(distance = 60): [React.RefObject<HTMLDivElement>, MotionValue<string>] {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${distance}px`, `${distance}px`]);
  return [ref as React.RefObject<HTMLDivElement>, y];
}

// ─── Magnetic button hook ────────────────────────────────────────────────────

export function useMagnetic(strength = 0.35) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 20 });
  const sy = useSpring(y, { stiffness: 200, damping: 20 });

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * strength);
    y.set((e.clientY - cy) * strength);
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return { x: sx, y: sy, onMouseMove, onMouseLeave };
}
