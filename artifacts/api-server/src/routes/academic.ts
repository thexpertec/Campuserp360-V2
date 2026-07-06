import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  academicYearsTable,
  classCategoriesTable,
  classesTable,
  classAcademicYearsTable,
  sectionsTable,
  classSectionsTable,
  sectionAllocationsTable,
  housesTable,
  academicTermsTable,
  affiliationsTable,
  termsConditionsTable,
  subjectsTable,
  classSubjectsTable,
  applicationsTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  CreateAdminAcademicYearBody,
  UpdateAdminAcademicYearBody,
  CreateAdminClassCategoryBody,
  UpdateAdminClassCategoryBody,
  CreateAdminSectionBody,
  UpdateAdminSectionBody,
  CreateAdminHouseBody,
  UpdateAdminHouseBody,
  CreateAdminAcademicTermBody,
  UpdateAdminAcademicTermBody,
  CreateAdminAffiliationBody,
  UpdateAdminAffiliationBody,
  CreateAdminTermsConditionBody,
  UpdateAdminTermsConditionBody,
  CreateAdminClassBody,
  UpdateAdminClassBody,
  CreateAdminSectionAllocationBody,
  CreateAdminSubjectBody,
  UpdateAdminSubjectBody,
  SetAdminClassSubjectsBody,
  SetAdminClassSectionsBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { seedCalendarHolidaysForYear } from "../lib/seed-calendar";

const router: IRouter = Router();

function isUniqueViolation(err: unknown): boolean {
  const codes: unknown[] = [];
  let cur: any = err;
  for (let i = 0; i < 4 && cur; i++) {
    codes.push(cur.code);
    cur = cur.cause;
  }
  if (codes.includes("23505")) return true;
  return err instanceof Error && /unique|duplicate/i.test(err.message);
}

// ── Generic catalog CRUD ──────────────────────────────────────────────────────
type FieldKind = "string" | "strNull" | "int" | "strDefault";
type Field = { col: string; kind: FieldKind };

type CatalogOpts = {
  pathBase: string;
  table: any;
  createSchema: { safeParse: (b: unknown) => any };
  updateSchema: { safeParse: (b: unknown) => any };
  label: string;
  fields: Field[];
  afterCreate?: (row: any) => Promise<void>;
  afterUpdate?: (row: any) => Promise<void>;
  reorderable?: boolean;
  dedup?: boolean;
};

function serializeCatalog(row: any, fields: Field[]) {
  const out: Record<string, unknown> = { id: row.id };
  for (const f of fields) out[f.col] = row[f.col];
  out.active = row.active;
  out.sortOrder = row.sortOrder;
  if (row.isDefault !== undefined) out.isDefault = row.isDefault;
  return out;
}

function buildCreateValues(data: any, fields: Field[]) {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const v = data[f.col];
    if (f.kind === "string") values[f.col] = String(v ?? "").trim();
    else if (f.kind === "strNull") values[f.col] = v?.trim() ? v.trim() : null;
    else if (f.kind === "strDefault") values[f.col] = (v ?? "").toString();
    else if (f.kind === "int" && v !== undefined) values[f.col] = v;
  }
  if (data.active !== undefined) values.active = data.active;
  if (data.sortOrder !== undefined) values.sortOrder = data.sortOrder;
  return values;
}

function buildUpdateValues(data: any, fields: Field[]) {
  const updates: Record<string, unknown> = {};
  for (const f of fields) {
    const v = data[f.col];
    if (v === undefined) continue;
    if (f.kind === "string") updates[f.col] = String(v).trim();
    else if (f.kind === "strNull") updates[f.col] = v.trim() ? v.trim() : null;
    else if (f.kind === "strDefault") updates[f.col] = v.toString();
    else if (f.kind === "int") updates[f.col] = v;
  }
  if (data.active !== undefined) updates.active = data.active;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  return updates;
}

