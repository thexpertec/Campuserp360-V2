import { Router, type IRouter, type Request, type Response } from "express";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import fs from "node:fs/promises";
import path from "node:path";
import {
  db,
  studentsTable,
  guardiansTable,
  studentAttendanceTable,
  studentDocumentsTable,
  studentDisciplinaryTable,
  feeChallansTable,
  libraryIssuesTable,
  libraryBooksTable,
  hostelAllocationsTable,
  hostelRoomsTable,
  hostelBlocksTable,
  applicationsTable,
  applicationEventsTable,
  sectionAllocationsTable,
  studentEnrollmentsTable,
  academicYearsTable,
  sectionsTable,
  housesTable,
} from "@workspace/db";
import { eq, and, or, ilike, asc, desc, count, sql, inArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { resolveUrl } from "../lib/storage";
import { checkAcademicSetup, academicSetupErrorMessage } from "../lib/academic-setup";
import { syncStudentCoa } from "../lib/coa-sync";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the effective tenantId for the request, or undefined when no tenant
 * context could be resolved. Prefers the fail-closed value resolved by the admin
 * router middleware (`req.adminTenantId`, override-aware), falling back to the
 * token's own tenantId for scoped admins.
 */
function reqTenantId(req: Request): string | undefined {
  return (req.adminTenantId ?? (req as any).adminUser?.tenantId) as string | undefined;
}

/**
 * Fail-closed tenant gate. Returns the resolved tenantId, or sends HTTP 400 and
 * returns null (caller MUST `return` immediately). The app-level WHERE is the
 * only cross-tenant guard because the DB connects with BYPASSRLS.
 */
function requireTenant(req: Request, res: Response): string | null {
  const tid = reqTenantId(req);
  if (!tid) {
    res.status(400).json({ error: "Tenant context required — select a school before continuing." });
    return null;
  }
  return tid;
}

/**
 * WHERE clause for looking up a student by id, scoped to tenant when present.
 * Prevents cross-tenant access on detail / update / delete operations.
 */
function stuById(req: Request, id: string) {
  const tid = reqTenantId(req);
  // Fail-closed: with no resolvable tenant, match an impossible id so a
  // super-admin without tenant context can never reach a cross-tenant student.
  if (!tid) return eq(studentsTable.id, "00000000-0000-0000-0000-000000000000");
  return and(eq(studentsTable.id, id), eq(studentsTable.tenantId, tid));
}

/**
 * Verify a student belongs to the requesting admin's tenant.
 * Returns the verified student id, or null if the student doesn't exist / is in another tenant.
 */
async function resolveStudentTenant(req: Request, studentId: string): Promise<string | null> {
  const [stu] = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(stuById(req, studentId))
    .limit(1);
  return stu?.id ?? null;
}

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

function serializeStudent(s: typeof studentsTable.$inferSelect) {
  return {
    id: s.id,
    applicantId: s.applicantId,
    rollNo: s.rollNo,
    applicationId: s.applicationId,
    fullName: s.fullName,
    dateOfBirth: s.dateOfBirth,
    bloodGroup: s.bloodGroup,
    religion: s.religion,
    nationality: s.nationality,
    photoFilename: resolveUrl(s.photoFilename),
    mobile: s.mobile,
    email: s.email,
    address: s.address,
    city: s.city,
    province: s.province,
    fatherName: s.fatherName,
    guardianName: s.guardianName,
    relation: s.relation,
    occupation: s.occupation,
    guardianMobile: s.guardianMobile,
    guardianCnic: s.guardianCnic,
    guardianId: s.guardianId,
    classCode: s.classCode,
    sectionId: s.sectionId,
    houseId: s.houseId,
    academicYearId: s.academicYearId,
    enrollmentDate: s.enrollmentDate,
    status: s.status,
    coaId: s.coaId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ── GET /admin/students — paginated list ─────────────────────────────────────

router.get("/admin/students", requireAdmin, async (req: Request, res: Response) => {
  try {
    const q            = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const status       = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const classCode    = typeof req.query.classCode === "string" && req.query.classCode ? req.query.classCode : undefined;
    const sectionId    = typeof req.query.sectionId === "string" && req.query.sectionId ? req.query.sectionId : undefined;
    const houseId      = typeof req.query.houseId === "string" && req.query.houseId ? req.query.houseId : undefined;
    const academicYearId = typeof req.query.academicYearId === "string" && req.query.academicYearId ? req.query.academicYearId : undefined;
    const classCodes   = typeof req.query.classCodes === "string" && req.query.classCodes
      ? req.query.classCodes.split(",").map(s => s.trim()).filter(Boolean)
      : null;
    const sectionIds   = typeof req.query.sectionIds === "string" && req.query.sectionIds
      ? req.query.sectionIds.split(",").map(s => s.trim()).filter(Boolean)
      : null;
    const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(2000, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const offset   = (page - 1) * pageSize;
    const sortBy   = typeof req.query.sortBy  === "string" ? req.query.sortBy.trim()  : "";
    const sortDir  = req.query.sortDir === "desc" ? "desc" : "asc";
    const sortCsv  = typeof req.query.sort    === "string" ? req.query.sort.trim()    : "";

    // Tenant isolation is fail-closed: no resolved tenant → refuse, never list
    // across tenants. The app-level WHERE is the only guard (db bypasses RLS).
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const conditions: SQL<unknown>[] = [eq(studentsTable.tenantId, tenantId)];
    if (q) {
      const like = `%${q}%`;
      conditions.push(
        or(
          ilike(studentsTable.fullName, like),
          ilike(studentsTable.applicantId, like),
          ilike(studentsTable.fatherName, like),
          ilike(studentsTable.guardianMobile, like),
        )!,
      );
    }
    if (status)       conditions.push(eq(studentsTable.status, status));
    if (classCode)         conditions.push(eq(studentsTable.classCode, classCode));
    else if (classCodes && classCodes.length > 0) conditions.push(inArray(studentsTable.classCode, classCodes));
    if (sectionId)         conditions.push(eq(studentsTable.sectionId, sectionId));
    else if (sectionIds && sectionIds.length > 0) conditions.push(inArray(studentsTable.sectionId, sectionIds));
    if (houseId)      conditions.push(eq(studentsTable.houseId, houseId));
    if (academicYearId) conditions.push(eq(studentsTable.academicYearId, academicYearId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow, rows] = await Promise.all([
      db.select({ total: count() }).from(studentsTable).where(where),
      db.select({
          s: studentsTable,
          guardianFamilySeq: guardiansTable.familySeq,
        })
        .from(studentsTable)
        .leftJoin(guardiansTable, eq(studentsTable.guardianId, guardiansTable.id))
        .where(where)
        .orderBy(...((): ReturnType<typeof asc>[] => {
          function colClauses(key: string, dir: "asc" | "desc"): ReturnType<typeof asc>[] {
            const fn = dir === "desc" ? desc : asc;
            switch (key) {
              case "applicantId":       return [fn(studentsTable.applicantId)];
              case "name":           return [fn(studentsTable.fullName)];
              case "fatherName":     return [fn(studentsTable.fatherName)];
              case "class":          return [fn(studentsTable.classCode)];
              case "status":         return [fn(studentsTable.status)];
              case "enrollmentDate": return [fn(studentsTable.enrollmentDate as any)];
              default:               return [];
            }
          }
          if (sortCsv) {
            const clauses = sortCsv.split(",").flatMap(s => {
              const [k, d] = s.trim().split(":");
              return colClauses(k?.trim() ?? "", d === "desc" ? "desc" : "asc");
            });
            return clauses.length ? clauses : [desc(studentsTable.createdAt), desc(studentsTable.id)];
          }
          const single = colClauses(sortBy, sortDir as "asc" | "desc");
          return single.length ? single : [desc(studentsTable.createdAt), desc(studentsTable.id)];
        })())
        .limit(pageSize)
        .offset(offset),
    ]);

    return res.json({
      items: rows.map(r => ({
        ...serializeStudent(r.s),
        guardianFamilyId: r.guardianFamilySeq != null
          ? `FAM-${String(r.guardianFamilySeq).padStart(4, "0")}`
          : null,
      })),
      total: Number(totalRow[0]?.total ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list students");
    return res.status(500).json({ error: "Failed to load students" });
  }
});

// ── GET /admin/students/stats ─────────────────────────────────────────────────

router.get("/admin/students/stats", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const tf = eq(studentsTable.tenantId, tenantId);
    const [byStatus, byClass, byHouse, recentRows, totalRow] = await Promise.all([
      db.select({ status: studentsTable.status, cnt: count() })
        .from(studentsTable)
        .where(tf)
        .groupBy(studentsTable.status),
      db.select({ classCode: studentsTable.classCode, cnt: count() })
        .from(studentsTable)
        .where(and(eq(studentsTable.status, "active"), tf))
        .groupBy(studentsTable.classCode)
        .orderBy(asc(studentsTable.classCode)),
      db.select({ houseId: studentsTable.houseId, cnt: count() })
        .from(studentsTable)
        .where(and(eq(studentsTable.status, "active"), tf))
        .groupBy(studentsTable.houseId),
      db.select().from(studentsTable)
        .where(tf)
        .orderBy(desc(studentsTable.createdAt))
        .limit(8),
      db.select({ total: count() }).from(studentsTable).where(tf),
    ]);
    return res.json({
      total:    Number(totalRow[0]?.total ?? 0),
      byStatus: byStatus.map(r => ({ status: r.status, count: Number(r.cnt) })),
      byClass:  byClass.map(r => ({ classCode: r.classCode, count: Number(r.cnt) })),
      byHouse:  byHouse.map(r => ({ houseId: r.houseId ?? "__none__", count: Number(r.cnt) })),
      recent:   recentRows.map(serializeStudent),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get student stats");
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── Student Attendance ─────────────────────────────────────────────────────────

// GET /admin/students/attendance?date=YYYY-MM-DD&classCode=&sectionId=
router.get("/admin/students/attendance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { date, classCode, sectionId, studentId } = req.query as Record<string, string>;
    const tenantId = reqTenantId(req);
    // Fail-closed: without a resolved tenant we must not return any rows.
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const conds: any[] = [eq(studentsTable.tenantId, tenantId)];
    if (studentId) conds.push(eq(studentAttendanceTable.studentId, studentId));
    if (date) conds.push(eq(studentAttendanceTable.attendanceDate, date));
    if (classCode) conds.push(eq(studentAttendanceTable.classCode, classCode));
    if (sectionId) conds.push(eq(studentAttendanceTable.sectionId, sectionId));
    let q = db
      .select({
        id: studentAttendanceTable.id,
        studentId: studentAttendanceTable.studentId,
        attendanceDate: studentAttendanceTable.attendanceDate,
        status: studentAttendanceTable.status,
        classCode: studentAttendanceTable.classCode,
        sectionId: studentAttendanceTable.sectionId,
        notes: studentAttendanceTable.notes,
        studentGrNumber: studentsTable.applicantId,
        studentFullName: studentsTable.fullName,
      })
      .from(studentAttendanceTable)
      .leftJoin(studentsTable, eq(studentAttendanceTable.studentId, studentsTable.id))
      .$dynamic();
    if (conds.length) q = q.where(and(...conds));
    const rows = await q.orderBy(asc(studentsTable.applicantId));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET student attendance failed");
    return res.status(500).json({ error: "Failed to fetch attendance" });
  }
});

// POST /admin/students/attendance/bulk-save
// Body: { date, classCode, sectionId?, records: [{ studentId, status, notes? }] }
router.post("/admin/students/attendance/bulk-save", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { date, classCode, records } = req.body as {
      date: string;
      classCode: string;
      records: { studentId: string; status: string; notes?: string }[];
    };
    if (!date || !classCode || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "date, classCode, and records[] are required" });
    }
    const tenantId = reqTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant context required" });
    const studentIds = records.map(r => r.studentId);
    // Fail-closed IDOR guard: every student must belong to the caller's tenant
    // before we delete/insert attendance rows for them.
    const owned = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(inArray(studentsTable.id, studentIds), eq(studentsTable.tenantId, tenantId)));
    if (owned.length !== new Set(studentIds).size) {
      return res.status(403).json({ error: "One or more students do not belong to this tenant" });
    }
    // Delete existing records for this date for these students
    await db.delete(studentAttendanceTable).where(
      and(
        eq(studentAttendanceTable.attendanceDate, date),
        inArray(studentAttendanceTable.studentId, studentIds)
      )
    );
    // Insert fresh records
    const inserted = await db.insert(studentAttendanceTable).values(
      records.map(r => ({
        studentId: r.studentId,
        attendanceDate: date,
        status: r.status || "present",
        classCode,
        notes: r.notes || null,
      }))
    ).returning();
    return res.json({ saved: inserted.length });
  } catch (err) {
    req.log.error({ err }, "POST student attendance bulk-save failed");
    return res.status(500).json({ error: "Failed to save attendance" });
  }
});

// ── GET /admin/students/by-applicant-id/:applicantId ──────────────────────────────────────

router.get("/admin/students/by-applicant-id/:applicantId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const applicantId = String(req.params.applicantId).trim();
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const where = and(eq(studentsTable.applicantId, applicantId), eq(studentsTable.tenantId, tenantId));
    const [student] = await db.select().from(studentsTable).where(where);
    if (!student) return res.status(404).json({ error: "Student not found" });
    return res.json(serializeStudent(student));
  } catch (err) {
    req.log.error({ err }, "Failed to get student by Applicant ID");
    return res.status(500).json({ error: "Failed to load student" });
  }
});

// ── GET /admin/students/:id ───────────────────────────────────────────────────

router.get("/admin/students/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(stuById(req, String(req.params.id)));
    if (!student) return res.status(404).json({ error: "Student not found" });
    return res.json(serializeStudent(student));
  } catch (err) {
    req.log.error({ err }, "Failed to get student");
    return res.status(500).json({ error: "Failed to load student" });
  }
});

