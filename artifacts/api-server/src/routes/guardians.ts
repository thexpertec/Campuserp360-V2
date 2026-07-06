import { Router, type Request, type Response } from "express";
import { pool, db, guardiansTable, studentsTable, sectionsTable, feeChallansTable } from "@workspace/db";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import { eq, and, or, ilike, asc, desc, count, sum, sql, isNull, isNotNull, inArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";

/** Returns the tenantId from the requesting admin's token, or undefined for super-admins. */
function reqTenantId(req: Request): string | undefined {
  return (req as any).adminUser?.tenantId as string | undefined;
}

async function guardianForTenant(guardianId: string, tenantId: string | undefined) {
  const [guardian] = await db
    .select()
    .from(guardiansTable)
    .where(eq(guardiansTable.id, guardianId));
  if (!guardian) return null;
  if (!tenantId) return guardian;
  if (guardian.tenantId === tenantId) return guardian;
  const [linked] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(and(eq(studentsTable.guardianId, guardianId), eq(studentsTable.tenantId, tenantId)))
    .limit(1);
  return linked ? guardian : null;
}

/** WHERE clause for a student lookup scoped to the requesting admin's tenant. */
function stuByIdScoped(req: Request, studentId: string) {
  const tid = reqTenantId(req);
  return tid
    ? and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tid))
    : eq(studentsTable.id, studentId);
}

const router = Router();

// ── DB bootstrap (idempotent) ─────────────────────────────────────────────────

