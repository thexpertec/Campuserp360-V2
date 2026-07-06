import { useState, useCallback, useMemo } from "react";
import type { Density } from "./types";

function useLs<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (v: T) => {
      setVal(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
    [key],
  );
  return [val, set];
}

export function useColState(
  tableId: string,
  colDefs: { key: string; defaultVisible?: boolean; defaultWidth?: number }[],
) {
  const defaultKeys = colDefs.map((c) => c.key);
  const defaultVis = Object.fromEntries(
    colDefs.map((c) => [c.key, c.defaultVisible ?? true]),
  );
  const defaultWidths = Object.fromEntries(
    colDefs.map((c) => [c.key, c.defaultWidth ?? 150]),
  );

  const [rawOrder, setRawOrder] = useLs<string[]>(
    `${tableId}:col_order`,
    defaultKeys,
  );
  const [visibility, setVisibility] = useLs<Record<string, boolean>>(
    `${tableId}:col_vis`,
    defaultVis,
  );
  const [widths, setWidths] = useLs<Record<string, number>>(
    `${tableId}:col_widths`,
    defaultWidths,
  );
  const [density, setDensity] = useLs<Density>(
    `${tableId}:density`,
    "comfortable",
  );

  const joinedKeys = defaultKeys.join(",");
  const colOrder = useMemo(() => {
    const valid = new Set(defaultKeys);
    const filtered = rawOrder.filter((k) => valid.has(k));
    const missing = defaultKeys.filter((k) => !filtered.includes(k));
    return [...filtered, ...missing];
  }, [rawOrder, joinedKeys]);

  function resetToDefaults() {
    setRawOrder(defaultKeys);
    setVisibility(defaultVis);
    setWidths(defaultWidths);
    setDensity("comfortable");
  }

  return {
    colOrder,
    setRawOrder,
    visibility,
    setVisibility,
    widths,
    setWidths,
    density,
    setDensity,
    defaultVis,
    defaultWidths,
    resetToDefaults,
  };
}
