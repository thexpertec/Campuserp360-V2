import {
  pgTable, uuid, text, boolean, integer, timestamp, index, numeric, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Item Categories (3-level tree: Main → Sub → 3rd Level) ───────────────────
export const storeItemCategoriesTable = pgTable("store_item_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),   // null = main category; set after table defined
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  coaId: uuid("coa_id"),         // → chart_of_accounts.id (inventory asset account, set by coa-sync)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("store_item_categories_active_idx").on(t.active),
  parentIdx: index("store_item_categories_parent_idx").on(t.parentId),
}));

// ── Units of Measure ──────────────────────────────────────────────────────────
export const storeUnitsTable = pgTable("store_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  symbol: text("symbol").notNull().default(""),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("store_units_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("store_units_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Items (Inventory catalogue) ───────────────────────────────────────────────
export const storeItemsTable = pgTable("store_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  sku: text("sku"),
  imageUrl: text("image_url"),
  categoryId: uuid("category_id").references(() => storeItemCategoriesTable.id, { onDelete: "set null" }),
  unitId: uuid("unit_id").references(() => storeUnitsTable.id, { onDelete: "set null" }),
  department: text("department"),
  storeName: text("store_name"),
  currentStock: integer("current_stock").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(5),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("store_items_active_idx").on(t.active),
  catIdx:    index("store_items_cat_idx").on(t.categoryId),
  tenantNameUniq: uniqueIndex("store_items_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Transactions (stock in / out) ─────────────────────────────────────────────
export const storeTransactionsTable = pgTable("store_transactions", {
  id:              uuid("id").primaryKey().defaultRandom(),
  tenantId:        uuid("tenant_id"),
  itemId:          uuid("item_id").notNull().references(() => storeItemsTable.id, { onDelete: "restrict" }),
  transactionType: text("transaction_type").notNull(), // in | out
  quantity:        integer("quantity").notNull(),
  unitCost:        integer("unit_cost"),                // PKR whole rupees per unit (for JE valuation)
  vendorId:        uuid("vendor_id"),                   // → vendors.id (for GRN JE automation)
  transactionDate: text("transaction_date").notNull(), // YYYY-MM-DD
  reference:       text("reference"),
  issuedTo:        text("issued_to"),               // person/dept receiving (for 'out')
  notes:           text("notes"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  itemIdx:   index("store_transactions_item_idx").on(t.itemId),
  typeIdx:   index("store_transactions_type_idx").on(t.transactionType),
  dateIdx:   index("store_transactions_date_idx").on(t.transactionDate),
  vendorIdx: index("store_tx_vendor_idx").on(t.vendorId),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertStoreItemCategorySchema = createInsertSchema(storeItemCategoriesTable).omit(omitTs);
export const insertStoreUnitSchema = createInsertSchema(storeUnitsTable).omit(omitTs);
export const insertStoreItemSchema = createInsertSchema(storeItemsTable).omit(omitTs);
export const insertStoreTransactionSchema = createInsertSchema(storeTransactionsTable).omit(omitTs);

export type StoreItemCategory = typeof storeItemCategoriesTable.$inferSelect;
export type StoreUnit = typeof storeUnitsTable.$inferSelect;
export type StoreItem = typeof storeItemsTable.$inferSelect;
export type StoreTransaction = typeof storeTransactionsTable.$inferSelect;
export type InsertStoreItemCategory = z.infer<typeof insertStoreItemCategorySchema>;
export type InsertStoreUnit = z.infer<typeof insertStoreUnitSchema>;
export type InsertStoreItem = z.infer<typeof insertStoreItemSchema>;
export type InsertStoreTransaction = z.infer<typeof insertStoreTransactionSchema>;
