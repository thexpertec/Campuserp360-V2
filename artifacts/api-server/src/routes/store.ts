import { Router, type IRouter, type Request, type Response } from "express";
import { db, storeItemCategoriesTable, storeUnitsTable, storeItemsTable, storeTransactionsTable } from "@workspace/db";
import { vendorsTable } from "@workspace/db";
import { eq, asc, desc, and, ilike, sql, count, sum, gt } from "drizzle-orm";
import { requireAdmin } from "../lib/admin-auth";
import { getAdminTenantId } from "../lib/tenant";
import { syncStoreCategoryCoa } from "../lib/coa-sync";
import { tryCreateAndPostJE, coaById, coaByCode } from "../lib/je-factory";

const router: IRouter = Router();

// ── Generic catalog CRUD ───────────────────────────────────────────────────────
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

// ── Item Categories (custom — wires coa-sync) ──────────────────────────────────
const CAT_PATH = "/admin/store/item-categories";
router.get(CAT_PATH, requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const rows = await db.select().from(storeItemCategoriesTable)
      .where(eq(storeItemCategoriesTable.tenantId, tenantId))
      .orderBy(asc(storeItemCategoriesTable.sortOrder), asc(storeItemCategoriesTable.name));
    return res.json(rows);
  } catch (err) { req.log.error({ err }, "GET item-categories failed"); return res.status(500).json({ error: "Failed to fetch records" }); }
});
router.post(CAT_PATH, requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const [row] = await db.insert(storeItemCategoriesTable).values({ ...data, tenantId }).returning();
    void syncStoreCategoryCoa({ id: row.id, name: row.name }, tenantId);
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "POST item-categories failed"); return res.status(500).json({ error: "Failed to create record" });
  }
});
router.put(`${CAT_PATH}/:id`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...body } = req.body as any;
    const [row] = await db.update(storeItemCategoriesTable).set({ ...body, updatedAt: new Date() })
      .where(and(eq(storeItemCategoriesTable.id, String(req.params.id)), eq(storeItemCategoriesTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    void syncStoreCategoryCoa({ id: row.id, name: row.name }, tenantId);
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Name already exists" });
    req.log.error({ err }, "PUT item-categories/:id failed"); return res.status(500).json({ error: "Failed to update record" });
  }
});
router.delete(`${CAT_PATH}/:id`, requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(storeItemCategoriesTable)
      .where(and(eq(storeItemCategoriesTable.id, String(req.params.id)), eq(storeItemCategoriesTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) { req.log.error({ err }, "DELETE item-categories/:id failed"); return res.status(500).json({ error: "Failed to delete record" }); }
});

catalogRoutes("/admin/store/units", storeUnitsTable);

// ── Items ──────────────────────────────────────────────────────────────────────
const su = storeUnitsTable;

router.get("/admin/store/items", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { search, categoryId } = req.query as Record<string, string>;

    const conds: any[] = [eq(storeItemsTable.tenantId, tenantId)];
    if (search)     conds.push(ilike(storeItemsTable.name, `%${search}%`));
    if (categoryId) conds.push(eq(storeItemsTable.categoryId, categoryId));

    const rows = await db
      .select({
        id:           storeItemsTable.id,
        name:         storeItemsTable.name,
        sku:          storeItemsTable.sku,
        imageUrl:     storeItemsTable.imageUrl,
        categoryId:   storeItemsTable.categoryId,
        unitId:       storeItemsTable.unitId,
        department:   storeItemsTable.department,
        storeName:    storeItemsTable.storeName,
        currentStock: storeItemsTable.currentStock,
        reorderLevel: storeItemsTable.reorderLevel,
        unitPrice:    storeItemsTable.unitPrice,
        description:  storeItemsTable.description,
        active:       storeItemsTable.active,
        createdAt:    storeItemsTable.createdAt,
        updatedAt:    storeItemsTable.updatedAt,
        unitName:     su.name,
        unitSymbol:   su.symbol,
      })
      .from(storeItemsTable)
      .leftJoin(su, eq(storeItemsTable.unitId, su.id))
      .where(and(...conds))
      .orderBy(asc(storeItemsTable.name));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET store items failed");
    return res.status(500).json({ error: "Failed to fetch items" });
  }
});

