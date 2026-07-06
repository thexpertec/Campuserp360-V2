import { useEffect, useSyncExternalStore } from "react";

// ─── First-paint boot gate (flash-of-wrong-tenant prevention) ─────────────────
// Theme COLOURS resolve synchronously from the URL (see site-settings.tsx), but
// tenant CONTENT — the logo, hero title and section copy — only arrives after the
// async settings + page-blocks fetches. On a cold first visit (empty cache) or in
// a preview session (caches are deliberately suppressed), React would paint the
// hardcoded CCM fallbacks ("|| Cadet College Murree", DEFAULTS, /logo.png) for a
// few hundred ms before the real tenant data lands — the "flash of CCM then GCCM"
// users keep reporting.
//
// This gate holds the first paint behind a neutral, theme-coloured splash until
// the branding-critical resources have resolved, so no tenant ever paints CCM's
// fallback content before its own data is ready.
//
// "Booted" is true once BOTH hold:
//   1. site settings have resolved (markSettingsReady), AND
//   2. every gated fetch registered for the first paint has settled (pending === 0).
// Page-blocks are the gated fetch — they carry the hero title / headings whose
// hardcoded fallback is CCM's name. We gate on them too (not just settings)
// because the small settings payload routinely returns before the larger
// page-blocks payload, so a settings-only gate would still flash.
//
// CRITICAL TIMING — why registration is synchronous (render-phase), not in an
// effect: warm settings call markSettingsReady() at module load, which is BEFORE
// React's first render. If gated fetches only registered in a useEffect (after
// paint), there would be a window where settingsReady=true and pending=0 simply
// because no gated fetch has registered yet — the gate would open and paint the
// CCM fallback before page-blocks ever started. This happens for real whenever
// settings are cached but page-blocks are NOT (e.g. the last visit was to a
// non-home page, or partial cache eviction). So gated resources call
// beginGatedFetch() synchronously during render (see tenant-cache.ts), before
// BootSplash reads the gate.
//
// To avoid re-showing the splash on client-side navigation to a page whose
// content is cold, the gate LATCHES OPEN permanently the first time it is booted
// AFTER the first render has committed (finalizeFirstRender). The latch is
// deliberately NOT applied during the pre-first-render transient (warm settings,
// pending still 0 only because nothing has registered yet) — that transient must
// not be mistaken for a genuine boot.

let settingsReady = false;
let pending = 0;
let firstRenderDone = false;
let locked = false;
const listeners = new Set<() => void>();

function computeBooted(): boolean {
  return locked || (settingsReady && pending <= 0);
}

// Cached so useSyncExternalStore's getSnapshot returns a stable value between
// genuine changes; only update() ever mutates it.
let snapshot = computeBooted();

// Tracks ONLY whether settings actually resolved (markSettingsReady). Unlike
// `snapshot`/booted, the safety-net timeout never flips this true — so a CCM-only
// branding fallback (the bundled logo.png) stays withheld on other tenants even
// when the gate fails open on a slow or dead network. See useSettingsResolved.
let settingsResolvedSnapshot = settingsReady;

function emit(): void {
  for (const l of listeners) l();
}

function update(): void {
  // Latch the gate open the first time we are genuinely booted — but only once
  // the first render has committed, so all first-paint gated registrations have
  // run. This prevents the pre-render transient (warm settings, pending 0) from
  // locking the gate before page-blocks have had a chance to register.
  if (!locked && firstRenderDone && settingsReady && pending <= 0) {
    locked = true;
  }
  let changed = false;
  const next = computeBooted();
  if (next !== snapshot) {
    snapshot = next;
    changed = true;
  }
  // settings-resolved is its own observable signal; it only ever flips once, via
  // markSettingsReady — never via the safety net (which mutates snapshot directly).
  if (settingsReady !== settingsResolvedSnapshot) {
    settingsResolvedSnapshot = settingsReady;
    changed = true;
  }
  if (changed) emit();
}

/** Called once site settings have resolved (from cache synchronously, or fetch). */
export function markSettingsReady(): void {
  if (settingsReady) return;
  settingsReady = true;
  update();
}

/**
 * A branding-critical (gated) fetch has started. MUST be called synchronously
 * during render (not in an effect) so the gate is closed before the first paint.
 * No-ops once the gate is latched open, so client-side navigation to a cold page
 * never re-shows the splash.
 */
export function beginGatedFetch(): void {
  if (locked) return;
  pending += 1;
  update();
}

/** A branding-critical (gated) fetch has settled (success, error, or unmount). */
export function endGatedFetch(): void {
  if (locked) return;
  pending -= 1;
  update();
}

/**
 * Signals that the provider's first render has committed, so every first-paint
 * gated resource has already registered. Only after this may the gate latch open
 * permanently. Idempotent.
 */
export function finalizeFirstRender(): void {
  if (firstRenderDone) return;
  firstRenderDone = true;
  update();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return snapshot;
}

function getSettingsResolvedSnapshot(): boolean {
  return settingsResolvedSnapshot;
}

// Safety net: never let the splash stick if a fetch hangs or the network is down
// and readiness can never resolve. After this deadline we force the gate open so
// the splash lifts. This deliberately does NOT mark settings resolved — the
// reveal is tenant-neutral (logo/name fallbacks gated on useSettingsResolved stay
// withheld), so a slow boot never flashes CCM branding on another tenant. The
// window is generous (10s) because the deduped + server-cached critical path
// almost always resolves first; the timeout only matters when the API is down.
if (typeof window !== "undefined") {
  window.setTimeout(() => {
    if (!locked) {
      locked = true;
      if (!snapshot) {
        snapshot = true;
        emit();
      }
    }
  }, 10000);
}

/** True once the branding-critical resources have resolved (or the safety net fired). */
export function useBooted(): boolean {
  // Server snapshot is `true` so non-browser renders never gate (there is no SSR
  // here, but this keeps useSyncExternalStore well-behaved).
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/**
 * True ONLY once site settings have actually resolved (markSettingsReady) — never
 * merely because the boot gate's safety net fired. Use this (not useBooted) to
 * decide when to reveal a CCM-specific branding fallback such as the bundled
 * logo.png, so a slow or failed settings fetch that trips the safety net never
 * flashes CCM's emblem on another tenant.
 */
export function useSettingsResolved(): boolean {
  return useSyncExternalStore(subscribe, getSettingsResolvedSnapshot, () => true);
}

/** Convenience hook for the provider to mark its first render committed. */
export function useFinalizeFirstRender(): void {
  useEffect(() => {
    finalizeFirstRender();
  }, []);
}
