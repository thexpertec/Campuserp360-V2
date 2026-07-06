import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { canonicalizeCnic, canonicalizePhone } from "../lib/format-utils.js";
import { resolveUrl } from "../lib/storage";
import { tryCreateAndPostJE, coaByCode, coaById } from "../lib/je-factory";
import { syncEmployeeCoa } from "../lib/coa-sync";
import {
  hrDepartmentsTable, hrDesignationsTable, hrSalaryGradesTable,
  hrIncentiveTypesTable, hrDeductionTypesTable,
  employeesTable, employeeBankAccountsTable, employeeDocumentsTable,
  employeeSalaryTransactionsTable, hrAttendanceTable, hrLeaveRequestsTable,
  employeeSalaryTemplatesTable, employeeSalaryTemplateItemsTable,
  hrLectureAttendanceTable, timetableSlotsTable, timetablePeriodsTable,
  insertHrDepartmentSchema, insertHrDesignationSchema, insertHrSalaryGradeSchema,
  insertHrIncentiveTypeSchema, insertHrDeductionTypeSchema,
  insertEmployeeSchema, insertEmployeeBankAccountSchema,
  insertEmployeeSalaryTransactionSchema, insertHrAttendanceSchema,
  insertHrLeaveRequestSchema, insertEmployeeSalaryTemplateSchema,
  bankAccountsTable,
  chartOfAccountsTable,
} from "@workspace/db";
import { eq, asc, desc, ilike, and, or, sql, count, inArray } from "drizzle-orm";
import { requireAdmin, requireRole, realAdminUserId } from "../lib/admin-auth";
import { getAdminTenantId, withTenantRead } from "../lib/tenant";
import { z } from "zod/v4";

function zodError(err: z.ZodError): string {
  return err.issues.map(i => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`).join("; ");
}

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function catalogRoutes(
  path: string,
  table: any,
  router: IRouter,
  updateSchema: z.ZodObject<any>,
) {
  router.get(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
      // withTenantRead pins the connection to a transaction with SET LOCAL ROLE app_user
      // + set_config LOCAL so the RLS tenant_isolation policy fires as a second safety net
      // on top of the explicit WHERE tenant_id clause below.
      const rows = await withTenantRead(tenantId, (tx) =>
        tx.select().from(table)
          .where(eq(table.tenantId, tenantId))
          .orderBy(asc(table.sortOrder), asc(table.name))
      );
      return res.json(rows);
    } catch (err) {
      req.log.error({ err }, `GET ${path} failed`);
      return res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  router.post(path, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
      const { id: _id, createdAt: _ca, updatedAt: _ua, tenantId: _tid, ...data } = req.body as any;
      const rows = (await db.insert(table).values({ ...data, tenantId }).returning()) as any[];
      return res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
      req.log.error({ err }, `POST ${path} failed`);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });

  router.put(`${path}/:id`, requireAdmin, async (req: Request, res: Response) => {
    try {
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
      const id = String(req.params.id);
      const parsed = updateSchema.partial().strict().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
      }
      const [row] = await db.update(table)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.tenantId, tenantId)))
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
      const tenantId = await getAdminTenantId(req);
      if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
      const id = String(req.params.id);
      await db.delete(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId)));
      return res.json({ success: true });
    } catch (err) {
      req.log.error({ err }, `DELETE ${path}/:id failed`);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

catalogRoutes("/admin/hr/departments",    hrDepartmentsTable,    router, insertHrDepartmentSchema);
catalogRoutes("/admin/hr/designations",   hrDesignationsTable,   router, insertHrDesignationSchema);
catalogRoutes("/admin/hr/salary-grades",  hrSalaryGradesTable,   router, insertHrSalaryGradeSchema);
catalogRoutes("/admin/hr/incentive-types",hrIncentiveTypesTable, router, insertHrIncentiveTypeSchema);
catalogRoutes("/admin/hr/deduction-types",hrDeductionTypesTable, router, insertHrDeductionTypeSchema);

// ── Staff ID generator ────────────────────────────────────────────────────────
const ROLE_PREFIX: Record<string, string> = {
  director: "DIR", admin: "ADM", teacher: "TCH", accountant: "ACC",
  admission_officer: "ADO", librarian: "LIB", medical_officer: "MED", support: "SUP",
};

async function generateStaffId(role: string, tenantId: string): Promise<string> {
  const prefix = ROLE_PREFIX[role] ?? "EMP";
  const year   = String(new Date().getFullYear()).slice(-2);
  const rows   = await db
    .select({ staffId: employeesTable.staffId })
    .from(employeesTable)
    .where(and(
      eq(employeesTable.tenantId, tenantId),
      ilike(employeesTable.staffId, `${prefix}-${year}-%`),
    ))
    .orderBy(desc(employeesTable.staffId));
  const last = rows[0]?.staffId;
  let seq = 1;
  if (last) {
    const parts = last.split("-");
    const lastSeq = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(3, "0")}`;
}

// ── Employees list ────────────────────────────────────────────────────────────
router.get("/admin/employees", requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      role, q, status = "active",
      page = "1", pageSize = "25",
      sortBy = "", sortDir = "asc", sort = "",
    } = req.query as Record<string, string>;

    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });

    const pg   = Math.max(1, parseInt(page, 10));
    const size = Math.min(2000, Math.max(1, parseInt(pageSize, 10)));
    const offset = (pg - 1) * size;

    const conditions: any[] = [eq(employeesTable.tenantId, tenantId)];
    if (role && role !== "all") conditions.push(eq(employeesTable.role, role));
    if (status && status !== "all") conditions.push(eq(employeesTable.status, status));
    if (q) {
      const like = `%${q}%`;
      conditions.push(or(
        ilike(employeesTable.fullName,  like),
        ilike(employeesTable.staffId,   like),
        ilike(employeesTable.email,     like),
      ));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    // withTenantRead sets SET LOCAL ROLE app_user + app.current_tenant so RLS fires
    // as a second safety net in addition to the explicit WHERE tenant_id clause.
    const [rows, [{ total }]] = await withTenantRead(tenantId, async (tx) => {
      function colClauses(key: string, dir: "asc" | "desc"): ReturnType<typeof asc>[] {
        const fn = dir === "desc" ? desc : asc;
        switch (key) {
          case "staffId":     return [fn(employeesTable.staffId)];
          case "name":        return [fn(employeesTable.fullName)];
          case "fatherName":  return [fn(employeesTable.fatherName)];
          case "role":        return [fn(employeesTable.role)];
          case "status":      return [fn(employeesTable.status)];
          case "gender":      return [fn(employeesTable.gender)];
          case "joiningDate": return [fn(employeesTable.joiningDate as any)];
          default:            return [];
        }
      }
      const orderClauses = (() => {
        if (sort) {
          const clauses = sort.split(",").flatMap(s => {
            const [k, d] = s.trim().split(":");
            return colClauses(k?.trim() ?? "", d === "desc" ? "desc" : "asc");
          });
          return clauses.length ? clauses : [desc(employeesTable.createdAt), desc(employeesTable.id)];
        }
        const single = colClauses(sortBy, sortDir === "desc" ? "desc" : "asc");
        return single.length ? single : [desc(employeesTable.createdAt), desc(employeesTable.id)];
      })();

      return Promise.all([
        tx
          .select({
            id: employeesTable.id,
            staffId: employeesTable.staffId,
            fullName: employeesTable.fullName,
            fatherName: employeesTable.fatherName,
            gender: employeesTable.gender,
            religion: employeesTable.religion,
            bloodGroup: employeesTable.bloodGroup,
            dateOfBirth: employeesTable.dateOfBirth,
            email: employeesTable.email,
            phone: employeesTable.phone,
            qualification: employeesTable.qualification,
            presentAddress: employeesTable.presentAddress,
            permanentAddress: employeesTable.permanentAddress,
            role: employeesTable.role,
            contractType: employeesTable.contractType,
            joiningDate: employeesTable.joiningDate,
            status: employeesTable.status,
            photoFilename: employeesTable.photoFilename,
            designationId: employeesTable.designationId,
            departmentId: employeesTable.departmentId,
            salaryGradeId: employeesTable.salaryGradeId,
            attendanceMode: employeesTable.attendanceMode,
            scheduledStartTime: employeesTable.scheduledStartTime,
            scheduledEndTime: employeesTable.scheduledEndTime,
            graceMinutes: employeesTable.graceMinutes,
            designationName: hrDesignationsTable.name,
            departmentName: hrDepartmentsTable.name,
            salaryGradeName: hrSalaryGradesTable.name,
          })
          .from(employeesTable)
          .leftJoin(hrDesignationsTable, eq(employeesTable.designationId, hrDesignationsTable.id))
          .leftJoin(hrDepartmentsTable,  eq(employeesTable.departmentId,  hrDepartmentsTable.id))
          .leftJoin(hrSalaryGradesTable, eq(employeesTable.salaryGradeId, hrSalaryGradesTable.id))
          .where(where)
          .orderBy(...orderClauses)
          .limit(size)
          .offset(offset),
        tx.select({ total: count() }).from(employeesTable).where(where),
      ]);
    });

    return res.json({
      employees: rows.map(r => ({ ...r, photoFilename: resolveUrl(r.photoFilename) })),
      total: Number(total), page: pg, pageSize: size,
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/employees failed");
    return res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// ── Create employee ───────────────────────────────────────────────────────────
router.post("/admin/employees", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const body = req.body as any;
    const role = body.role ?? "admin";
    const staffId = await generateStaffId(role, tenantId);
    const { tenantId: _tid, ...restBody } = body;
    if (restBody.cnic?.trim()) {
      const canon = canonicalizeCnic(restBody.cnic);
      if (!canon) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
      restBody.cnic = canon;
    }
    if (restBody.phone?.trim()) {
      const canon = canonicalizePhone(restBody.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      restBody.phone = canon;
    }
    const [emp] = await db.insert(employeesTable).values({ ...restBody, staffId, tenantId }).returning();
    // Fire-and-forget: create salary-expense COA sub-ledger for this employee.
    // Log a clear warning if it fails so the missing ledger can be backfilled;
    // payroll JE generation will also lazily create one if it is still missing.
    void syncEmployeeCoa(
      {
        id:           emp.id,
        fullName:     emp.fullName,
        staffId:      emp.staffId,
        role:         emp.role,
        contractType: emp.contractType ?? "permanent",
      },
      tenantId,
    ).then(coaId => {
      if (!coaId) req.log.warn({ employeeId: emp.id, staffId: emp.staffId }, "syncEmployeeCoa returned null on employee create — sub-ledger missing, will backfill lazily");
    }).catch(err => {
      req.log.error({ err, employeeId: emp.id, staffId: emp.staffId }, "syncEmployeeCoa threw on employee create");
    });
    return res.status(201).json(emp);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Staff ID or username already exists" });
    req.log.error({ err }, "POST /admin/employees failed");
    return res.status(500).json({ error: "Failed to create employee" });
  }
});

// ── Employee by staff ID ──────────────────────────────────────────────────────
router.get("/admin/employees/by-staff-id/:staffId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const staffId = String(req.params.staffId).trim();
    const [emp] = await db
      .select({
        id: employeesTable.id,
        staffId: employeesTable.staffId,
        fullName: employeesTable.fullName,
        fatherName: employeesTable.fatherName,
        gender: employeesTable.gender,
        religion: employeesTable.religion,
        bloodGroup: employeesTable.bloodGroup,
        dateOfBirth: employeesTable.dateOfBirth,
        cnic: employeesTable.cnic,
        nationality: employeesTable.nationality,
        photoFilename: employeesTable.photoFilename,
        email: employeesTable.email,
        phone: employeesTable.phone,
        presentAddress: employeesTable.presentAddress,
        permanentAddress: employeesTable.permanentAddress,
        role: employeesTable.role,
        designationId: employeesTable.designationId,
        departmentId: employeesTable.departmentId,
        salaryGradeId: employeesTable.salaryGradeId,
        qualification: employeesTable.qualification,
        experience: employeesTable.experience,
        joiningDate: employeesTable.joiningDate,
        contractType: employeesTable.contractType,
        status: employeesTable.status,
        username: employeesTable.username,
        createdAt: employeesTable.createdAt,
        updatedAt: employeesTable.updatedAt,
        attendanceMode: employeesTable.attendanceMode,
        scheduledStartTime: employeesTable.scheduledStartTime,
        scheduledEndTime: employeesTable.scheduledEndTime,
        graceMinutes: employeesTable.graceMinutes,
        coaId: employeesTable.coaId,
        designationName: hrDesignationsTable.name,
        departmentName: hrDepartmentsTable.name,
        salaryGradeName: hrSalaryGradesTable.name,
        salaryGradeBasicMin: hrSalaryGradesTable.basicMin,
        salaryGradeBasicMax: hrSalaryGradesTable.basicMax,
      })
      .from(employeesTable)
      .leftJoin(hrDesignationsTable, eq(employeesTable.designationId, hrDesignationsTable.id))
      .leftJoin(hrDepartmentsTable,  eq(employeesTable.departmentId,  hrDepartmentsTable.id))
      .leftJoin(hrSalaryGradesTable, eq(employeesTable.salaryGradeId, hrSalaryGradesTable.id))
      .where(and(eq(employeesTable.staffId, staffId), eq(employeesTable.tenantId, tenantId)));

    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const id = emp.id;
    const [bankAccounts, documents, salaryTransactions] = await Promise.all([
      db.select().from(employeeBankAccountsTable)
        .where(eq(employeeBankAccountsTable.employeeId, id))
        .orderBy(desc(employeeBankAccountsTable.isPrimary)),
      db.select().from(employeeDocumentsTable)
        .where(eq(employeeDocumentsTable.employeeId, id))
        .orderBy(desc(employeeDocumentsTable.uploadedAt)),
      db.select().from(employeeSalaryTransactionsTable)
        .where(eq(employeeSalaryTransactionsTable.employeeId, id))
        .orderBy(desc(employeeSalaryTransactionsTable.month))
        .limit(24),
    ]);

    return res.json({ ...emp, photoFilename: resolveUrl(emp.photoFilename), bankAccounts, documents, salaryTransactions });
  } catch (err) {
    req.log.error({ err }, "GET /admin/employees/by-staff-id/:staffId failed");
    return res.status(500).json({ error: "Failed to fetch employee" });
  }
});

