import { withTenant } from "@/lib/tenant-fetch";

/**
 * Whether the visitor has asked not to be tracked (Do-Not-Track / Global
 * Privacy Control). We honor it by skipping the beacon entirely.
 */
function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const dnt =
    (navigator as Navigator & { doNotTrack?: string }).doNotTrack ??
    (window as Window & { doNotTrack?: string }).doNotTrack;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return dnt === "1" || dnt === "yes" || gpc === true;
}

/**
 * Fire-and-forget page-view beacon to the self-contained visitor analytics
 * endpoint. Never throws and never blocks the page; respects Do-Not-Track.
 */
export function trackPageView(path: string): void {
  try {
    if (typeof window === "undefined") return;
    if (doNotTrack()) return;

    const payload = JSON.stringify({
      path,
      referrer: document.referrer || "",
    });
    const url = withTenant("/api/website/track");

    // Prefer fetch with keepalive so the request survives navigation; fall back
    // to sendBeacon where fetch keepalive is unavailable.
    if (typeof fetch === "function") {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    }
  } catch {
    /* tracking must never affect the page */
  }
}
