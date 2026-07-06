const TOKEN_KEY = "ccm_admin_token";

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrintSettings = {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  pageSize: "A4" | "A5" | "Letter";
  orientation: "portrait" | "landscape";
  bgImageUrl: string | null;
  instituteName: string;
  showInstituteName: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  marginTop: 20,
  marginRight: 15,
  marginBottom: 20,
  marginLeft: 15,
  pageSize: "A4",
  orientation: "portrait",
  bgImageUrl: null,
  instituteName: "",
  showInstituteName: true,
};

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchPrintSettings(): Promise<PrintSettings> {
  try {
    const res = await fetch(`/api/admin/print-settings`, {
      headers: authHeaders() as HeadersInit,
    });
    if (!res.ok) return { ...DEFAULT_PRINT_SETTINGS };
    return res.json();
  } catch {
    return { ...DEFAULT_PRINT_SETTINGS };
  }
}

export async function savePrintLayout(
  layout: Omit<PrintSettings, "bgImageUrl" | "instituteName">,
): Promise<void> {
  await fetch(`/api/admin/print-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(authHeaders() as Record<string, string>) },
    body: JSON.stringify(layout),
  });
}

export async function uploadPrintBg(dataUrl: string, ext: string): Promise<string> {
  const res = await fetch(`/api/admin/print-settings/bg`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authHeaders() as Record<string, string>) },
    body: JSON.stringify({ dataUrl, ext }),
  });
  if (!res.ok) throw new Error("Upload failed");
  const { url } = await res.json() as { url: string };
  return url;
}

export async function deletePrintBg(): Promise<void> {
  await fetch(`/api/admin/print-settings/bg`, {
    method: "DELETE",
    headers: authHeaders() as HeadersInit,
  });
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Shared print window helper ────────────────────────────────────────────────
// A single mechanism for opening a print window. The document is served from a
// Blob URL and opened with `noopener`, which puts it in a *separate renderer
// process*: when the modal print dialog opens, only the print window's own
// process blocks — the main app stays fully responsive and never has to "catch
// up" after the dialog closes.
//
// Because a `noopener` window returns no reference, popup-blocked detection and
// Blob URL cleanup work via a BroadcastChannel handshake: the opened document
// posts an "opened" message; if none arrives within a short timeout we assume
// the popup was blocked. Blob URLs are revoked as soon as the window has loaded
// (or on failure), so large bulk documents don't accumulate in memory.
//
// Print itself is still triggered from *inside* the opened window's own context
// after the document and all its images (letterhead background, signatures,
// stamps) have finished loading, so pages never print half-rendered.

const PRINT_CHANNEL = "ccm-print-window";
const POPUP_BLOCK_TIMEOUT_MS = 3000;

function newPrintJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const PRINT_BOOTSTRAP = `<script>
(function(){
  var printed = false;
  function doPrint(){
    if (printed) return; printed = true;
    try { window.focus(); } catch (e) {}
    try { window.print(); } catch (e) {}
  }
  window.onafterprint = function(){ try { window.close(); } catch (e) {} };
  function whenImagesReady(cb){
    var imgs = Array.prototype.slice.call(document.images || []);
    var pending = imgs.filter(function(i){ return !i.complete; });
    if (pending.length === 0) { cb(); return; }
    var remaining = pending.length, done = false;
    function finish(){ if (done) return; done = true; cb(); }
    function one(){ remaining -= 1; if (remaining <= 0) finish(); }
    pending.forEach(function(i){
      i.addEventListener('load', one);
      i.addEventListener('error', one);
    });
    setTimeout(finish, 7000);
  }
  function start(){ whenImagesReady(doPrint); }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
<\/script>`;

function injectPrintBootstrap(html: string): string {
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${PRINT_BOOTSTRAP}</body>`)
    : html + PRINT_BOOTSTRAP;
}

/** Handshake script — placed in <head> so it runs before the (possibly huge) body parses. */
function handshakeScript(jobId: string): string {
  return `<script>
try {
  var __pbc = new BroadcastChannel(${JSON.stringify(PRINT_CHANNEL)});
  __pbc.postMessage({ type: "opened", jobId: ${JSON.stringify(jobId)} });
  __pbc.close();
} catch (e) {}
<\/script>`;
}

function injectIntoHead(html: string, script: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + script);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + script);
  return script + html;
}

