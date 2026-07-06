import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  examTypesTable, examGradingScalesTable, examGradeBandsTable,
  examSchedulesTable, examResultsTable, studentsTable, studentEnrollmentsTable,
  classesTable, classSubjectsTable, subjectsTable,
} from "@workspace/db";
import { eq, asc, and, inArray, desc, isNull } from "drizzle-orm";
import { requireAdmin, requireRole, realAdminUserId } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";

const router: IRouter = Router();

// ── Helper: validate subjectCode belongs to classCode for tenant ──────────────
async function validateSubjectInClass(
  tenantId: string,
  classCode: string,
  subjectCode: string,
): Promise<boolean> {
  const [cls] = await db
    .select({ id: classesTable.id })
    .from(classesTable)
    .where(and(eq(classesTable.code, classCode), eq(classesTable.tenantId, tenantId)))
    .limit(1);
  if (!cls) return false;
  const [sub] = await db
    .select({ id: subjectsTable.id })
    .from(subjectsTable)
    .where(and(eq(subjectsTable.code, subjectCode), eq(subjectsTable.tenantId, tenantId), eq(subjectsTable.active, true)))
    .limit(1);
  if (!sub) return false;
  const [link] = await db
    .select({ id: classSubjectsTable.id })
    .from(classSubjectsTable)
    .where(and(eq(classSubjectsTable.classId, cls.id), eq(classSubjectsTable.subjectId, sub.id)))
    .limit(1);
  return !!link;
}

