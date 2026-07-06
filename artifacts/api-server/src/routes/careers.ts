import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  careerPositionsTable,
  careerApplicationsTable,
  careerApplicationPositionsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth.js";
import { getAdminTenantId } from "../lib/tenant.js";
import { resolveTenantStrict } from "../lib/tenant.js";
import { z } from "zod/v4";

const router: IRouter = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreatePositionBody = z.object({
  title:     z.string().min(1).max(200),
  isActive:  z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

const UpdatePositionBody = CreatePositionBody.partial();

const CAREER_STATUSES = ["new", "reviewed", "shortlisted", "rejected"] as const;

const CareerAppBody = z.object({
  fullName:   z.string().min(2).max(200),
  fatherName: z.string().max(200).optional().nullable(),
  cnic:       z.string().max(20).optional().nullable(),
  dob:        z.string().max(30).optional().nullable(),
  gender:     z.string().max(20).optional().nullable(),
  phone:      z.string().min(7).max(30),
  email:      z.string().email().max(200),
  address:    z.string().max(1000).optional().nullable(),
  education:  z.string().max(5000).optional().nullable(),
  experience: z.string().max(5000).optional().nullable(),
  coverNote:  z.string().max(3000).optional().nullable(),
  // Position IDs are optional — zero-or-more
  positionIds: z.array(z.string().uuid()).optional().default([]),
});

const UpdateStatusBody = z.object({
  status: z.enum(CAREER_STATUSES),
});

// ── Public: list active positions ─────────────────────────────────────────────

router.get("/website/career-positions", async (req: Request, res: Response) => {
  const tenant = await resolveTenantStrict(req);
  if (!tenant) return res.status(400).json({ error: "Tenant could not be determined." });

  try {
    const rows = await db
      .select({ id: careerPositionsTable.id, title: careerPositionsTable.title })
      .from(careerPositionsTable)
      .where(and(
        eq(careerPositionsTable.tenantId, tenant.id),
        eq(careerPositionsTable.isActive, true),
      ))
      .orderBy(asc(careerPositionsTable.sortOrder), asc(careerPositionsTable.title));

    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list career positions");
    return res.status(500).json({ error: "Failed to load positions" });
  }
});

// ── Public: submit career application ─────────────────────────────────────────

router.post("/website/career-applications", async (req: Request, res: Response) => {
  const tenant = await resolveTenantStrict(req);
  if (!tenant) return res.status(400).json({ error: "Tenant could not be determined." });

  const parsed = CareerAppBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
  }
  const input = parsed.data;

  // Validate positionIds belong to this tenant (if any were submitted)
  if (input.positionIds.length > 0) {
    const found = await db
      .select({ id: careerPositionsTable.id })
      .from(careerPositionsTable)
      .where(and(
        inArray(careerPositionsTable.id, input.positionIds),
        eq(careerPositionsTable.tenantId, tenant.id),
        eq(careerPositionsTable.isActive, true),
      ));
    if (found.length !== input.positionIds.length) {
      return res.status(400).json({ error: "One or more selected positions are invalid." });
    }
  }

  try {
    const [created] = await db
      .insert(careerApplicationsTable)
      .values({
        tenantId:   tenant.id,
        fullName:   input.fullName,
        fatherName: input.fatherName ?? null,
        cnic:       input.cnic ?? null,
        dob:        input.dob ?? null,
        gender:     input.gender ?? null,
        phone:      input.phone,
        email:      input.email,
        address:    input.address ?? null,
        education:  input.education ?? null,
        experience: input.experience ?? null,
        coverNote:  input.coverNote ?? null,
        status:     "new",
      })
      .returning();

    if (!created) throw new Error("Insert returned no row");

    if (input.positionIds.length > 0) {
      await db.insert(careerApplicationPositionsTable).values(
        input.positionIds.map((positionId) => ({
          applicationId: created.id,
          positionId,
        })),
      );
    }

    return res.status(201).json({ id: created.id, status: created.status });
  } catch (err) {
    req.log.error({ err }, "Failed to save career application");
    return res.status(500).json({ error: "Failed to submit application" });
  }
});

// ── Admin: positions CRUD ─────────────────────────────────────────────────────

router.get("/admin/career-positions", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  try {
    const rows = await db
      .select()
      .from(careerPositionsTable)
      .where(eq(careerPositionsTable.tenantId, tenantId))
      .orderBy(asc(careerPositionsTable.sortOrder), asc(careerPositionsTable.title));

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list career positions (admin)");
    return res.status(500).json({ error: "Failed to load positions" });
  }
});

router.post("/admin/career-positions", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  const parsed = CreatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
  }

  try {
    const [row] = await db
      .insert(careerPositionsTable)
      .values({ ...parsed.data, tenantId })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create career position");
    return res.status(500).json({ error: "Failed to create position" });
  }
});