// ── Employee profile ──────────────────────────────────────────────────────────
router.get("/admin/employees/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = String(req.params.id);
    const [emp] = await db
      .select({
        id: employeesTable.id,
        staffId: employeesTable.staffId,
        fullName: employeesTable.fullName,
        fatherName: employeesTable.fatherName,
        gender: employeesTable.gender,
        religion: employeesTable.religion,
        bloodGroup: employeesTable.bloodGroup,
        dateOfBirth: employeesTable.dateOfBirth,
        cnic: employeesTable.cnic,
        nationality: employeesTable.nationality,
        photoFilename: employeesTable.photoFilename,
        email: employeesTable.email,
        phone: employeesTable.phone,
        presentAddress: employeesTable.presentAddress,
        permanentAddress: employeesTable.permanentAddress,
        role: employeesTable.role,
        designationId: employeesTable.designationId,
        departmentId: employeesTable.departmentId,
        salaryGradeId: employeesTable.salaryGradeId,
        qualification: employeesTable.qualification,
        experience: employeesTable.experience,
        joiningDate: employeesTable.joiningDate,
        contractType: employeesTable.contractType,
        status: employeesTable.status,
        username: employeesTable.username,
        createdAt: employeesTable.createdAt,
        updatedAt: employeesTable.updatedAt,
        attendanceMode: employeesTable.attendanceMode,
        scheduledStartTime: employeesTable.scheduledStartTime,
        scheduledEndTime: employeesTable.scheduledEndTime,
        graceMinutes: employeesTable.graceMinutes,
        coaId: employeesTable.coaId,
        designationName: hrDesignationsTable.name,
        departmentName: hrDepartmentsTable.name,
        salaryGradeName: hrSalaryGradesTable.name,
        salaryGradeBasicMin: hrSalaryGradesTable.basicMin,
        salaryGradeBasicMax: hrSalaryGradesTable.basicMax,
      })
      .from(employeesTable)
      .leftJoin(hrDesignationsTable, eq(employeesTable.designationId, hrDesignationsTable.id))
      .leftJoin(hrDepartmentsTable,  eq(employeesTable.departmentId,  hrDepartmentsTable.id))
      .leftJoin(hrSalaryGradesTable, eq(employeesTable.salaryGradeId, hrSalaryGradesTable.id))
      .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId)));

    if (!emp) return res.status(404).json({ error: "Employee not found" });

    const [bankAccounts, documents, salaryTransactions] = await Promise.all([
      db.select().from(employeeBankAccountsTable)
        .where(eq(employeeBankAccountsTable.employeeId, id))
        .orderBy(desc(employeeBankAccountsTable.isPrimary)),
      db.select().from(employeeDocumentsTable)
        .where(eq(employeeDocumentsTable.employeeId, id))
        .orderBy(desc(employeeDocumentsTable.uploadedAt)),
      db.select().from(employeeSalaryTransactionsTable)
        .where(eq(employeeSalaryTransactionsTable.employeeId, id))
        .orderBy(desc(employeeSalaryTransactionsTable.month))
        .limit(24),
    ]);

    return res.json({ ...emp, photoFilename: resolveUrl(emp.photoFilename), bankAccounts, documents, salaryTransactions });
  } catch (err) {
    req.log.error({ err }, "GET /admin/employees/:id failed");
    return res.status(500).json({ error: "Failed to fetch employee" });
  }
});

const employeeUpdateSchema = insertEmployeeSchema
  .omit({ staffId: true, passwordHash: true })
  .partial()
  .strict();

// ── Update employee ───────────────────────────────────────────────────────────
router.put("/admin/employees/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = String(req.params.id);
    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    const updateData: Record<string, any> = { ...parsed.data };
    if (updateData.cnic?.trim()) {
      const canon = canonicalizeCnic(updateData.cnic);
      if (!canon) return res.status(400).json({ error: "CNIC must be exactly 13 digits — format: XXXXX-XXXXXXX-X" });
      updateData.cnic = canon;
    }
    if (updateData.phone?.trim()) {
      const canon = canonicalizePhone(updateData.phone);
      if (!canon) return res.status(400).json({ error: "Phone must be exactly 11 digits — format: 0XXX-XXXXXXX" });
      updateData.phone = canon;
    }
    const [emp] = await db
      .update(employeesTable)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId)))
      .returning();
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    return res.json(emp);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Username already taken" });
    req.log.error({ err }, "PUT /admin/employees/:id failed");
    return res.status(500).json({ error: "Failed to update employee" });
  }
});

// ── Delete employee ───────────────────────────────────────────────────────────
router.delete("/admin/employees/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const id = String(req.params.id);
    await db.delete(employeesTable).where(and(eq(employeesTable.id, id), eq(employeesTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /admin/employees/:id failed");
    return res.status(500).json({ error: "Failed to delete employee" });
  }
});

// ── Tenant guard helpers ───────────────────────────────────────────────────────
async function resolveEmployeeTenant(req: Request, employeeId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.tenantId, tenantId))).limit(1);
  return emp ? tenantId : null;
}
async function resolveAttendanceTenant(req: Request, attendanceId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [row] = await db.select({ id: hrAttendanceTable.id }).from(hrAttendanceTable)
    .innerJoin(employeesTable, and(eq(hrAttendanceTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
    .where(eq(hrAttendanceTable.id, attendanceId)).limit(1);
  return row ? tenantId : null;
}
async function resolveLeaveRequestTenant(req: Request, leaveId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [row] = await db.select({ id: hrLeaveRequestsTable.id }).from(hrLeaveRequestsTable)
    .innerJoin(employeesTable, and(eq(hrLeaveRequestsTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
    .where(eq(hrLeaveRequestsTable.id, leaveId)).limit(1);
  return row ? tenantId : null;
}
async function resolveSalaryTxTenant(req: Request, txId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [row] = await db.select({ id: employeeSalaryTransactionsTable.id }).from(employeeSalaryTransactionsTable)
    .innerJoin(employeesTable, and(eq(employeeSalaryTransactionsTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
    .where(eq(employeeSalaryTransactionsTable.id, txId)).limit(1);
  return row ? tenantId : null;
}
async function resolveSalaryTemplateTenant(req: Request, templateId: string): Promise<string | null> {
  const tenantId = await getAdminTenantId(req);
  if (!tenantId) return null;
  const [row] = await db.select({ id: employeeSalaryTemplatesTable.id }).from(employeeSalaryTemplatesTable)
    .innerJoin(employeesTable, and(eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
    .where(eq(employeeSalaryTemplatesTable.id, templateId)).limit(1);
  return row ? tenantId : null;
}

// ── Bank accounts ─────────────────────────────────────────────────────────────
router.post("/admin/employees/:id/bank-accounts", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveEmployeeTenant(req, id)) return res.status(403).json({ error: "Employee not found in this tenant" });
    if (req.body.isPrimary) {
      await db.update(employeeBankAccountsTable)
        .set({ isPrimary: false })
        .where(eq(employeeBankAccountsTable.employeeId, id));
    }
    const [row] = await db.insert(employeeBankAccountsTable)
      .values({ ...req.body, employeeId: id })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST bank-accounts failed");
    return res.status(500).json({ error: "Failed to add bank account" });
  }
});

const bankAccountUpdateSchema = insertEmployeeBankAccountSchema
  .omit({ employeeId: true })
  .partial()
  .strict();

router.put("/admin/employees/:id/bank-accounts/:accId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id); const accId = String(req.params.accId);
    if (!await resolveEmployeeTenant(req, id)) return res.status(403).json({ error: "Employee not found in this tenant" });
    const parsed = bankAccountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    if (parsed.data.isPrimary) {
      await db.update(employeeBankAccountsTable).set({ isPrimary: false }).where(eq(employeeBankAccountsTable.employeeId, id));
    }
    const [row] = await db.update(employeeBankAccountsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(employeeBankAccountsTable.id, accId), eq(employeeBankAccountsTable.employeeId, id)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT bank-accounts failed");
    return res.status(500).json({ error: "Failed to update bank account" });
  }
});

router.delete("/admin/employees/:id/bank-accounts/:accId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id); const accId = String(req.params.accId);
    if (!await resolveEmployeeTenant(req, id)) return res.status(403).json({ error: "Employee not found in this tenant" });
    await db.delete(employeeBankAccountsTable).where(and(eq(employeeBankAccountsTable.id, accId), eq(employeeBankAccountsTable.employeeId, id)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE bank-accounts failed");
    return res.status(500).json({ error: "Failed to delete bank account" });
  }
});

// ── Salary transactions ───────────────────────────────────────────────────────
router.post("/admin/employees/:id/salary-transactions", requireRole("payroll", "draft"), async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveEmployeeTenant(req, id)) return res.status(403).json({ error: "Employee not found in this tenant" });
    const body = req.body as any;
    const net = (body.basicSalary ?? 0) + (body.allowances ?? 0) - (body.deductions ?? 0);
    const user = req.adminUser;
    const preparedBy = realAdminUserId(user);
    const [row] = await db.insert(employeeSalaryTransactionsTable)
      .values({ ...body, employeeId: id, netSalary: net, preparedBy, status: preparedBy ? "pending" : (body.status ?? "pending") })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "POST salary-transactions failed");
    return res.status(500).json({ error: "Failed to add salary transaction" });
  }
});

// POST /admin/payroll/transactions/:id/approve — Checker approves payroll
router.post("/admin/payroll/transactions/:txId/approve", requireRole("payroll", "post"), async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId);
    if (!await resolveSalaryTxTenant(req, txId)) return res.status(403).json({ error: "Transaction not found in this tenant" });
    const { bankAccountId } = req.body as { bankAccountId?: string };
    const [existing] = await db
      .select()
      .from(employeeSalaryTransactionsTable)
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Salary transaction not found" });
    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending transactions can be approved" });
    }

    const user = req.adminUser!;
    const approvedBy = realAdminUserId(user);
    if (approvedBy && existing.preparedBy && existing.preparedBy === approvedBy) {
      return res.status(403).json({ error: "Self-approval not permitted — the preparer cannot approve their own payroll entry" });
    }

    const [updated] = await db
      .update(employeeSalaryTransactionsTable)
      .set({ status: "approved", approvedBy: approvedBy ?? undefined, approvedAt: new Date() })
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .returning();

    // On approval: post expense accrual JE only (DR employee sub-ledger, CR Salaries Payable)
    void generatePayrollJE(
      { id: updated.id, employeeId: updated.employeeId, month: updated.month, netSalary: updated.netSalary },
      req.log,
      bankAccountId,
      "expense",
    );

    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "POST payroll approve failed");
    return res.status(500).json({ error: "Failed to approve payroll transaction" });
  }
});

