// Shared print/download helpers for the candidate portal.
//
// The built-in (hard-coded) offer letter that used to live here was removed:
// it baked one college's bank account, signatory, contact numbers and name into
// the code, which leaked across colleges. Each college must now configure its
// own offer-letter template; the portal renders/prints only from that template.

import { openPrintWindow } from "@/lib/print-window";

export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open the printable HTML in a new window and trigger the browser print dialog.
 * Users can then choose "Save as PDF" as the destination.
 *
 * Printing is triggered from inside the opened window's own context (never from the
 * parent window) after the document and its images finish loading, so the main app
 * stays responsive. See `@/lib/print-window`.
 */
export function printHtml(html: string) {
  openPrintWindow(html, { features: "width=900,height=1100" });
}
