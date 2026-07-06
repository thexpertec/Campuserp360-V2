import { useState, useEffect, useContext } from "react";
import {
  loadModuleVisibility,
  VISIBILITY_CHANGE_EVENT,
  serverModulesToHiddenNavNames,
  type ModuleVisibilityConfig,
} from "@/lib/module-visibility";
import { ModulesContext } from "@/lib/modules-context";

/**
 * Returns the combined module visibility config:
 * - hiddenModules: server-authoritative — derived from the server module list
 *   once loaded. Never falls back to localStorage for module-level visibility
 *   (fail-closed: shows nothing hidden while loading, blocks when fetch fails).
 * - hiddenTabs:    from localStorage (per-user tab visibility prefs, low-stakes)
 */
export function useModuleVisibility(): ModuleVisibilityConfig {
  const { modules: serverModules, loading } = useContext(ModulesContext);
  const [localConfig, setLocalConfig] = useState<ModuleVisibilityConfig>(loadModuleVisibility);

  useEffect(() => {
    const refresh = () => setLocalConfig(loadModuleVisibility());
    window.addEventListener(VISIBILITY_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(VISIBILITY_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // While loading: hide nothing (nav renders normally; gated() handles route-level blocking).
  // After load: use server-authoritative hidden list exclusively. No localStorage fallback
  // for module-level visibility — server is the source of truth.
  const hiddenModules = loading ? [] : serverModulesToHiddenNavNames(serverModules);

  return {
    hiddenModules,
    hiddenTabs: localConfig.hiddenTabs,
  };
}