// POST /admin/payroll/transactions/:txId/reject — Checker rejects a pending salary transaction
router.post("/admin/payroll/transactions/:txId/reject", requireRole("payroll", "post"), async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId);
    if (!await resolveSalaryTxTenant(req, txId)) return res.status(403).json({ error: "Transaction not found in this tenant" });
    const [existing] = await db
      .select()
      .from(employeeSalaryTransactionsTable)
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Salary transaction not found" });
    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending transactions can be rejected" });
    }
    const { reason } = req.body as { reason?: string };
    const [updated] = await db
      .update(employeeSalaryTransactionsTable)
      .set({ status: "rejected", remarks: reason ? `[REJECTED: ${reason.trim()}]` : "[REJECTED by checker]" })
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .returning();
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "POST payroll reject failed");
    return res.status(500).json({ error: "Failed to reject payroll transaction" });
  }
});

const salaryTransactionUpdateSchema = insertEmployeeSalaryTransactionSchema
  .omit({
    employeeId: true, netSalary: true,
    // Approval-state fields are managed exclusively by checker approve/reject endpoints
    status: true, paidAt: true, preparedBy: true, approvedBy: true, approvedAt: true,
  })
  .partial()
  .strict();

router.put("/admin/employees/:id/salary-transactions/:txId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId);
    if (!await resolveSalaryTxTenant(req, txId)) return res.status(403).json({ error: "Transaction not found in this tenant" });
    const parsed = salaryTransactionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    const net = (parsed.data.basicSalary ?? 0) + (parsed.data.allowances ?? 0) - (parsed.data.deductions ?? 0);
    // Note: status/paidAt are intentionally excluded from this endpoint — payment state
    // transitions are handled exclusively by POST /approve, POST /reject, and PUT /pay.
    const [row] = await db.update(employeeSalaryTransactionsTable)
      .set({ ...parsed.data, netSalary: net })
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT salary-transactions failed");
    return res.status(500).json({ error: "Failed to update salary transaction" });
  }
});

// ── Photo upload ──────────────────────────────────────────────────────────────
router.post("/admin/employees/:id/photo", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveEmployeeTenant(req, id)) return res.status(403).json({ error: "Employee not found in this tenant" });
    const { fileBase64, fileName } = req.body as { fileBase64: string; fileName: string };
    const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase();
    const allowed = ["jpg", "jpeg", "png", "webp"];
    if (!allowed.includes(ext)) return res.status(400).json({ error: "Only jpg/png/webp allowed" });

    const fn = `${id}-${Date.now()}.${ext}`;
    const { putObject } = await import("../lib/storage");
    const storedUrl = await putObject(`employees/${fn}`, Buffer.from(fileBase64, "base64"), `image/${ext === "jpg" ? "jpeg" : ext}`);

    const [emp] = await db.update(employeesTable).set({ photoFilename: storedUrl, updatedAt: new Date() }).where(eq(employeesTable.id, id)).returning();
    return res.json({ photoFilename: storedUrl, employee: emp });
  } catch (err) {
    req.log.error({ err }, "POST /admin/employees/:id/photo failed");
    return res.status(500).json({ error: "Failed to upload photo" });
  }
});

// ── Staff Attendance ───────────────────────────────────────────────────────────
router.get("/admin/hr/attendance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { employeeId, date, status } = req.query as Record<string, string>;
    const conds: any[] = [eq(employeesTable.tenantId, tenantId)];
    if (employeeId) conds.push(eq(hrAttendanceTable.employeeId, employeeId));
    if (date) conds.push(eq(hrAttendanceTable.attendanceDate, date));
    if (status && status !== "all") conds.push(eq(hrAttendanceTable.status, status));
    const where = and(...conds);
    const rows = await db
      .select({
        id: hrAttendanceTable.id,
        employeeId: hrAttendanceTable.employeeId,
        attendanceDate: hrAttendanceTable.attendanceDate,
        status: hrAttendanceTable.status,
        inTime: hrAttendanceTable.inTime,
        outTime: hrAttendanceTable.outTime,
        notes: hrAttendanceTable.notes,
        earlyDeparture: hrAttendanceTable.earlyDeparture,
        lecturesAttended: hrAttendanceTable.lecturesAttended,
        lecturesTotal: hrAttendanceTable.lecturesTotal,
        fullName: employeesTable.fullName,
        staffId: employeesTable.staffId,
      })
      .from(hrAttendanceTable)
      .leftJoin(employeesTable, eq(hrAttendanceTable.employeeId, employeesTable.id))
      .where(where)
      .orderBy(desc(hrAttendanceTable.attendanceDate));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hr attendance failed");
    return res.status(500).json({ error: "Failed to fetch attendance" });
  }
});
router.post("/admin/hr/attendance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.employeeId && !await resolveEmployeeTenant(req, data.employeeId)) {
      return res.status(403).json({ error: "Employee not found in this tenant" });
    }
    const [row] = await db.insert(hrAttendanceTable).values(data).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST hr attendance failed");
    return res.status(500).json({ error: "Failed to create attendance record" });
  }
});
const attendanceUpdateSchema = insertHrAttendanceSchema
  .omit({ employeeId: true })
  .partial()
  .strict();

router.put("/admin/hr/attendance/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const aid = String(req.params.id);
    if (!await resolveAttendanceTenant(req, aid)) return res.status(403).json({ error: "Attendance record not found in this tenant" });
    const parsed = attendanceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    const [row] = await db.update(hrAttendanceTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(hrAttendanceTable.id, aid)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT hr attendance failed");
    return res.status(500).json({ error: "Failed to update attendance" });
  }
});
router.delete("/admin/hr/attendance/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const aid = String(req.params.id);
    if (!await resolveAttendanceTenant(req, aid)) return res.status(403).json({ error: "Attendance record not found in this tenant" });
    await db.delete(hrAttendanceTable).where(eq(hrAttendanceTable.id, aid));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hr attendance failed");
    return res.status(500).json({ error: "Failed to delete attendance record" });
  }
});

// POST /admin/hr/attendance/bulk-save  — save/overwrite a full day's sheet
// Body: { date: string, records: [{ employeeId, status, inTime?, outTime?, notes? }] }
router.post("/admin/hr/attendance/bulk-save", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(403).json({ error: "Tenant not found" });
    const { date, records } = req.body as {
      date: string;
      records: { employeeId: string; status: string; inTime?: string; outTime?: string; notes?: string }[];
    };
    if (!date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "date and records[] are required" });
    }
    const empIds = records.map(r => r.employeeId);
    // Fetch attendance config for these employees; this doubles as the
    // tenant-ownership check (any id missing here is not in this tenant).
    const settings = empIds.length > 0
      ? await db.select({
          id: employeesTable.id,
          attendanceMode: employeesTable.attendanceMode,
          scheduledStartTime: employeesTable.scheduledStartTime,
          scheduledEndTime: employeesTable.scheduledEndTime,
          graceMinutes: employeesTable.graceMinutes,
        }).from(employeesTable)
        .where(and(inArray(employeesTable.id, empIds), eq(employeesTable.tenantId, tenantId)))
      : [];
    const settingsMap = new Map(settings.map(s => [s.id, s]));
    if (empIds.some(id => !settingsMap.has(id))) {
      return res.status(403).json({ error: "One or more employees not in this tenant" });
    }

    // Lecture-based teachers are marked per-lecture via /lectures/save, which
    // writes their rolled-up day status. Never let the time-based sheet clobber
    // it — filter them out server-side (defence-in-depth beyond the UI split).
    const timeBased = records.filter(r => settingsMap.get(r.employeeId)?.attendanceMode !== "lecture_based");
    const timeBasedIds = timeBased.map(r => r.employeeId);
    if (timeBasedIds.length === 0) {
      return res.json({ saved: 0, skippedLectureBased: records.length });
    }

    // Delete existing records for this date for the time-based employees only
    await db.delete(hrAttendanceTable).where(
      and(
        eq(hrAttendanceTable.attendanceDate, date),
        sql`${hrAttendanceTable.employeeId} = ANY(ARRAY[${sql.join(timeBasedIds.map(id => sql`${id}::uuid`), sql`, `)}])`
      )
    );
    // Insert fresh records, auto-deriving late / early-departure from the
    // employee's scheduled hours when an in/out time is supplied.
    const inserted = await db.insert(hrAttendanceTable).values(
      timeBased.map(r => {
        const cfg = settingsMap.get(r.employeeId);
        let status = r.status || "present";
        let earlyDeparture = false;
        const attended = status === "present" || status === "late";
        if (attended) {
          const inMin = hhmmToMinutes(r.inTime);
          const startMin = hhmmToMinutes(cfg?.scheduledStartTime);
          if (status === "present" && inMin != null && startMin != null && inMin > startMin + (cfg?.graceMinutes ?? 0)) {
            status = "late";
          }
          const outMin = hhmmToMinutes(r.outTime);
          const endMin = hhmmToMinutes(cfg?.scheduledEndTime);
          if (outMin != null && endMin != null && outMin < endMin) earlyDeparture = true;
        }
        return {
          employeeId: r.employeeId,
          attendanceDate: date,
          status,
          inTime: r.inTime || null,
          outTime: r.outTime || null,
          notes: r.notes || null,
          earlyDeparture,
        };
      })
    ).returning();
    return res.json({ saved: inserted.length, skippedLectureBased: records.length - timeBased.length });
  } catch (err) {
    req.log.error({ err }, "POST hr attendance bulk-save failed");
    return res.status(500).json({ error: "Failed to save attendance" });
  }
});