// ── POST /admin/students ──────────────────────────────────────────────────────

router.post("/admin/students", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body;
  if (!b?.applicantId?.trim() || !b?.fullName?.trim() || !b?.classCode?.trim()) {
    return res.status(400).json({ error: "applicantId, fullName and classCode are required" });
  }
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;

    // Block enrollment unless the mandatory Academic Setup is complete.
    const setup = await checkAcademicSetup(tenantId);
    if (!setup.complete) {
      return res.status(400).json({ error: academicSetupErrorMessage(setup.missing) });
    }

    const rawMobile = b.mobile?.trim() ?? null;
    if (rawMobile) {
      const c = canonicalizePhone(rawMobile);
      if (!c) return res.status(400).json({ error: "mobile must be exactly 11 digits — format: 0XXX-XXXXXXX" });
    }
    const rawGuardianMobile = b.guardianMobile?.trim() ?? null;
    if (rawGuardianMobile) {
      const c = canonicalizePhone(rawGuardianMobile);
      if (!c) return res.status(400).json({ error: "guardianMobile must be exactly 11 digits — format: 0XXX-XXXXXXX" });
    }
    const rawCnic = b.guardianCnic?.trim() ?? null;
    if (rawCnic) {
      const c = canonicalizeCnic(rawCnic);
      if (!c) return res.status(400).json({ error: "guardianCnic must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
    }
    const cnic = rawCnic ? canonicalizeCnic(rawCnic) : null;
    const applicationId: string | null = b.applicationId ?? null;

    // Auto-resolve guardianId from CNIC if a guardian record already exists
    let autoGuardianId: string | null = null;
    if (cnic) {
      const [existing] = await db
        .select({ id: guardiansTable.id })
        .from(guardiansTable)
        .where(eq(guardiansTable.cnic, cnic));
      if (existing) autoGuardianId = existing.id;
    }

    // When linked to an application, carry over section placement if the body
    // didn't supply sectionId / academicYearId.
    let resolvedSectionId: string | null = b.sectionId ?? null;
    let resolvedAcademicYearId: string | null = b.academicYearId ?? null;
    if (applicationId && (!resolvedSectionId || !resolvedAcademicYearId)) {
      const [alloc] = await db
        .select({ sectionId: sectionAllocationsTable.sectionId, academicYearId: sectionAllocationsTable.academicYearId })
        .from(sectionAllocationsTable)
        .where(eq(sectionAllocationsTable.applicationId, applicationId))
        .limit(1);
      if (alloc) {
        if (!resolvedSectionId)      resolvedSectionId      = alloc.sectionId ?? null;
        if (!resolvedAcademicYearId) resolvedAcademicYearId = alloc.academicYearId ?? null;
      }
    }

    const created = await db.transaction(async (tx) => {
      const [student] = await tx
        .insert(studentsTable)
        .values({
          applicantId:      String(b.applicantId).trim(),
          rollNo:        b.rollNo?.trim() ?? null,
          applicationId,
          fullName:      String(b.fullName).trim(),
          dateOfBirth:   b.dateOfBirth?.trim() ?? null,
          bloodGroup:    b.bloodGroup?.trim() ?? null,
          religion:      b.religion?.trim() ?? null,
          nationality:   b.nationality?.trim() ?? "Pakistani",
          photoFilename: b.photoFilename ?? null,
          mobile:        rawMobile ? canonicalizePhone(rawMobile) : null,
          email:         b.email?.trim() ?? null,
          address:       b.address?.trim() ?? null,
          city:          b.city?.trim() ?? null,
          province:      b.province?.trim() ?? null,
          fatherName:    b.fatherName?.trim() ?? null,
          guardianName:  b.guardianName?.trim() ?? null,
          relation:      b.relation?.trim() ?? null,
          occupation:    b.occupation?.trim() ?? null,
          guardianMobile: rawGuardianMobile ? canonicalizePhone(rawGuardianMobile) : null,
          guardianCnic:  cnic,
          guardianId:    autoGuardianId,
          classCode:     String(b.classCode).trim(),
          sectionId:     resolvedSectionId,
          houseId:       b.houseId ?? null,
          academicYearId: resolvedAcademicYearId,
          enrollmentDate: b.enrollmentDate?.trim() ?? null,
          status:        b.status?.trim() ?? "active",
          tenantId,
        })
        .returning();

      // Sync the linked application to `enrolled` and record the event so the
      // admission pipeline stays consistent whether enrollment happens via the
      // dedicated enroll endpoint or this direct student-create path.
      if (applicationId) {
        const appWhere = tenantId
          ? and(eq(applicationsTable.id, applicationId), eq(applicationsTable.tenantId, tenantId))
          : eq(applicationsTable.id, applicationId);
        // Use .returning() so we can verify the application was actually found
        // under this tenant before writing the audit event — guards against
        // cross-tenant event injection via a crafted applicationId.
        const updated = await tx
          .update(applicationsTable)
          .set({ status: "enrolled" })
          .where(appWhere)
          .returning({ id: applicationsTable.id });
        if (updated.length > 0) {
          await tx.insert(applicationEventsTable).values({
            applicationId,
            eventType:   "enrolled",
            title:       "Cadet Enrolled",
            description: `Enrolled as student ${student.applicantId} (Applicant ID).`,
            occurredAt:  new Date(),
          });
        }
      }

      // Create initial enrollment row for academic year history tracking.
      // ON CONFLICT DO NOTHING so re-running the enroll endpoint is safe.
      await tx
        .insert(studentEnrollmentsTable)
        .values({
          studentId:      student.id,
          academicYearId: student.academicYearId ?? null,
          classCode:      student.classCode,
          sectionId:      student.sectionId ?? null,
          houseId:        student.houseId ?? null,
          startDate:      student.enrollmentDate ?? new Date().toISOString().slice(0, 10),
          status:         "active",
        })
        .onConflictDoNothing();

      return student;
    });

    // Fire-and-forget: create fee-receivable COA sub-ledger for this student.
    void syncStudentCoa(
      { id: created.id, fullName: created.fullName, applicantId: created.applicantId },
      tenantId!,
    );

    return res.status(201).json(serializeStudent(created));
  } catch (err) {
    if (isUniqueViolation(err))
      return res.status(409).json({ error: "A student with this Applicant ID already exists" });
    req.log.error({ err }, "Failed to create student");
    return res.status(500).json({ error: "Failed to create student" });
  }
});

