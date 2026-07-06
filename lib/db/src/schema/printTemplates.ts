import { pgTable, uuid, text, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const printTemplatesTable = pgTable("print_templates", {
  id:           uuid("id").primaryKey().defaultRandom(),
  /** Owning college. Every template belongs to exactly one tenant; reads/writes
   *  are always filtered by this so one college can never see another's rows.
   *  Nullable in the schema so the startup migration can add it without a
   *  default and backfill; the API always stamps it on create. */
  tenantId:     uuid("tenant_id"),
  type:         text("type").notNull(),
  name:         text("name").notNull(),
  content:      text("content").notNull().default(""),
  pageSize:     text("page_size").notNull().default("A4"),
  orientation:  text("orientation").notNull().default("portrait"),
  marginTop:    integer("margin_top").notNull().default(20),
  marginRight:  integer("margin_right").notNull().default(15),
  marginBottom: integer("margin_bottom").notNull().default(20),
  marginLeft:   integer("margin_left").notNull().default(15),
  bgImageUrl:   text("bg_image_url"),
  isCustom:     boolean("is_custom").notNull().default(false),
  category:     text("category").notNull().default("builtin"),
  /** Situation slug this template is assigned to, or null if unassigned. At most one template holds a given purpose at a time, per college. */
  purpose:      text("purpose"),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:       index("print_templates_tenant_idx").on(t.tenantId),
  // type is unique within a college, not globally.
  tenantTypeUniq:  uniqueIndex("print_templates_tenant_type_uniq").on(t.tenantId, t.type),
  // At most one template per purpose, per college (purpose may be null/unassigned).
  tenantPurposeUniq: uniqueIndex("print_templates_tenant_purpose_uniq")
    .on(t.tenantId, t.purpose)
    .where(sql`${t.purpose} IS NOT NULL`),
}));

export type PrintTemplate = typeof printTemplatesTable.$inferSelect;