// ── Lecture-based attendance helpers ─────────────────────────────────────────
// "HH:MM" → minutes since midnight (null if blank/invalid). Zero-padded input.
function hhmmToMinutes(v?: string | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
// ISO date (YYYY-MM-DD) → ISO weekday 1=Mon … 7=Sun (UTC-safe; matches
// timetable_slots.day_of_week which is 1=Mon … 7=Sun).
function weekdayFromISO(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getUTCDay(); // 0=Sun … 6=Sat
  return js === 0 ? 7 : js;
}

// GET /admin/hr/attendance/lectures?employeeId&date
// A lecture-based teacher's scheduled lectures for the weekday of `date`,
// merged with any per-lecture attendance already saved for that exact date.
router.get("/admin/hr/attendance/lectures", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { employeeId, date } = req.query as Record<string, string>;
    if (!employeeId || !date) return res.status(400).json({ error: "employeeId and date are required" });
    const dow = weekdayFromISO(date);
    if (dow == null) return res.status(400).json({ error: "Invalid date (expected YYYY-MM-DD)" });
    const [emp] = await db
      .select({ id: employeesTable.id, fullName: employeesTable.fullName })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.tenantId, tenantId)))
      .limit(1);
    if (!emp) return res.status(403).json({ error: "Employee not found in this tenant" });
    const fullName = emp.fullName;

    const rows = await db
      .select({
        slotId: timetableSlotsTable.id,
        periodId: timetableSlotsTable.periodId,
        classCode: timetableSlotsTable.classCode,
        sectionName: timetableSlotsTable.sectionName,
        subjectName: timetableSlotsTable.subjectName,
        subjectCode: timetableSlotsTable.subjectCode,
        periodName: timetablePeriodsTable.name,
        startTime: timetablePeriodsTable.startTime,
        endTime: timetablePeriodsTable.endTime,
        present: hrLectureAttendanceTable.present,
      })
      .from(timetableSlotsTable)
      .leftJoin(timetablePeriodsTable, eq(timetableSlotsTable.periodId, timetablePeriodsTable.id))
      .leftJoin(hrLectureAttendanceTable, and(
        eq(hrLectureAttendanceTable.slotId, timetableSlotsTable.id),
        eq(hrLectureAttendanceTable.employeeId, employeeId),
        eq(hrLectureAttendanceTable.attendanceDate, date),
      ))
      .where(and(
        eq(timetableSlotsTable.tenantId, tenantId),
        eq(timetableSlotsTable.dayOfWeek, dow),
        or(eq(timetableSlotsTable.teacherEmployeeId, employeeId), eq(timetableSlotsTable.teacherName, fullName)),
      ))
      .orderBy(asc(timetablePeriodsTable.sortOrder), asc(timetablePeriodsTable.startTime));

    // Unmarked lecture defaults to present (mirrors the sheet's "present" default).
    const lectures = rows.map(r => ({
      slotId: r.slotId,
      periodId: r.periodId,
      classCode: r.classCode,
      sectionName: r.sectionName,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      periodName: r.periodName,
      startTime: r.startTime,
      endTime: r.endTime,
      present: r.present == null ? true : r.present,
      saved: r.present != null,
    }));
    const total = lectures.length;
    const attended = lectures.filter(l => l.present).length;
    const saved = lectures.some(l => l.saved);
    return res.json({ employeeId, date, dayOfWeek: dow, total, attended, saved, lectures });
  } catch (err) {
    req.log.error({ err }, "GET hr attendance lectures failed");
    return res.status(500).json({ error: "Failed to fetch lectures" });
  }
});

// POST /admin/hr/attendance/lectures/save
// Body: { employeeId, date, lectures: [{ slotId, periodId?, present }] }
// Replaces the per-lecture rows for the day and upserts the rolled-up hr_attendance row.
router.post("/admin/hr/attendance/lectures/save", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { employeeId, date, lectures } = req.body as {
      employeeId: string; date: string;
      lectures: { slotId: string; periodId?: string | null; present: boolean }[];
    };
    if (!employeeId || !date || !Array.isArray(lectures)) {
      return res.status(400).json({ error: "employeeId, date and lectures[] are required" });
    }
    if (weekdayFromISO(date) == null) return res.status(400).json({ error: "Invalid date (expected YYYY-MM-DD)" });
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.tenantId, tenantId))).limit(1);
    if (!emp) return res.status(403).json({ error: "Employee not found in this tenant" });

    const total = lectures.length;
    const attended = lectures.filter(l => l.present).length;
    // Rollup: all present → present; none → absent; partial → late.
    const status = total === 0 || attended === 0 ? "absent" : attended === total ? "present" : "late";
    const summary = total > 0 ? `${attended} of ${total} lectures attended` : "No lectures scheduled";

    await db.transaction(async (tx) => {
      await tx.delete(hrLectureAttendanceTable).where(and(
        eq(hrLectureAttendanceTable.employeeId, employeeId),
        eq(hrLectureAttendanceTable.attendanceDate, date),
      ));
      if (lectures.length > 0) {
        await tx.insert(hrLectureAttendanceTable).values(
          lectures.map(l => ({
            employeeId,
            attendanceDate: date,
            slotId: l.slotId,
            periodId: l.periodId ?? null,
            present: !!l.present,
          }))
        );
      }
      await tx.insert(hrAttendanceTable).values({
        employeeId,
        attendanceDate: date,
        status,
        notes: summary,
        lecturesAttended: attended,
        lecturesTotal: total,
      }).onConflictDoUpdate({
        target: [hrAttendanceTable.employeeId, hrAttendanceTable.attendanceDate],
        set: { status, notes: summary, lecturesAttended: attended, lecturesTotal: total, updatedAt: new Date() },
      });
    });
    return res.json({ saved: total, attended, total, status });
  } catch (err) {
    req.log.error({ err }, "POST hr attendance lectures save failed");
    return res.status(500).json({ error: "Failed to save lecture attendance" });
  }
});

// GET /admin/hr/attendance/monthly-report?month=YYYY-MM
// Per-employee attendance aggregates for a month. Lecture-based staff report
// lectures attended vs scheduled (from the day rollups); time-based staff
// report counts of present/absent/leave/off/late days.
router.get("/admin/hr/attendance/monthly-report", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: "month is required (expected YYYY-MM)" });
    }

    const [emps, attRows] = await Promise.all([
      db.select({
          id: employeesTable.id,
          staffId: employeesTable.staffId,
          fullName: employeesTable.fullName,
          attendanceMode: employeesTable.attendanceMode,
          departmentId: employeesTable.departmentId,
          departmentName: hrDepartmentsTable.name,
          designationName: hrDesignationsTable.name,
        })
        .from(employeesTable)
        .leftJoin(hrDepartmentsTable, eq(employeesTable.departmentId, hrDepartmentsTable.id))
        .leftJoin(hrDesignationsTable, eq(employeesTable.designationId, hrDesignationsTable.id))
        .where(and(
          eq(employeesTable.tenantId, tenantId),
          inArray(employeesTable.status, ["active", "on_leave"]),
        ))
        .orderBy(asc(employeesTable.fullName)),
      db.select({
          employeeId: hrAttendanceTable.employeeId,
          attendanceDate: hrAttendanceTable.attendanceDate,
          status: hrAttendanceTable.status,
          lecturesAttended: hrAttendanceTable.lecturesAttended,
          lecturesTotal: hrAttendanceTable.lecturesTotal,
        })
        .from(hrAttendanceTable)
        .innerJoin(employeesTable, and(
          eq(hrAttendanceTable.employeeId, employeesTable.id),
          eq(employeesTable.tenantId, tenantId),
        ))
        .where(sql`${hrAttendanceTable.attendanceDate} LIKE ${month + "-%"}`),
    ]);

    const byEmp = new Map<string, typeof attRows>();
    for (const r of attRows) {
      const list = byEmp.get(r.employeeId);
      if (list) list.push(r); else byEmp.set(r.employeeId, [r]);
    }

    const employees = emps.map(e => {
      const rows = byEmp.get(e.id) ?? [];
      const counts = { present: 0, absent: 0, leave: 0, off: 0, late: 0 };
      let lecturesAttended = 0;
      let lecturesTotal = 0;
      for (const r of rows) {
        if (r.status in counts) counts[r.status as keyof typeof counts]++;
        lecturesAttended += r.lecturesAttended ?? 0;
        lecturesTotal += r.lecturesTotal ?? 0;
      }
      return {
        employeeId: e.id,
        staffId: e.staffId,
        name: e.fullName,
        departmentId: e.departmentId,
        departmentName: e.departmentName,
        designationName: e.designationName,
        attendanceMode: e.attendanceMode ?? "time_based",
        daysMarked: rows.length,
        daysPresent: counts.present,
        daysAbsent: counts.absent,
        daysLeave: counts.leave,
        daysOff: counts.off,
        daysLate: counts.late,
        lecturesAttended,
        lecturesTotal,
        lecturePercentage: lecturesTotal > 0 ? Math.round((lecturesAttended / lecturesTotal) * 1000) / 10 : null,
      };
    });

    return res.json({ month, employees });
  } catch (err) {
    req.log.error({ err }, "GET hr attendance monthly-report failed");
    return res.status(500).json({ error: "Failed to build monthly attendance report" });
  }
});

// ── Leave Requests ──────────────────────────────────────────────────────────────
router.get("/admin/hr/leave-requests", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const { employeeId, status } = req.query as Record<string, string>;
    const conds: any[] = [eq(employeesTable.tenantId, tenantId)];
    if (employeeId) conds.push(eq(hrLeaveRequestsTable.employeeId, employeeId));
    if (status && status !== "all") conds.push(eq(hrLeaveRequestsTable.status, status));
    const where = and(...conds);
    const rows = await db
      .select({
        id: hrLeaveRequestsTable.id,
        employeeId: hrLeaveRequestsTable.employeeId,
        leaveType: hrLeaveRequestsTable.leaveType,
        fromDate: hrLeaveRequestsTable.fromDate,
        toDate: hrLeaveRequestsTable.toDate,
        reason: hrLeaveRequestsTable.reason,
        status: hrLeaveRequestsTable.status,
        approvedBy: hrLeaveRequestsTable.approvedBy,
        notes: hrLeaveRequestsTable.notes,
        fullName: employeesTable.fullName,
        staffId: employeesTable.staffId,
      })
      .from(hrLeaveRequestsTable)
      .leftJoin(employeesTable, eq(hrLeaveRequestsTable.employeeId, employeesTable.id))
      .where(where)
      .orderBy(desc(hrLeaveRequestsTable.fromDate));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET hr leave requests failed");
    return res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});
