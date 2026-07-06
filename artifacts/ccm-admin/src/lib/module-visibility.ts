/**
 * Module visibility — server-backed.
 *
 * The module list is fetched from /api/admin/tenant/modules on app load and
 * stored in a React context. This file provides the types and the mapping
 * from server module keys to the NAV names used by the sidebar.
 *
 * The legacy localStorage keys are kept so the Settings > Modules tab still
 * works for tab-level visibility (sub-tab hiding within a module). Module-level
 * visibility is now server-controlled only.
 */

export const VISIBILITY_KEY = "ccm_module_visibility";
export const VISIBILITY_CHANGE_EVENT = "ccm-module-visibility-changed";

export type ModuleVisibilityConfig = {
  hiddenModules: string[];
  hiddenTabs: Record<string, string[]>;
};

export function loadModuleVisibility(): ModuleVisibilityConfig {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY);
    if (raw) return JSON.parse(raw) as ModuleVisibilityConfig;
  } catch {}
  return { hiddenModules: [], hiddenTabs: {} };
}

export function saveModuleVisibility(config: ModuleVisibilityConfig): void {
  localStorage.setItem(VISIBILITY_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(VISIBILITY_CHANGE_EVENT));
}

/**
 * Maps a server module key to the NAV `name` strings that belong to it.
 * If a module key is disabled, all listed nav names are hidden.
 */
export const MODULE_KEY_TO_NAV_NAMES: Record<string, string[]> = {
  admissions:    ["Admissions"],
  academics:     ["Academic Setup", "Timetable", "Syllabus", "Students"],
  exams:         ["Exams & Results"],
  fees:          ["Finance"],
  finance:       ["Finance"],
  hr:            ["HRM"],
  payroll:       ["HRM"],
  hostel:        ["Hostel"],
  inventory:     ["Inventory"],
  website:       ["Website", "Media Library"],
  batch_print:   ["Printing"],
  communication: ["Communication"],
  transport:     ["Transport"],
  library:       ["Library"],
  health:        ["Sick Bay"],
  sports:        ["Sports"],
  gate_security: ["Gate Security"],
  events:        ["Events"],
  approvals:     ["Approvals"],
};

export type ServerModule = {
  key: string;
  label: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

/**
 * Convert the server module list into a `hiddenModules` array of NAV names.
 *
 * A nav item is hidden only when ALL module keys that map to it are disabled.
 * This handles shared nav items (e.g. "Finance" covers both `fees` and `finance`;
 * disabling just one doesn't remove the nav entry entirely — only when both
 * are off does the sidebar item disappear).
 *
 * Individual routes are still gated per-key via `gated()` in App.tsx, so a
 * user navigating directly to a disabled route gets the ModuleDisabled page
 * even if the nav item is still visible.
 */
export function serverModulesToHiddenNavNames(modules: ServerModule[]): string[] {
  // Build navName → [all module keys that map to it]
  const navToKeys: Record<string, string[]> = {};
  for (const [key, navNames] of Object.entries(MODULE_KEY_TO_NAV_NAMES)) {
    for (const nav of navNames) {
      if (!navToKeys[nav]) navToKeys[nav] = [];
      navToKeys[nav].push(key);
    }
  }

  const disabledKeys = new Set(
    modules.filter((m) => !m.enabled).map((m) => m.key),
  );

  // Hide a nav name only if every module key that owns it is disabled
  const hidden: string[] = [];
  for (const [navName, keys] of Object.entries(navToKeys)) {
    if (keys.length > 0 && keys.every((k) => disabledKeys.has(k))) {
      hidden.push(navName);
    }
  }
  return hidden;
}
