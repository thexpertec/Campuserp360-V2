import {
  pgTable, uuid, text, boolean, timestamp, index,
} from "drizzle-orm/pg-core";

// Every analytics row belongs to a tenant. The column is nullable to mirror the
// other site_* tables (the API always stamps it on create and filters reads by
// it), so the migration can add it without a default.
const tenantId = () => uuid("tenant_id");

// ── Site Page Views (self-contained visitor analytics) ─────────────────────────
// One row per public-website page view, captured by a lightweight beacon on the
// public site. Privacy-light: we never persist the raw IP — only a daily-rotating
// salted hash (visitor_hash) used to approximate unique visitors, plus derived
// coarse signals (device type, browser, referrer host, country). Do-Not-Track is
// recorded so it can be excluded/inspected later.

export const sitePageViewsTable = pgTable("site_page_views", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     tenantId(),
  path:         text("path").notNull(),
  referrer:     text("referrer"),
  referrerHost: text("referrer_host"),
  deviceType:   text("device_type").notNull().default("unknown"),
  browser:      text("browser"),
  country:      text("country"),
  // Daily-rotating salted hash of (ip + user-agent). Approximates a unique
  // visitor within a day without storing any raw IP.
  visitorHash:  text("visitor_hash"),
  dnt:          boolean("dnt").notNull().default(false),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx:  index("site_pv_tenant_idx").on(t.tenantId),
  createdIdx: index("site_pv_created_idx").on(t.createdAt),
  pathIdx:    index("site_pv_path_idx").on(t.path),
  visitorIdx: index("site_pv_visitor_idx").on(t.visitorHash),
}));

export type SitePageView = typeof sitePageViewsTable.$inferSelect;