async function getEmployeeJoiningDate(employeeId: string): Promise<string | null> {
  const [emp] = await db.select({ joiningDate: employeesTable.joiningDate }).from(employeesTable)
    .where(eq(employeesTable.id, employeeId)).limit(1);
  return emp?.joiningDate ?? null;
}

router.post("/admin/hr/leave-requests", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    if (data.employeeId && !await resolveEmployeeTenant(req, data.employeeId)) {
      return res.status(403).json({ error: "Employee not found in this tenant" });
    }
    if (data.employeeId && data.fromDate) {
      const joiningDate = await getEmployeeJoiningDate(data.employeeId);
      if (joiningDate && data.fromDate < joiningDate) {
        return res.status(400).json({ error: `From date cannot be before employee's joining date (${joiningDate})`, field: "fromDate" });
      }
    }
    const [row] = await db.insert(hrLeaveRequestsTable).values(data).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST hr leave request failed");
    return res.status(500).json({ error: "Failed to create leave request" });
  }
});
const leaveRequestUpdateSchema = insertHrLeaveRequestSchema
  .omit({ employeeId: true })
  .partial()
  .strict();

router.put("/admin/hr/leave-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const lid = String(req.params.id);
    if (!await resolveLeaveRequestTenant(req, lid)) return res.status(403).json({ error: "Leave request not found in this tenant" });
    const parsed = leaveRequestUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    if (parsed.data.fromDate) {
      const [existing] = await db.select({ employeeId: hrLeaveRequestsTable.employeeId }).from(hrLeaveRequestsTable)
        .where(eq(hrLeaveRequestsTable.id, lid)).limit(1);
      if (existing) {
        const joiningDate = await getEmployeeJoiningDate(existing.employeeId);
        if (joiningDate && parsed.data.fromDate < joiningDate) {
          return res.status(400).json({ error: `From date cannot be before employee's joining date (${joiningDate})`, field: "fromDate" });
        }
      }
    }
    const [row] = await db.update(hrLeaveRequestsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(hrLeaveRequestsTable.id, lid)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT hr leave request failed");
    return res.status(500).json({ error: "Failed to update leave request" });
  }
});
router.delete("/admin/hr/leave-requests/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const lid = String(req.params.id);
    if (!await resolveLeaveRequestTenant(req, lid)) return res.status(403).json({ error: "Leave request not found in this tenant" });
    await db.delete(hrLeaveRequestsTable).where(eq(hrLeaveRequestsTable.id, lid));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE hr leave request failed");
    return res.status(500).json({ error: "Failed to delete leave request" });
  }
});

// ── Employee Salary Templates ─────────────────────────────────────────────────

async function generateTemplateCode(_tenantId: string): Promise<string> {
  // template_code has a GLOBAL unique constraint (not per tenant), so the
  // sequence must be computed across all tenants to avoid collisions.
  const rows = await db
    .select({ code: employeeSalaryTemplatesTable.templateCode })
    .from(employeeSalaryTemplatesTable);
  let maxSeq = 0;
  for (const r of rows) {
    const parts = r.code.split("-");
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `EST-${String(maxSeq + 1).padStart(3, "0")}`;
}

// List all templates
router.get("/admin/hr/employee-salary-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select({
        id:           employeeSalaryTemplatesTable.id,
        templateCode: employeeSalaryTemplatesTable.templateCode,
        employeeId:   employeeSalaryTemplatesTable.employeeId,
        basicSalary:  employeeSalaryTemplatesTable.basicSalary,
        effectiveFrom: employeeSalaryTemplatesTable.effectiveFrom,
        notes:        employeeSalaryTemplatesTable.notes,
        active:       employeeSalaryTemplatesTable.active,
        leaveDeductEnabled:          employeeSalaryTemplatesTable.leaveDeductEnabled,
        leaveDeductType:             employeeSalaryTemplatesTable.leaveDeductType,
        leaveDeductValue:            employeeSalaryTemplatesTable.leaveDeductValue,
        shortLeaveEnabled:           employeeSalaryTemplatesTable.shortLeaveEnabled,
        shortLeaveThresholdMinutes:  employeeSalaryTemplatesTable.shortLeaveThresholdMinutes,
        shortLeaveDeductType:        employeeSalaryTemplatesTable.shortLeaveDeductType,
        shortLeaveDeductValue:       employeeSalaryTemplatesTable.shortLeaveDeductValue,
        createdAt:    employeeSalaryTemplatesTable.createdAt,
        updatedAt:    employeeSalaryTemplatesTable.updatedAt,
        employeeStaffId:   employeesTable.staffId,
        employeeFullName:  employeesTable.fullName,
        employeeRole:      employeesTable.role,
      })
      .from(employeeSalaryTemplatesTable)
      .innerJoin(employeesTable, and(eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
      .orderBy(asc(employeeSalaryTemplatesTable.templateCode));

    // Attach items for each template
    const ids = rows.map(r => r.id);
    let itemsByTemplate: Record<string, any[]> = {};
    if (ids.length) {
      const allItems = await db
        .select()
        .from(employeeSalaryTemplateItemsTable)
        .where(sql`${employeeSalaryTemplateItemsTable.templateId} = ANY(${sql.raw(`ARRAY[${ids.map(id => `'${id}'`).join(",")}]::uuid[]`)})`)
        .orderBy(asc(employeeSalaryTemplateItemsTable.sortOrder));
      for (const item of allItems) {
        if (!itemsByTemplate[item.templateId]) itemsByTemplate[item.templateId] = [];
        itemsByTemplate[item.templateId]!.push(item);
      }
    }

    return res.json(rows.map(r => ({ ...r, items: itemsByTemplate[r.id] ?? [] })));
  } catch (err) {
    req.log.error({ err }, "GET employee-salary-templates failed");
    return res.status(500).json({ error: "Failed to fetch salary templates" });
  }
});

// Get single template with items
router.get("/admin/hr/employee-salary-templates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db
      .select({
        id:           employeeSalaryTemplatesTable.id,
        templateCode: employeeSalaryTemplatesTable.templateCode,
        employeeId:   employeeSalaryTemplatesTable.employeeId,
        basicSalary:  employeeSalaryTemplatesTable.basicSalary,
        effectiveFrom: employeeSalaryTemplatesTable.effectiveFrom,
        notes:        employeeSalaryTemplatesTable.notes,
        active:       employeeSalaryTemplatesTable.active,
        leaveDeductEnabled:          employeeSalaryTemplatesTable.leaveDeductEnabled,
        leaveDeductType:             employeeSalaryTemplatesTable.leaveDeductType,
        leaveDeductValue:            employeeSalaryTemplatesTable.leaveDeductValue,
        shortLeaveEnabled:           employeeSalaryTemplatesTable.shortLeaveEnabled,
        shortLeaveThresholdMinutes:  employeeSalaryTemplatesTable.shortLeaveThresholdMinutes,
        shortLeaveDeductType:        employeeSalaryTemplatesTable.shortLeaveDeductType,
        shortLeaveDeductValue:       employeeSalaryTemplatesTable.shortLeaveDeductValue,
        createdAt:    employeeSalaryTemplatesTable.createdAt,
        updatedAt:    employeeSalaryTemplatesTable.updatedAt,
        employeeStaffId:   employeesTable.staffId,
        employeeFullName:  employeesTable.fullName,
        employeeRole:      employeesTable.role,
      })
      .from(employeeSalaryTemplatesTable)
      .innerJoin(employeesTable, and(eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
      .where(eq(employeeSalaryTemplatesTable.id, id));
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const items = await db
      .select()
      .from(employeeSalaryTemplateItemsTable)
      .where(eq(employeeSalaryTemplateItemsTable.templateId, id))
      .orderBy(asc(employeeSalaryTemplateItemsTable.sortOrder));
    return res.json({ ...rows[0], items });
  } catch (err) {
    req.log.error({ err }, "GET employee-salary-template/:id failed");
    return res.status(500).json({ error: "Failed to fetch salary template" });
  }
});

const salaryTemplateItemSchema = z.object({
  itemType: z.string(),
  name: z.string(),
  calculationType: z.string(),
  value: z.number().int("Item value must be a whole number (no decimals)"),
  sortOrder: z.number().optional(),
}).strict();

const salaryTemplateCreateSchema = insertEmployeeSalaryTemplateSchema
  .omit({ templateCode: true })
  .extend({ items: z.array(salaryTemplateItemSchema).optional() })
  .strict();

const salaryTemplateUpdateSchema = insertEmployeeSalaryTemplateSchema
  .omit({ employeeId: true, templateCode: true })
  .partial()
  .extend({ items: z.array(salaryTemplateItemSchema).optional() })
  .strict();

// Create template
router.post("/admin/hr/employee-salary-templates", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const parsed = salaryTemplateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }
    const { items, ...rest } = parsed.data;
    if (rest.employeeId) {
      const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(eq(employeesTable.id, rest.employeeId), eq(employeesTable.tenantId, tenantId))).limit(1);
      if (!emp) return res.status(403).json({ error: "Employee not found in this tenant" });
    }
    const templateCode = await generateTemplateCode(tenantId);
    const [tpl] = await db.insert(employeeSalaryTemplatesTable).values({ ...rest, templateCode } as any).returning();
    if (items?.length) {
      await db.insert(employeeSalaryTemplateItemsTable).values(
        items.map((it, i) => ({ templateId: tpl.id, itemType: it.itemType, name: it.name, calculationType: it.calculationType, value: it.value, sortOrder: it.sortOrder ?? i })),
      );
    }
    const result = await db
      .select({ id: employeeSalaryTemplatesTable.id, templateCode: employeeSalaryTemplatesTable.templateCode, employeeId: employeeSalaryTemplatesTable.employeeId, basicSalary: employeeSalaryTemplatesTable.basicSalary, effectiveFrom: employeeSalaryTemplatesTable.effectiveFrom, notes: employeeSalaryTemplatesTable.notes, active: employeeSalaryTemplatesTable.active, leaveDeductEnabled: employeeSalaryTemplatesTable.leaveDeductEnabled, leaveDeductType: employeeSalaryTemplatesTable.leaveDeductType, leaveDeductValue: employeeSalaryTemplatesTable.leaveDeductValue, shortLeaveEnabled: employeeSalaryTemplatesTable.shortLeaveEnabled, shortLeaveThresholdMinutes: employeeSalaryTemplatesTable.shortLeaveThresholdMinutes, shortLeaveDeductType: employeeSalaryTemplatesTable.shortLeaveDeductType, shortLeaveDeductValue: employeeSalaryTemplatesTable.shortLeaveDeductValue, createdAt: employeeSalaryTemplatesTable.createdAt, updatedAt: employeeSalaryTemplatesTable.updatedAt, employeeStaffId: employeesTable.staffId, employeeFullName: employeesTable.fullName, employeeRole: employeesTable.role })
      .from(employeeSalaryTemplatesTable).leftJoin(employeesTable, eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id)).where(eq(employeeSalaryTemplatesTable.id, tpl.id));
    const savedItems = await db.select().from(employeeSalaryTemplateItemsTable).where(eq(employeeSalaryTemplateItemsTable.templateId, tpl.id)).orderBy(asc(employeeSalaryTemplateItemsTable.sortOrder));
    return res.status(201).json({ ...result[0], items: savedItems });
  } catch (err: any) {
    if (err?.code === "23505" || err?.cause?.code === "23505") return res.status(409).json({ error: "Employee already has a salary template" });
    req.log.error({ err }, "POST employee-salary-templates failed");
    return res.status(500).json({ error: "Failed to create salary template" });
  }
});

