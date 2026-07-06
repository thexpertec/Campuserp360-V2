// Shared print-window helper for the candidate portal.
//
// Opens ready-to-print HTML in a *process-isolated* window: the document is
// served from a Blob URL and opened with `noopener`, so the browser puts it in
// a separate renderer process. When the modal print dialog opens, only that
// window's own process blocks — the main app stays fully responsive and never
// has to "catch up" after the dialog closes.
//
// Because a `noopener` window returns no reference, popup-blocked detection and
// Blob URL cleanup work via a BroadcastChannel handshake: the opened document
// posts an "opened" message; if none arrives within a short timeout we assume
// the popup was blocked. The Blob URL is revoked as soon as the window has
// loaded (or on failure).
//
// Print itself is triggered from *inside* the opened window's own context,
// after the document and all its images have finished loading, so pages never
// print half-rendered.

const PRINT_CHANNEL = "ccm-print-window";
const POPUP_BLOCK_TIMEOUT_MS = 3000;

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

/**
 * Open a new process-isolated window with the given HTML and print it from
 * inside that window's own context. Popup-blocked detection is asynchronous:
 * an alert is shown shortly after if the popup never opened. Never calls
 * print() from the parent window and never shares a renderer process with it,
 * so the app stays responsive while the print dialog is open.
 */
export function openPrintWindow(
  html: string,
  opts?: { autoPrint?: boolean; features?: string },
): boolean {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const autoPrint = opts?.autoPrint !== false;
  const withBootstrap = autoPrint ? injectPrintBootstrap(html) : html;
  const finalHtml = injectIntoHead(withBootstrap, handshakeScript(jobId));

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

  const features = opts?.features ? `noopener,noreferrer,${opts.features}` : "noopener,noreferrer";
  window.open(url, "_blank", features);

  timer = setTimeout(() => {
    if (!settled) {
      settle();
      alert("Please allow pop-ups for this site to print/save the document as PDF.");
    }
  }, POPUP_BLOCK_TIMEOUT_MS);

  return true;
}