// ── PATCH /admin/students/:id ─────────────────────────────────────────────────

router.patch("/admin/students/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body;
  const updates: Partial<typeof studentsTable.$inferInsert> = {};

  if (b.applicantId     !== undefined) updates.applicantId     = String(b.applicantId).trim();
  if (b.rollNo       !== undefined) updates.rollNo       = b.rollNo?.trim() ?? null;
  if (b.fullName     !== undefined) updates.fullName     = String(b.fullName).trim();
  if (b.dateOfBirth  !== undefined) updates.dateOfBirth  = b.dateOfBirth?.trim() ?? null;
  if (b.bloodGroup   !== undefined) updates.bloodGroup   = b.bloodGroup?.trim() ?? null;
  if (b.religion     !== undefined) updates.religion     = b.religion?.trim() ?? null;
  if (b.nationality  !== undefined) updates.nationality  = b.nationality?.trim() ?? null;
  if (b.photoFilename !== undefined) updates.photoFilename = b.photoFilename ?? null;
  if (b.mobile       !== undefined) {
    const v = b.mobile?.trim() ?? null;
    if (v) {
      const canonical = canonicalizePhone(v);
      if (!canonical) return res.status(400).json({ error: "mobile must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      updates.mobile = canonical;
    } else { updates.mobile = null; }
  }
  if (b.email        !== undefined) updates.email        = b.email?.trim() ?? null;
  if (b.address      !== undefined) updates.address      = b.address?.trim() ?? null;
  if (b.city         !== undefined) updates.city         = b.city?.trim() ?? null;
  if (b.province     !== undefined) updates.province     = b.province?.trim() ?? null;
  if (b.fatherName   !== undefined) updates.fatherName   = b.fatherName?.trim() ?? null;
  if (b.guardianName !== undefined) updates.guardianName = b.guardianName?.trim() ?? null;
  if (b.relation     !== undefined) updates.relation     = b.relation?.trim() ?? null;
  if (b.occupation   !== undefined) updates.occupation   = b.occupation?.trim() ?? null;
  if (b.guardianMobile !== undefined) {
    const v = b.guardianMobile?.trim() ?? null;
    if (v) {
      const canonical = canonicalizePhone(v);
      if (!canonical) return res.status(400).json({ error: "guardianMobile must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      updates.guardianMobile = canonical;
    } else { updates.guardianMobile = null; }
  }
  if (b.guardianCnic !== undefined) {
    const v = b.guardianCnic?.trim() ?? null;
    if (v) {
      const canonical = canonicalizeCnic(v);
      if (!canonical) return res.status(400).json({ error: "guardianCnic must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
      updates.guardianCnic = canonical;
    } else { updates.guardianCnic = null; }
  }
  if (b.classCode    !== undefined) updates.classCode    = String(b.classCode).trim();
  if (b.sectionId    !== undefined) updates.sectionId    = b.sectionId ?? null;
  if (b.houseId      !== undefined) updates.houseId      = b.houseId ?? null;
  if (b.academicYearId !== undefined) updates.academicYearId = b.academicYearId ?? null;
  if (b.enrollmentDate !== undefined) updates.enrollmentDate = b.enrollmentDate?.trim() ?? null;
  if (b.status       !== undefined) updates.status       = String(b.status).trim();

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: "No fields to update" });

  // If guardianCnic is being updated and no explicit guardianId was set,
  // auto-resolve guardianId from the new CNIC
  if (updates.guardianCnic && updates.guardianId === undefined) {
    const [existingGuardian] = await db
      .select({ id: guardiansTable.id })
      .from(guardiansTable)
      .where(eq(guardiansTable.cnic, updates.guardianCnic));
    if (existingGuardian) {
      updates.guardianId = existingGuardian.id;
    }
  }

  const trackEnrollment = b.classCode !== undefined || b.academicYearId !== undefined ||
                          b.sectionId !== undefined || b.houseId !== undefined;

  try {
    // Read current student BEFORE update so we can diff the enrollment fields
    const [before] = trackEnrollment
      ? await db.select().from(studentsTable).where(stuById(req, String(req.params.id)))
      : [undefined];

    const [updated] = await db
      .update(studentsTable)
      .set(updates)
      .where(stuById(req, String(req.params.id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Student not found" });

    // Sync the student_enrollments history table when academically-relevant
    // fields change.
    if (trackEnrollment && before) {
      const today = new Date().toISOString().slice(0, 10);
      const yearChanged  = before.academicYearId !== updated.academicYearId;
      const classChanged = before.classCode      !== updated.classCode;

      if (yearChanged) {
        // Close the old active enrollment row (if it exists)
        if (before.academicYearId) {
          await db
            .update(studentEnrollmentsTable)
            .set({ endDate: today, status: "promoted" })
            .where(and(
              eq(studentEnrollmentsTable.studentId,      updated.id),
              eq(studentEnrollmentsTable.academicYearId, before.academicYearId),
              eq(studentEnrollmentsTable.status,         "active"),
            ));
        }
        // Open a new enrollment row for the new year (ignore conflict if one exists)
        await db
          .insert(studentEnrollmentsTable)
          .values({
            studentId:      updated.id,
            academicYearId: updated.academicYearId ?? null,
            classCode:      updated.classCode,
            sectionId:      updated.sectionId ?? null,
            houseId:        updated.houseId ?? null,
            startDate:      today,
            status:         "active",
          })
          .onConflictDoNothing();
      } else if (classChanged || b.sectionId !== undefined || b.houseId !== undefined) {
        // Same academic year — update the existing active enrollment row in-place
        // (unique constraint on (studentId, academicYearId) prevents close+open within same year)
        await db
          .update(studentEnrollmentsTable)
          .set({
            classCode: updated.classCode,
            sectionId: updated.sectionId ?? null,
            houseId:   updated.houseId ?? null,
          })
          .where(and(
            eq(studentEnrollmentsTable.studentId, updated.id),
            updated.academicYearId
              ? eq(studentEnrollmentsTable.academicYearId, updated.academicYearId)
              : sql`${studentEnrollmentsTable.academicYearId} IS NULL`,
            eq(studentEnrollmentsTable.status, "active"),
          ));
      }
    }

    // Fire-and-forget: ensure COA sub-ledger exists whenever a student becomes
    // active or enrolled (idempotent — upsert will no-op if already present).
    if (updates.status === "active" || updates.status === "enrolled") {
      void syncStudentCoa(
        { id: updated.id, fullName: updated.fullName, applicantId: updated.applicantId },
        reqTenantId(req)!,
      );
    }

    return res.json(serializeStudent(updated));
  } catch (err) {
    if (isUniqueViolation(err))
      return res.status(409).json({ error: "A student with this Applicant ID already exists" });
    req.log.error({ err }, "Failed to update student");
    return res.status(500).json({ error: "Failed to update student" });
  }
});

// ── DELETE /admin/students/:id ────────────────────────────────────────────────
// When deleting a student who was created via the enrollment pipeline (i.e. the
// student has an applicationId), the linked application is rolled back to
// "admitted" so the applicant can be re-enrolled without manual intervention.

router.delete("/admin/students/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    let deleted: typeof studentsTable.$inferSelect | undefined;

    await db.transaction(async (tx) => {
      const [student] = await tx
        .delete(studentsTable)
        .where(stuById(req, String(req.params.id)))
        .returning();
      if (!student) return; // handled below
      deleted = student;

      if (student.applicationId) {
        // Scope the application update to the same tenant as the student to
        // prevent cross-tenant mutations (belt-and-suspenders; student is
        // already scoped by stuById above).
        const appWhere = student.tenantId
          ? and(
              eq(applicationsTable.id, student.applicationId),
              eq(applicationsTable.tenantId, student.tenantId),
            )
          : eq(applicationsTable.id, student.applicationId);

        await tx
          .update(applicationsTable)
          .set({ status: "admitted" })
          .where(appWhere);

        await tx.insert(applicationEventsTable).values({
          applicationId: student.applicationId,
          eventType:     "admitted",
          title:         "Enrollment Reversed",
          description:   `Student record (Applicant ID: ${student.applicantId}) was deleted; application returned to admitted status.`,
        });
      }
    });

    if (!deleted) return res.status(404).json({ error: "Student not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete student");
    return res.status(500).json({ error: "Failed to delete student" });
  }
});

// ── Student Documents ─────────────────────────────────────────────────────────

router.get("/admin/students/:id/documents", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const docs = await db
      .select()
      .from(studentDocumentsTable)
      .where(eq(studentDocumentsTable.studentId, studentId))
      .orderBy(desc(studentDocumentsTable.uploadedAt));
    return res.json(docs);
  } catch (err) {
    req.log.error({ err }, "GET student documents failed");
    return res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/admin/students/:id/documents", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const { docType, originalName, mimeType, fileSize, data: fileBase64 } = req.body as {
      docType: string; originalName: string; mimeType: string; fileSize: number; data: string;
    };
    if (!docType || !originalName || !mimeType || !fileBase64) {
      return res.status(400).json({ error: "docType, originalName, mimeType and data are required" });
    }
    const allowed = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"];
    const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: "Unsupported file type" });
    }
    const buf = Buffer.from(fileBase64, "base64");
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 10 MB" });
    }
    const { putPrivateObject } = await import("../lib/storage");
    const key = `student-docs/${studentId}-${Date.now()}.${ext}`;
    const storedName = await putPrivateObject(key, buf, mimeType);
    const [doc] = await db
      .insert(studentDocumentsTable)
      .values({ studentId, docType, originalName, storedName, mimeType, fileSize: Number(fileSize) })
      .returning();
    return res.status(201).json(doc);
  } catch (err) {
    req.log.error({ err }, "POST student document failed");
    return res.status(500).json({ error: "Failed to upload document" });
  }
});

