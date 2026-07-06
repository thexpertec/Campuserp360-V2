import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setDefaultHeaders } from "@workspace/api-client-react";
import { getTenantOverride } from "@/lib/tenant-fetch";
import App from "./App";
import "./index.css";

const tenantSlug = getTenantOverride();
if (tenantSlug) {
  setDefaultHeaders({ "x-tenant-slug": tenantSlug });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