function withNoopener(features?: string): string {
  return features ? `noopener,noreferrer,${features}` : "noopener,noreferrer";
}

function reportPopupBlocked(onPopupBlocked?: () => void): void {
  if (onPopupBlocked) onPopupBlocked();
  else alert("Please allow pop-ups for this site to print the document.");
}

/** Open final HTML in a process-isolated window via a Blob URL + noopener. */
function openIsolatedHtml(
  html: string,
  opts?: { onPopupBlocked?: () => void; features?: string },
): void {
  const jobId = newPrintJobId();
  const finalHtml = injectIntoHead(html, handshakeScript(jobId));
  const url = URL.createObjectURL(new Blob([finalHtml], { type: "text/html" }));
  const channel = new BroadcastChannel(PRINT_CHANNEL);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) clearTimeout(timer);
    channel.close();
    URL.revokeObjectURL(url);
  };
  channel.onmessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; jobId?: string } | null;
    if (d && d.type === "opened" && d.jobId === jobId) settle();
  };
  window.open(url, "_blank", withNoopener(opts?.features));
  timer = setTimeout(() => {
    if (!settled) {
      settle();
      reportPopupBlocked(opts?.onPopupBlocked);
    }
  }, POPUP_BLOCK_TIMEOUT_MS);
}

/**
 * Two-phase print flow. Opens a small "Preparing document…" loader window
 * *synchronously* (so it survives popup blockers even when the real content is
 * fetched afterwards), then delivers the final HTML to it over a
 * BroadcastChannel. The loader window is process-isolated (Blob URL +
 * noopener), so printing never blocks the main app.
 *
 * Call `openPrintWindow()` synchronously inside the click handler, then either
 * `handle.print(html)` once the content is ready or `handle.close()` on failure.
 */
export type PrintWindowHandle = {
  print(html: string, opts?: { autoPrint?: boolean }): void;
  close(): void;
};