export async function migrateGuardians(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guardians (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      family_seq  SERIAL      NOT NULL,
      name        TEXT        NOT NULL,
      cnic        TEXT,
      phone       TEXT,
      city        TEXT,
      address     TEXT,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT guardians_cnic_unique UNIQUE (cnic)
    )
  `);
  // Add tenant_id column for direct tenant ownership (idempotent)
  await pool.query(`
    ALTER TABLE guardians
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL
  `);
  // Add email column (idempotent)
  await pool.query(`
    ALTER TABLE guardians
      ADD COLUMN IF NOT EXISTS email TEXT
  `);
  // Only alter students if it already exists (safe on fresh DB)
  await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'students') THEN
        ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function familyId(seq: number): string {
  return `FAM-${String(seq).padStart(4, "0")}`;
}

function serializeGuardian(g: typeof guardiansTable.$inferSelect) {
  return {
    id: g.id,
    familyId: familyId(g.familySeq),
    familySeq: g.familySeq,
    name: g.name,
    cnic: g.cnic ?? null,
    phone: g.phone ?? null,
    email: g.email ?? null,
    city: g.city ?? null,
    address: g.address ?? null,
    notes: g.notes ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  const codes: unknown[] = [];
  let cur: any = err;
  for (let i = 0; i < 4 && cur; i++) { codes.push(cur.code); cur = cur.cause; }
  if (codes.includes("23505")) return true;
  return err instanceof Error && /unique|duplicate/i.test(err.message);
}

// ── List guardians ────────────────────────────────────────────────────────────

router.get("/admin/guardians", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q        = req.query["q"]        ? String(req.query["q"])        : undefined;
    const page     = Math.max(1, Number(req.query["page"])     || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query["pageSize"]) || 20));
    const offset   = (page - 1) * pageSize;
    const sortBy   = typeof req.query["sortBy"]  === "string" ? req.query["sortBy"].trim()  : "";
    const sortDir  = req.query["sortDir"] === "desc" ? "desc" : "asc";
    const sortCsv  = typeof req.query["sort"]    === "string" ? req.query["sort"].trim()    : "";

    const conditions = [];
    if (q) {
      const famMatch = q.match(/^FAM-(\d+)$/i);
      const numMatch = !famMatch && /^\d+$/.test(q.trim());
      const seqNum = famMatch ? parseInt(famMatch[1], 10) : numMatch ? parseInt(q.trim(), 10) : null;
      conditions.push(
        or(
          ilike(guardiansTable.name, `%${q}%`),
          ilike(guardiansTable.cnic, `%${q}%`),
          ilike(guardiansTable.phone, `%${q}%`),
          ilike(guardiansTable.email, `%${q}%`),
          ilike(guardiansTable.city, `%${q}%`),
          ...(seqNum !== null ? [sql`${guardiansTable.familySeq} = ${seqNum}`] : []),
        ),
      );
    }

    // Tenant isolation: non-super-admin can only see guardians that either:
    //   (a) have tenant_id = adminTenantId (created directly in this tenant), OR
    //   (b) have at least one student FK-linked to this guardian in this tenant, OR
    //   (c) have at least one student whose father_name or guardian_name matches this
    //       guardian's name (text fallback, no guardian_id restriction so it catches
    //       students whose guardian_id points to a different record but whose name text
    //       still matches).
    // Super-admins (tenantId === undefined) see all guardians across the system.
    const adminTenantId = reqTenantId(req);
    if (adminTenantId) {
      conditions.push(
        or(
          eq(guardiansTable.tenantId, adminTenantId),
          sql`EXISTS (
            SELECT 1 FROM students s
            WHERE s.guardian_id = ${guardiansTable.id}
              AND s.tenant_id = ${adminTenantId}
          )`,
          sql`EXISTS (
            SELECT 1 FROM students s
            WHERE (LOWER(s.father_name) = LOWER(${guardiansTable.name}) OR LOWER(s.guardian_name) = LOWER(${guardiansTable.name}))
              AND s.tenant_id = ${adminTenantId}
          )`,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ count: count() })
      .from(guardiansTable)
      .where(where);

    // Scalar subquery used ONLY for ORDER BY child-count sorting.
    // Uses sql.raw() for outer-table column references so the correlated reference
    // is emitted as a SQL identifier (not a bound parameter), which Drizzle's
    // sql`` template otherwise gets wrong for SELECT-list subqueries.
    const GID  = sql.raw('"guardians"."id"');
    const GNAM = sql.raw('"guardians"."name"');
    const childCountForSort = adminTenantId
      ? sql<number>`(
          SELECT COUNT(*)::int
          FROM students s
          WHERE (
            s.guardian_id = ${GID}
            OR LOWER(s.father_name)   = LOWER(${GNAM})
            OR LOWER(s.guardian_name) = LOWER(${GNAM})
          )
            AND (s.tenant_id = ${adminTenantId} OR s.tenant_id IS NULL)
        )`
      : sql<number>`(
          SELECT COUNT(*)::int
          FROM students s
          WHERE s.guardian_id = ${GID}
            OR LOWER(s.father_name)   = LOWER(${GNAM})
            OR LOWER(s.guardian_name) = LOWER(${GNAM})
        )`;

    function colClauses(key: string, dir: "asc" | "desc"): SQL[] {
      const dirFrag = sql.raw(dir === "desc" ? "DESC" : "ASC");
      switch (key) {
        case "familyId":    return [sql`${guardiansTable.familySeq} ${dirFrag}`];
        case "name":        return [sql`${guardiansTable.name} ${dirFrag}`];
        case "cnic":        return [sql`${guardiansTable.cnic} ${dirFrag}`];
        case "phone":       return [sql`${guardiansTable.phone} ${dirFrag}`];
        case "city":        return [sql`${guardiansTable.city} ${dirFrag}`];
        case "childCount":  return [sql`${childCountForSort} ${dirFrag}`];
        case "createdAt":   return [sql`${guardiansTable.createdAt} ${dirFrag}`];
        default:            return [];
      }
    }

    let orderClauses: SQL[] = [];
    if (sortCsv) {
      orderClauses = sortCsv.split(",").flatMap(s => {
        const [k, d] = s.trim().split(":");
        return colClauses(k?.trim() ?? "", d === "desc" ? "desc" : "asc");
      });
    } else if (sortBy) {
      orderClauses = colClauses(sortBy, sortDir);
    }
    if (!orderClauses.length) orderClauses = [sql`${guardiansTable.id} DESC`];

    const rows = await db
      .select({
        id: guardiansTable.id,
        familySeq: guardiansTable.familySeq,
        name: guardiansTable.name,
        cnic: guardiansTable.cnic,
        phone: guardiansTable.phone,
        email: guardiansTable.email,
        city: guardiansTable.city,
        address: guardiansTable.address,
        notes: guardiansTable.notes,
        tenantId: guardiansTable.tenantId,
        createdAt: guardiansTable.createdAt,
        updatedAt: guardiansTable.updatedAt,
      })
      .from(guardiansTable)
      .where(where)
      .orderBy(...orderClauses)
      .limit(pageSize)
      .offset(offset);

    // ── Fetch children in a separate query (avoids Drizzle correlated-subquery ─
    // column-reference issues when sql`` fragments are placed in the SELECT list).
    const guardianIds = rows.map(g => g.id);
    const childrenById = new Map<string, Map<string, { id: string; name: string }>>();
    rows.forEach(g => childrenById.set(g.id, new Map()));

    if (guardianIds.length > 0) {
      const guardianNamesLower = [
        ...new Set(rows.map(g => (g.name ?? "").toLowerCase().trim()).filter(Boolean)),
      ];
      const nameOrConds = guardianNamesLower.flatMap(n => [
        sql`LOWER(COALESCE(${studentsTable.fatherName},   '')) = ${n}`,
        sql`LOWER(COALESCE(${studentsTable.guardianName}, '')) = ${n}`,
      ]);
      const childMatchFilter = or(inArray(studentsTable.guardianId, guardianIds), ...nameOrConds)!;
      const childTenantFilter = adminTenantId
        ? or(eq(studentsTable.tenantId, adminTenantId), isNull(studentsTable.tenantId))!
        : undefined;
      const childWhere = childTenantFilter ? and(childMatchFilter, childTenantFilter) : childMatchFilter;

      const studentRows = await db
        .select({
          id:          studentsTable.id,
          fullName:    studentsTable.fullName,
          guardianId:  studentsTable.guardianId,
          fatherName:  studentsTable.fatherName,
          guardianName: studentsTable.guardianName,
        })
        .from(studentsTable)
        .where(childWhere);

      const guardianIdSet       = new Set(guardianIds);
      const guardianByNameLower = new Map(rows.map(g => [(g.name ?? "").toLowerCase().trim(), g.id]));

      for (const s of studentRows) {
        const push = (gid: string) => childrenById.get(gid)!.set(s.id, { id: s.id, name: s.fullName ?? "" });
        if (s.guardianId && guardianIdSet.has(s.guardianId)) push(s.guardianId);
        const fnKey = (s.fatherName  ?? "").toLowerCase().trim();
        if (fnKey  && guardianByNameLower.has(fnKey))  push(guardianByNameLower.get(fnKey)!);
        const gnKey = (s.guardianName ?? "").toLowerCase().trim();
        if (gnKey  && guardianByNameLower.has(gnKey))  push(guardianByNameLower.get(gnKey)!);
      }
    }

    const data = rows.map((g) => ({
      ...serializeGuardian(g as typeof guardiansTable.$inferSelect),
      children: Array.from(childrenById.get(g.id)?.values() ?? [])
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

    return res.json({
      data,
      total: Number(totalRow?.count ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/guardians failed");
    return res.status(500).json({ error: "Failed to fetch guardians" });
  }
});

// ── Guardian search (lightweight combobox endpoint) ──────────────────────────
// Must be declared BEFORE /:id so Express does not match "search" as an id param.

router.get("/admin/guardians/search", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q     = req.query["q"]     ? String(req.query["q"]).trim()     : "";
    const limit = Math.min(50, Math.max(1, Number(req.query["limit"]) || 10));
    if (q.length < 2) {
      return res.status(400).json({ error: "q must be at least 2 characters" });
    }

    const adminTenantId = reqTenantId(req);
    const searchCond = or(
      ilike(guardiansTable.name,  `%${q}%`),
      ilike(guardiansTable.cnic,  `%${q}%`),
      ilike(guardiansTable.phone, `%${q}%`),
      ilike(guardiansTable.email, `%${q}%`),
    )!;

    const conditions = [searchCond];
    if (adminTenantId) {
      conditions.push(
        or(
          eq(guardiansTable.tenantId, adminTenantId),
          sql`EXISTS (
            SELECT 1 FROM students s
            WHERE s.guardian_id = ${guardiansTable.id}
              AND s.tenant_id = ${adminTenantId}
          )`,
          sql`EXISTS (
            SELECT 1 FROM students s
            WHERE (LOWER(s.father_name) = LOWER(${guardiansTable.name}) OR LOWER(s.guardian_name) = LOWER(${guardiansTable.name}))
              AND s.tenant_id = ${adminTenantId}
          )`,
        )!,
      );
    }

    const rows = await db
      .select({
        id:        guardiansTable.id,
        familySeq: guardiansTable.familySeq,
        name:      guardiansTable.name,
        cnic:      guardiansTable.cnic,
        phone:     guardiansTable.phone,
        email:     guardiansTable.email,
      })
      .from(guardiansTable)
      .where(and(...conditions))
      .orderBy(asc(guardiansTable.name))
      .limit(limit);

    const items = rows.map((g) => ({
      id:       g.id,
      familyId: familyId(g.familySeq),
      name:     g.name,
      cnic:     g.cnic ?? null,
      phone:    g.phone ?? null,
      email:    g.email ?? null,
    }));

    return res.json({ items });
  } catch (err) {
    req.log.error({ err }, "GET /admin/guardians/search failed");
    return res.status(500).json({ error: "Failed to search guardians" });
  }
});

// ── Get guardian detail ────────────────────────────────────────────────────────

router.get("/admin/guardians/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = reqTenantId(req);
    const guardian = await guardianForTenant(id, tenantId);
    if (!guardian) return res.status(404).json({ error: "Guardian not found" });

    const childMatchCond = or(
      eq(studentsTable.guardianId, id),
      sql`LOWER(COALESCE(${studentsTable.fatherName},   '')) = LOWER(${guardian.name})`,
      sql`LOWER(COALESCE(${studentsTable.guardianName}, '')) = LOWER(${guardian.name})`,
    )!;
    const childFilter = tenantId
      ? and(childMatchCond, eq(studentsTable.tenantId, tenantId))
      : childMatchCond;
    const children = await db
      .select({
        id: studentsTable.id,
        applicantId: studentsTable.applicantId,
        fullName: studentsTable.fullName,
        classCode: studentsTable.classCode,
        status: studentsTable.status,
        sectionName: sectionsTable.name,
      })
      .from(studentsTable)
      .leftJoin(sectionsTable, eq(studentsTable.sectionId, sectionsTable.id))
      .where(childFilter)
      .orderBy(asc(studentsTable.applicantId));

    return res.json({
      ...serializeGuardian(guardian),
      children,
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/guardians/:id failed");
    return res.status(500).json({ error: "Failed to fetch guardian" });
  }
});

// ── Create guardian ───────────────────────────────────────────────────────────

router.post("/admin/guardians", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, cnic, phone, email, city, address, notes } = req.body as {
      name: string; cnic?: string; phone?: string; email?: string;
      city?: string; address?: string; notes?: string;
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const cnicVal = cnic?.trim() ? cnic.trim() : null;
    let canonCnic: string | null = null;
    if (cnicVal) {
      canonCnic = canonicalizeCnic(cnicVal);
      if (!canonCnic) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
    }
    const phoneVal = phone?.trim() ? phone.trim() : null;
    let canonPhone: string | null = null;
    if (phoneVal) {
      canonPhone = canonicalizePhone(phoneVal);
      if (!canonPhone) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
    }
    const emailVal = email?.trim() ? email.trim().toLowerCase() : null;

    // Explicit dedup checks so we can return a structured 409 with existingId
    if (canonCnic) {
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(eq(guardiansTable.cnic, canonCnic));
      if (dup) return res.status(409).json({ error: "A guardian with that CNIC already exists", field: "cnic", existingId: dup.id });
    }
    if (canonPhone) {
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(eq(guardiansTable.phone, canonPhone));
      if (dup) return res.status(409).json({ error: "A guardian with that phone number already exists", field: "phone", existingId: dup.id });
    }
    if (emailVal) {
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable).where(sql`lower(${guardiansTable.email}) = ${emailVal}`);
      if (dup) return res.status(409).json({ error: "A guardian with that email already exists", field: "email", existingId: dup.id });
    }

    const [created] = await db
      .insert(guardiansTable)
      .values({
        name: name.trim(),
        cnic: canonCnic,
        phone: canonPhone,
        email: emailVal,
        city: city?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        tenantId: reqTenantId(req) ?? null,
      })
      .returning();

    return res.status(201).json(serializeGuardian(created));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A guardian with that CNIC already exists", field: "cnic" });
    }
    req.log.error({ err }, "POST /admin/guardians failed");
    return res.status(500).json({ error: "Failed to create guardian" });
  }
});

// ── Update guardian ───────────────────────────────────────────────────────────

router.patch("/admin/guardians/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = reqTenantId(req);
    const existing = await guardianForTenant(id, tenantId);
    if (!existing) return res.status(404).json({ error: "Guardian not found" });
    if (tenantId && existing.tenantId && existing.tenantId !== tenantId) {
      return res.status(404).json({ error: "Guardian not found" });
    }

    const { name, cnic, phone, email, city, address, notes } = req.body as {
      name?: string; cnic?: string | null; phone?: string | null; email?: string | null;
      city?: string | null; address?: string | null; notes?: string | null;
    };

    const patch: Record<string, unknown> = {};
    if (name !== undefined)  patch.name  = name.trim();

    let canonCnic: string | null | undefined;
    if (cnic !== undefined) {
      const cnicVal = cnic?.trim() || null;
      if (cnicVal) {
        canonCnic = canonicalizeCnic(cnicVal);
        if (!canonCnic) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
        patch.cnic = canonCnic;
      } else {
        patch.cnic = null;
      }
    }

    let canonPhone: string | null | undefined;
    if (phone !== undefined) {
      const phoneVal = phone?.trim() || null;
      if (phoneVal) {
        canonPhone = canonicalizePhone(phoneVal);
        if (!canonPhone) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
        patch.phone = canonPhone;
      } else {
        patch.phone = null;
      }
    }

    if (email !== undefined) {
      patch.email = email?.trim() ? email.trim().toLowerCase() : null;
    }

    if (city !== undefined)    patch.city    = city?.trim() || null;
    if (address !== undefined) patch.address = address?.trim() || null;
    if (notes !== undefined)   patch.notes   = notes?.trim() || null;

    // Explicit dedup checks so we can return structured 409 with existingId
    if (canonCnic) {
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable)
        .where(and(eq(guardiansTable.cnic, canonCnic), sql`${guardiansTable.id} <> ${id}`));
      if (dup) return res.status(409).json({ error: "A guardian with that CNIC already exists", field: "cnic", existingId: dup.id });
    }
    if (canonPhone) {
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable)
        .where(and(eq(guardiansTable.phone, canonPhone), sql`${guardiansTable.id} <> ${id}`));
      if (dup) return res.status(409).json({ error: "A guardian with that phone number already exists", field: "phone", existingId: dup.id });
    }
    if (patch.email) {
      const emailLower = (patch.email as string).toLowerCase();
      const [dup] = await db.select({ id: guardiansTable.id }).from(guardiansTable)
        .where(and(sql`lower(${guardiansTable.email}) = ${emailLower}`, sql`${guardiansTable.id} <> ${id}`));
      if (dup) return res.status(409).json({ error: "A guardian with that email already exists", field: "email", existingId: dup.id });
    }

    patch.updatedAt = new Date();

    const [updated] = await db
      .update(guardiansTable)
      .set(patch)
      .where(and(
        eq(guardiansTable.id, id),
        tenantId ? eq(guardiansTable.tenantId, tenantId) : sql`true`,
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Guardian not found" });
    return res.json(serializeGuardian(updated));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "A guardian with that CNIC already exists", field: "cnic" });
    }
    req.log.error({ err }, "PATCH /admin/guardians/:id failed");
    return res.status(500).json({ error: "Failed to update guardian" });
  }
});

// ── Delete guardian ───────────────────────────────────────────────────────────

router.delete("/admin/guardians/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = reqTenantId(req);
    const existing = await guardianForTenant(id, tenantId);
    if (!existing) return res.status(404).json({ error: "Guardian not found" });

    const [linked] = await db
      .select({ cnt: count() })
      .from(studentsTable)
      .where(tenantId
        ? and(eq(studentsTable.guardianId, id), eq(studentsTable.tenantId, tenantId))
        : eq(studentsTable.guardianId, id));

    if (Number(linked?.cnt ?? 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete: guardian still has linked students. Unlink them first.",
      });
    }

    const [deleted] = await db
      .delete(guardiansTable)
      .where(and(
        eq(guardiansTable.id, id),
        tenantId ? eq(guardiansTable.tenantId, tenantId) : sql`true`,
      ))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Guardian not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /admin/guardians/:id failed");
    return res.status(500).json({ error: "Failed to delete guardian" });
  }
});

// ── Family fee summary ────────────────────────────────────────────────────────

router.get("/admin/guardians/:id/fee-summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [guardian] = await db
      .select({ id: guardiansTable.id })
      .from(guardiansTable)
      .where(eq(guardiansTable.id, id));

    if (!guardian) return res.status(404).json({ error: "Guardian not found" });

    const feeSummaryTenantId = reqTenantId(req);
    const feeSummaryChildFilter = feeSummaryTenantId
      ? and(eq(studentsTable.guardianId, id), eq(studentsTable.tenantId, feeSummaryTenantId))
      : eq(studentsTable.guardianId, id);

    const children = await db
      .select({
        id: studentsTable.id,
        applicantId: studentsTable.applicantId,
        fullName: studentsTable.fullName,
        classCode: studentsTable.classCode,
        status: studentsTable.status,
      })
      .from(studentsTable)
      .where(feeSummaryChildFilter)
      .orderBy(asc(studentsTable.applicantId));

    if (children.length === 0) {
      return res.json({ students: [], familyOutstanding: 0, familyOverdueCount: 0 });
    }

    const studentIds = children.map((c) => c.id);

    const challanAgg = await db
      .select({
        studentId: feeChallansTable.studentId,
        outstanding: sql<number>`
          COALESCE(SUM(
            CASE WHEN ${feeChallansTable.status} IN ('pending', 'overdue', 'partial')
              THEN ${feeChallansTable.amount} - COALESCE(${feeChallansTable.paidAmount}, 0)
              ELSE 0
            END
          ), 0)`.mapWith(Number),
        overdueCount: sql<number>`
          COUNT(CASE WHEN ${feeChallansTable.status} = 'overdue' THEN 1 END)
        `.mapWith(Number),
        totalChallans: count(),
      })
      .from(feeChallansTable)
      .where(inArray(feeChallansTable.studentId, studentIds))
      .groupBy(feeChallansTable.studentId);

    const aggMap = new Map(challanAgg.map((r) => [r.studentId, r]));

    const students = children.map((child) => {
      const agg = aggMap.get(child.id);
      return {
        id: child.id,
        applicantId: child.applicantId,
        fullName: child.fullName,
        classCode: child.classCode,
        status: child.status,
        outstanding: agg?.outstanding ?? 0,
        overdueCount: agg?.overdueCount ?? 0,
        totalChallans: agg?.totalChallans ?? 0,
      };
    });

    const familyOutstanding  = students.reduce((s, c) => s + c.outstanding, 0);
    const familyOverdueCount = students.reduce((s, c) => s + c.overdueCount, 0);

    return res.json({ students, familyOutstanding, familyOverdueCount });
  } catch (err) {
    req.log.error({ err }, "GET /admin/guardians/:id/fee-summary failed");
    return res.status(500).json({ error: "Failed to fetch fee summary" });
  }
});

// ── Link / unlink student ─────────────────────────────────────────────────────

router.patch("/admin/students/:id/guardian", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId  = String(req.params.id);
    const guardianId = req.body.guardianId as string | null | undefined;

    const [updated] = await db
      .update(studentsTable)
      .set({ guardianId: guardianId ?? null })
      .where(stuByIdScoped(req, studentId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Student not found" });
    return res.json({ success: true, guardianId: updated.guardianId });
  } catch (err) {
    req.log.error({ err }, "PATCH /admin/students/:id/guardian failed");
    return res.status(500).json({ error: "Failed to update student guardian link" });
  }
});

// ── Backfill: create guardians from existing guardianCnic data ────────────────

router.post("/admin/guardians/backfill", requireAdmin, async (req: Request, res: Response) => {
  try {
    // Fetch all students not yet linked to a guardian
    const students = await db
      .select({
        id: studentsTable.id,
        guardianCnic: studentsTable.guardianCnic,
        guardianName: studentsTable.guardianName,
        fatherName: studentsTable.fatherName,
        guardianMobile: studentsTable.guardianMobile,
        city: studentsTable.city,
        address: studentsTable.address,
        guardianId: studentsTable.guardianId,
        tenantId: studentsTable.tenantId,
      })
      .from(studentsTable)
      .where(isNull(studentsTable.guardianId));

    let created = 0;
    let linked  = 0;

    // ── Pass 1: group by CNIC (most reliable) ─────────────────────────────────
    const byCnic = new Map<string, typeof students[number][]>();
    const noCnic: typeof students[number][] = [];

    for (const s of students) {
      const cnic = s.guardianCnic?.trim();
      if (cnic) {
        if (!byCnic.has(cnic)) byCnic.set(cnic, []);
        byCnic.get(cnic)!.push(s);
      } else {
        noCnic.push(s);
      }
    }

    for (const [cnic, group] of byCnic.entries()) {
      const first = group[0]!;
      const guardianName = (first.guardianName || first.fatherName || "Unknown").trim();

      // Re-use an existing guardian record with this CNIC if it exists
      const [existing] = await db
        .select({ id: guardiansTable.id })
        .from(guardiansTable)
        .where(eq(guardiansTable.cnic, cnic));

      let guardianId: string;
      if (existing) {
        guardianId = existing.id;
      } else {
        const [g] = await db
          .insert(guardiansTable)
          .values({
            name: guardianName,
            cnic,
            phone: first.guardianMobile?.trim() || null,
            city: first.city?.trim() || null,
            address: first.address?.trim() || null,
            tenantId: first.tenantId ?? null,
          })
          .returning();
        guardianId = g.id;
        created++;
      }

      for (const s of group) {
        await db
          .update(studentsTable)
          .set({ guardianId })
          .where(eq(studentsTable.id, s.id));
        linked++;
      }
    }

    // ── Pass 2: group remaining students by normalised father name ─────────────
    // Only use father name when ≥2 students share the same name (siblings).
    function normName(n: string | null | undefined): string {
      return (n ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    const byFatherName = new Map<string, typeof noCnic[number][]>();
    for (const s of noCnic) {
      const key = normName(s.fatherName);
      if (!key) continue;
      if (!byFatherName.has(key)) byFatherName.set(key, []);
      byFatherName.get(key)!.push(s);
    }

    for (const [normFather, group] of byFatherName.entries()) {
      if (group.length < 2) continue; // only create a shared record for confirmed siblings

      const first = group[0]!;
      const displayName = (first.guardianName || first.fatherName || "Unknown").trim();

      // Check if a guardian already exists with matching name (case-insensitive)
      const [existing] = await db
        .select({ id: guardiansTable.id })
        .from(guardiansTable)
        .where(sql`lower(${guardiansTable.name}) = ${normFather}`);

      let guardianId: string;
      if (existing) {
        guardianId = existing.id;
      } else {
        const [g] = await db
          .insert(guardiansTable)
          .values({
            name: displayName,
            cnic: null,
            phone: first.guardianMobile?.trim() || null,
            city: first.city?.trim() || null,
            address: first.address?.trim() || null,
            tenantId: first.tenantId ?? null,
          })
          .returning();
        guardianId = g.id;
        created++;
      }

      for (const s of group) {
        await db
          .update(studentsTable)
          .set({ guardianId })
          .where(eq(studentsTable.id, s.id));
        linked++;
      }
    }

    return res.json({ created, linked });
  } catch (err) {
    req.log.error({ err }, "POST /admin/guardians/backfill failed");
    return res.status(500).json({ error: "Backfill failed" });
  }
});

export default router;
