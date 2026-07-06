import { db } from "@workspace/db";
import { admissionsSettingsTable, printSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveUrl } from "./storage";

export const PRINT_DEFAULTS = {
  marginTop: 20,
  marginRight: 15,
  marginBottom: 20,
  marginLeft: 15,
  pageSize: "A4",
  orientation: "portrait",
  bgImageUrl: null as string | null,
  showInstituteName: true,
};

export type PrintSettingsValues = {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  pageSize: string;
  orientation: string;
  bgImagePath?: string | null;
  showInstituteName: boolean;
};

function tenantPrintKey(tenantId: string): string {
  return `print_settings:${tenantId}`;
}

export function tenantPrintBgKey(tenantId: string): string {
  return `print/${tenantId}/bg.webp`;
}

async function loadGlobalPrintSettings(): Promise<PrintSettingsValues | null> {
  const [row] = await db.select().from(printSettingsTable).where(eq(printSettingsTable.id, 1));
  if (!row) return null;
  return {
    marginTop: row.marginTop,
    marginRight: row.marginRight,
    marginBottom: row.marginBottom,
    marginLeft: row.marginLeft,
    pageSize: row.pageSize,
    orientation: row.orientation,
    bgImagePath: row.bgImagePath,
    showInstituteName: row.showInstituteName,
  };
}

async function loadTenantPrintSettings(tenantId: string): Promise<PrintSettingsValues | null> {
  const [row] = await db
    .select({ value: admissionsSettingsTable.value })
    .from(admissionsSettingsTable)
    .where(eq(admissionsSettingsTable.key, tenantPrintKey(tenantId)));
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as PrintSettingsValues;
  } catch {
    return null;
  }
}

export async function loadPrintSettings(tenantId?: string): Promise<PrintSettingsValues> {
  if (tenantId) {
    const tenantRow = await loadTenantPrintSettings(tenantId);
    if (tenantRow) return tenantRow;
  }
  const global = await loadGlobalPrintSettings();
  return global ?? { ...PRINT_DEFAULTS, bgImagePath: null };
}

export async function savePrintSettings(
  tenantId: string | undefined,
  vals: Partial<PrintSettingsValues>,
): Promise<void> {
  if (!tenantId) {
    await db
      .insert(printSettingsTable)
      .values({ id: 1, ...vals })
      .onConflictDoUpdate({ target: printSettingsTable.id, set: vals });
    return;
  }

  const current = await loadPrintSettings(tenantId);
  const next = { ...current, ...vals };
  await db
    .insert(admissionsSettingsTable)
    .values({ key: tenantPrintKey(tenantId), value: JSON.stringify(next) })
    .onConflictDoUpdate({
      target: admissionsSettingsTable.key,
      set: { value: JSON.stringify(next), updatedAt: new Date() },
    });
}

export function toPrintSettingsResponse(
  row: PrintSettingsValues,
  instituteName = "",
) {
  return {
    marginTop: row.marginTop,
    marginRight: row.marginRight,
    marginBottom: row.marginBottom,
    marginLeft: row.marginLeft,
    pageSize: row.pageSize,
    orientation: row.orientation,
    bgImageUrl: resolveUrl(row.bgImagePath ?? null) ?? null,
    showInstituteName: row.showInstituteName,
    instituteName,
  };
}
