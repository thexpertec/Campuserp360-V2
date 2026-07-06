import { createContext } from "react";
import type { ServerModule } from "@/lib/module-visibility";

/**
 * State carried by ModulesProvider.
 * - `loading`: true while the first fetch is in-flight (including pre-login)
 * - `modules`: empty until the first successful fetch
 *
 * Route gates (gated()) must check `loading` and block access until the
 * server-authoritative list arrives. This ensures gating is fail-closed:
 * protected routes are never allowed through on an empty context.
 */
export type ModulesState = {
  modules: ServerModule[];
  loading: boolean;
};

export const ModulesContext = createContext<ModulesState>({
  modules: [],
  loading: true,
});