// ── Generic catalog CRUD ──────────────────────────────────────────────────────
function catalogRoutes(path: string, table: any) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      const { id: _id, createdAt: _ca, ...body } = req.body as any;
      const [row] = await db.update(table).set({ ...body, updatedAt: new Date() })
        .where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId))).returning();
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
      await db.delete(table).where(and(eq(table.id, String(req.params.id)), eq(table.tenantId, tenantId)));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `DELETE ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

catalogRoutes("/admin/exams/types", examTypesTable);
catalogRoutes("/admin/exams/grading-scales", examGradingScalesTable);

// ── Seed Defaults ─────────────────────────────────────────────────────────────
router.post("/admin/exams/seed-defaults", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const DEFAULT_TYPES = [
      { name: "Monthly Test",          description: "Monthly class test",               active: true, sortOrder: 1 },
      { name: "Mid-Term Examination",  description: "Mid-term exam held in November",   active: true, sortOrder: 2 },
      { name: "Annual Examination",    description: "Year-end annual examinations",     active: true, sortOrder: 3 },
      { name: "Pre-Board Examination", description: "Board examination mock/practice",  active: true, sortOrder: 4 },
      { name: "Practical Exam",        description: "Lab / practical assessment",       active: true, sortOrder: 5 },
    ];
    const DEFAULT_SCALES = [
      { name: "FBISE Standard Scale", description: "Federal Board A1–F grading system", active: true, sortOrder: 1 },
      { name: "Pass/Fail Scale",      description: "Simple pass/fail for practicals",   active: true, sortOrder: 2 },
    ];

    const [existingTypes, existingScales] = await Promise.all([
      db.select().from(examTypesTable).where(eq(examTypesTable.tenantId, tenantId)),
      db.select().from(examGradingScalesTable).where(eq(examGradingScalesTable.tenantId, tenantId)),
    ]);
    const existingTypeNames  = new Set(existingTypes.map(t => t.name));
    const existingScaleNames = new Set(existingScales.map(s => s.name));

    const typesToInsert  = DEFAULT_TYPES.filter(t => !existingTypeNames.has(t.name));
    const scalesToInsert = DEFAULT_SCALES.filter(s => !existingScaleNames.has(s.name));

    if (typesToInsert.length)  await db.insert(examTypesTable).values(typesToInsert.map(t => ({ ...t, tenantId })));
    if (scalesToInsert.length) await db.insert(examGradingScalesTable).values(scalesToInsert.map(s => ({ ...s, tenantId })));

    const allScales = await db.select().from(examGradingScalesTable).where(eq(examGradingScalesTable.tenantId, tenantId));
    const fbise     = allScales.find(s => s.name === "FBISE Standard Scale");
    const pf        = allScales.find(s => s.name === "Pass/Fail Scale");

    const existingBands   = await db.select().from(examGradeBandsTable).where(eq(examGradeBandsTable.tenantId, tenantId));
    const bandKey         = (b: { gradeScaleId: string; grade: string }) => `${b.gradeScaleId}:${b.grade}`;
    const existingBandKeys = new Set(existingBands.map(bandKey));

    const DEFAULT_BANDS = [
      ...(fbise ? [
        { gradeScaleId: fbise.id, grade: "A1", minPercent: 90, maxPercent: 100, remarks: "Outstanding",     active: true, sortOrder: 1 },
        { gradeScaleId: fbise.id, grade: "A",  minPercent: 80, maxPercent: 89,  remarks: "Excellent",       active: true, sortOrder: 2 },
        { gradeScaleId: fbise.id, grade: "B",  minPercent: 70, maxPercent: 79,  remarks: "Good",            active: true, sortOrder: 3 },
        { gradeScaleId: fbise.id, grade: "C",  minPercent: 60, maxPercent: 69,  remarks: "Satisfactory",    active: true, sortOrder: 4 },
        { gradeScaleId: fbise.id, grade: "D",  minPercent: 50, maxPercent: 59,  remarks: "Pass",            active: true, sortOrder: 5 },
        { gradeScaleId: fbise.id, grade: "E",  minPercent: 33, maxPercent: 49,  remarks: "Pass (Marginal)", active: true, sortOrder: 6 },
        { gradeScaleId: fbise.id, grade: "F",  minPercent: 0,  maxPercent: 32,  remarks: "Fail",            active: true, sortOrder: 7 },
      ] : []),
      ...(pf ? [
        { gradeScaleId: pf.id, grade: "Pass", minPercent: 40, maxPercent: 100, remarks: "Pass", active: true, sortOrder: 1 },
        { gradeScaleId: pf.id, grade: "Fail", minPercent: 0,  maxPercent: 39,  remarks: "Fail", active: true, sortOrder: 2 },
      ] : []),
    ];
    const bandsToInsert = DEFAULT_BANDS.filter(b => !existingBandKeys.has(bandKey(b)));
    if (bandsToInsert.length) await db.insert(examGradeBandsTable).values(bandsToInsert.map(b => ({ ...b, tenantId })));

    return res.json({
      inserted: { types: typesToInsert.length, scales: scalesToInsert.length, bands: bandsToInsert.length },
    });
  } catch (err) {
    req.log.error({ err }, "POST seed-defaults failed");
    return res.status(500).json({ error: "Failed to seed defaults" });
  }
});

// ── Grade Bands ───────────────────────────────────────────────────────────────
router.get("/admin/exams/grade-bands", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(examGradeBandsTable)
      .where(eq(examGradeBandsTable.tenantId, tenantId))
      .orderBy(asc(examGradeBandsTable.gradeScaleId), asc(examGradeBandsTable.sortOrder));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET grade bands failed");
    return res.status(500).json({ error: "Failed to fetch grade bands" });
  }
});
router.post("/admin/exams/grade-bands", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.minPercent !== undefined) data.minPercent = parseFloat(data.minPercent);
    if (data.maxPercent !== undefined) data.maxPercent = parseFloat(data.maxPercent);
    if (!Number.isFinite(data.minPercent) || !Number.isFinite(data.maxPercent))
      return res.status(400).json({ error: "minPercent and maxPercent must be valid numbers" });
    const row = ((await db.insert(examGradeBandsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST grade band failed");
    return res.status(500).json({ error: "Failed to create grade band" });
  }
});
router.put("/admin/exams/grade-bands/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...gbBody } = req.body as any;
    if (gbBody.minPercent !== undefined) gbBody.minPercent = parseFloat(gbBody.minPercent);
    if (gbBody.maxPercent !== undefined) gbBody.maxPercent = parseFloat(gbBody.maxPercent);
    if (gbBody.minPercent !== undefined && !Number.isFinite(gbBody.minPercent))
      return res.status(400).json({ error: "minPercent must be a valid number" });
    if (gbBody.maxPercent !== undefined && !Number.isFinite(gbBody.maxPercent))
      return res.status(400).json({ error: "maxPercent must be a valid number" });
    const [row] = await db.update(examGradeBandsTable)
      .set({ ...gbBody, updatedAt: new Date() })
      .where(and(eq(examGradeBandsTable.id, String(req.params.id)), eq(examGradeBandsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT grade band failed");
    return res.status(500).json({ error: "Failed to update grade band" });
  }
});
router.delete("/admin/exams/grade-bands/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(examGradeBandsTable)
      .where(and(eq(examGradeBandsTable.id, String(req.params.id)), eq(examGradeBandsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE grade band failed");
    return res.status(500).json({ error: "Failed to delete grade band" });
  }
});

// ── Exam Schedules ────────────────────────────────────────────────────────────
router.get("/admin/exams/schedules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { classCode, sessionLabel, examTypeId, academicYearId } = req.query as Record<string, string>;
    const filters: any[] = [eq(examSchedulesTable.tenantId, tenantId)];
    if (classCode)     filters.push(eq(examSchedulesTable.classCode, classCode));
    if (sessionLabel)  filters.push(eq(examSchedulesTable.sessionLabel, sessionLabel));
    if (examTypeId)    filters.push(eq(examSchedulesTable.examTypeId, examTypeId));
    if (academicYearId) filters.push(eq(examSchedulesTable.academicYearId, academicYearId));

    const rows = await db.select({
      id:             examSchedulesTable.id,
      examTypeId:     examSchedulesTable.examTypeId,
      examTypeName:   examTypesTable.name,
      academicYearId: examSchedulesTable.academicYearId,
      classCode:      examSchedulesTable.classCode,
      subjectCode:    examSchedulesTable.subjectCode,
      subjectName:    examSchedulesTable.subjectName,
      sessionLabel:   examSchedulesTable.sessionLabel,
      examDate:       examSchedulesTable.examDate,
      totalMarks:     examSchedulesTable.totalMarks,
      passMarks:      examSchedulesTable.passMarks,
      venue:          examSchedulesTable.venue,
      notes:          examSchedulesTable.notes,
      active:         examSchedulesTable.active,
      createdAt:      examSchedulesTable.createdAt,
    })
    .from(examSchedulesTable)
    .leftJoin(examTypesTable, eq(examSchedulesTable.examTypeId, examTypesTable.id))
    .where(and(...filters))
    .orderBy(desc(examSchedulesTable.examDate), asc(examSchedulesTable.classCode), asc(examSchedulesTable.subjectCode));

    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET exam schedules failed");
    return res.status(500).json({ error: "Failed to fetch exam schedules" });
  }
});

router.post("/admin/exams/schedules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, resultsStatus: _rs, marksEnteredBy: _me, publishedBy: _pb, publishedAt: _pa, ...data } = req.body as any;
    if (data.classCode && data.subjectCode) {
      const valid = await validateSubjectInClass(tenantId, data.classCode, data.subjectCode);
      if (!valid) {
        return res.status(422).json({ error: `Subject "${data.subjectCode}" is not assigned to class "${data.classCode}"` });
      }
    }
    const [row] = await db.insert(examSchedulesTable).values({ ...data, tenantId }).returning();
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST exam schedule failed");
    return res.status(500).json({ error: "Failed to create exam schedule" });
  }
});

router.post("/admin/exams/schedules/bulk", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { items: rawItems } = req.body as { items: any[] };
    if (!Array.isArray(rawItems) || rawItems.length === 0)
      return res.status(400).json({ error: "items array required" });
    for (const raw of rawItems) {
      if (raw.classCode && raw.subjectCode) {
        const valid = await validateSubjectInClass(tenantId, raw.classCode, raw.subjectCode);
        if (!valid) {
          return res.status(422).json({ error: `Subject "${raw.subjectCode}" is not assigned to class "${raw.classCode}"` });
        }
      }
    }
    const items = rawItems.map(({ id: _id, createdAt: _ca, updatedAt: _ua, resultsStatus: _rs, marksEnteredBy: _me, publishedBy: _pb, publishedAt: _pa, ...r }: any) => ({
      ...r,
      tenantId,
    }));
    const rows = await db.insert(examSchedulesTable).values(items).returning();
    return res.status(201).json({ created: rows.length, rows });
  } catch (err) {
    req.log.error({ err }, "POST bulk exam schedules failed");
    return res.status(500).json({ error: "Failed to create exam schedules" });
  }
});

// ── Master Datesheet: upsert N rows × M classes in one call ──────────────────
router.post("/admin/exams/schedules/bulk-master", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const { examTypeId, sessionLabel, academicYearId, classCodes, rows } = req.body as {
      examTypeId: string | null;
      sessionLabel: string;
      academicYearId: string | null;
      classCodes: string[];
      rows: Array<{
        subjectCode: string;
        subjectName: string | null;
        examDate: string | null;
        totalMarks: number;
        passMarks: number;
        venue: string | null;
      }>;
    };

    if (!sessionLabel || !Array.isArray(classCodes) || classCodes.length === 0 || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "sessionLabel, classCodes[], and rows[] are required" });
    }

    // Step 1: Batch-validate all (classCode, subjectCode) pairs in ONE query
    const validLinks = await db
      .select({ classCode: classesTable.code, subjectCode: subjectsTable.code })
      .from(classSubjectsTable)
      .innerJoin(classesTable, eq(classSubjectsTable.classId, classesTable.id))
      .innerJoin(subjectsTable, eq(classSubjectsTable.subjectId, subjectsTable.id))
      .where(and(
        eq(classesTable.tenantId, tenantId),
        inArray(classesTable.code, classCodes),
        eq(subjectsTable.active, true),
      ));

    const validPairsSet = new Set(validLinks.map(l => `${l.classCode}:${l.subjectCode}`));

    const toProcess: Array<{ classCode: string; row: typeof rows[0] }> = [];
    const skipped: Array<{ classCode: string; subjectCode: string; reason: string }> = [];

    for (const classCode of classCodes) {
      for (const row of rows) {
        if (!row.subjectCode) {
          skipped.push({ classCode, subjectCode: "", reason: "missing subjectCode" });
          continue;
        }
        if (!validPairsSet.has(`${classCode}:${row.subjectCode}`)) {
          skipped.push({ classCode, subjectCode: row.subjectCode, reason: `Subject not in class ${classCode}` });
          continue;
        }
        toProcess.push({ classCode, row });
      }
    }

    // Step 2: Batch-fetch all existing schedules for this (classCodes × session × examType) in ONE query
    const typeFilter = examTypeId
      ? eq(examSchedulesTable.examTypeId, examTypeId)
      : isNull(examSchedulesTable.examTypeId);

    const existingRows = await db
      .select({
        id:          examSchedulesTable.id,
        classCode:   examSchedulesTable.classCode,
        subjectCode: examSchedulesTable.subjectCode,
      })
      .from(examSchedulesTable)
      .where(and(
        eq(examSchedulesTable.tenantId, tenantId),
        inArray(examSchedulesTable.classCode, classCodes),
        eq(examSchedulesTable.sessionLabel, sessionLabel),
        typeFilter,
      ));

    const existingMap = new Map(existingRows.map(r => [`${r.classCode}:${r.subjectCode}`, r.id]));

    // Step 3: Atomic transaction — all UPDATEs and INSERTs together
    let created = 0, updated = 0;
    await db.transaction(async (tx) => {
      for (const { classCode, row } of toProcess) {
        const existingId = existingMap.get(`${classCode}:${row.subjectCode}`);
        if (existingId) {
          await tx.update(examSchedulesTable)
            .set({
              examDate:       row.examDate || null,
              totalMarks:     row.totalMarks,
              passMarks:      row.passMarks,
              venue:          row.venue || null,
              subjectName:    row.subjectName || null,
              academicYearId: academicYearId || null,
              updatedAt:      new Date(),
            })
            .where(and(eq(examSchedulesTable.id, existingId), eq(examSchedulesTable.tenantId, tenantId)));
          updated++;
        } else {
          await tx.insert(examSchedulesTable).values({
            tenantId,
            examTypeId:     examTypeId || null,
            academicYearId: academicYearId || null,
            classCode,
            subjectCode:    row.subjectCode,
            subjectName:    row.subjectName || null,
            sessionLabel,
            examDate:       row.examDate || null,
            totalMarks:     row.totalMarks,
            passMarks:      row.passMarks,
            venue:          row.venue || null,
          });
          created++;
        }
      }
    });

    const total = created + updated;
    return res.json({
      created,
      updated,
      skipped: skipped.length,
      skippedDetails: skipped,
      message: `Datesheet saved — ${total} entr${total !== 1 ? "ies" : "y"} across ${classCodes.length} class${classCodes.length !== 1 ? "es" : ""} (${created} created, ${updated} updated${skipped.length ? `, ${skipped.length} skipped` : ""}).`,
    });
  } catch (err) {
    req.log.error({ err }, "POST bulk-master exam schedules failed");
    return res.status(500).json({ error: "Failed to save master datesheet" });
  }
});

router.put("/admin/exams/schedules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const {
      id: _id, createdAt: _ca,
      resultsStatus: _rs, marksEnteredBy: _me, publishedBy: _pb, publishedAt: _pa,
      ...schedBody
    } = req.body as any;
    if (schedBody.classCode && schedBody.subjectCode) {
      const valid = await validateSubjectInClass(tenantId, schedBody.classCode, schedBody.subjectCode);
      if (!valid) {
        return res.status(422).json({ error: `Subject "${schedBody.subjectCode}" is not assigned to class "${schedBody.classCode}"` });
      }
    }
    const [row] = await db.update(examSchedulesTable)
      .set({ ...schedBody, updatedAt: new Date() })
      .where(and(eq(examSchedulesTable.id, String(req.params.id)), eq(examSchedulesTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT exam schedule failed");
    return res.status(500).json({ error: "Failed to update exam schedule" });
  }
});

router.delete("/admin/exams/schedules/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(examSchedulesTable)
      .where(and(eq(examSchedulesTable.id, String(req.params.id)), eq(examSchedulesTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE exam schedule failed");
    return res.status(500).json({ error: "Failed to delete exam schedule" });
  }
});

// ── Results for a Schedule ────────────────────────────────────────────────────
router.get("/admin/exams/schedules/:id/results", requireAdmin, async (req: Request, res: Response) => {
  try {
    const scheduleId = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [schedule] = await db.select().from(examSchedulesTable)
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)));
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    const [students, results] = await Promise.all([
      db.select({
        id: studentsTable.id,
        applicantId: studentsTable.applicantId,
        fullName: studentsTable.fullName,
        classCode: studentsTable.classCode,
      })
      .from(studentsTable)
      .where(and(eq(studentsTable.classCode, schedule.classCode), eq(studentsTable.status, "active"), eq(studentsTable.tenantId, tenantId)))
      .orderBy(asc(studentsTable.applicantId)),

      db.select().from(examResultsTable).where(eq(examResultsTable.scheduleId, scheduleId)),
    ]);

    const resultMap = new Map(results.map(r => [r.studentId, r]));
    const rows = students.map(s => ({
      studentId:     s.id,
      applicantId:      s.applicantId,
      studentName:   s.fullName,
      obtainedMarks: resultMap.get(s.id)?.obtainedMarks ?? null,
      isAbsent:      resultMap.get(s.id)?.isAbsent ?? false,
      remarks:       resultMap.get(s.id)?.remarks ?? "",
      resultId:      resultMap.get(s.id)?.id ?? null,
    }));

    return res.json({ schedule, rows });
  } catch (err) {
    req.log.error({ err }, "GET schedule results failed");
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

// POST /admin/exams/schedules/:id/results/bulk
router.post("/admin/exams/schedules/:id/results/bulk", requireRole("exams", "draft"), async (req: Request, res: Response) => {
  try {
    const scheduleId = String(req.params.id);
    const { rows } = req.body as { rows: { studentId: string; obtainedMarks: number | null; isAbsent: boolean; remarks?: string }[] };
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "rows[] is required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const [schedule] = await db.select({
      resultsStatus: examSchedulesTable.resultsStatus,
      tenantId: examSchedulesTable.tenantId,
      totalMarks: examSchedulesTable.totalMarks,
    })
      .from(examSchedulesTable)
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)));
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    if (schedule.resultsStatus === "published") {
      return res.status(400).json({ error: "Results have already been published and cannot be modified. Contact a checker to reverse if needed." });
    }

    const studentIds = rows.map(r => r.studentId);
    const owned = await db.select({ id: studentsTable.id, fullName: studentsTable.fullName }).from(studentsTable)
      .where(and(inArray(studentsTable.id, studentIds), eq(studentsTable.tenantId, tenantId)));
    const ownedMap = new Map(owned.map(s => [s.id, s.fullName]));
    if (studentIds.some(id => !ownedMap.has(id))) {
      return res.status(403).json({ error: "One or more students not in this tenant" });
    }

    for (const r of rows) {
      const isAbsent = r.isAbsent ?? false;
      const obtained = r.obtainedMarks;

      if (isAbsent) {
        if (obtained !== null && obtained !== undefined) {
          const label = ownedMap.get(r.studentId) ?? r.studentId;
          return res.status(400).json({ error: `${label}: absent students must not have marks.` });
        }
        continue;
      }

      if (obtained === null || obtained === undefined) continue;

      if (!Number.isFinite(obtained) || !Number.isInteger(obtained)) {
        const label = ownedMap.get(r.studentId) ?? r.studentId;
        return res.status(400).json({ error: `${label}: marks must be a whole number.` });
      }
      if (obtained < 0) {
        const label = ownedMap.get(r.studentId) ?? r.studentId;
        return res.status(400).json({ error: `${label}: marks cannot be less than 0.` });
      }
      if (obtained > schedule.totalMarks) {
        const label = ownedMap.get(r.studentId) ?? r.studentId;
        return res.status(400).json({
          error: `${label}: marks cannot exceed the total marks (${schedule.totalMarks}).`,
        });
      }
    }

    for (const r of rows) {
      await db
        .insert(examResultsTable)
        .values({ scheduleId, studentId: r.studentId, obtainedMarks: r.obtainedMarks, isAbsent: r.isAbsent ?? false, remarks: r.remarks ?? "" })
        .onConflictDoUpdate({
          target: [examResultsTable.scheduleId, examResultsTable.studentId],
          set: { obtainedMarks: r.obtainedMarks, isAbsent: r.isAbsent ?? false, remarks: r.remarks ?? "", updatedAt: new Date() },
        });
    }

    const user = req.adminUser;
    const marksEnteredBy = realAdminUserId(user);
    const newStatus = schedule.resultsStatus === "draft" ? "submitted" : schedule.resultsStatus;
    await db
      .update(examSchedulesTable)
      .set({
        resultsStatus:  newStatus,
        marksEnteredBy: marksEnteredBy ?? undefined,
        updatedAt:      new Date(),
      })
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)));

    return res.json({ saved: rows.length, resultsStatus: newStatus });
  } catch (err) {
    req.log.error({ err }, "POST bulk results failed");
    return res.status(500).json({ error: "Failed to save results" });
  }
});

// POST /admin/exams/schedules/:id/publish
router.post("/admin/exams/schedules/:id/publish", requireRole("exams", "post"), async (req: Request, res: Response) => {
  try {
    const scheduleId = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const [schedule] = await db.select().from(examSchedulesTable)
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)));
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });

    if (schedule.resultsStatus !== "submitted") {
      return res.status(400).json({ error: "Results must be submitted before publishing" });
    }

    const user = req.adminUser!;
    const publishedBy = realAdminUserId(user);
    if (publishedBy && schedule.marksEnteredBy && schedule.marksEnteredBy === publishedBy) {
      return res.status(403).json({ error: "Self-approval not permitted — the marks entry person cannot publish results" });
    }

    const [updated] = await db
      .update(examSchedulesTable)
      .set({
        resultsStatus: "published",
        publishedBy:   publishedBy ?? undefined,
        publishedAt:   new Date(),
        updatedAt:     new Date(),
      })
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "POST publish exam results failed");
    return res.status(500).json({ error: "Failed to publish exam results" });
  }
});

// POST /admin/exams/schedules/:id/reject
router.post("/admin/exams/schedules/:id/reject", requireRole("exams", "post"), async (req: Request, res: Response) => {
  try {
    const scheduleId = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const [schedule] = await db.select().from(examSchedulesTable)
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)));
    if (!schedule) return res.status(404).json({ error: "Schedule not found" });
    if (schedule.resultsStatus !== "submitted") {
      return res.status(400).json({ error: "Only submitted results can be rejected" });
    }
    const [updated] = await db
      .update(examSchedulesTable)
      .set({ resultsStatus: "draft", marksEnteredBy: null, updatedAt: new Date() })
      .where(and(eq(examSchedulesTable.id, scheduleId), eq(examSchedulesTable.tenantId, tenantId)))
      .returning();
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "POST reject exam results failed");
    return res.status(500).json({ error: "Failed to reject exam results" });
  }
});

// ── Report Card data ──────────────────────────────────────────────────────────
router.get("/admin/exams/student-results", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { studentId } = req.query as Record<string, string>;
    if (!studentId) return res.status(400).json({ error: "studentId is required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const [stu] = await db.select({ id: studentsTable.id }).from(studentsTable)
      .where(and(eq(studentsTable.id, studentId), eq(studentsTable.tenantId, tenantId))).limit(1);
    if (!stu) return res.status(403).json({ error: "Student not found in this tenant" });

    const results = await db
      .select({
        scheduleId:    examResultsTable.scheduleId,
        obtainedMarks: examResultsTable.obtainedMarks,
        isAbsent:      examResultsTable.isAbsent,
        remarks:       examResultsTable.remarks,
        sessionLabel:  examSchedulesTable.sessionLabel,
        subjectCode:   examSchedulesTable.subjectCode,
        subjectName:   examSchedulesTable.subjectName,
        totalMarks:    examSchedulesTable.totalMarks,
        passMarks:     examSchedulesTable.passMarks,
        examTypeName:  examTypesTable.name,
      })
      .from(examResultsTable)
      .innerJoin(examSchedulesTable, eq(examResultsTable.scheduleId, examSchedulesTable.id))
      .leftJoin(examTypesTable, eq(examSchedulesTable.examTypeId, examTypesTable.id))
      .where(and(eq(examResultsTable.studentId, studentId), eq(examSchedulesTable.tenantId, tenantId)))
      .orderBy(asc(examSchedulesTable.sessionLabel), asc(examSchedulesTable.subjectCode));

    const bySession = new Map<string, { sessionLabel: string; subjects: typeof results; totalObtained: number; totalMax: number }>();
    for (const r of results) {
      if (!bySession.has(r.sessionLabel)) {
        bySession.set(r.sessionLabel, { sessionLabel: r.sessionLabel, subjects: [], totalObtained: 0, totalMax: 0 });
      }
      const sess = bySession.get(r.sessionLabel)!;
      sess.subjects.push(r);
      if (!r.isAbsent && r.obtainedMarks !== null) {
        sess.totalObtained += r.obtainedMarks;
        sess.totalMax += r.totalMarks;
      }
    }

    const sessions = Array.from(bySession.values()).map(s => ({
      ...s,
      percentage: s.totalMax > 0 ? Math.round((s.totalObtained / s.totalMax) * 100) : null,
    })).reverse();

    return res.json(sessions);
  } catch (err) {
    req.log.error({ err }, "GET student results failed");
    return res.status(500).json({ error: "Failed to fetch student results" });
  }
});

// GET /admin/exams/report-card?classCode=&sessionLabel=
router.get("/admin/exams/report-card", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { classCode, sessionLabel } = req.query as Record<string, string>;
    if (!classCode || !sessionLabel) return res.status(400).json({ error: "classCode and sessionLabel are required" });

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });

    const schedules = await db.select().from(examSchedulesTable)
      .where(and(
        eq(examSchedulesTable.classCode, classCode),
        eq(examSchedulesTable.sessionLabel, sessionLabel),
        eq(examSchedulesTable.resultsStatus, "published"),
        eq(examSchedulesTable.tenantId, tenantId),
      ))
      .orderBy(asc(examSchedulesTable.subjectCode));
    if (!schedules.length) return res.json({ schedules: [], students: [] });

    const scheduleIds = schedules.map(s => s.id);
    const results = await db.select().from(examResultsTable)
      .where(inArray(examResultsTable.scheduleId, scheduleIds));

    const resultStudentIds = [...new Set(results.map(r => r.studentId))];
    const classStudents = await db.select({
      id: studentsTable.id, applicantId: studentsTable.applicantId,
      fullName: studentsTable.fullName,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.classCode, classCode), eq(studentsTable.status, "active"), eq(studentsTable.tenantId, tenantId)))
    .orderBy(asc(studentsTable.applicantId));

    const classStudentIds = new Set(classStudents.map(s => s.id));
    const extraIds = resultStudentIds.filter(id => !classStudentIds.has(id));
    let extraStudents: typeof classStudents = [];
    if (extraIds.length > 0) {
      extraStudents = await db.select({
        id: studentsTable.id, applicantId: studentsTable.applicantId,
        fullName: studentsTable.fullName,
      })
      .from(studentsTable)
      .where(and(inArray(studentsTable.id, extraIds), eq(studentsTable.tenantId, tenantId)));
    }
    const students = [...classStudents, ...extraStudents]
      .sort((a, b) => a.applicantId.localeCompare(b.applicantId));

    const scheduleAcademicYearId = schedules[0]?.academicYearId ?? null;
    const enrolledStudentIds = new Set<string>();
    if (scheduleAcademicYearId && students.length > 0) {
      const studentIds = students.map(s => s.id);
      const enrollments = await db.select({ studentId: studentEnrollmentsTable.studentId })
        .from(studentEnrollmentsTable)
        .where(and(
          inArray(studentEnrollmentsTable.studentId, studentIds),
          eq(studentEnrollmentsTable.academicYearId, scheduleAcademicYearId),
          eq(studentEnrollmentsTable.classCode, classCode),
        ));
      enrollments.forEach(e => enrolledStudentIds.add(e.studentId));
    }

    const resultMap = new Map<string, Map<string, typeof results[0]>>();
    results.forEach(r => {
      if (!resultMap.has(r.studentId)) resultMap.set(r.studentId, new Map());
      resultMap.get(r.studentId)!.set(r.scheduleId, r);
    });

    const studentRows = students.map(s => {
      const sMap = resultMap.get(s.id) ?? new Map();
      let totalObtained = 0, totalMax = 0;
      const subjects = schedules.map(sch => {
        const res = sMap.get(sch.id);
        const obtained = res?.isAbsent ? 0 : (res?.obtainedMarks ?? null);
        if (obtained !== null) { totalObtained += obtained; totalMax += sch.totalMarks; }
        return { scheduleId: sch.id, subjectCode: sch.subjectCode, subjectName: sch.subjectName, totalMarks: sch.totalMarks, passMarks: sch.passMarks, obtainedMarks: obtained, isAbsent: res?.isAbsent ?? false };
      });
      const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : null;
      const enrollmentMismatch = scheduleAcademicYearId ? !enrolledStudentIds.has(s.id) : false;
      return { studentId: s.id, applicantId: s.applicantId, studentName: s.fullName, subjects, totalObtained, totalMax, percentage: pct, enrollmentMismatch };
    });

    return res.json({ schedules, students: studentRows });
  } catch (err) {
    req.log.error({ err }, "GET report card failed");
    return res.status(500).json({ error: "Failed to fetch report card data" });
  }
});

export default router;