// Update template (replace items)
router.put("/admin/hr/employee-salary-templates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveSalaryTemplateTenant(req, id)) return res.status(403).json({ error: "Template not found in this tenant" });
    const parsed = salaryTemplateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: zodError(parsed.error) });
    }

    const { items, ...rest } = parsed.data;
    const [tpl] = await db.update(employeeSalaryTemplatesTable).set({ ...rest, updatedAt: new Date() }).where(eq(employeeSalaryTemplatesTable.id, id)).returning();
    if (!tpl) return res.status(404).json({ error: "Not found" });
    // Replace items
    await db.delete(employeeSalaryTemplateItemsTable).where(eq(employeeSalaryTemplateItemsTable.templateId, id));
    if (items?.length) {
      await db.insert(employeeSalaryTemplateItemsTable).values(
        items.map((it, i) => ({ templateId: id, itemType: it.itemType, name: it.name, calculationType: it.calculationType, value: it.value, sortOrder: it.sortOrder ?? i })),
      );
    }
    const result = await db
      .select({ id: employeeSalaryTemplatesTable.id, templateCode: employeeSalaryTemplatesTable.templateCode, employeeId: employeeSalaryTemplatesTable.employeeId, basicSalary: employeeSalaryTemplatesTable.basicSalary, effectiveFrom: employeeSalaryTemplatesTable.effectiveFrom, notes: employeeSalaryTemplatesTable.notes, active: employeeSalaryTemplatesTable.active, leaveDeductEnabled: employeeSalaryTemplatesTable.leaveDeductEnabled, leaveDeductType: employeeSalaryTemplatesTable.leaveDeductType, leaveDeductValue: employeeSalaryTemplatesTable.leaveDeductValue, shortLeaveEnabled: employeeSalaryTemplatesTable.shortLeaveEnabled, shortLeaveThresholdMinutes: employeeSalaryTemplatesTable.shortLeaveThresholdMinutes, shortLeaveDeductType: employeeSalaryTemplatesTable.shortLeaveDeductType, shortLeaveDeductValue: employeeSalaryTemplatesTable.shortLeaveDeductValue, createdAt: employeeSalaryTemplatesTable.createdAt, updatedAt: employeeSalaryTemplatesTable.updatedAt, employeeStaffId: employeesTable.staffId, employeeFullName: employeesTable.fullName, employeeRole: employeesTable.role })
      .from(employeeSalaryTemplatesTable).leftJoin(employeesTable, eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id)).where(eq(employeeSalaryTemplatesTable.id, id));
    const savedItems = await db.select().from(employeeSalaryTemplateItemsTable).where(eq(employeeSalaryTemplateItemsTable.templateId, id)).orderBy(asc(employeeSalaryTemplateItemsTable.sortOrder));
    return res.json({ ...result[0], items: savedItems });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Employee already has a salary template" });
    req.log.error({ err }, "PUT employee-salary-template/:id failed");
    return res.status(500).json({ error: "Failed to update salary template" });
  }
});

// Delete template
router.delete("/admin/hr/employee-salary-templates/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!await resolveSalaryTemplateTenant(req, id)) return res.status(403).json({ error: "Template not found in this tenant" });
    await db.delete(employeeSalaryTemplatesTable).where(eq(employeeSalaryTemplatesTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE employee-salary-template/:id failed");
    return res.status(500).json({ error: "Failed to delete salary template" });
  }
});

// ── Payroll ───────────────────────────────────────────────────────────────────

// GET /admin/payroll?month=YYYY-MM  — list all transactions for a month
router.get("/admin/payroll", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { month } = req.query as Record<string, string>;
    const baseWhere = eq(employeesTable.tenantId, tenantId);
    let q = db
      .select({
        id:          employeeSalaryTransactionsTable.id,
        employeeId:  employeeSalaryTransactionsTable.employeeId,
        month:       employeeSalaryTransactionsTable.month,
        basicSalary: employeeSalaryTransactionsTable.basicSalary,
        allowances:  employeeSalaryTransactionsTable.allowances,
        deductions:  employeeSalaryTransactionsTable.deductions,
        netSalary:   employeeSalaryTransactionsTable.netSalary,
        amountPaid:  employeeSalaryTransactionsTable.amountPaid,
        status:      employeeSalaryTransactionsTable.status,
        paidAt:      employeeSalaryTransactionsTable.paidAt,
        bankAccountId:    employeeSalaryTransactionsTable.bankAccountId,
        bankAccountTitle: bankAccountsTable.accountTitle,
        remarks:     employeeSalaryTransactionsTable.remarks,
        createdAt:   employeeSalaryTransactionsTable.createdAt,
        preparedBy:  employeeSalaryTransactionsTable.preparedBy,
        approvedBy:  employeeSalaryTransactionsTable.approvedBy,
        approvedAt:  employeeSalaryTransactionsTable.approvedAt,
        employeeStaffId:   employeesTable.staffId,
        employeeFullName:  employeesTable.fullName,
        employeeRole:      employeesTable.role,
        designationName:   hrDesignationsTable.name,
        departmentName:    hrDepartmentsTable.name,
      })
      .from(employeeSalaryTransactionsTable)
      .innerJoin(employeesTable, and(eq(employeeSalaryTransactionsTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
      .leftJoin(hrDesignationsTable, eq(employeesTable.designationId, hrDesignationsTable.id))
      .leftJoin(hrDepartmentsTable,  eq(employeesTable.departmentId,  hrDepartmentsTable.id))
      .leftJoin(bankAccountsTable,   eq(employeeSalaryTransactionsTable.bankAccountId, bankAccountsTable.id))
      .$dynamic();
    if (month) q = q.where(and(baseWhere, eq(employeeSalaryTransactionsTable.month, month)));
    const rows = await q.orderBy(asc(employeesTable.staffId));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET /admin/payroll failed");
    return res.status(500).json({ error: "Failed to fetch payroll" });
  }
});

// ── Attendance-driven deduction helper ────────────────────────────────────────
// Attendance status vocabulary: present | absent | leave | off | late.
// `off` = weekend/holiday and is never deductible. `late` maps to short-leave.
// NOTE: shortLeaveThresholdMinutes is intentionally NOT applied here — there is no
// scheduled shift-start time in the schema, so the `late` status is the sole
// occurrence marker. The threshold field is retained for future use.

interface AttendanceDeductionTemplate {
  basicSalary: number;
  leaveDeductEnabled: boolean;
  leaveDeductType: string;
  leaveDeductValue: number;
  shortLeaveEnabled: boolean;
  shortLeaveDeductType: string;
  shortLeaveDeductValue: number;
}

interface AttendanceDeductionResult {
  leaveDeduction: number;
  shortLeaveDeduction: number;
  breakdown: string | null;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, m!, 0).getDate();
}

function computeAttendanceDeductions(
  tpl: AttendanceDeductionTemplate,
  attendanceRows: { attendanceDate: string; status: string }[],
  approvedLeaves: { fromDate: string; toDate: string }[],
  month: string,
): AttendanceDeductionResult {
  const dim = daysInMonth(month);

  const coveredByApprovedLeave = (date: string) =>
    approvedLeaves.some(l => l.fromDate <= date && date <= l.toDate);

  let absentDays = 0;
  let unapprovedLeaveDays = 0;
  let lateOccurrences = 0;

  for (const row of attendanceRows) {
    if (row.status === "absent") {
      absentDays++;
    } else if (row.status === "leave") {
      if (!coveredByApprovedLeave(row.attendanceDate)) unapprovedLeaveDays++;
    } else if (row.status === "late") {
      lateOccurrences++;
    }
    // present / off → never deductible
  }

  const deductibleDays = absentDays + unapprovedLeaveDays;

  let leaveDeduction = 0;
  if (tpl.leaveDeductEnabled && deductibleDays > 0) {
    if (tpl.leaveDeductType === "per_day") {
      const perDayRate = tpl.leaveDeductValue > 0
        ? tpl.leaveDeductValue
        : Math.round(tpl.basicSalary / dim);
      leaveDeduction = perDayRate * deductibleDays;
    } else if (tpl.leaveDeductType === "fixed") {
      leaveDeduction = tpl.leaveDeductValue;
    } else if (tpl.leaveDeductType === "percentage") {
      leaveDeduction = deductibleDays * Math.round(tpl.basicSalary * tpl.leaveDeductValue / 100);
    }
  }

  let shortLeaveDeduction = 0;
  if (tpl.shortLeaveEnabled && lateOccurrences > 0) {
    if (tpl.shortLeaveDeductType === "per_occurrence") {
      shortLeaveDeduction = tpl.shortLeaveDeductValue * lateOccurrences;
    } else if (tpl.shortLeaveDeductType === "fixed") {
      shortLeaveDeduction = tpl.shortLeaveDeductValue;
    } else if (tpl.shortLeaveDeductType === "percentage") {
      shortLeaveDeduction = lateOccurrences * Math.round(tpl.basicSalary * tpl.shortLeaveDeductValue / 100);
    }
  }

  const parts: string[] = [];
  if (leaveDeduction > 0) {
    const dayParts: string[] = [];
    if (absentDays > 0) dayParts.push(`${absentDays} absent`);
    if (unapprovedLeaveDays > 0) dayParts.push(`${unapprovedLeaveDays} unapproved leave`);
    parts.push(`Leave/absence: ${dayParts.join(" + ")} day(s) → PKR ${leaveDeduction.toLocaleString("en-PK")}`);
  }
  if (shortLeaveDeduction > 0) {
    parts.push(`Short-leave: ${lateOccurrences} late occurrence(s) → PKR ${shortLeaveDeduction.toLocaleString("en-PK")}`);
  }
  const breakdown = parts.length ? `Attendance deductions — ${parts.join("; ")}` : null;

  return { leaveDeduction, shortLeaveDeduction, breakdown };
}