router.delete("/admin/students/:id/documents/:docId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const [doc] = await db
      .select()
      .from(studentDocumentsTable)
      .where(and(eq(studentDocumentsTable.id, String(req.params.docId)), eq(studentDocumentsTable.studentId, studentId)));
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const { deleteObject, urlToKey } = await import("../lib/storage");
    const key = urlToKey(doc.storedName, "student-docs/");
    if (key) await deleteObject(key);
    await db.delete(studentDocumentsTable).where(eq(studentDocumentsTable.id, doc.id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE student document failed");
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

router.get("/admin/students/:id/documents/:docId/download", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const [doc] = await db
      .select()
      .from(studentDocumentsTable)
      .where(and(eq(studentDocumentsTable.id, String(req.params.docId)), eq(studentDocumentsTable.studentId, studentId)));
    if (!doc) return res.status(404).json({ error: "Not found" });
    const { resolvePrivateDownloadUrl } = await import("../lib/storage");
    let url = await resolvePrivateDownloadUrl(doc.storedName, "student-docs/", 300);
    if (!url) return res.status(404).json({ error: "Document not found" });
    if (url.startsWith("/uploads/")) {
      const token = (req.query["token"] as string | undefined) ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (token) url = `${url}?token=${encodeURIComponent(token)}`;
    }
    return res.redirect(302, url);
  } catch (err) {
    req.log.error({ err }, "GET student document download failed");
    return res.status(500).json({ error: "Failed to download document" });
  }
});

// ── Student Disciplinary ──────────────────────────────────────────────────────

router.get("/admin/students/:id/disciplinary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const records = await db
      .select()
      .from(studentDisciplinaryTable)
      .where(eq(studentDisciplinaryTable.studentId, studentId))
      .orderBy(desc(studentDisciplinaryTable.incidentDate));
    return res.json(records);
  } catch (err) {
    req.log.error({ err }, "GET student disciplinary failed");
    return res.status(500).json({ error: "Failed to fetch disciplinary records" });
  }
});

