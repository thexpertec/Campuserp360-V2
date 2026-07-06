import { Router, type IRouter, type Request, type Response } from "express";
import { db, timetablePeriodsTable, timetableSlotsTable, classSubjectsTable, teacherSubjectAssignmentsTable, subjectsTable, classesTable, employeesTable } from "@workspace/db";
import { eq, and, asc, desc, gt, inArray, isNotNull, count } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

const PERIOD_TYPES = ["lecture", "break", "assembly", "activity", "lunch", "other"] as const;

const periodInsertSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMins: z.number().int().optional(),
  periodType: z.enum(PERIOD_TYPES).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const slotUpdateSchema = z.object({
  subjectName: z.string().optional(),
  subjectCode: z.string().optional(),
  teacherName: z.string().optional(),
  teacherEmployeeId: z.string().uuid().optional(),
}).strict();

function zodError(e: z.ZodError) { return e.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "); }

// ── Periods ───────────────────────────────────────────────────────────────────
router.get("/admin/timetable/periods", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(timetablePeriodsTable)
      .where(eq(timetablePeriodsTable.tenantId, tenantId))
      .orderBy(asc(timetablePeriodsTable.sortOrder), asc(timetablePeriodsTable.startTime));
    return res.json(rows);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/timetable/periods", requireAdmin, async (req: Request, res: Response) => {
  const parsed = periodInsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.insert(timetablePeriodsTable).values({ ...parsed.data, tenantId }).returning();
    return res.status(201).json(row);
  } catch (err: any) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// POST /admin/timetable/periods/bulk — bulk replace all periods for tenant
router.post("/admin/timetable/periods/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { periods, replaceAll } = req.body as { periods: any[]; replaceAll?: boolean };
    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({ error: "periods array required" });
    }
    const parsed = z.array(periodInsertSchema).safeParse(periods);
    if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
    if (replaceAll) {
      await db.delete(timetablePeriodsTable).where(eq(timetablePeriodsTable.tenantId, tenantId));
    }
    const rows = await db.insert(timetablePeriodsTable)
      .values(parsed.data.map((p, i) => ({ ...p, sortOrder: p.sortOrder ?? i, tenantId })))
      .returning();
    return res.json(rows);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/timetable/periods/:id", requireAdmin, async (req: Request, res: Response) => {
  const parsed = periodInsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [row] = await db.update(timetablePeriodsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(timetablePeriodsTable.id, String(req.params.id)), eq(timetablePeriodsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/timetable/periods/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(timetablePeriodsTable)
      .where(and(eq(timetablePeriodsTable.id, String(req.params.id)), eq(timetablePeriodsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// ── Slots ─────────────────────────────────────────────────────────────────────
router.get("/admin/timetable/slots", requireAdmin, async (req: Request, res: Response) => {
  const { classCode, dayOfWeek, academicYearId } = req.query as Record<string, string>;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const conds: any[] = [eq(timetableSlotsTable.tenantId, tenantId)];
    if (classCode) conds.push(eq(timetableSlotsTable.classCode, classCode));
    if (dayOfWeek) conds.push(eq(timetableSlotsTable.dayOfWeek, Number(dayOfWeek)));
    if (academicYearId) conds.push(eq(timetableSlotsTable.academicYearId, academicYearId));
    const rows = await db.select().from(timetableSlotsTable)
      .where(and(...conds))
      .orderBy(asc(timetableSlotsTable.dayOfWeek), asc(timetableSlotsTable.periodId));
    return res.json(rows);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/timetable/slots", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const [row] = await db.insert(timetableSlotsTable).values({ ...data, tenantId }).returning();
    return res.status(201).json(row);
  } catch (err: any) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// Upsert by key (classCode + dayOfWeek + periodId)
router.put("/admin/timetable/slots/upsert", requireAdmin, async (req: Request, res: Response) => {
  const { classCode, dayOfWeek, periodId, id: _id, createdAt: _ca, ...data } = req.body as {
    classCode: string; dayOfWeek: number; periodId: string; [k: string]: any
  };
  if (!classCode || !dayOfWeek || !periodId) return res.status(400).json({ error: "classCode, dayOfWeek, periodId required" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const existing = await db.select().from(timetableSlotsTable)
      .where(and(
        eq(timetableSlotsTable.classCode, classCode),
        eq(timetableSlotsTable.dayOfWeek, dayOfWeek),
        eq(timetableSlotsTable.periodId, periodId),
        eq(timetableSlotsTable.tenantId, tenantId),
      )).limit(1);
    let row;
    if (existing.length) {
      [row] = await db.update(timetableSlotsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(timetableSlotsTable.id, existing[0].id)).returning();
    } else {
      [row] = await db.insert(timetableSlotsTable)
        .values({ classCode, dayOfWeek, periodId, ...data, tenantId }).returning();
    }
    return res.json(row);
  } catch (err: any) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.put("/admin/timetable/slots/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const parsed = slotUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
    const [row] = await db.update(timetableSlotsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(timetableSlotsTable.id, String(req.params.id)), eq(timetableSlotsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/timetable/slots/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(timetableSlotsTable)
      .where(and(eq(timetableSlotsTable.id, String(req.params.id)), eq(timetableSlotsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// Clear all slots for a class
router.delete("/admin/timetable/slots", requireAdmin, async (req: Request, res: Response) => {
  const { classCode } = req.query as Record<string, string>;
  if (!classCode) return res.status(400).json({ error: "classCode required" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(timetableSlotsTable)
      .where(and(eq(timetableSlotsTable.classCode, classCode), eq(timetableSlotsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// ── Class ↔ Subject assignments ────────────────────────────────────────────────
router.get("/admin/timetable/class-subjects", requireAdmin, async (req: Request, res: Response) => {
  const { classId } = req.query as Record<string, string>;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    if (classId) {
      const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
        .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
      if (!cls) return res.status(404).json({ error: "Class not found" });
    }
    // Scope by classId (already tenant-exclusive via the classes FK) rather than
    // the class_subjects row's own tenant_id, which can drift out of sync with the
    // owning class (see class-subjects tenant drift note below).
    const conds: any[] = classId
      ? [eq(classSubjectsTable.classId, classId)]
      : [eq(classSubjectsTable.tenantId, tenantId)];
    const rows = await db.select({
      id: classSubjectsTable.id,
      classId: classSubjectsTable.classId,
      subjectId: classSubjectsTable.subjectId,
      periodsPerWeek: classSubjectsTable.periodsPerWeek,
      sortOrder: classSubjectsTable.sortOrder,
      subjectName: subjectsTable.name,
      subjectCode: subjectsTable.code,
      subjectType: subjectsTable.type,
    })
      .from(classSubjectsTable)
      .innerJoin(subjectsTable, eq(classSubjectsTable.subjectId, subjectsTable.id))
      .where(and(...conds))
      .orderBy(asc(classSubjectsTable.sortOrder), asc(subjectsTable.name));
    return res.json(rows);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/timetable/class-subjects/bulk", requireAdmin, async (req: Request, res: Response) => {
  const { classId, subjects } = req.body as { classId: string; subjects: { subjectId: string; periodsPerWeek: number }[] };
  if (!classId) return res.status(400).json({ error: "classId required" });
  if (!Array.isArray(subjects)) return res.status(400).json({ error: "subjects must be array" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [cls] = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId))).limit(1);
    if (!cls) return res.status(404).json({ error: "Class not found" });
    // Scope the delete by classId alone: a class already belongs to exactly one
    // tenant (enforced by the classes FK), so this also clears any stale rows
    // whose stored tenant_id had drifted out of sync with the owning class —
    // otherwise those rows survive the delete and collide with the fresh insert
    // below on the (classId, subjectId) unique index.
    await db.delete(classSubjectsTable)
      .where(eq(classSubjectsTable.classId, classId));
    if (subjects.length) {
      await db.insert(classSubjectsTable).values(
        subjects.map((s, i) => ({ classId, subjectId: s.subjectId, periodsPerWeek: Math.max(0, s.periodsPerWeek ?? 0), sortOrder: i, tenantId })),
      );
    }
    return res.json({ saved: subjects.length });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// Grid-style save: apply a set of class+subject cell changes (periods-per-week
// or removal) across many classes at once, in a single transaction. Only the
// affected class/subject pairs are touched — other subjects already assigned
// to those classes are left untouched (unlike the single-class bulk endpoint
// above, which replaces a whole class's subject list).
const classSubjectGridChangeSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  periodsPerWeek: z.number().int().min(0).optional(),
  assigned: z.boolean(),
});

router.post("/admin/timetable/class-subjects/by-grid", requireAdmin, async (req: Request, res: Response) => {
  const { changes } = req.body as {
    changes: { classId: string; subjectId: string; periodsPerWeek?: number; assigned: boolean }[];
  };
  if (!Array.isArray(changes) || changes.length === 0) return res.status(400).json({ error: "changes array required" });
  const parsed = z.array(classSubjectGridChangeSchema).safeParse(changes);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const classIds = [...new Set(parsed.data.map(c => c.classId))];
    const ownedClasses = await db.select({ id: classesTable.id }).from(classesTable)
      .where(and(inArray(classesTable.id, classIds), eq(classesTable.tenantId, tenantId)));
    if (ownedClasses.length !== classIds.length) {
      return res.status(404).json({ error: "One or more classes not found" });
    }

    const subjectIds = [...new Set(parsed.data.map(c => c.subjectId))];
    const ownedSubjects = await db.select({ id: subjectsTable.id }).from(subjectsTable)
      .where(and(inArray(subjectsTable.id, subjectIds), eq(subjectsTable.tenantId, tenantId)));
    if (ownedSubjects.length !== subjectIds.length) {
      return res.status(404).json({ error: "One or more subjects not found" });
    }

    const toAdd = parsed.data.filter(c => c.assigned);
    const toRemove = parsed.data.filter(c => !c.assigned);
    await db.transaction(async (tx) => {
      for (const c of toRemove) {
        await tx.delete(classSubjectsTable)
          .where(and(eq(classSubjectsTable.classId, c.classId), eq(classSubjectsTable.subjectId, c.subjectId)));
      }
      for (const c of toAdd) {
        await tx.insert(classSubjectsTable)
          .values({ classId: c.classId, subjectId: c.subjectId, periodsPerWeek: Math.max(0, c.periodsPerWeek ?? 0), tenantId })
          .onConflictDoUpdate({
            target: [classSubjectsTable.classId, classSubjectsTable.subjectId],
            set: { periodsPerWeek: Math.max(0, c.periodsPerWeek ?? 0), tenantId },
          });
      }
    });
    return res.json({ saved: toAdd.length, removed: toRemove.length });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// ── Teacher ↔ Subject ↔ Class assignments ────────────────────────────────────
router.get("/admin/timetable/teacher-assignments", requireAdmin, async (req: Request, res: Response) => {
  const { employeeId, classId } = req.query as Record<string, string>;
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const conds: any[] = [eq(teacherSubjectAssignmentsTable.tenantId, tenantId)];
    if (employeeId) conds.push(eq(teacherSubjectAssignmentsTable.employeeId, employeeId));
    if (classId) conds.push(eq(teacherSubjectAssignmentsTable.classId, classId));
    const rows = await db.select({
      id: teacherSubjectAssignmentsTable.id,
      employeeId: teacherSubjectAssignmentsTable.employeeId,
      classId: teacherSubjectAssignmentsTable.classId,
      subjectId: teacherSubjectAssignmentsTable.subjectId,
      periodsPerWeek: teacherSubjectAssignmentsTable.periodsPerWeek,
      subjectName: subjectsTable.name,
      subjectCode: subjectsTable.code,
      className: classesTable.name,
      classCode: classesTable.code,
      teacherFullName: employeesTable.fullName,
    })
      .from(teacherSubjectAssignmentsTable)
      .innerJoin(subjectsTable, eq(teacherSubjectAssignmentsTable.subjectId, subjectsTable.id))
      .innerJoin(classesTable, eq(teacherSubjectAssignmentsTable.classId, classesTable.id))
      .leftJoin(employeesTable, eq(teacherSubjectAssignmentsTable.employeeId, employeesTable.id))
      .where(and(...conds))
      .orderBy(asc(classesTable.sortOrder), asc(subjectsTable.name));
    return res.json(rows.map(r => ({
      ...r,
      teacherName: r.teacherFullName ?? null,
    })));
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/timetable/teacher-assignments/bulk", requireAdmin, async (req: Request, res: Response) => {
  const { employeeId, classId, subjects } = req.body as {
    employeeId: string; classId: string; subjects: { subjectId: string; periodsPerWeek: number }[];
  };
  if (!employeeId || !classId) return res.status(400).json({ error: "employeeId and classId required" });
  if (!Array.isArray(subjects)) return res.status(400).json({ error: "subjects must be array" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(teacherSubjectAssignmentsTable)
      .where(and(
        eq(teacherSubjectAssignmentsTable.employeeId, employeeId),
        eq(teacherSubjectAssignmentsTable.classId, classId),
        eq(teacherSubjectAssignmentsTable.tenantId, tenantId),
      ));
    if (subjects.length) {
      await db.insert(teacherSubjectAssignmentsTable).values(
        subjects.map(s => ({ employeeId, classId, subjectId: s.subjectId, periodsPerWeek: Math.max(0, s.periodsPerWeek ?? 0), tenantId }))
      );
    }
    return res.json({ saved: subjects.length });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.post("/admin/timetable/teacher-assignments/by-class", requireAdmin, async (req: Request, res: Response) => {
  const { classId, assignments } = req.body as {
    classId: string;
    assignments: { subjectId: string; employeeId: string | null; periodsPerWeek: number }[];
  };
  if (!classId) return res.status(400).json({ error: "classId required" });
  if (!Array.isArray(assignments)) return res.status(400).json({ error: "assignments must be array" });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(teacherSubjectAssignmentsTable)
      .where(and(eq(teacherSubjectAssignmentsTable.classId, classId), eq(teacherSubjectAssignmentsTable.tenantId, tenantId)));
    const toInsert = assignments.filter(a => a.employeeId && a.periodsPerWeek > 0);
    if (toInsert.length) {
      await db.insert(teacherSubjectAssignmentsTable).values(
        toInsert.map(a => ({ employeeId: a.employeeId!, classId, subjectId: a.subjectId, periodsPerWeek: Math.max(0, a.periodsPerWeek), tenantId }))
      );
    }
    return res.json({ saved: toInsert.length });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// Grid-style save: given a teacher, apply a set of class+subject cell toggles
// (on/off) across many classes at once, in a single transaction. Only the
// affected class/subject pairs are touched — assignments for other
// classes/subjects for this teacher are left untouched.
const teacherGridChangeSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  periodsPerWeek: z.number().int().min(0).optional(),
  assigned: z.boolean(),
});

router.post("/admin/timetable/teacher-assignments/by-teacher", requireAdmin, async (req: Request, res: Response) => {
  const { employeeId, changes } = req.body as {
    employeeId: string;
    changes: { classId: string; subjectId: string; periodsPerWeek?: number; assigned: boolean }[];
  };
  if (!employeeId) return res.status(400).json({ error: "employeeId required" });
  if (!Array.isArray(changes) || changes.length === 0) return res.status(400).json({ error: "changes array required" });
  const parsed = z.array(teacherGridChangeSchema).safeParse(changes);
  if (!parsed.success) return res.status(400).json({ error: zodError(parsed.error) });
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const toAdd = parsed.data.filter(c => c.assigned);
    const toRemove = parsed.data.filter(c => !c.assigned);
    await db.transaction(async (tx) => {
      for (const c of toRemove) {
        await tx.delete(teacherSubjectAssignmentsTable)
          .where(and(
            eq(teacherSubjectAssignmentsTable.employeeId, employeeId),
            eq(teacherSubjectAssignmentsTable.classId, c.classId),
            eq(teacherSubjectAssignmentsTable.subjectId, c.subjectId),
            eq(teacherSubjectAssignmentsTable.tenantId, tenantId),
          ));
      }
      for (const c of toAdd) {
        await tx.insert(teacherSubjectAssignmentsTable)
          .values({ employeeId, classId: c.classId, subjectId: c.subjectId, periodsPerWeek: Math.max(0, c.periodsPerWeek ?? 0), tenantId })
          .onConflictDoUpdate({
            target: [teacherSubjectAssignmentsTable.employeeId, teacherSubjectAssignmentsTable.classId, teacherSubjectAssignmentsTable.subjectId],
            set: { periodsPerWeek: Math.max(0, c.periodsPerWeek ?? 0), updatedAt: new Date() },
          });
      }
    });
    return res.json({ saved: toAdd.length, removed: toRemove.length });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

router.delete("/admin/timetable/teacher-assignments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(teacherSubjectAssignmentsTable)
      .where(and(eq(teacherSubjectAssignmentsTable.id, String(req.params.id)), eq(teacherSubjectAssignmentsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// ── Auto-generate helpers ──────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type GenResult = { generated: number; unplaced: number; classCode: string; classId: string; error?: string };

async function runAutoGenerateForClass(classId: string, activeDays: number[], tenantId: string): Promise<GenResult> {
  const [classRow] = await db.select().from(classesTable)
    .where(and(eq(classesTable.id, classId), eq(classesTable.tenantId, tenantId)));
  if (!classRow) return { generated: 0, unplaced: 0, classCode: "", classId, error: "Class not found" };
  const classCode = classRow.code;

  const subjectRows = await db.select({
    subjectId: classSubjectsTable.subjectId,
    subjectName: subjectsTable.name,
    subjectCode: subjectsTable.code,
    periodsPerWeek: classSubjectsTable.periodsPerWeek,
    teacherEmployeeId: teacherSubjectAssignmentsTable.employeeId,
    teacherFullName: employeesTable.fullName,
  })
    .from(classSubjectsTable)
    .innerJoin(subjectsTable, eq(classSubjectsTable.subjectId, subjectsTable.id))
    .leftJoin(teacherSubjectAssignmentsTable, and(
      eq(teacherSubjectAssignmentsTable.classId, classId),
      eq(teacherSubjectAssignmentsTable.subjectId, classSubjectsTable.subjectId),
    ))
    .leftJoin(employeesTable, eq(teacherSubjectAssignmentsTable.employeeId, employeesTable.id))
    .where(and(
      eq(classSubjectsTable.classId, classId),
      gt(classSubjectsTable.periodsPerWeek, 0),
      eq(classSubjectsTable.tenantId, tenantId),
    ));

  if (!subjectRows.length) return { generated: 0, unplaced: 0, classCode, classId, error: "No subjects" };

  const lecturePeriods = await db.select().from(timetablePeriodsTable)
    .where(and(eq(timetablePeriodsTable.periodType, "lecture"), eq(timetablePeriodsTable.tenantId, tenantId)))
    .orderBy(asc(timetablePeriodsTable.sortOrder));

  if (!lecturePeriods.length) return { generated: 0, unplaced: 0, classCode, classId, error: "No periods" };

  type Ev = { subjectName: string; subjectCode: string; teacherName: string | null; teacherEmployeeId: string | null };
  const events: Ev[] = [];
  for (const row of [...subjectRows].sort((a, b) => (b.periodsPerWeek ?? 0) - (a.periodsPerWeek ?? 0))) {
    const teacherName = row.teacherFullName ?? null;
    for (let i = 0; i < (row.periodsPerWeek ?? 0); i++) {
      events.push({ subjectName: row.subjectName, subjectCode: row.subjectCode, teacherName, teacherEmployeeId: row.teacherEmployeeId ?? null });
    }
  }
  shuffle(events);

  const slotsToInsert: any[] = [];
  const teacherUsed = new Set<string>();
  const remaining = [...events];

  for (const period of lecturePeriods) {
    for (const day of activeDays) {
      if (!remaining.length) break;
      let placed = false;
      for (let i = 0; i < remaining.length; i++) {
        const ev = remaining[i];
        const key = ev.teacherEmployeeId ? `${ev.teacherEmployeeId}:${day}:${period.id}` : null;
        if (!key || !teacherUsed.has(key)) {
          if (key) teacherUsed.add(key);
          slotsToInsert.push({ classCode, dayOfWeek: day, periodId: period.id, subjectName: ev.subjectName, subjectCode: ev.subjectCode, teacherName: ev.teacherName ?? undefined, teacherEmployeeId: ev.teacherEmployeeId ?? undefined, tenantId });
          remaining.splice(i, 1);
          placed = true;
          break;
        }
      }
      if (!placed && remaining.length) {
        const ev = remaining.shift()!;
        slotsToInsert.push({ classCode, dayOfWeek: day, periodId: period.id, subjectName: ev.subjectName, subjectCode: ev.subjectCode, teacherName: ev.teacherName ?? undefined, tenantId });
      }
    }
  }

  await db.delete(timetableSlotsTable)
    .where(and(
      eq(timetableSlotsTable.classCode, classCode),
      inArray(timetableSlotsTable.dayOfWeek, activeDays),
      eq(timetableSlotsTable.tenantId, tenantId),
    ));
  if (slotsToInsert.length) await db.insert(timetableSlotsTable).values(slotsToInsert);

  return { generated: slotsToInsert.length, unplaced: remaining.length, classCode, classId };
}

router.post("/admin/timetable/auto-generate", requireAdmin, async (req: Request, res: Response) => {
  const { classId, activeDays: rawDays } = req.body as { classId: string; activeDays?: number[] };
  if (!classId) return res.status(400).json({ error: "classId required" });
  const activeDays = (Array.isArray(rawDays) && rawDays.length) ? rawDays.map(Number).filter(d => d >= 1 && d <= 7) : [1, 2, 3, 4, 5];
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const r = await runAutoGenerateForClass(classId, activeDays, tenantId);
    if (r.error === "Class not found") return res.status(404).json({ error: r.error });
    if (r.error === "No subjects") return res.status(422).json({ error: "No subjects with periods assigned to this class" });
    if (r.error === "No periods") return res.status(422).json({ error: "No lecture periods defined — set up periods first" });
    return res.json({ generated: r.generated, unplaced: r.unplaced, classCode: r.classCode });
  } catch (err) { req.log.error({ err }, "auto-generate failed"); return res.status(500).json({ error: "Auto-generate failed" }); }
});

router.post("/admin/timetable/auto-generate-all", requireAdmin, async (req: Request, res: Response) => {
  const { activeDays: rawDays } = req.body as { activeDays?: number[] };
  const activeDays = (Array.isArray(rawDays) && rawDays.length) ? rawDays.map(Number).filter(d => d >= 1 && d <= 7) : [1, 2, 3, 4, 5];
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const allClasses = await db.select({ id: classesTable.id, name: classesTable.name })
      .from(classesTable)
      .where(eq(classesTable.tenantId, tenantId))
      .orderBy(asc(classesTable.sortOrder));
    let totalGenerated = 0; let totalUnplaced = 0;
    const classes: { classId: string; className: string; generated: number; unplaced: number; skipped?: string }[] = [];
    for (const cls of allClasses) {
      const r = await runAutoGenerateForClass(cls.id, activeDays, tenantId);
      if (r.error) { classes.push({ classId: cls.id, className: cls.name, generated: 0, unplaced: 0, skipped: r.error }); continue; }
      totalGenerated += r.generated; totalUnplaced += r.unplaced;
      classes.push({ classId: cls.id, className: cls.name, generated: r.generated, unplaced: r.unplaced });
    }
    return res.json({ classes, totalGenerated, totalUnplaced });
  } catch (err) { req.log.error({ err }, "auto-generate-all failed"); return res.status(500).json({ error: "Auto-generate-all failed" }); }
});

// ── All slots (no classCode filter) — for master timetable view ───────────────
router.get("/admin/timetable/all-slots", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(timetableSlotsTable)
      .where(eq(timetableSlotsTable.tenantId, tenantId))
      .orderBy(asc(timetableSlotsTable.classCode), asc(timetableSlotsTable.dayOfWeek), asc(timetableSlotsTable.periodId));
    return res.json(rows);
  } catch (err) { req.log.error({ err }); return res.status(500).json({ error: "Failed" }); }
});

// ── Timetable summary dashboard ────────────────────────────────────────────────
router.get("/admin/timetable/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const [periodRows, slotCountRow, classCovRows, dayRows, teacherRows] = await Promise.all([
      db.select({ periodType: timetablePeriodsTable.periodType, cnt: count() })
        .from(timetablePeriodsTable)
        .where(and(eq(timetablePeriodsTable.active, true), eq(timetablePeriodsTable.tenantId, tenantId)))
        .groupBy(timetablePeriodsTable.periodType),

      db.select({ n: count() }).from(timetableSlotsTable).where(eq(timetableSlotsTable.tenantId, tenantId)),

      db.select({ classCode: timetableSlotsTable.classCode, cnt: count() })
        .from(timetableSlotsTable)
        .where(eq(timetableSlotsTable.tenantId, tenantId))
        .groupBy(timetableSlotsTable.classCode)
        .orderBy(asc(timetableSlotsTable.classCode)),

      db.select({ day: timetableSlotsTable.dayOfWeek, cnt: count() })
        .from(timetableSlotsTable)
        .where(eq(timetableSlotsTable.tenantId, tenantId))
        .groupBy(timetableSlotsTable.dayOfWeek)
        .orderBy(asc(timetableSlotsTable.dayOfWeek)),

      db.select({ teacherName: timetableSlotsTable.teacherName, cnt: count() })
        .from(timetableSlotsTable)
        .where(and(isNotNull(timetableSlotsTable.teacherName), eq(timetableSlotsTable.tenantId, tenantId)))
        .groupBy(timetableSlotsTable.teacherName)
        .orderBy(desc(count()))
        .limit(8),
    ]);

    const periodTypeMap: Record<string, number> = {};
    periodRows.forEach(r => { periodTypeMap[r.periodType] = Number(r.cnt); });
    const totalPeriods   = Object.values(periodTypeMap).reduce((s, n) => s + n, 0);
    const lecturePeriods = periodTypeMap["lecture"] ?? 0;
    const totalSlots     = Number(slotCountRow[0]?.n ?? 0);
    const classesCovered = classCovRows.length;
    const teacherCount   = teacherRows.length;

    const DAY_LABELS: Record<number, string> = { 1:"Mon", 2:"Tue", 3:"Wed", 4:"Thu", 5:"Fri", 6:"Sat", 7:"Sun" };
    const slotsByDay = dayRows.map(r => ({
      day: r.day, label: DAY_LABELS[r.day] ?? `Day ${r.day}`, count: Number(r.cnt),
    }));

    return res.json({
      totalPeriods, lecturePeriods, totalSlots, classesCovered, teacherCount, slotsByDay,
      topTeachers:   teacherRows.map(r => ({ teacherName: r.teacherName, count: Number(r.cnt) })),
      classCoverage: classCovRows.map(r => ({ classCode: r.classCode, count: Number(r.cnt) })),
    });
  } catch (err) {
    req.log.error({ err }, "GET timetable summary failed");
    return res.status(500).json({ error: "Failed to load timetable summary" });
  }
});

export default router;