function dedupByName<T extends { name?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = String(r.name ?? "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function registerCatalog(opts: CatalogOpts) {
  const { pathBase, table, createSchema, updateSchema, label, fields, afterCreate, afterUpdate } = opts;

  // Public: active records (filtered by public tenant context)
  router.get(`/${pathBase}`, async (req: Request, res: Response) => {
    try {
      const publicTenantId = (req as any).tenantId as string | undefined;
      const conditions: any[] = [eq(table.active, true)];
      if (publicTenantId) conditions.push(eq(table.tenantId, publicTenantId));
      const rows = await db
        .select()
        .from(table)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(asc(table.sortOrder), asc(table.id));
      let serialized = rows.map((r: any) => serializeCatalog(r, fields));
      if (opts.dedup) serialized = dedupByName(serialized) as typeof serialized;
      return res.json(serialized);
    } catch (err) {
      req.log.error({ err }, `Failed to list active ${label}s`);
      return res.status(500).json({ error: `Failed to load ${label}s` });
    }
  });

  // Admin: all records
  router.get(`/admin/${pathBase}`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.tenantId, tenantId))
        .orderBy(asc(table.sortOrder), asc(table.id));
      return res.json(rows.map((r: any) => serializeCatalog(r, fields)));
    } catch (err) {
      req.log.error({ err }, `Failed to list admin ${label}s`);
      return res.status(500).json({ error: `Failed to load ${label}s` });
    }
  });

  // Admin: create
  router.post(`/admin/${pathBase}`, requireAdmin, async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: `Invalid ${label}` });
    }
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const [created] = (await db
        .insert(table)
        .values({ ...buildCreateValues(parsed.data, fields), tenantId })
        .returning()) as any[];
      if (afterCreate) {
        afterCreate(created).catch((err: unknown) =>
          req.log.error({ err }, `afterCreate hook failed for ${label}`));
      }
      return res.status(201).json(serializeCatalog(created, fields));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(400).json({ error: `That ${label} already exists` });
      }
      req.log.error({ err }, `Failed to create ${label}`);
      return res.status(500).json({ error: `Failed to create ${label}` });
    }
  });

  // Admin: reorder (must be registered before the `/:id` route)
  if (opts.reorderable) {
    router.patch(`/admin/${pathBase}/reorder`, requireAdmin, async (req: Request, res: Response) => {
      try {
        const tenantId = await getAdminTenantId(req);
        if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
        const order = req.body?.order;
        if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "order must be an array of ids" });
        }
        await Promise.all(
          order.map((id: string, idx: number) =>
            db.update(table).set({ sortOrder: idx })
              .where(and(eq(table.id, id), eq(table.tenantId, tenantId))),
          ),
        );
        return res.json({ ok: true });
      } catch (err) {
        req.log.error({ err }, `Failed to reorder ${label}s`);
        return res.status(500).json({ error: `Failed to reorder ${label}s` });
      }
    });
  }

  // Admin: update
  router.patch(`/admin/${pathBase}/:id`, requireAdmin, async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: `Invalid ${label}` });
    }
    const updates = buildUpdateValues(parsed.data, fields);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const [updated] = (await db
        .update(table)
        .set(updates)
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)))
        .returning()) as any[];
      if (!updated) return res.status(404).json({ error: `${label} not found` });
      if (afterUpdate) {
        afterUpdate(updated).catch((err: unknown) =>
          req.log.error({ err }, `afterUpdate hook failed for ${label}`));
      }
      return res.json(serializeCatalog(updated, fields));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(400).json({ error: `That ${label} already exists` });
      }
      req.log.error({ err }, `Failed to update ${label}`);
      return res.status(500).json({ error: `Failed to update ${label}` });
    }
  });

  // Admin: delete
  router.delete(`/admin/${pathBase}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const [deleted] = (await db
        .delete(table)
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)))
        .returning()) as any[];
      if (!deleted) return res.status(404).json({ error: `${label} not found` });
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `Failed to delete ${label}`);
      return res.status(500).json({ error: `Failed to delete ${label}` });
    }
  });
}

registerCatalog({
  pathBase: "academic-years",
  table: academicYearsTable,
  createSchema: CreateAdminAcademicYearBody,
  updateSchema: UpdateAdminAcademicYearBody,
  label: "academic year",
  fields: [{ col: "name", kind: "string" }],
  reorderable: true,
  dedup: true,
  afterCreate: (row) => seedCalendarHolidaysForYear(row),
  afterUpdate: (row) => seedCalendarHolidaysForYear(row),
});

// POST /admin/academic-years/:id/set-default
router.post("/admin/academic-years/:id/set-default", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.update(academicYearsTable).set({ isDefault: false } as any)
      .where(eq(academicYearsTable.tenantId, tenantId));
    const [updated] = await db.update(academicYearsTable)
      .set({ isDefault: true } as any)
      .where(and(eq(academicYearsTable.id, id), eq(academicYearsTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Academic year not found" });
    return res.json({ ok: true, id: updated.id });
  } catch (err) {
    req.log.error({ err }, "Failed to set default academic year");
    return res.status(500).json({ error: "Failed to set default academic year" });
  }
});

registerCatalog({
  pathBase: "class-categories",
  table: classCategoriesTable,
  createSchema: CreateAdminClassCategoryBody,
  updateSchema: UpdateAdminClassCategoryBody,
  label: "class category",
  fields: [{ col: "name", kind: "string" }],
  reorderable: true,
});

registerCatalog({
  pathBase: "sections",
  table: sectionsTable,
  createSchema: CreateAdminSectionBody,
  updateSchema: UpdateAdminSectionBody,
  label: "section",
  fields: [
    { col: "name", kind: "string" },
    { col: "capacity", kind: "int" },
  ],
  reorderable: true,
});

registerCatalog({
  pathBase: "houses",
  table: housesTable,
  createSchema: CreateAdminHouseBody,
  updateSchema: UpdateAdminHouseBody,
  label: "house",
  fields: [
    { col: "name", kind: "string" },
    { col: "color", kind: "strNull" },
  ],
  dedup: true,
});

registerCatalog({
  pathBase: "academic-terms",
  table: academicTermsTable,
  createSchema: CreateAdminAcademicTermBody,
  updateSchema: UpdateAdminAcademicTermBody,
  label: "academic term",
  fields: [
    { col: "name", kind: "string" },
    { col: "kind", kind: "strNull" },
  ],
});

registerCatalog({
  pathBase: "affiliations",
  table: affiliationsTable,
  createSchema: CreateAdminAffiliationBody,
  updateSchema: UpdateAdminAffiliationBody,
  label: "affiliation",
  fields: [
    { col: "name", kind: "string" },
    { col: "body", kind: "strNull" },
  ],
});

registerCatalog({
  pathBase: "terms-conditions",
  table: termsConditionsTable,
  createSchema: CreateAdminTermsConditionBody,
  updateSchema: UpdateAdminTermsConditionBody,
  label: "term & condition",
  fields: [
    { col: "title", kind: "string" },
    { col: "content", kind: "strDefault" },
  ],
});

// ── Classes (with category + academic-year links) ─────────────────────────────
type ClassRow = typeof classesTable.$inferSelect;

async function serializeClasses(rows: ClassRow[]) {
  if (rows.length === 0) return [];
  const categories = await db.select().from(classCategoriesTable);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const classIds = rows.map((r) => r.id);

  // Academic years
  const yearLinks = await db
    .select({
      classId: classAcademicYearsTable.classId,
      yearId: academicYearsTable.id,
      yearName: academicYearsTable.name,
    })
    .from(classAcademicYearsTable)
    .innerJoin(
      academicYearsTable,
      eq(classAcademicYearsTable.academicYearId, academicYearsTable.id),
    )
    .where(inArray(classAcademicYearsTable.classId, classIds));

  const yearsByClass = new Map<string, { id: string; name: string }[]>();
  for (const l of yearLinks) {
    const arr = yearsByClass.get(l.classId) ?? [];
    arr.push({ id: l.yearId, name: l.yearName });
    yearsByClass.set(l.classId, arr);
  }

  // Sections
  const sectionLinks = await db
    .select({
      classId: classSectionsTable.classId,
      sectionId: sectionsTable.id,
      sectionName: sectionsTable.name,
    })
    .from(classSectionsTable)
    .innerJoin(sectionsTable, eq(classSectionsTable.sectionId, sectionsTable.id))
    .where(inArray(classSectionsTable.classId, classIds))
    .orderBy(asc(classSectionsTable.sortOrder));

  const sectionsByClass = new Map<string, { id: string; name: string }[]>();
  for (const l of sectionLinks) {
    const arr = sectionsByClass.get(l.classId) ?? [];
    arr.push({ id: l.sectionId, name: l.sectionName });
    sectionsByClass.set(l.classId, arr);
  }

  // Subjects
  const subjectLinks = await db
    .select({
      classId: classSubjectsTable.classId,
      subjectId: subjectsTable.id,
      subjectName: subjectsTable.name,
    })
    .from(classSubjectsTable)
    .innerJoin(subjectsTable, eq(classSubjectsTable.subjectId, subjectsTable.id))
    .where(inArray(classSubjectsTable.classId, classIds))
    .orderBy(asc(classSubjectsTable.sortOrder));

  const subjectsByClass = new Map<string, { id: string; name: string }[]>();
  for (const l of subjectLinks) {
    const arr = subjectsByClass.get(l.classId) ?? [];
    arr.push({ id: l.subjectId, name: l.subjectName });
    subjectsByClass.set(l.classId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.categoryId ? categoryName.get(r.categoryId) ?? null : null,
    feeType: r.feeType,
    eligibility: r.eligibility,
    termType: r.termType,
    termCount: r.termCount,
    seats: r.seats,
    active: r.active,
    sortOrder: r.sortOrder,
    academicYears: yearsByClass.get(r.id) ?? [],
    sections: sectionsByClass.get(r.id) ?? [],
    subjects: subjectsByClass.get(r.id) ?? [],
  }));
}

async function listClasses(activeOnly: boolean, tenantId: string | null) {
  if (!tenantId) return [];
  const conditions: any[] = [eq(classesTable.tenantId, tenantId)];
  if (activeOnly) conditions.push(eq(classesTable.active, true));
  const rows = await db
    .select()
    .from(classesTable)
    .where(and(...conditions))
    .orderBy(asc(classesTable.sortOrder), asc(classesTable.name));
  return serializeClasses(rows);
}

router.get("/classes", async (req: Request, res: Response) => {
  try {
    const publicTenantId = (req as any).tenantId as string | undefined;
    return res.json(await listClasses(true, publicTenantId ?? null));
  } catch (err) {
    req.log.error({ err }, "Failed to list active classes");
    return res.status(500).json({ error: "Failed to load classes" });
  }
});

router.get("/admin/classes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    return res.json(await listClasses(false, tenantId));
  } catch (err) {
    req.log.error({ err }, "Failed to list admin classes");
    return res.status(500).json({ error: "Failed to load classes" });
  }
});

router.post("/admin/classes", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateAdminClassBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid class" });
  }
  const d = parsed.data;
  if (d.seats !== undefined && !Number.isInteger(d.seats)) {
    return res.status(400).json({ error: "Seats must be a whole number" });
  }
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const created = await db.transaction(async (tx) => {
      const [cls] = await tx
        .insert(classesTable)
        .values({
          code: d.code.trim(),
          name: d.name.trim(),
          categoryId: d.categoryId ?? null,
          feeType: d.feeType?.trim() || null,
          eligibility: d.eligibility?.trim() || null,
          termType: d.termType ?? null,
          termCount: d.termCount ?? null,
          seats: d.seats ?? 0,
          active: d.active ?? true,
          sortOrder: d.sortOrder ?? 0,
          tenantId,
        })
        .returning();
      const yearIds = (d.academicYearIds ?? []).filter(Boolean);
      if (yearIds.length > 0) {
        await tx.insert(classAcademicYearsTable).values(
          yearIds.map((academicYearId: string) => ({ classId: cls!.id, academicYearId })),
        );
      }
      const sectionIds = (d.sectionIds ?? []).filter(Boolean);
      if (sectionIds.length > 0) {
        await tx.insert(classSectionsTable).values(
          sectionIds.map((sectionId: string, i: number) => ({ classId: cls!.id, sectionId, sortOrder: i })),
        );
      }
      const subjectIds = (d.subjectIds ?? []).filter(Boolean);
      if (subjectIds.length > 0) {
        await tx.insert(classSubjectsTable).values(
          subjectIds.map((subjectId: string, i: number) => ({ classId: cls!.id, subjectId, sortOrder: i, tenantId })),
        );
      }
      return cls!;
    });
    const [serialized] = await serializeClasses([created]);
    return res.status(201).json(serialized);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(400).json({ error: "A class with that code already exists" });
    }
    req.log.error({ err }, "Failed to create class");
    return res.status(500).json({ error: "Failed to create class" });
  }
});

router.patch("/admin/classes/reorder", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const order = req.body?.order;
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      return res.status(400).json({ error: "order must be an array of ids" });
    }
    await Promise.all(
      order.map((id: string, idx: number) =>
        db.update(classesTable).set({ sortOrder: idx })
          .where(and(eq(classesTable.id, id), eq(classesTable.tenantId, tenantId))),
      ),
    );
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder classes");
    return res.status(500).json({ error: "Failed to reorder classes" });
  }
});

router.patch("/admin/classes/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateAdminClassBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid class" });
  }
  const d = parsed.data;
  if (d.seats !== undefined && !Number.isInteger(d.seats)) {
    return res.status(400).json({ error: "Seats must be a whole number" });
  }
  const updates: Partial<typeof classesTable.$inferInsert> = {};
  if (d.name !== undefined) updates.name = d.name.trim();
  if (d.categoryId !== undefined) updates.categoryId = d.categoryId ?? null;
  if (d.feeType !== undefined) updates.feeType = d.feeType.trim() || null;
  if (d.eligibility !== undefined) updates.eligibility = d.eligibility.trim() || null;
  if (d.termType !== undefined) updates.termType = d.termType ?? null;
  if (d.termCount !== undefined) updates.termCount = d.termCount ?? null;
  if (d.seats !== undefined) updates.seats = d.seats;
  if (d.active !== undefined) updates.active = d.active;
  if (d.sortOrder !== undefined) updates.sortOrder = d.sortOrder;

  const id = String(req.params.id);
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const classWhere = and(eq(classesTable.id, id), eq(classesTable.tenantId, tenantId));

    const updated = await db.transaction(async (tx) => {
      let row: ClassRow | undefined;
      if (Object.keys(updates).length > 0) {
        [row] = await tx.update(classesTable).set(updates).where(classWhere).returning();
      } else {
        [row] = await tx.select().from(classesTable).where(classWhere);
      }
      if (!row) return undefined;
      if (d.academicYearIds !== undefined) {
        await tx.delete(classAcademicYearsTable).where(eq(classAcademicYearsTable.classId, id));
        const yearIds = d.academicYearIds.filter(Boolean);
        if (yearIds.length > 0) {
          await tx.insert(classAcademicYearsTable).values(
            yearIds.map((academicYearId: string) => ({ classId: id, academicYearId })),
          );
        }
      }
      if (d.sectionIds !== undefined) {
        await tx.delete(classSectionsTable).where(eq(classSectionsTable.classId, id));
        const sectionIds = d.sectionIds.filter(Boolean);
        if (sectionIds.length > 0) {
          await tx.insert(classSectionsTable).values(
            sectionIds.map((sectionId: string, i: number) => ({ classId: id, sectionId, sortOrder: i })),
          );
        }
      }
      if (d.subjectIds !== undefined) {
        await tx.delete(classSubjectsTable).where(eq(classSubjectsTable.classId, id));
        const subjectIds = d.subjectIds.filter(Boolean);
        if (subjectIds.length > 0) {
          await tx.insert(classSubjectsTable).values(
            subjectIds.map((subjectId: string, i: number) => ({ classId: id, subjectId, sortOrder: i, tenantId })),
          );
        }
      }
      return row;
    });
    if (!updated) return res.status(404).json({ error: "Class not found" });
    const [serialized] = await serializeClasses([updated]);
    return res.json(serialized);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(400).json({ error: "A class with that code already exists" });
    }
    req.log.error({ err }, "Failed to update class");
    return res.status(500).json({ error: "Failed to update class" });
  }
});

router.delete("/admin/classes/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [deleted] = await db
      .delete(classesTable)
      .where(and(eq(classesTable.id, String(req.params.id)), eq(classesTable.tenantId, tenantId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Class not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete class");
    return res.status(500).json({ error: "Failed to delete class" });
  }
});

// ── Section allocations ───────────────────────────────────────────────────────
async function fetchAllocations(filters: {
  tenantId: string;
  academicYearId?: string;
  classCode?: string;
  sectionId?: string;
}) {
  const conds = [eq(applicationsTable.tenantId, filters.tenantId)] as any[];
  if (filters.academicYearId)
    conds.push(eq(sectionAllocationsTable.academicYearId, filters.academicYearId));
  if (filters.classCode)
    conds.push(eq(sectionAllocationsTable.classCode, filters.classCode));
  if (filters.sectionId)
    conds.push(eq(sectionAllocationsTable.sectionId, filters.sectionId));

  const rows = await db
    .select({
      id: sectionAllocationsTable.id,
      applicationId: sectionAllocationsTable.applicationId,
      referenceId: applicationsTable.referenceId,
      fullName: applicationsTable.fullName,
      classCode: sectionAllocationsTable.classCode,
      sectionId: sectionAllocationsTable.sectionId,
      sectionName: sectionsTable.name,
      academicYearId: sectionAllocationsTable.academicYearId,
      academicYearName: academicYearsTable.name,
    })
    .from(sectionAllocationsTable)
    .innerJoin(applicationsTable, eq(sectionAllocationsTable.applicationId, applicationsTable.id))
    .innerJoin(sectionsTable, eq(sectionAllocationsTable.sectionId, sectionsTable.id))
    .innerJoin(academicYearsTable, eq(sectionAllocationsTable.academicYearId, academicYearsTable.id))
    .where(and(...conds))
    .orderBy(asc(applicationsTable.fullName));

  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    referenceId: r.referenceId,
    applicantName: r.fullName,
    classCode: r.classCode,
    sectionId: r.sectionId,
    sectionName: r.sectionName,
    academicYearId: r.academicYearId,
    academicYearName: r.academicYearName,
  }));
}

router.get("/admin/section-allocations", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const allocations = await fetchAllocations({
      tenantId,
      academicYearId: req.query.academicYearId ? String(req.query.academicYearId) : undefined,
      classCode: req.query.classCode ? String(req.query.classCode) : undefined,
      sectionId: req.query.sectionId ? String(req.query.sectionId) : undefined,
    });
    return res.json(allocations);
  } catch (err) {
    req.log.error({ err }, "Failed to list section allocations");
    return res.status(500).json({ error: "Failed to load section allocations" });
  }
});

router.post("/admin/section-allocations", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateAdminSectionAllocationBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid allocation" });
  }
  const { referenceId, sectionId, academicYearId } = parsed.data;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [application] = await db
      .select({ id: applicationsTable.id, classApplying: applicationsTable.classApplying })
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.referenceId, referenceId.trim()),
        eq(applicationsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (!application) {
      return res.status(404).json({ error: "Applicant not found" });
    }
    // Guard against cross-tenant academic years being stamped onto allocations
    // (this value later flows onto the student + enrollment records).
    const [yearOwned] = await db
      .select({ id: academicYearsTable.id })
      .from(academicYearsTable)
      .where(and(
        eq(academicYearsTable.id, academicYearId),
        eq(academicYearsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (!yearOwned) {
      return res.status(400).json({ error: "Academic year does not belong to this tenant" });
    }
    if (sectionId) {
      const [sectionOwned] = await db
        .select({ id: sectionsTable.id })
        .from(sectionsTable)
        .where(and(
          eq(sectionsTable.id, sectionId),
          eq(sectionsTable.tenantId, tenantId),
        ))
        .limit(1);
      if (!sectionOwned) {
        return res.status(400).json({ error: "Section does not belong to this tenant" });
      }
    }
    const [created] = await db
      .insert(sectionAllocationsTable)
      .values({
        applicationId: application.id,
        classCode: application.classApplying,
        sectionId,
        academicYearId,
      })
      .returning();
    const [serialized] = await fetchAllocations({ tenantId }).then((all) =>
      all.filter((a) => a.id === created!.id),
    );
    return res.status(201).json(serialized);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res
        .status(400)
        .json({ error: "This applicant is already placed for the selected academic year" });
    }
    req.log.error({ err }, "Failed to create section allocation");
    return res.status(500).json({ error: "Failed to create section allocation" });
  }
});

router.delete("/admin/section-allocations/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    // Verify ownership via application.tenantId before deleting
    const allocationId = String(req.params.id);
    const [row] = await db
      .select({ id: sectionAllocationsTable.id })
      .from(sectionAllocationsTable)
      .innerJoin(applicationsTable, eq(sectionAllocationsTable.applicationId, applicationsTable.id))
      .where(and(
        eq(sectionAllocationsTable.id, allocationId),
        eq(applicationsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Allocation not found" });
    await db.delete(sectionAllocationsTable).where(eq(sectionAllocationsTable.id, allocationId));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete section allocation");
    return res.status(500).json({ error: "Failed to delete section allocation" });
  }
});

// ── Subjects ──────────────────────────────────────────────────────────────────
type SubjectRow = typeof subjectsTable.$inferSelect;

function serializeSubject(s: SubjectRow) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    type: s.type,
    isElective: s.isElective,
    maxMarks: s.maxMarks,
    passMarks: s.passMarks,
    active: s.active,
    sortOrder: s.sortOrder,
  };
}

router.get("/subjects", async (req: Request, res: Response) => {
  try {
    const publicTenantId = (req as any).tenantId as string | undefined;
    const conditions: any[] = [eq(subjectsTable.active, true)];
    if (publicTenantId) conditions.push(eq(subjectsTable.tenantId, publicTenantId));
    const rows = await db
      .select()
      .from(subjectsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(asc(subjectsTable.sortOrder), asc(subjectsTable.name));
    return res.json(rows.map(serializeSubject));
  } catch (err) {
    req.log.error({ err }, "Failed to list active subjects");
    return res.status(500).json({ error: "Failed to load subjects" });
  }
});

router.get("/admin/subjects", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select()
      .from(subjectsTable)
      .where(eq(subjectsTable.tenantId, tenantId))
      .orderBy(asc(subjectsTable.sortOrder), asc(subjectsTable.name));
    return res.json(rows.map(serializeSubject));
  } catch (err) {
    req.log.error({ err }, "Failed to list admin subjects");
    return res.status(500).json({ error: "Failed to load subjects" });
  }
});

router.post("/admin/subjects", requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateAdminSubjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid subject" });
  const d = parsed.data;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [created] = await db
      .insert(subjectsTable)
      .values({
        code: d.code.trim(),
        name: d.name.trim(),
        type: d.type?.trim() || "theory",
        isElective: d.isElective ?? false,
        maxMarks: d.maxMarks ?? 100,
        passMarks: d.passMarks ?? 33,
        active: d.active ?? true,
        sortOrder: d.sortOrder ?? 0,
        tenantId,
      })
      .returning();
    return res.status(201).json(serializeSubject(created!));
  } catch (err) {
    if (isUniqueViolation(err))
      return res.status(400).json({ error: "A subject with that code already exists" });
    req.log.error({ err }, "Failed to create subject");
    return res.status(500).json({ error: "Failed to create subject" });
  }
});

router.patch("/admin/subjects/reorder", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const order = req.body?.order;
    if (!Array.isArray(order) || order.some((id) => typeof id !== "string")) {
      return res.status(400).json({ error: "order must be an array of ids" });
    }
    await Promise.all(
      order.map((id: string, idx: number) =>
        db.update(subjectsTable).set({ sortOrder: idx })
          .where(and(eq(subjectsTable.id, id), eq(subjectsTable.tenantId, tenantId))),
      ),
    );
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to reorder subjects");
    return res.status(500).json({ error: "Failed to reorder subjects" });
  }
});

router.get("/admin/subjects/by-class/:classCode", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const classCode = String(req.params.classCode);
    // Classes may have null tenant_id (legacy/seed data), so look up by code only.
    // Tenant isolation is enforced via the subjects.tenant_id filter below.
    const classRows = await db
      .select({ id: classesTable.id })
      .from(classesTable)
      .where(eq(classesTable.code, classCode));
    if (!classRows.length) return res.json([]);
    const classIds = classRows.map(c => c.id);
    // Use selectDistinct to deduplicate when multiple class records share the same code.
    const rows = await db
      .selectDistinct({
        id:          subjectsTable.id,
        tenantId:    subjectsTable.tenantId,
        code:        subjectsTable.code,
        name:        subjectsTable.name,
        type:        subjectsTable.type,
        isElective:  subjectsTable.isElective,
        maxMarks:    subjectsTable.maxMarks,
        passMarks:   subjectsTable.passMarks,
        active:      subjectsTable.active,
        sortOrder:   subjectsTable.sortOrder,
        createdAt:   subjectsTable.createdAt,
        updatedAt:   subjectsTable.updatedAt,
      })
      .from(classSubjectsTable)
      .innerJoin(subjectsTable, eq(classSubjectsTable.subjectId, subjectsTable.id))
      .where(
        and(
          inArray(classSubjectsTable.classId, classIds),
          eq(subjectsTable.active, true),
          eq(subjectsTable.tenantId, tenantId),
        ),
      )
      .orderBy(asc(subjectsTable.sortOrder), asc(subjectsTable.name));
    return res.json(rows.map(serializeSubject));
  } catch (err) {
    req.log.error({ err }, "Failed to list subjects by class");
    return res.status(500).json({ error: "Failed to load subjects for class" });
  }
});

router.patch("/admin/subjects/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateAdminSubjectBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid subject" });
  const d = parsed.data;
  const updates: Partial<typeof subjectsTable.$inferInsert> = {};
  if (d.name !== undefined) updates.name = d.name.trim();
  if (d.type !== undefined) updates.type = d.type.trim();
  if (d.isElective !== undefined) updates.isElective = d.isElective;
  if (d.maxMarks !== undefined) updates.maxMarks = d.maxMarks;
  if (d.passMarks !== undefined) updates.passMarks = d.passMarks;
  if (d.active !== undefined) updates.active = d.active;
  if (d.sortOrder !== undefined) updates.sortOrder = d.sortOrder;
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: "No fields to update" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [updated] = await db
      .update(subjectsTable)
      .set(updates)
      .where(and(eq(subjectsTable.id, String(req.params.id)), eq(subjectsTable.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Subject not found" });
    return res.json(serializeSubject(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update subject");
    return res.status(500).json({ error: "Failed to update subject" });
  }
});

router.delete("/admin/subjects/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [deleted] = await db
      .delete(subjectsTable)
      .where(and(eq(subjectsTable.id, String(req.params.id)), eq(subjectsTable.tenantId, tenantId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Subject not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete subject");
    return res.status(500).json({ error: "Failed to delete subject" });
  }
});

// ── Class ↔ Section assignments ──────────────────────────────────────────────
router.get("/admin/class-sections/:classId", requireAdmin, async (req: Request, res: Response) => {
  const classId = String(req.params.classId);
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const links = await db
      .select({ sectionId: classSectionsTable.sectionId })
      .from(classSectionsTable)
      .where(eq(classSectionsTable.classId, classId))
      .orderBy(asc(classSectionsTable.sortOrder));
    if (links.length === 0) return res.json([]);
    const sectionIds = links.map((l) => l.sectionId);
    const sections = await db
      .select()
      .from(sectionsTable)
      .where(and(inArray(sectionsTable.id, sectionIds), eq(sectionsTable.tenantId, tenantId)));
    const byId = new Map(sections.map((s) => [s.id, s]));
    return res.json(
      sectionIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((s: any) => ({ id: s.id, name: s.name, capacity: s.capacity, active: s.active, sortOrder: s.sortOrder })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list class sections");
    return res.status(500).json({ error: "Failed to load class sections" });
  }
});

router.put("/admin/class-sections/:classId", requireAdmin, async (req: Request, res: Response) => {
  const parsed = SetAdminClassSectionsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const classId = String(req.params.classId);
  const { sectionIds } = parsed.data;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const result = await db.transaction(async (tx) => {
      await tx.delete(classSectionsTable).where(eq(classSectionsTable.classId, classId));
      if (sectionIds.length > 0) {
        await tx.insert(classSectionsTable).values(
          sectionIds.map((sectionId: string, i: number) => ({ classId, sectionId, sortOrder: i })),
        );
      }
      if (sectionIds.length === 0) return [];
      return tx.select().from(sectionsTable)
        .where(and(inArray(sectionsTable.id, sectionIds), eq(sectionsTable.tenantId, tenantId)));
    });
    return res.json(
      (result as any[]).map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, active: s.active, sortOrder: s.sortOrder })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to set class sections");
    return res.status(500).json({ error: "Failed to update class sections" });
  }
});

// ── Class ↔ Subject assignments ───────────────────────────────────────────────
router.get("/admin/class-subjects/:classId", requireAdmin, async (req: Request, res: Response) => {
  const classId = String(req.params.classId);
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const links = await db
      .select({ subjectId: classSubjectsTable.subjectId })
      .from(classSubjectsTable)
      .where(eq(classSubjectsTable.classId, classId))
      .orderBy(asc(classSubjectsTable.sortOrder));
    if (links.length === 0) return res.json([]);
    const subjectIds = links.map((l) => l.subjectId);
    const subjects = await db
      .select()
      .from(subjectsTable)
      .where(and(inArray(subjectsTable.id, subjectIds), eq(subjectsTable.tenantId, tenantId)));
    const byId = new Map(subjects.map((s) => [s.id, s]));
    return res.json(subjectIds.map((id) => byId.get(id)).filter(Boolean).map(serializeSubject));
  } catch (err) {
    req.log.error({ err }, "Failed to list class subjects");
    return res.status(500).json({ error: "Failed to load class subjects" });
  }
});

router.put("/admin/class-subjects/:classId", requireAdmin, async (req: Request, res: Response) => {
  const parsed = SetAdminClassSubjectsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const classId = String(req.params.classId);
  const { subjectIds } = parsed.data;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const result = await db.transaction(async (tx) => {
      await tx.delete(classSubjectsTable).where(eq(classSubjectsTable.classId, classId));
      if (subjectIds.length > 0) {
        await tx.insert(classSubjectsTable).values(
          subjectIds.map((subjectId: string, i: number) => ({ classId, subjectId, sortOrder: i, tenantId })),
        );
      }
      if (subjectIds.length === 0) return [];
      return tx.select().from(subjectsTable)
        .where(and(inArray(subjectsTable.id, subjectIds), eq(subjectsTable.tenantId, tenantId)));
    });
    return res.json((result as SubjectRow[]).map(serializeSubject));
  } catch (err) {
    req.log.error({ err }, "Failed to set class subjects");
    return res.status(500).json({ error: "Failed to update class subjects" });
  }
});

export default router;