// POST /admin/payroll/generate  — bulk generate for a month from salary templates
router.post("/admin/payroll/generate", requireRole("payroll", "draft"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { month } = req.body as { month: string };
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    const generatingUser = req.adminUser;
    const preparedByGenerate = realAdminUserId(generatingUser);

    // Load all active templates with their items (scoped to tenant via employee join)
    const templates = await db
      .select({
        id:          employeeSalaryTemplatesTable.id,
        employeeId:  employeeSalaryTemplatesTable.employeeId,
        basicSalary: employeeSalaryTemplatesTable.basicSalary,
        leaveDeductEnabled:    employeeSalaryTemplatesTable.leaveDeductEnabled,
        leaveDeductType:       employeeSalaryTemplatesTable.leaveDeductType,
        leaveDeductValue:      employeeSalaryTemplatesTable.leaveDeductValue,
        shortLeaveEnabled:     employeeSalaryTemplatesTable.shortLeaveEnabled,
        shortLeaveDeductType:  employeeSalaryTemplatesTable.shortLeaveDeductType,
        shortLeaveDeductValue: employeeSalaryTemplatesTable.shortLeaveDeductValue,
      })
      .from(employeeSalaryTemplatesTable)
      .innerJoin(employeesTable, and(eq(employeeSalaryTemplatesTable.employeeId, employeesTable.id), eq(employeesTable.tenantId, tenantId)))
      .where(eq(employeeSalaryTemplatesTable.active, true));

    if (!templates.length) {
      return res.json({ generated: 0, updated: 0, skipped: 0, message: "No active salary templates found." });
    }

    // Load items for all templates
    const templateIds = templates.map(t => t.id);
    const allItems = await db
      .select()
      .from(employeeSalaryTemplateItemsTable)
      .where(inArray(employeeSalaryTemplateItemsTable.templateId, templateIds))
      .orderBy(asc(employeeSalaryTemplateItemsTable.sortOrder));

    const itemsByTemplate: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      if (!itemsByTemplate[item.templateId]) itemsByTemplate[item.templateId] = [];
      itemsByTemplate[item.templateId]!.push(item);
    }

    const empIds = templates.map(t => t.employeeId);

    // Existing transactions for this month (with status so we can recompute pending ones)
    const existing = await db
      .select({
        id:         employeeSalaryTransactionsTable.id,
        employeeId: employeeSalaryTransactionsTable.employeeId,
        status:     employeeSalaryTransactionsTable.status,
      })
      .from(employeeSalaryTransactionsTable)
      .where(and(
        eq(employeeSalaryTransactionsTable.month, month),
        inArray(employeeSalaryTransactionsTable.employeeId, empIds),
      ));

    const existingByEmp = new Map(existing.map(r => [r.employeeId, r]));

    // Load this month's attendance rows and approved leave requests for all employees
    const attendanceRows = await db
      .select({
        employeeId:     hrAttendanceTable.employeeId,
        attendanceDate: hrAttendanceTable.attendanceDate,
        status:         hrAttendanceTable.status,
      })
      .from(hrAttendanceTable)
      .where(and(
        inArray(hrAttendanceTable.employeeId, empIds),
        sql`${hrAttendanceTable.attendanceDate} LIKE ${month + "%"}`,
      ));

    const monthStart = `${month}-01`;
    const monthEnd   = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    const approvedLeaveRows = await db
      .select({
        employeeId: hrLeaveRequestsTable.employeeId,
        fromDate:   hrLeaveRequestsTable.fromDate,
        toDate:     hrLeaveRequestsTable.toDate,
      })
      .from(hrLeaveRequestsTable)
      .where(and(
        inArray(hrLeaveRequestsTable.employeeId, empIds),
        eq(hrLeaveRequestsTable.status, "approved"),
        sql`${hrLeaveRequestsTable.fromDate} <= ${monthEnd}`,
        sql`${hrLeaveRequestsTable.toDate} >= ${monthStart}`,
      ));

    const attendanceByEmp = new Map<string, { attendanceDate: string; status: string }[]>();
    for (const row of attendanceRows) {
      if (!attendanceByEmp.has(row.employeeId)) attendanceByEmp.set(row.employeeId, []);
      attendanceByEmp.get(row.employeeId)!.push(row);
    }
    const leavesByEmp = new Map<string, { fromDate: string; toDate: string }[]>();
    for (const row of approvedLeaveRows) {
      if (!leavesByEmp.has(row.employeeId)) leavesByEmp.set(row.employeeId, []);
      leavesByEmp.get(row.employeeId)!.push(row);
    }

    let generated = 0;
    let updated   = 0;
    let skipped   = 0;
    const failures: { employeeId: string; templateId: string; templateCode?: string; error: string }[] = [];

    for (const tpl of templates) {
      try {
        const items = itemsByTemplate[tpl.id] ?? [];
        const allowances = items
          .filter(i => i.itemType === "incentive")
          .reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round(tpl.basicSalary * i.value / 100) : i.value), 0);
        const itemDeductions = items
          .filter(i => i.itemType === "deduction")
          .reduce((s, i) => s + (i.calculationType === "percentage" ? Math.round(tpl.basicSalary * i.value / 100) : i.value), 0);

        const att = computeAttendanceDeductions(
          tpl,
          attendanceByEmp.get(tpl.employeeId) ?? [],
          leavesByEmp.get(tpl.employeeId) ?? [],
          month,
        );

        const deductions = itemDeductions + att.leaveDeduction + att.shortLeaveDeduction;
        const netSalary  = Math.max(0, tpl.basicSalary + allowances - deductions);

        const prior = existingByEmp.get(tpl.employeeId);
        if (!prior) {
          await db.insert(employeeSalaryTransactionsTable).values({
            employeeId: tpl.employeeId,
            month,
            basicSalary: tpl.basicSalary,
            allowances,
            deductions,
            netSalary,
            status: "pending",
            remarks: att.breakdown,
            preparedBy: preparedByGenerate,
          });
          generated++;
        } else if (prior.status === "pending" || prior.status === "draft") {
          // Recompute pending/draft slips so attendance edits before payment flow through.
          await db
            .update(employeeSalaryTransactionsTable)
            .set({
              basicSalary: tpl.basicSalary,
              allowances,
              deductions,
              netSalary,
              remarks: att.breakdown,
            })
            .where(and(
              eq(employeeSalaryTransactionsTable.id, prior.id),
              inArray(employeeSalaryTransactionsTable.status, ["pending", "draft"]),
            ));
          updated++;
        } else {
          // approved / paid → left untouched
          skipped++;
        }
      } catch (tplErr: any) {
        // Isolate per-template failures so one bad template (e.g. legacy
        // non-integer data) can't block payroll generation for everyone else.
        const message = tplErr?.cause?.message ?? tplErr?.message ?? "Unknown error";
        req.log.error(
          { err: tplErr, tenantId, month, employeeId: tpl.employeeId, templateId: tpl.id },
          "Payroll generation failed for one template — skipping and continuing",
        );
        failures.push({ employeeId: tpl.employeeId, templateId: tpl.id, error: message });
        skipped++;
      }
    }

    if (failures.length) {
      // Resolve staff names for the failures so the toast can name the offender.
      const failedEmpIds = failures.map(f => f.employeeId);
      const failedEmps = failedEmpIds.length
        ? await db.select({ id: employeesTable.id, staffId: employeesTable.staffId, fullName: employeesTable.fullName })
            .from(employeesTable).where(inArray(employeesTable.id, failedEmpIds))
        : [];
      const empById = new Map(failedEmps.map(e => [e.id, e]));
      const detailed = failures.map(f => {
        const emp = empById.get(f.employeeId);
        const who = emp ? `${emp.fullName} (${emp.staffId})` : f.employeeId;
        return `${who}: ${f.error}`;
      });
      return res.status(207).json({
        generated, updated, skipped,
        errors: detailed,
        message: `Generated ${generated}, updated ${updated}, but ${failures.length} template(s) failed: ${detailed.join("; ")}`,
      });
    }

    return res.json({ generated, updated, skipped });
  } catch (err: any) {
    const tenantId = await getAdminTenantId(req).catch(() => undefined);
    req.log.error({ err, tenantId, month: (req.body as any)?.month }, "POST /admin/payroll/generate failed");
    const detail = err?.cause?.message ?? err?.message;
    return res.status(500).json({
      error: detail ? `Failed to generate payroll: ${detail}` : "Failed to generate payroll",
    });
  }
});

// ── Payroll JE helper ─────────────────────────────────────────────────────────

async function generatePayrollJE(
  tx: { id: string; employeeId: string; month: string; netSalary: number },
  logger?: any,
  bankAccountId?: string,
  step: "expense" | "payment" | "both" = "both",
  paymentAmount?: number,
  paymentDate?: string,
): Promise<{ ok: boolean; error?: string }> {
  const today = paymentDate ?? new Date().toISOString().slice(0, 10);
  const amountPaid = paymentAmount ?? tx.netSalary;
  try {
    const [emp] = await db
      .select({ role: employeesTable.role, fullName: employeesTable.fullName, staffId: employeesTable.staffId, contractType: employeesTable.contractType, tenantId: employeesTable.tenantId, coaId: employeesTable.coaId })
      .from(employeesTable)
      .where(eq(employeesTable.id, tx.employeeId))
      .limit(1);

    const tid = emp?.tenantId ?? undefined;
    const empName = emp ? emp.fullName : tx.employeeId;

    // Employee salary expense sub-ledger.
    let expCoa = emp?.coaId ? await coaById(emp.coaId, tid) : null;

    // Lazy create-and-persist: an employee missing a sub-ledger at payroll-JE time
    // gets one created and linked now, instead of only falling back to a shared
    // group account (which would collapse every employee's expense into one line).
    if (!expCoa && emp && tid) {
      const newCoaId = await syncEmployeeCoa(
        {
          id:           tx.employeeId,
          fullName:     emp.fullName,
          staffId:      emp.staffId,
          role:         emp.role,
          contractType: emp.contractType ?? "permanent",
        },
        tid,
      );
      if (newCoaId) {
        expCoa = await coaById(newCoaId, tid);
      } else if (logger) {
        logger.warn({ employeeId: tx.employeeId }, "[payroll-je] lazy employee COA creation failed; falling back to group account");
      }
    }

    // Last-resort fallback to the role-based group account (rare — only if the
    // sub-ledger could not be created).
    if (!expCoa) {
      expCoa = await coaByCode(emp?.role === "teacher" ? "5010" : "5030", tid).then(r => r ?? coaByCode("5000", tid));
    }

    // Salaries Payable (2200) — intermediary liability account
    const salPayableCoa = await coaByCode("2200", tid);

    // Resolve bank/cash COA — prefer the explicitly selected account, fall back to hardcoded codes
    async function resolveBankCoa() {
      if (bankAccountId) {
        const [acct] = await db
          .select({ coaId: bankAccountsTable.coaId })
          .from(bankAccountsTable)
          .where(eq(bankAccountsTable.id, bankAccountId))
          .limit(1);
        if (acct?.coaId) {
          const [coa] = await db
            .select()
            .from(chartOfAccountsTable)
            .where(tid ? and(eq(chartOfAccountsTable.id, acct.coaId), eq(chartOfAccountsTable.tenantId, tid)) : eq(chartOfAccountsTable.id, acct.coaId))
            .limit(1);
          if (coa) return coa;
        }
      }
      return coaByCode("1130", tid).then(r => r ?? coaByCode("1100", tid));
    }

    // Step 1 — expense accrual: DR employee sub-ledger, CR Salaries Payable (2200)
    if ((step === "expense" || step === "both") && expCoa && salPayableCoa) {
      await tryCreateAndPostJE({
        tenantId: tid,
        date:         today,
        description:  `Salary accrual — ${empName} (${tx.month})`,
        reference:    tx.id,
        sourceModule: "payroll-expense",
        sourceRefId:  tx.id,
        lines: [
          { coaId: expCoa.id,        coaCode: expCoa.code,        coaName: expCoa.name,        debitAmount: tx.netSalary, creditAmount: 0,            narration: `Salary ${tx.month}` },
          { coaId: salPayableCoa.id, coaCode: salPayableCoa.code, coaName: salPayableCoa.name, debitAmount: 0,            creditAmount: tx.netSalary, narration: `Payable to ${empName}` },
        ],
      }, logger);
    } else if (step === "expense" || step === "both") {
      const msg = `[payroll-je] accrual skipped for tx ${tx.id}: missing ${!expCoa ? "employee expense COA" : "Salaries Payable (2200) COA"}`;
      if (logger) logger.warn(msg); else console.warn(msg);
      return { ok: false, error: msg };
    }

    // Step 2 — payment: DR Salaries Payable (2200), CR bank/cash
    if (step === "payment" || step === "both") {
      const bankCoa = await resolveBankCoa();
      if (bankCoa && salPayableCoa) {
        await tryCreateAndPostJE({
          tenantId: tid,
          date:         today,
          description:  `Salary payment — ${empName} (${tx.month})`,
          reference:    tx.id,
          sourceModule: "payroll-payment",
          sourceRefId:  tx.id,
          lines: [
            { coaId: salPayableCoa.id, coaCode: salPayableCoa.code, coaName: salPayableCoa.name, debitAmount: amountPaid, creditAmount: 0,          narration: `Payment for ${tx.month}` },
            { coaId: bankCoa.id,       coaCode: bankCoa.code,       coaName: bankCoa.name,       debitAmount: 0,          creditAmount: amountPaid, narration: `Paid to ${empName}` },
          ],
        }, logger);
      } else {
        const msg = `[payroll-je] payment skipped for tx ${tx.id}: missing ${!bankCoa ? "cash/bank COA" : "Salaries Payable (2200) COA"}`;
        if (logger) logger.warn(msg); else console.warn(msg);
        return { ok: false, error: msg };
      }
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger) logger.error({ err }, "[payroll-je] failed for tx " + tx.id);
    else console.error("[payroll-je] failed for tx " + tx.id, err);
    return { ok: false, error: msg };
  }
}