router.post("/admin/students/:id/disciplinary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const { incidentDate, severity, type, description, actionTaken, reportedBy, status } = req.body as {
      incidentDate: string; severity: string; type: string; description: string;
      actionTaken?: string; reportedBy?: string; status?: string;
    };
    if (!incidentDate || !type || !description) {
      return res.status(400).json({ error: "incidentDate, type and description are required" });
    }
    const [record] = await db
      .insert(studentDisciplinaryTable)
      .values({
        studentId,
        incidentDate,
        severity: severity || "minor",
        type,
        description,
        actionTaken: actionTaken || null,
        reportedBy: reportedBy || null,
        status: status || "open",
      })
      .returning();
    return res.status(201).json(record);
  } catch (err) {
    req.log.error({ err }, "POST student disciplinary failed");
    return res.status(500).json({ error: "Failed to create disciplinary record" });
  }
});

router.patch("/admin/students/:id/disciplinary/:recordId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const { status, actionTaken } = req.body as { status?: string; actionTaken?: string };
    const [updated] = await db
      .update(studentDisciplinaryTable)
      .set({ ...(status ? { status } : {}), ...(actionTaken !== undefined ? { actionTaken } : {}) })
      .where(and(eq(studentDisciplinaryTable.id, String(req.params.recordId)), eq(studentDisciplinaryTable.studentId, studentId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Record not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "PATCH student disciplinary failed");
    return res.status(500).json({ error: "Failed to update disciplinary record" });
  }
});

