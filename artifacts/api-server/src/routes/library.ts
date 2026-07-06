import { Router, type IRouter, type Request, type Response } from "express";
import { db, pool, studentsTable } from "@workspace/db";
import {
  libraryCategoriesTable, libraryPublishersTable,
  libraryBooksTable, libraryIssuesTable,
} from "@workspace/db";
import { eq, asc, desc, ilike, and, or, lt, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

// ── Startup migration ─────────────────────────────────────────────────────────

export async function migrateLibrary(): Promise<void> {
  // Add tenant_id to all library tables
  for (const table of ["library_categories", "library_publishers", "library_books", "library_issues"]) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id UUID`);
    await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_tenant_idx ON ${table}(tenant_id)`);
  }

  // Drop old global unique constraints/indexes that are now per-tenant
  await pool.query(`ALTER TABLE library_categories DROP CONSTRAINT IF EXISTS library_categories_name_key`);
  await pool.query(`ALTER TABLE library_publishers  DROP CONSTRAINT IF EXISTS library_publishers_name_key`);

  // Per-tenant unique indexes
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS library_categories_tenant_name_uniq
    ON library_categories(tenant_id, name)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS library_publishers_tenant_name_uniq
    ON library_publishers(tenant_id, name)
  `);

  // Backfill all unscoped rows to the CCM tenant
  for (const table of ["library_categories", "library_publishers", "library_books", "library_issues"]) {
    await pool.query(`
      UPDATE ${table}
      SET tenant_id = (SELECT id FROM tenants WHERE slug = 'ccm' LIMIT 1)
      WHERE tenant_id IS NULL
    `);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fail-closed helper: returns tenantId or sends 400 and returns null. */
async function requireTenantId(req: Request, res: Response): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) {
    res.status(400).json({ error: "Tenant context required" });
    return null;
  }
  return tenantId;
}

const router: IRouter = Router();

/**
 * Generic CRUD for library reference tables (categories, publishers).
 * All reads and writes are scoped to the admin's tenant — fail-closed.
 */
function catalogRoutes(path: string, table: any) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const rows = await db.select().from(table)
        .where(eq(table.tenantId, tenantId))
        .orderBy(asc(table.sortOrder), asc(table.name));
      return res.json(rows);
    } catch (err) {
      req.log.error({ err }, `GET ${path} failed`);
      return res.status(500).json({ error: "Failed to fetch records" });
    }
  });
  router.post(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;
      const row = ((await db.insert(table).values({ ...data, tenantId }).returning()) as any[])[0];
      return res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
      req.log.error({ err }, `POST ${path} failed`);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });
  router.put(`${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      const { id: _id, createdAt: _ca, tenantId: _tid, ...body } = req.body as any;
      const [row] = await db.update(table)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)))
        .returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
      req.log.error({ err }, `PUT ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to update record" });
    }
  });
  router.delete(`${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await requireTenantId(req, res);
      if (!tenantId) return;
      await db.delete(table).where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `DELETE ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

catalogRoutes("/admin/library/categories", libraryCategoriesTable);
catalogRoutes("/admin/library/publishers", libraryPublishersTable);

// ── Books (joined with category + publisher names) ─────────────────────────────
router.get("/admin/library/books", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { search, categoryId, active } = req.query as Record<string, string>;
    const b = libraryBooksTable;
    const c = libraryCategoriesTable;
    const p = libraryPublishersTable;

    const conds: any[] = [eq(b.tenantId, tenantId)];
    if (search) conds.push(or(ilike(b.title, `%${search}%`), ilike(b.author, `%${search}%`), ilike(b.isbn, `%${search}%`)));
    if (categoryId) conds.push(eq(b.categoryId, categoryId));
    if (active !== undefined) conds.push(eq(b.active, active === "true"));

    const rows = await db
      .select({
        id: b.id, title: b.title, author: b.author, isbn: b.isbn,
        categoryId: b.categoryId, categoryName: c.name,
        publisherId: b.publisherId, publisherName: p.name,
        edition: b.edition, yearPublished: b.yearPublished,
        totalCopies: b.totalCopies, availableCopies: b.availableCopies,
        shelfLocation: b.shelfLocation, description: b.description,
        active: b.active, createdAt: b.createdAt,
      })
      .from(b)
      .leftJoin(c, eq(b.categoryId, c.id))
      .leftJoin(p, eq(b.publisherId, p.id))
      .where(and(...conds))
      .orderBy(asc(b.title));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET library books failed");
    return res.status(500).json({ error: "Failed to fetch books" });
  }
});

router.post("/admin/library/books", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...body } = req.body as any;
    if (body.totalCopies !== undefined && body.availableCopies === undefined) {
      body.availableCopies = body.totalCopies;
    }
    const row = ((await db.insert(libraryBooksTable).values({ ...body, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Book already exists" });
    req.log.error({ err }, "POST library book failed");
    return res.status(500).json({ error: "Failed to create book" });
  }
});

router.put("/admin/library/books/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const { id: _id, createdAt: _ca, tenantId: _tid, ...body } = req.body as any;
    const [row] = await db
      .update(libraryBooksTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(libraryBooksTable.id, String(req.params.id)), eq(libraryBooksTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Book already exists" });
    req.log.error({ err }, "PUT library book failed");
    return res.status(500).json({ error: "Failed to update book" });
  }
});

router.delete("/admin/library/books/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    await db.delete(libraryBooksTable)
      .where(and(eq(libraryBooksTable.id, String(req.params.id)), eq(libraryBooksTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE library book failed");
    return res.status(500).json({ error: "Failed to delete book" });
  }
});

// ── Helper: adjust availableCopies on issue status change ─────────────────────
async function adjustAvailability(bookId: string, delta: number) {
  if (!bookId || delta === 0) return;
  await db
    .update(libraryBooksTable)
    .set({
      availableCopies: sql`GREATEST(0, LEAST(${libraryBooksTable.totalCopies}, ${libraryBooksTable.availableCopies} + ${delta}))`,
      updatedAt: new Date(),
    })
    .where(eq(libraryBooksTable.id, bookId));
}

// ── Auto-mark overdue and return joined issues list ────────────────────────────
async function listIssuesJoined(conds: any[]) {
  const b = libraryBooksTable;
  const i = libraryIssuesTable;
  return db
    .select({
      id: i.id, bookId: i.bookId, bookTitle: b.title, bookAuthor: b.author, shelfLocation: b.shelfLocation,
      studentId: i.studentId, studentName: i.studentName, applicantId: i.applicantId,
      issuedDate: i.issuedDate, dueDate: i.dueDate, returnedDate: i.returnedDate,
      fineAmount: i.fineAmount, status: i.status, notes: i.notes, createdAt: i.createdAt,
    })
    .from(i)
    .leftJoin(b, eq(i.bookId, b.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(i.createdAt));
}

// Issues ──────────────────────────────────────────────────────────────────────
router.get("/admin/library/issues", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { status, search, studentId } = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);

    // Auto-mark overdue: issued + past dueDate (scoped to this tenant)
    await db
      .update(libraryIssuesTable)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(and(
        eq(libraryIssuesTable.tenantId, tenantId),
        eq(libraryIssuesTable.status, "issued"),
        lt(libraryIssuesTable.dueDate, today),
      ));

    const conds: any[] = [eq(libraryIssuesTable.tenantId, tenantId)];
    if (studentId) conds.push(eq(libraryIssuesTable.studentId, studentId));
    if (status && status !== "all") conds.push(eq(libraryIssuesTable.status, status));
    if (search) conds.push(or(
      ilike(libraryIssuesTable.studentName, `%${search}%`),
      ilike(libraryIssuesTable.applicantId, `%${search}%`),
    ));

    const rows = await listIssuesJoined(conds);
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET library issues failed");
    return res.status(500).json({ error: "Failed to fetch issues" });
  }
});

router.post("/admin/library/issues", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...body } = req.body as any;

    // Verify student belongs to this tenant
    if (body.studentId) {
      const [stu] = await db.select({ id: studentsTable.id }).from(studentsTable)
        .where(and(eq(studentsTable.id, body.studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
      if (!stu) return res.status(403).json({ error: "Student not found in this tenant" });
    }

    const row = ((await db.insert(libraryIssuesTable).values({ ...body, tenantId }).returning()) as any[])[0];
    if (body.status === "issued" || !body.status) {
      await adjustAvailability(body.bookId, -1);
    }
    const [enriched] = await listIssuesJoined([eq(libraryIssuesTable.id, row.id)]);
    return res.status(201).json(enriched ?? row);
  } catch (err: any) {
    req.log.error({ err }, "POST library issue failed");
    return res.status(500).json({ error: "Failed to create issue" });
  }
});

router.put("/admin/library/issues/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select().from(libraryIssuesTable)
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ error: "Issue not found in this tenant" });

    const { id: _id, createdAt: _ca, tenantId: _tid, ...body } = req.body as any;
    if (body.status === "returned" && !body.returnedDate) {
      body.returnedDate = new Date().toISOString().slice(0, 10);
    }

    const [row] = await db.update(libraryIssuesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)))
      .returning();

    const wasOut = existing.status === "issued" || existing.status === "overdue";
    const nowOut = row.status === "issued" || row.status === "overdue";
    if (wasOut && !nowOut) await adjustAvailability(row.bookId, 1);
    else if (!wasOut && nowOut) await adjustAvailability(row.bookId, -1);

    const [enriched] = await listIssuesJoined([eq(libraryIssuesTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PUT library issue failed");
    return res.status(500).json({ error: "Failed to update issue" });
  }
});

router.patch("/admin/library/issues/:id/return", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select().from(libraryIssuesTable)
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ error: "Issue not found in this tenant" });

    const returnedDate = new Date().toISOString().slice(0, 10);
    const fineAmount = req.body.fineAmount ?? existing.fineAmount ?? 0;

    const [row] = await db
      .update(libraryIssuesTable)
      .set({ status: "returned", returnedDate, fineAmount, updatedAt: new Date() })
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)))
      .returning();

    if (existing.status === "issued" || existing.status === "overdue") {
      await adjustAvailability(row.bookId, 1);
    }

    const [enriched] = await listIssuesJoined([eq(libraryIssuesTable.id, row.id)]);
    return res.json(enriched ?? row);
  } catch (err) {
    req.log.error({ err }, "PATCH library issue return failed");
    return res.status(500).json({ error: "Failed to process return" });
  }
});

router.delete("/admin/library/issues/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const id = String(req.params.id);
    const [existing] = await db.select().from(libraryIssuesTable)
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ error: "Issue not found in this tenant" });

    await db.delete(libraryIssuesTable)
      .where(and(eq(libraryIssuesTable.id, id), eq(libraryIssuesTable.tenantId, tenantId)));

    if (existing.status === "issued" || existing.status === "overdue") {
      await adjustAvailability(existing.bookId, 1);
    }
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE library issue failed");
    return res.status(500).json({ error: "Failed to delete issue" });
  }
});

export default router;