function buildLoaderHtml(jobId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Preparing document…</title>
<script>
(function(){
  var id = ${JSON.stringify(jobId)};
  var bc = new BroadcastChannel(${JSON.stringify(PRINT_CHANNEL)});
  bc.onmessage = function(e){
    var d = e.data;
    if (!d || d.jobId !== id) return;
    if (d.type === "content") {
      bc.postMessage({ type: "received", jobId: id });
      bc.close();
      document.open();
      document.write(d.html);
      document.close();
    } else if (d.type === "close") {
      bc.close();
      try { window.close(); } catch (err) {}
    }
  };
  bc.postMessage({ type: "opened", jobId: id });
})();
<\/script>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; color: #475569; }
</style>
</head>
<body><p>Preparing document…</p></body>
</html>`;
}

export function openPrintWindow(
  opts?: { onPopupBlocked?: () => void; features?: string },
): PrintWindowHandle {
  const jobId = newPrintJobId();
  const channel = new BroadcastChannel(PRINT_CHANNEL);
  const loaderUrl = URL.createObjectURL(new Blob([buildLoaderHtml(jobId)], { type: "text/html" }));

  let opened = false;
  let finished = false;
  let closeRequested = false;
  let pendingHtml: string | null = null;
  let blockTimer: ReturnType<typeof setTimeout> | undefined;
  let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (blockTimer !== undefined) clearTimeout(blockTimer);
    if (lifetimeTimer !== undefined) clearTimeout(lifetimeTimer);
    channel.close();
    URL.revokeObjectURL(loaderUrl);
  };

  channel.onmessage = (e: MessageEvent) => {
    const d = e.data as { type?: string; jobId?: string } | null;
    if (!d || d.jobId !== jobId) return;
    if (d.type === "opened") {
      opened = true;
      if (blockTimer !== undefined) clearTimeout(blockTimer);
      URL.revokeObjectURL(loaderUrl);
      if (closeRequested) {
        channel.postMessage({ type: "close", jobId });
        finish();
        return;
      }
      if (pendingHtml !== null) {
        channel.postMessage({ type: "content", jobId, html: pendingHtml });
        pendingHtml = null;
      }
    } else if (d.type === "received") {
      finish();
    }
  };

  window.open(loaderUrl, "_blank", withNoopener(opts?.features));

  blockTimer = setTimeout(() => {
    if (!opened && !finished) {
      finish();
      reportPopupBlocked(opts?.onPopupBlocked);
    }
  }, POPUP_BLOCK_TIMEOUT_MS);

  // Safety net: never keep the channel/Blob URL alive forever.
  lifetimeTimer = setTimeout(finish, 5 * 60 * 1000);

  return {
    print(html: string, o?: { autoPrint?: boolean }) {
      if (finished) return; // blocked or already delivered/closed
      const finalHtml = o?.autoPrint === false ? html : injectPrintBootstrap(html);
      if (opened) channel.postMessage({ type: "content", jobId, html: finalHtml });
      else pendingHtml = finalHtml;
    },
    close() {
      if (finished) return;
      if (opened) {
        channel.postMessage({ type: "close", jobId });
        finish();
      } else {
        closeRequested = true;
        pendingHtml = null;
      }
    },
  };
}

/**
 * Open a new process-isolated window with the given HTML and print it from
 * inside that window's own context. Popup-blocked detection is asynchronous:
 * `onPopupBlocked` (or a fallback alert) fires shortly after if the popup never
 * opened. Never calls `print()` from the parent window and never shares a
 * renderer process with it, so the main app stays responsive.
 */
export function printHtmlDocument(
  html: string,
  opts?: { onPopupBlocked?: () => void; autoPrint?: boolean; features?: string },
): boolean {
  const autoPrint = opts?.autoPrint !== false;
  const finalHtml = autoPrint ? injectPrintBootstrap(html) : html;
  openIsolatedHtml(finalHtml, { onPopupBlocked: opts?.onPopupBlocked, features: opts?.features });
  return true;
}

// ─── Print HTML builder ───────────────────────────────────────────────────────

// `content` is either a single HTML string (one flowing document — tables,
// reports — that may naturally spill onto extra physical pages) or an array
// of per-record HTML strings (one entry = one physical page, e.g. one offer
// letter per applicant). Each array entry gets its own `.page-body` so the
// configured margins are re-applied on every page, not just the first.
export function buildPrintHtml(content: string | string[], settings: PrintSettings, title = ""): string {
  const { marginTop, marginRight, marginBottom, marginLeft, pageSize, orientation, bgImageUrl } = settings;
  const bgAbsoluteUrl = bgImageUrl
    ? bgImageUrl.startsWith("/")
      ? `${window.location.origin}${bgImageUrl}`
      : bgImageUrl
    : null;

  const pages = Array.isArray(content) ? content : [content];
  const titleHtml = title
    ? `<h2 style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;margin:0 0 10px;padding:0;color:#1e293b;text-align:left">${escapeHtml(title)}</h2>`
    : "";
  const pagesHtml = pages
    .map((pageContent, i) => {
      const breakStyle = i < pages.length - 1 ? ' style="page-break-after:always;page-break-inside:avoid"' : "";
      return `<div class="page"${breakStyle}><div class="page-body">${i === 0 ? titleHtml : ""}${pageContent}</div></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* Page margin is intentionally 0 — Chrome's print renderer clips ANY
       content (including position:fixed elements) to the @page margin box,
       so a non-zero @page margin makes true edge-to-edge backgrounds
       impossible no matter how the background element itself is
       positioned. Margins are instead applied per-page via .page-body
       padding below, so each printed page keeps the configured margins. */
    @page {
      size: ${pageSize} ${orientation};
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { font-size: 2em;   font-weight: bold; margin: 0.4em 0; }
    h2 { font-size: 1.5em; font-weight: bold; margin: 0.4em 0; }
    h3 { font-size: 1.2em; font-weight: bold; margin: 0.4em 0; }
    p  { margin: 0.35em 0; }
    ul { list-style: disc;    padding-left: 1.5em; }
    ol { list-style: decimal; padding-left: 1.5em; }
    blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #555; margin: 0.5em 0; }
    a  { color: #1a56db; }
    table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
    th, td { border: 1px solid #ccc; padding: 5px 8px; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; text-align: left; }
    /* Fixed (not absolute) so the watermark repeats on every physical page —
       with @page margin:0 above, "fixed" is scoped to the true page box, so
       this now reaches every edge instead of the old margin-shrunk box. */
    .page-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.12; z-index: -1; pointer-events: none; }
    .page { position: relative; }
    .page-body { position: relative; padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; }
    img:not(.page-bg) { max-width: 100%; height: auto; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>${bgAbsoluteUrl ? `<img class="page-bg" src="${bgAbsoluteUrl}" alt="" />` : ""}${pagesHtml}</body>
</html>`;
}
