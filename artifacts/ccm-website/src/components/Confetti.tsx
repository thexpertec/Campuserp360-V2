import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

type Piece = {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotateStart: number;
  rotateEnd: number;
  drift: number;
  size: number;
  color: string;
  shape: "square" | "rect" | "circle";
};

const COLORS = [
  "#03CC0B",
  "#198754",
  "#064A1A",
  "#FFFFFF",
  "#FFD60A",
  "#FF7B54",
  "#22D3EE",
];

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const shapeRoll = Math.random();
    const shape: Piece["shape"] =
      shapeRoll < 0.5 ? "rect" : shapeRoll < 0.85 ? "square" : "circle";
    return {
      id: i,
      x: rand(0, 100),
      delay: rand(0, 0.35),
      duration: rand(2.4, 4.2),
      rotateStart: rand(-180, 180),
      rotateEnd: rand(-720, 720),
      drift: rand(-220, 220),
      size: rand(7, 13),
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#03CC0B",
      shape,
    };
  });
}

type ConfettiProps = {
  /** When this value changes (truthy), confetti fires once. */
  trigger: unknown;
  /** Number of pieces. Default 110. */
  count?: number;
  /** Total visible time in ms before unmount. Default 4500. */
  durationMs?: number;
};

export default function Confetti({ trigger, count = 110, durationMs = 4500 }: ConfettiProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!trigger) return undefined;
    if (reduce) return undefined;
    setActive(true);
    const t = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(t);
  }, [trigger, durationMs, reduce]);

  const pieces = useMemo(() => (active ? makePieces(count) : []), [active, count]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      data-testid="confetti"
    >
      {pieces.map((p) => {
        const radius =
          p.shape === "circle" ? "9999px" : p.shape === "square" ? "2px" : "1.5px";
        const width = p.shape === "rect" ? p.size * 0.55 : p.size;
        const height = p.size;
        return (
          <motion.span
            key={p.id}
            initial={{
              x: 0,
              y: "-10vh",
              rotate: p.rotateStart,
              opacity: 0,
            }}
            animate={{
              x: p.drift,
              y: "110vh",
              rotate: p.rotateEnd,
              opacity: [0, 1, 1, 1, 0.85, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: [0.15, 0.85, 0.35, 1],
              times: [0, 0.05, 0.4, 0.7, 0.9, 1],
            }}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: 0,
              width,
              height,
              backgroundColor: p.color,
              borderRadius: radius,
              boxShadow: `0 0 6px ${p.color}55`,
              willChange: "transform, opacity",
            }}
          />
        );
      })}
    </div>
  );
}
