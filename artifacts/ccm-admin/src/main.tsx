import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapImpersonation } from "./lib/auth";

// Must run before React renders so the token is in localStorage when
// App.tsx calls initAuth() and checks getToken() on the first render.
bootstrapImpersonation();

// The stale-cache recovery guard in index.html reloads with a "__reload"
// cache-busting query param when the entry bundle fails to load. If the module
// executed we recovered successfully, so strip the param to keep the URL clean.
// (The shared "__ccm_chunk_reload__" flag is cleared by ErrorBoundary on mount.)
if (window.location.search.indexOf("__reload=") !== -1) {
  const url = new URL(window.location.href);
  url.searchParams.delete("__reload");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

createRoot(document.getElementById("root")!).render(<App />);