// PUT /admin/payroll/:txId/pay  — mark single transaction as paid directly.
// Named users must use the POST /approve endpoint unless they hold "edit"
// permission (or higher) in the payroll module.
router.put("/admin/payroll/:txId/pay", requireRole("payroll", "edit"), async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId);
    if (!await resolveSalaryTxTenant(req, txId)) return res.status(403).json({ error: "Transaction not found in this tenant" });
    const { remarks, bankAccountId, paidAt, amountPaid } = req.body as {
      remarks?: string; bankAccountId?: string; paidAt?: string; amountPaid?: number;
    };

    // Pre-fetch current status + netSalary to validate amount/date and determine JE step
    const [prePay] = await db
      .select({ status: employeeSalaryTransactionsTable.status, netSalary: employeeSalaryTransactionsTable.netSalary })
      .from(employeeSalaryTransactionsTable)
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .limit(1);
    if (!prePay) return res.status(404).json({ error: "Transaction not found" });

    let paidAtDate: Date | undefined;
    if (paidAt !== undefined) {
      paidAtDate = new Date(paidAt);
      if (Number.isNaN(paidAtDate.getTime())) return res.status(400).json({ error: "Invalid payment date" });
      const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
      if (paidAtDate.getTime() > endOfToday.getTime()) return res.status(400).json({ error: "Payment date cannot be in the future" });
    }

    let finalAmount: number | undefined;
    if (amountPaid !== undefined) {
      if (!Number.isFinite(amountPaid)) return res.status(400).json({ error: "Amount must be a valid number" });
      const rounded = Math.round(amountPaid);
      if (rounded <= 0) return res.status(400).json({ error: "Amount must be greater than 0" });
      if (rounded > prePay.netSalary) return res.status(400).json({ error: "Amount cannot exceed the net salary" });
      finalAmount = rounded;
    } else {
      finalAmount = prePay.netSalary;
    }

    const [row] = await db
      .update(employeeSalaryTransactionsTable)
      .set({
        status: "paid",
        paidAt: paidAtDate ?? new Date(),
        amountPaid: finalAmount,
        ...(remarks ? { remarks } : {}),
        ...(bankAccountId ? { bankAccountId } : {}),
      })
      .where(eq(employeeSalaryTransactionsTable.id, txId))
      .returning();
    if (!row) return res.status(404).json({ error: "Transaction not found" });

    const jeResult = await generatePayrollJE(
      { id: row.id, employeeId: row.employeeId, month: row.month, netSalary: row.netSalary },
      req.log,
      bankAccountId,
      prePay.status === "approved" ? "payment" : "both",
      finalAmount,
      paidAt !== undefined ? paidAt : undefined,
    );

    // Salary status change is authoritative even if the JE failed — but the
    // failure is surfaced in the response, not just the server log, so the
    // finance user can see and follow up (e.g. via the manual JE screen).
    return res.json({ ...row, jePosted: jeResult.ok, jeError: jeResult.ok ? undefined : jeResult.error });
  } catch (err) {
    req.log.error({ err }, "PUT /admin/payroll/:txId/pay failed");
    return res.status(500).json({ error: "Failed to mark as paid" });
  }
});

// POST /admin/payroll/pay-all  — mark all pending transactions for a month as paid.
// Requires "edit" permission (or higher) in the payroll module; named users
// without it must approve payroll transactions individually via the approve flow.
router.post("/admin/payroll/pay-all", requireRole("payroll", "edit"), async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { month, bankAccountId, paidAt } = req.body as { month: string; bankAccountId?: string; paidAt?: string };
    if (!month) return res.status(400).json({ error: "month is required" });

    let paidAtDate: Date | undefined;
    if (paidAt !== undefined) {
      paidAtDate = new Date(paidAt);
      if (Number.isNaN(paidAtDate.getTime())) return res.status(400).json({ error: "Invalid payment date" });
      const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
      if (paidAtDate.getTime() > endOfToday.getTime()) return res.status(400).json({ error: "Payment date cannot be in the future" });
    }

    // Fetch only transactions for this tenant's employees
    const tenantEmpIds = await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(eq(employeesTable.tenantId, tenantId));
    const empIdList = tenantEmpIds.map(e => e.id);
    if (!empIdList.length) return res.json({ paid: 0 });
    const rows = await db
      .update(employeeSalaryTransactionsTable)
      .set({
        status: "paid",
        paidAt: paidAtDate ?? new Date(),
        amountPaid: sql`${employeeSalaryTransactionsTable.netSalary}`,
        ...(bankAccountId ? { bankAccountId } : {}),
      })
      .where(and(
        eq(employeeSalaryTransactionsTable.month, month),
        eq(employeeSalaryTransactionsTable.status, "pending"),
        sql`${employeeSalaryTransactionsTable.employeeId} = ANY(${sql.raw(`ARRAY[${empIdList.map(id => `'${id}'`).join(",")}]::uuid[]`)})`,
      ))
      .returning();

    // Await each JE (not fire-and-forget) so failures are captured and returned
    // to the caller instead of only being visible in server logs.
    const jeFailures: Array<{ txId: string; employeeId: string; error: string }> = [];
    for (const row of rows) {
      const result = await generatePayrollJE(
        { id: row.id, employeeId: row.employeeId, month: row.month, netSalary: row.netSalary },
        req.log,
        bankAccountId,
        "both",
        row.netSalary,
        paidAt !== undefined ? paidAt : undefined,
      );
      if (!result.ok) {
        jeFailures.push({ txId: row.id, employeeId: row.employeeId, error: result.error ?? "Unknown error" });
      }
    }

    return res.json({
      paid: rows.length,
      jePosted: rows.length - jeFailures.length,
      jeFailures,
    });
  } catch (err) {
    req.log.error({ err }, "POST /admin/payroll/pay-all failed");
    return res.status(500).json({ error: "Failed to pay all" });
  }
});

// ── Employee Documents ─────────────────────────────────────────────────────────

router.post("/admin/employees/:id/documents", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    // Verify the employee belongs to this admin's tenant before accepting the upload
    if (!await resolveEmployeeTenant(req, id)) {
      return res.status(403).json({ error: "Employee not found in this tenant" });
    }
    const { fileBase64, fileName, docType = "other", docLabel } = req.body as {
      fileBase64: string; fileName: string; docType?: string; docLabel?: string;
    };

    const fs   = await import("fs/promises");
    const path = await import("path");

    const ext     = (fileName.split(".").pop() ?? "bin").toLowerCase();
    const allowed = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx"];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: "Unsupported file type. Allowed: PDF, JPG, PNG, WEBP, DOC, DOCX" });
    }

    const buf = Buffer.from(fileBase64, "base64");
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File exceeds 10 MB limit" });
    }

    const fn = `${id}-${Date.now()}.${ext}`;
    const { putPrivateObject } = await import("../lib/storage");
    const storedUrl = await putPrivateObject(`employee-docs/${fn}`, buf, ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`);

    const [doc] = await db
      .insert(employeeDocumentsTable)
      .values({ employeeId: id, docType, docLabel: docLabel ?? null, filename: storedUrl })
      .returning();

    return res.status(201).json(doc);
  } catch (err) {
    req.log.error({ err }, "POST /admin/employees/:id/documents failed");
    return res.status(500).json({ error: "Failed to upload document" });
  }
});

router.get("/admin/employees/:id/documents/:docId/download", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const docId = String(req.params.docId);
    // Verify doc belongs to an employee in this tenant before serving the file
    const [docRow] = await db
      .select({ id: employeeDocumentsTable.id, filename: employeeDocumentsTable.filename })
      .from(employeeDocumentsTable)
      .innerJoin(employeesTable, and(
        eq(employeeDocumentsTable.employeeId, employeesTable.id),
        eq(employeesTable.tenantId, tenantId),
      ))
      .where(eq(employeeDocumentsTable.id, docId))
      .limit(1);
    if (!docRow?.filename) return res.status(404).json({ error: "Document not found" });
    const { resolvePrivateDownloadUrl } = await import("../lib/storage");
    let url = await resolvePrivateDownloadUrl(docRow.filename, "employee-docs/", 300);
    if (!url) return res.status(404).json({ error: "Document not found" });
    if (url.startsWith("/uploads/")) {
      const token = (req.query["token"] as string | undefined) ?? req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (token) url = `${url}?token=${encodeURIComponent(token)}`;
    }
    return res.redirect(302, url);
  } catch (err) {
    req.log.error({ err }, "GET /admin/employees/:id/documents/:docId/download failed");
    return res.status(500).json({ error: "Failed to generate download URL" });
  }
});

router.delete("/admin/employees/:id/documents/:docId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Cannot resolve tenant" });
    const docId = String(req.params.docId);

    // Verify doc belongs to an employee in this tenant before fetching/deleting
    const joined = await db
      .select({ doc: employeeDocumentsTable })
      .from(employeeDocumentsTable)
      .innerJoin(employeesTable, and(
        eq(employeeDocumentsTable.employeeId, employeesTable.id),
        eq(employeesTable.tenantId, tenantId),
      ))
      .where(eq(employeeDocumentsTable.id, docId))
      .limit(1);

    const doc = joined[0]?.doc;
    if (!doc) return res.status(404).json({ error: "Document not found" });

    // Delete the file (best-effort)
    if (doc.filename) {
      try {
        const { deleteObject, urlToKey } = await import("../lib/storage");
        const key = urlToKey(doc.filename, "employee-docs/");
        if (key) await deleteObject(key);
      } catch { /* file might already be gone */ }
    }

    await db.delete(employeeDocumentsTable).where(eq(employeeDocumentsTable.id, docId));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE /admin/employees/:id/documents/:docId failed");
    return res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;

