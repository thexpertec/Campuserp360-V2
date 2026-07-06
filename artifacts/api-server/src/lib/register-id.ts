import { sql, eq, and } from "drizzle-orm";
import { studentsTable, admissionsSettingsTable, db } from "@workspace/db";

export type DbClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GrFormat = {
  prefix: string;
  separator: string;
  includeYear: boolean;
  padding: number;
};

export class RegisterIdError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RegisterIdError";
  }
}

export async function loadGrFormat(
  client: DbClient,
  tenantId: string,
): Promise<GrFormat | null> {
  const [fmtRow] = await client
    .select({ value: admissionsSettingsTable.value })
    .from(admissionsSettingsTable)
    .where(eq(admissionsSettingsTable.key, `gr_format:${tenantId}`))
    .limit(1);

  if (!fmtRow) return null;

  let dbFmt: Record<string, unknown> = {};
  try {
    dbFmt = JSON.parse(fmtRow.value) as Record<string, unknown>;
  } catch {
    dbFmt = {};
  }

  return {
    prefix:
      typeof dbFmt.prefix === "string" && dbFmt.prefix.trim()
        ? dbFmt.prefix.trim()
        : "GR",
    separator: typeof dbFmt.separator === "string" ? dbFmt.separator : "-",
    includeYear: dbFmt.includeYear !== false,
    padding: dbFmt.paddingDigits
      ? parseInt(String(dbFmt.paddingDigits), 10) || 3
      : 3,
  };
}

function buildRegisterId(fmt: GrFormat, seq: number, year: number): string {
  const parts = [fmt.prefix];
  if (fmt.includeYear) parts.push(String(year));
  parts.push(String(seq).padStart(fmt.padding, "0"));
  return parts.join(fmt.separator);
}

async function maxSequenceForFormat(
  client: DbClient,
  tenantId: string,
  fmt: GrFormat,
  year: number,
): Promise<number> {
  const seqPosition = fmt.includeYear ? 3 : 2;
  const likePattern = fmt.includeYear
    ? `${fmt.prefix}${fmt.separator}${year}${fmt.separator}%`
    : `${fmt.prefix}${fmt.separator}%`;

  const [row] = await client
    .select({
      maxSeq: sql<number | null>`COALESCE(MAX(CAST(SPLIT_PART(${studentsTable.applicantId}, ${fmt.separator}, ${seqPosition}) AS INTEGER)), 0)`,
    })
    .from(studentsTable)
    .where(
      and(
        sql`${studentsTable.applicantId} LIKE ${likePattern}`,
        eq(studentsTable.tenantId, tenantId),
      ),
    );

  return Number(row?.maxSeq ?? 0);
}

/**
 * Preview the next N register IDs without locking. Safe for UI display only.
 */
export async function peekNextRegisterIds(
  client: DbClient,
  tenantId: string,
  count: number,
  formatOverride?: Partial<GrFormat>,
): Promise<{ applicantIds: string[]; nextSequence: number }> {
  const fmt = await loadGrFormat(client, tenantId);
  if (!fmt) {
    throw new RegisterIdError(
      "GR_FORMAT_NOT_CONFIGURED",
      "Register ID format is not configured for this tenant. Go to Settings → ID Format and set a prefix before generating Register IDs.",
    );
  }

  const merged: GrFormat = { ...fmt, ...formatOverride };
  const year = new Date().getFullYear();
  let seq = (await maxSequenceForFormat(client, tenantId, merged, year)) + 1;

  const applicantIds: string[] = [];
  let firstSeq: number | null = null;
  let attempt = 0;
  const maxAttempts = count * 10 + 200;

  while (applicantIds.length < count && attempt < maxAttempts) {
    attempt += 1;
    const candidate = buildRegisterId(merged, seq, year);
    const [existing] = await client
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(
        and(
          eq(studentsTable.applicantId, candidate),
          eq(studentsTable.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      if (firstSeq === null) firstSeq = seq;
      applicantIds.push(candidate);
    }
    seq += 1;
  }

  if (applicantIds.length < count) {
    throw new RegisterIdError(
      "ALLOCATION_FAILED",
      `Could not find ${count} available Register ID(s). Please check existing Register IDs.`,
    );
  }

  return { applicantIds, nextSequence: firstSeq ?? seq };
}

/**
 * Atomically reserve the next N register IDs inside an open transaction.
 * Uses a per-tenant advisory lock to prevent duplicate IDs under concurrency.
 */
export async function allocateRegisterIds(
  client: DbClient,
  tenantId: string,
  count: number,
): Promise<string[]> {
  await client.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`);
  const { applicantIds } = await peekNextRegisterIds(client, tenantId, count);
  return applicantIds;
}
