import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");

    // No anchor requested → behave as before and jump to the top.
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    // Anchor requested (e.g. admin "Preview this section" deep links). Section
    // content can mount/grow after data loads, so retry a few frames until the
    // target exists before giving up.
    let frame = 0;
    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      if (frame < 30) {
        frame += 1;
        requestAnimationFrame(tryScroll);
      }
    };
    requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
    };
  }, [location]);

  return null;
}