router.post("/admin/store/items", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, currentStock: _cs, ...data } = req.body as any;
    const row = ((await db.insert(storeItemsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Item name already exists" });
    req.log.error({ err }, "POST store item failed");
    return res.status(500).json({ error: "Failed to create item" });
  }
});

router.put("/admin/store/items/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...itemBody } = req.body as any;
    const [row] = await db.update(storeItemsTable).set({ ...itemBody, updatedAt: new Date() })
      .where(and(eq(storeItemsTable.id, String(req.params.id)), eq(storeItemsTable.tenantId, tenantId))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "Item name already exists" });
    req.log.error({ err }, "PUT store item failed");
    return res.status(500).json({ error: "Failed to update item" });
  }
});

router.delete("/admin/store/items/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(storeItemsTable)
      .where(and(eq(storeItemsTable.id, String(req.params.id)), eq(storeItemsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE store item failed");
    return res.status(500).json({ error: "Failed to delete item" });
  }
});

// ── Store JE helper ────────────────────────────────────────────────────────────

/** Maps store item category name to the relevant expense COA code for "out" transactions.
 *  Only returns codes that are actively seeded in DEFAULT_ACCOUNTS:
 *  5540 (Computer Lab), 5550 (Sports Equipment), 5610 (Ration & Mess), 5640 (Uniform & Kit).
 *  Returns "" for categories that don't map to a retained code (no JE will be posted).
 */
function storeExpenseCode(categoryName: string): string {
  const n = categoryName.toLowerCase();
  if (n.includes("sport"))                                                                        return "5550";
  if (n.includes("mess") || n.includes("ration") || n.includes("food") || n.includes("kitchen")) return "5610";
  if (n.includes("uniform") || n.includes("kit") || n.includes("clothing"))                      return "5640";
  if (n.includes("it") || n.includes("computer") || n.includes("tech") ||
      n.includes("stationery") || n.includes("paper") || n.includes("office"))                   return "5540";
  return "";
}

async function generateStoreJE(
  tx: { id: string; itemId: string; transactionType: string; quantity: number; unitCost: number | null; vendorId: string | null; transactionDate: string; reference: string | null; issuedTo: string | null },
  logger?: any,
): Promise<void> {
  try {
    const [item] = await db
      .select({ name: storeItemsTable.name, categoryId: storeItemsTable.categoryId, unitPrice: storeItemsTable.unitPrice })
      .from(storeItemsTable)
      .where(eq(storeItemsTable.id, tx.itemId))
      .limit(1);
    if (!item) return;

    const unitCost = tx.unitCost ?? Math.round(Number(item.unitPrice ?? 0));
    const amount   = tx.quantity * unitCost;
    if (amount <= 0) return;

    let inventoryCoa: { id: string; code: string; name: string } | null = null;
    let categoryName = "";
    if (item.categoryId) {
      const [cat] = await db
        .select({ coaId: storeItemCategoriesTable.coaId, name: storeItemCategoriesTable.name })
        .from(storeItemCategoriesTable)
        .where(eq(storeItemCategoriesTable.id, item.categoryId))
        .limit(1);
      if (cat?.coaId) inventoryCoa = await coaById(cat.coaId);
      categoryName = cat?.name ?? "";
    }
    if (!inventoryCoa) return;

    if (tx.transactionType === "in" || tx.transactionType === "receipt") {
      if (!tx.vendorId) return;

      let apCoa: { id: string; code: string; name: string } | null = null;
      const [vendor] = await db
        .select({ coaId: vendorsTable.coaId })
        .from(vendorsTable)
        .where(eq(vendorsTable.id, tx.vendorId))
        .limit(1);
      if (vendor?.coaId) apCoa = await coaById(vendor.coaId);
      apCoa = apCoa ?? await coaByCode("2100");
      if (!apCoa) return;

      await tryCreateAndPostJE({
        date:         tx.transactionDate,
        description:  `GRN — ${item.name} (qty ${tx.quantity})`,
        reference:    tx.reference ?? tx.id,
        sourceModule: "store",
        sourceRefId:  tx.id,
        lines: [
          { coaId: inventoryCoa.id, coaCode: inventoryCoa.code, coaName: inventoryCoa.name, debitAmount: amount,  creditAmount: 0,      narration: `${tx.quantity} × Rs ${unitCost}` },
          { coaId: apCoa.id,        coaCode: apCoa.code,        coaName: apCoa.name,        debitAmount: 0,       creditAmount: amount, narration: `Payable for ${item.name}` },
        ],
      }, logger);

    } else if (tx.transactionType === "out" || tx.transactionType === "issue") {
      const expCode = storeExpenseCode(categoryName);
      if (!expCode) return;
      const expCoa  = await coaByCode(expCode);
      if (!expCoa) return;

      await tryCreateAndPostJE({
        date:         tx.transactionDate,
        description:  `Store issue — ${item.name} (qty ${tx.quantity})`,
        reference:    tx.reference ?? tx.id,
        sourceModule: "store",
        sourceRefId:  tx.id,
        lines: [
          { coaId: expCoa.id,        coaCode: expCoa.code,        coaName: expCoa.name,        debitAmount: amount,  creditAmount: 0,      narration: tx.issuedTo ?? `Issued ${tx.quantity}` },
          { coaId: inventoryCoa.id,  coaCode: inventoryCoa.code,  coaName: inventoryCoa.name,  debitAmount: 0,       creditAmount: amount, narration: `${tx.quantity} × Rs ${unitCost}` },
        ],
      }, logger);
    }
  } catch (err) {
    if (logger) logger.error({ err }, "[store-je] failed for tx " + tx.id);
    else console.error("[store-je] failed for tx " + tx.id, err);
  }
}

// ── Transactions ───────────────────────────────────────────────────────────────
router.get("/admin/store/transactions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { itemId, type } = req.query as Record<string, string>;
    const conds: any[] = [eq(storeTransactionsTable.tenantId, tenantId)];
    if (itemId)           conds.push(eq(storeTransactionsTable.itemId, itemId));
    if (type && type !== "all") conds.push(eq(storeTransactionsTable.transactionType, type));
    const rows = await db.select().from(storeTransactionsTable)
      .where(and(...conds))
      .orderBy(desc(storeTransactionsTable.transactionDate), desc(storeTransactionsTable.createdAt));
    return res.json(rows);
  } catch (err) {
    req.log.error({ err }, "GET store transactions failed");
    return res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.post("/admin/store/transactions", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = req.body as any;
    const row = ((await db.insert(storeTransactionsTable).values({ ...data, tenantId }).returning()) as any[])[0];
    void generateStoreJE(row, req.log);
    return res.status(201).json(row);
  } catch (err: any) {
    req.log.error({ err }, "POST store transaction failed");
    return res.status(500).json({ error: "Failed to create transaction" });
  }
});