router.delete("/admin/students/:id/disciplinary/:recordId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    const [deleted] = await db
      .delete(studentDisciplinaryTable)
      .where(and(eq(studentDisciplinaryTable.id, String(req.params.recordId)), eq(studentDisciplinaryTable.studentId, studentId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Record not found" });
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE student disciplinary failed");
    return res.status(500).json({ error: "Failed to delete disciplinary record" });
  }
});

// ── GET /admin/students/:id/enrollments — academic year history ───────────────

router.get("/admin/students/:id/enrollments", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    // Validate student belongs to this tenant before returning enrollment rows
    const [stu] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(stuById(req, studentId))
      .limit(1);
    if (!stu) return res.status(404).json({ error: "Student not found" });
    const rows = await db
      .select({
        id:             studentEnrollmentsTable.id,
        studentId:      studentEnrollmentsTable.studentId,
        academicYearId: studentEnrollmentsTable.academicYearId,
        yearName:       academicYearsTable.name,
        classCode:      studentEnrollmentsTable.classCode,
        sectionId:      studentEnrollmentsTable.sectionId,
        sectionName:    sectionsTable.name,
        houseId:        studentEnrollmentsTable.houseId,
        houseName:      housesTable.name,
        houseColor:     housesTable.color,
        startDate:      studentEnrollmentsTable.startDate,
        endDate:        studentEnrollmentsTable.endDate,
        status:         studentEnrollmentsTable.status,
        createdAt:      studentEnrollmentsTable.createdAt,
      })
      .from(studentEnrollmentsTable)
      .leftJoin(academicYearsTable, eq(studentEnrollmentsTable.academicYearId, academicYearsTable.id))
      .leftJoin(sectionsTable, eq(studentEnrollmentsTable.sectionId, sectionsTable.id))
      .leftJoin(housesTable, eq(studentEnrollmentsTable.houseId, housesTable.id))
      .where(eq(studentEnrollmentsTable.studentId, stu.id))
      .orderBy(desc(studentEnrollmentsTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET student enrollments failed");
    return res.status(500).json({ error: "Failed to fetch enrollment history" });
  }
});

// ── Student Activity Timeline ─────────────────────────────────────────────────

router.get("/admin/students/:id/timeline", requireAdmin, async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params.id);
    if (!await resolveStudentTenant(req, studentId)) return res.status(403).json({ error: "Student not found in this tenant" });
    type TimelineEvent = {
      id: string; date: string; category: string; title: string; description: string; meta?: string;
    };
    const events: TimelineEvent[] = [];

    // Fee challans
    const challans = await db
      .select()
      .from(feeChallansTable)
      .where(eq(feeChallansTable.studentId, studentId));
    for (const c of challans) {
      events.push({
        id: `challan-${c.id}`,
        date: c.paidAt ? c.paidAt.toISOString().slice(0, 10) : c.issueDate,
        category: "fee",
        title: c.status === "paid" ? "Fee Paid" : "Fee Challan Issued",
        description: `PKR ${Number(c.amount).toLocaleString()}${c.challanNumber ? ` · #${c.challanNumber}` : ""}`,
        meta: c.status,
      });
    }

    // Library issues — join to get book title
    const issues = await db
      .select({
        id: libraryIssuesTable.id,
        bookTitle: libraryBooksTable.title,
        issuedDate: libraryIssuesTable.issuedDate,
        dueDate: libraryIssuesTable.dueDate,
        returnedDate: libraryIssuesTable.returnedDate,
        fineAmount: libraryIssuesTable.fineAmount,
        status: libraryIssuesTable.status,
      })
      .from(libraryIssuesTable)
      .leftJoin(libraryBooksTable, eq(libraryIssuesTable.bookId, libraryBooksTable.id))
      .where(eq(libraryIssuesTable.studentId, studentId));
    for (const li of issues) {
      const bookLabel = li.bookTitle ? `${li.bookTitle} · ` : "";
      events.push({
        id: `lib-issue-${li.id}`,
        date: li.issuedDate,
        category: "library",
        title: "Book Issued",
        description: `${bookLabel}Due: ${li.dueDate}`,
        meta: li.status,
      });
      if (li.returnedDate) {
        events.push({
          id: `lib-return-${li.id}`,
          date: li.returnedDate,
          category: "library",
          title: "Book Returned",
          description: li.fineAmount > 0 ? `${bookLabel}Fine: PKR ${Number(li.fineAmount).toLocaleString()}` : `${bookLabel}No fine`,
          meta: "returned",
        });
      }
    }

    // Hostel allocations
    const allocations = await db
      .select({
        id: hostelAllocationsTable.id,
        fromDate: hostelAllocationsTable.fromDate,
        status: hostelAllocationsTable.status,
        roomNumber: hostelRoomsTable.roomNumber,
        blockName: hostelBlocksTable.name,
      })
      .from(hostelAllocationsTable)
      .leftJoin(hostelRoomsTable, eq(hostelAllocationsTable.roomId, hostelRoomsTable.id))
      .leftJoin(hostelBlocksTable, eq(hostelRoomsTable.blockId, hostelBlocksTable.id))
      .where(eq(hostelAllocationsTable.studentId, studentId));
    for (const a of allocations) {
      events.push({
        id: `hostel-${a.id}`,
        date: a.fromDate,
        category: "hostel",
        title: "Hostel Allocated",
        description: [a.blockName, a.roomNumber].filter(Boolean).join(" · ") || "Room assigned",
        meta: a.status,
      });
    }

    // Disciplinary
    const discRecords = await db
      .select()
      .from(studentDisciplinaryTable)
      .where(eq(studentDisciplinaryTable.studentId, studentId));
    for (const d of discRecords) {
      events.push({
        id: `disc-${d.id}`,
        date: d.incidentDate,
        category: "disciplinary",
        title: `Disciplinary: ${d.type.charAt(0).toUpperCase() + d.type.slice(1)}`,
        description: d.description,
        meta: d.severity,
      });
    }

    // Sort newest first
    events.sort((a, b) => b.date.localeCompare(a.date));
    return res.json(events);
  } catch (err) {
    req.log.error({ err }, "GET student timeline failed");
    return res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

export default router;
