import {
  pgTable, uuid, text, boolean, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// ── Sport Categories ──────────────────────────────────────────────────────────
export const sportsCategoriesTable = pgTable("sports_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("sports_categories_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("sports_categories_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Venues / Grounds ──────────────────────────────────────────────────────────
export const sportsVenuesTable = pgTable("sports_venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  venueType: text("venue_type").notNull().default("outdoor"), // outdoor | indoor | pool | court
  capacity: integer("capacity").notNull().default(0),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("sports_venues_active_idx").on(t.active),
  tenantNameUniq: uniqueIndex("sports_venues_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Teams ─────────────────────────────────────────────────────────────────────
export const sportsTeamsTable = pgTable("sports_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  sportCategoryId: uuid("sport_category_id").references(() => sportsCategoriesTable.id, { onDelete: "set null" }),
  house: text("house"),                       // house name / team type
  coachName: text("coach_name"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  activeIdx: index("sports_teams_active_idx").on(t.active),
  catIdx: index("sports_teams_cat_idx").on(t.sportCategoryId),
  tenantNameUniq: uniqueIndex("sports_teams_tenant_name_uniq").on(t.tenantId, t.name),
}));

// ── Fixtures / Matches ────────────────────────────────────────────────────────
export const sportsFixturesTable = pgTable("sports_fixtures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  sport: text("sport"),                       // free-text sport name
  venueId: uuid("venue_id").references(() => sportsVenuesTable.id, { onDelete: "set null" }),
  scheduledDate: text("scheduled_date").notNull(), // YYYY-MM-DD
  scheduledTime: text("scheduled_time"),
  status: text("status").notNull().default("scheduled"), // scheduled | completed | cancelled | postponed
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  result: text("result"),                     // free-text result summary
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  dateIdx: index("sports_fixtures_date_idx").on(t.scheduledDate),
  statusIdx: index("sports_fixtures_status_idx").on(t.status),
}));

// ── Insert schemas ────────────────────────────────────────────────────────────
export const insertSportsCategorySchema = createInsertSchema(sportsCategoriesTable).omit(omitTs);
export const insertSportsVenueSchema = createInsertSchema(sportsVenuesTable).omit(omitTs);
export const insertSportsTeamSchema = createInsertSchema(sportsTeamsTable).omit(omitTs);
export const insertSportsFixtureSchema = createInsertSchema(sportsFixturesTable).omit(omitTs);

export type SportsCategory = typeof sportsCategoriesTable.$inferSelect;
export type SportsVenue = typeof sportsVenuesTable.$inferSelect;
export type SportsTeam = typeof sportsTeamsTable.$inferSelect;
export type SportsFixture = typeof sportsFixturesTable.$inferSelect;
export type InsertSportsCategory = z.infer<typeof insertSportsCategorySchema>;
export type InsertSportsVenue = z.infer<typeof insertSportsVenueSchema>;
export type InsertSportsTeam = z.infer<typeof insertSportsTeamSchema>;
export type InsertSportsFixture = z.infer<typeof insertSportsFixtureSchema>;