router.put("/admin/store/transactions/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const { id: _id, createdAt: _ca, ...txBody } = req.body as any;
    const [row] = await db.update(storeTransactionsTable)
      .set({ ...txBody, updatedAt: new Date() })
      .where(and(eq(storeTransactionsTable.id, String(req.params.id)), eq(storeTransactionsTable.tenantId, tenantId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err) {
    req.log.error({ err }, "PUT store transaction failed");
    return res.status(500).json({ error: "Failed to update transaction" });
  }
});

router.delete("/admin/store/transactions/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    await db.delete(storeTransactionsTable)
      .where(and(eq(storeTransactionsTable.id, String(req.params.id)), eq(storeTransactionsTable.tenantId, tenantId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "DELETE store transaction failed");
    return res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// ── Store summary dashboard ────────────────────────────────────────────────────
router.get("/admin/store/summary", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = await getAdminTenantId(req);
    if (!tenantId) return res.status(400).json({ error: "Tenant not resolved" });
    const today = new Date().toISOString().slice(0, 10);

    const [totalRows, lowStockRows, outStockRows, valueRows, recentRows, lowStockItemRows, todayRows] = await Promise.all([
      db.select({ n: count() }).from(storeItemsTable)
        .where(and(eq(storeItemsTable.active, true), eq(storeItemsTable.tenantId, tenantId))),

      db.select({ n: count() }).from(storeItemsTable).where(
        and(
          eq(storeItemsTable.active, true),
          eq(storeItemsTable.tenantId, tenantId),
          sql`${storeItemsTable.currentStock} <= ${storeItemsTable.reorderLevel}`,
          gt(storeItemsTable.currentStock, 0),
        ),
      ),

      db.select({ n: count() }).from(storeItemsTable).where(
        and(
          eq(storeItemsTable.active, true),
          eq(storeItemsTable.tenantId, tenantId),
          sql`${storeItemsTable.currentStock} = 0`,
        ),
      ),

      db.select({ v: sql<string>`sum(current_stock::numeric * unit_price)` }).from(storeItemsTable)
        .where(and(eq(storeItemsTable.active, true), eq(storeItemsTable.tenantId, tenantId))),

      db.select({
          id:              storeTransactionsTable.id,
          transactionType: storeTransactionsTable.transactionType,
          quantity:        storeTransactionsTable.quantity,
          transactionDate: storeTransactionsTable.transactionDate,
          issuedTo:        storeTransactionsTable.issuedTo,
          itemName:        storeItemsTable.name,
        })
        .from(storeTransactionsTable)
        .leftJoin(storeItemsTable, eq(storeTransactionsTable.itemId, storeItemsTable.id))
        .where(eq(storeTransactionsTable.tenantId, tenantId))
        .orderBy(desc(storeTransactionsTable.createdAt))
        .limit(10),

      db.select({ id: storeItemsTable.id, name: storeItemsTable.name,
          currentStock: storeItemsTable.currentStock, reorderLevel: storeItemsTable.reorderLevel })
        .from(storeItemsTable)
        .where(and(
          eq(storeItemsTable.active, true),
          eq(storeItemsTable.tenantId, tenantId),
          sql`${storeItemsTable.currentStock} <= ${storeItemsTable.reorderLevel}`,
        ))
        .orderBy(asc(storeItemsTable.currentStock))
        .limit(8),

      db.select({ transactionType: storeTransactionsTable.transactionType,
          totalQty: sum(storeTransactionsTable.quantity) })
        .from(storeTransactionsTable)
        .where(and(
          eq(storeTransactionsTable.tenantId, tenantId),
          eq(storeTransactionsTable.transactionDate, today),
        ))
        .groupBy(storeTransactionsTable.transactionType),
    ]);

    const todayMap: Record<string, number> = {};
    todayRows.forEach(r => { todayMap[r.transactionType] = Number(r.totalQty ?? 0); });

    return res.json({
      totalItems:      Number(totalRows[0]?.n ?? 0),
      lowStockCount:   Number(lowStockRows[0]?.n ?? 0),
      outOfStock:      Number(outStockRows[0]?.n ?? 0),
      totalStockValue: Number(valueRows[0]?.v ?? 0),
      todayIn:         todayMap["in"]  ?? 0,
      todayOut:        todayMap["out"] ?? 0,
      recentTransactions: recentRows,
      lowStockItems:   lowStockItemRows,
    });
  } catch (err) {
    req.log.error({ err }, "GET store summary failed");
    return res.status(500).json({ error: "Failed to load store summary" });
  }
});

export default router;
