import { pgTable, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const printSettingsTable = pgTable("print_settings", {
  id: integer("id").primaryKey().default(1),
  marginTop: integer("margin_top").notNull().default(20),
  marginRight: integer("margin_right").notNull().default(15),
  marginBottom: integer("margin_bottom").notNull().default(20),
  marginLeft: integer("margin_left").notNull().default(15),
  pageSize: text("page_size").notNull().default("A4"),
  orientation: text("orientation").notNull().default("portrait"),
  bgImagePath: text("bg_image_path"),
  showInstituteName: boolean("show_institute_name").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type PrintSettingsRow = typeof printSettingsTable.$inferSelect;