router.patch("/admin/career-positions/:id", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  const posId = String(req.params["id"]);
  const parsed = UpdatePositionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
  }

  try {
    const [row] = await db
      .update(careerPositionsTable)
      .set(parsed.data)
      .where(and(
        eq(careerPositionsTable.id, posId),
        eq(careerPositionsTable.tenantId, tenantId),
      ))
      .returning();

    if (!row) return res.status(404).json({ error: "Position not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update career position");
    return res.status(500).json({ error: "Failed to update position" });
  }
});

// ── Admin: career applications ────────────────────────────────────────────────

router.get("/admin/career-applications", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  const page     = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
  const offset   = (page - 1) * pageSize;
  const q        = String(req.query.q ?? "").trim();
  const status   = String(req.query.status ?? "").trim();

  const filters = [eq(careerApplicationsTable.tenantId, tenantId)];
  if (status) filters.push(eq(careerApplicationsTable.status, status));
  if (q) {
    const qFilter = or(
      ilike(careerApplicationsTable.fullName, `%${q}%`),
      ilike(careerApplicationsTable.email, `%${q}%`),
      ilike(careerApplicationsTable.phone, `%${q}%`),
    );
    if (qFilter) filters.push(qFilter);
  }

  try {
    const [{ total = 0 } = {}] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(careerApplicationsTable)
      .where(and(...filters));

    const rows = await db
      .select({
        id:        careerApplicationsTable.id,
        fullName:  careerApplicationsTable.fullName,
        email:     careerApplicationsTable.email,
        phone:     careerApplicationsTable.phone,
        status:    careerApplicationsTable.status,
        createdAt: careerApplicationsTable.createdAt,
      })
      .from(careerApplicationsTable)
      .where(and(...filters))
      .orderBy(desc(careerApplicationsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    const junctions = ids.length
      ? await db
          .select({
            applicationId: careerApplicationPositionsTable.applicationId,
            positionId:    careerApplicationPositionsTable.positionId,
            title:         careerPositionsTable.title,
          })
          .from(careerApplicationPositionsTable)
          .innerJoin(careerPositionsTable, eq(careerApplicationPositionsTable.positionId, careerPositionsTable.id))
          .where(inArray(careerApplicationPositionsTable.applicationId, ids))
      : [];

    const posMap = new Map<string, { positionId: string; title: string }[]>();
    for (const j of junctions) {
      const arr = posMap.get(j.applicationId) ?? [];
      arr.push({ positionId: j.positionId, title: j.title });
      posMap.set(j.applicationId, arr);
    }

    return res.json({
      total: Number(total),
      page,
      pageSize,
      items: rows.map((r) => ({ ...r, positions: posMap.get(r.id) ?? [] })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list career applications");
    return res.status(500).json({ error: "Failed to load applications" });
  }
});

router.get("/admin/career-applications/:id", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  const appId = String(req.params["id"]);
  try {
    const [app] = await db
      .select()
      .from(careerApplicationsTable)
      .where(and(
        eq(careerApplicationsTable.id, appId),
        eq(careerApplicationsTable.tenantId, tenantId),
      ));

    if (!app) return res.status(404).json({ error: "Application not found" });

    const positions = await db
      .select({
        positionId: careerApplicationPositionsTable.positionId,
        title:      careerPositionsTable.title,
      })
      .from(careerApplicationPositionsTable)
      .innerJoin(careerPositionsTable, eq(careerApplicationPositionsTable.positionId, careerPositionsTable.id))
      .where(eq(careerApplicationPositionsTable.applicationId, app.id));

    return res.json({ ...app, positions });
  } catch (err) {
    req.log.error({ err }, "Failed to get career application");
    return res.status(500).json({ error: "Failed to load application" });
  }
});

router.patch("/admin/career-applications/:id/status", requireAdmin, async (req: Request, res: Response) => {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

  const appId = String(req.params["id"]);
  const parsed = UpdateStatusBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: `Status must be one of: ${CAREER_STATUSES.join(", ")}` });
  }

  try {
    const [updated] = await db
      .update(careerApplicationsTable)
      .set({ status: parsed.data.status })
      .where(and(
        eq(careerApplicationsTable.id, appId),
        eq(careerApplicationsTable.tenantId, tenantId),
      ))
      .returning();

    if (!updated) return res.status(404).json({ error: "Application not found" });

    // Return full detail including positions (matches CareerApplicationDetail schema)
    const positions = await db
      .select({
        positionId: careerApplicationPositionsTable.positionId,
        title:      careerPositionsTable.title,
      })
      .from(careerApplicationPositionsTable)
      .innerJoin(careerPositionsTable, eq(careerApplicationPositionsTable.positionId, careerPositionsTable.id))
      .where(eq(careerApplicationPositionsTable.applicationId, updated.id));

    return res.json({ ...updated, positions });
  } catch (err) {
    req.log.error({ err }, "Failed to update career application status");
    return res.status(500).json({ error: "Failed to update status" });
  }
});

export default router;
