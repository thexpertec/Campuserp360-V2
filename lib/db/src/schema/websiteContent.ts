import {
  pgTable, uuid, text, boolean, integer, timestamp, index, primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

const omitTs = { id: true, createdAt: true, updatedAt: true } as const;

// Every site_* content row belongs to a tenant. The column is nullable so the
// migration can add it without a default and existing rows are backfilled to the
// CCM tenant; the API always stamps it on create and filters reads by it.
const tenantId = () => uuid("tenant_id");

// ── Site Announcements ─────────────────────────────────────────────────────────

export const siteAnnouncementsTable = pgTable("site_announcements", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  title:       text("title").notNull(),
  body:        text("body"),
  imageUrl:    text("image_url"),
  category:    text("category").notNull().default("general"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: text("published_at"),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_ann_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_ann_pub_idx").on(t.isPublished),
  sortIdx: index("site_ann_sort_idx").on(t.sortOrder),
}));

export const insertSiteAnnouncementSchema = createInsertSchema(siteAnnouncementsTable).omit(omitTs);
export type SiteAnnouncement       = typeof siteAnnouncementsTable.$inferSelect;
export type InsertSiteAnnouncement = z.infer<typeof insertSiteAnnouncementSchema>;

// ── Site Events (website-facing) ───────────────────────────────────────────────

export const siteEventsTable = pgTable("site_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  title:       text("title").notNull(),
  description: text("description"),
  date:        text("date").notNull().default(""),
  category:    text("category").notNull().default("College Function"),
  imageUrl:    text("image_url"),
  imageAlt:    text("image_alt"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_ev_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_ev_pub_idx").on(t.isPublished),
  sortIdx: index("site_ev_sort_idx").on(t.sortOrder),
}));

export const insertSiteEventSchema = createInsertSchema(siteEventsTable).omit(omitTs);
export type SiteEvent       = typeof siteEventsTable.$inferSelect;
export type InsertSiteEvent = z.infer<typeof insertSiteEventSchema>;

// ── Site Gallery ───────────────────────────────────────────────────────────────

export const siteGalleryTable = pgTable("site_gallery", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  title:       text("title").notNull(),
  category:    text("category").notNull().default("College Functions"),
  imageUrl:    text("image_url").notNull(),
  imageAlt:    text("image_alt"),
  author:      text("author"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_gal_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_gal_pub_idx").on(t.isPublished),
  catIdx:  index("site_gal_cat_idx").on(t.category),
}));

export const insertSiteGallerySchema = createInsertSchema(siteGalleryTable).omit(omitTs);
export type SiteGalleryItem       = typeof siteGalleryTable.$inferSelect;
export type InsertSiteGalleryItem = z.infer<typeof insertSiteGallerySchema>;

// ── Site Hero Headers (homepage rotating hero slideshow) ───────────────────────
// Multiple rows render as a rotating hero slideshow at the top of the homepage,
// replacing the single static hero when at least one row is published.

export const siteHeroHeadersTable = pgTable("site_hero_headers", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  title:       text("title").notNull(),
  subtitle:    text("subtitle"),
  imageUrl:    text("image_url").notNull(),
  buttonLabel: text("button_label"),
  buttonLink:  text("button_link"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_hero_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_hero_pub_idx").on(t.isPublished),
  sortIdx: index("site_hero_sort_idx").on(t.sortOrder),
}));

export const insertSiteHeroHeaderSchema = createInsertSchema(siteHeroHeadersTable).omit(omitTs);
export type SiteHeroHeader       = typeof siteHeroHeadersTable.$inferSelect;
export type InsertSiteHeroHeader = z.infer<typeof insertSiteHeroHeaderSchema>;

// ── Site Downloads ─────────────────────────────────────────────────────────────

export const siteDownloadsTable = pgTable("site_downloads", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  title:       text("title").notNull(),
  subtitle:    text("subtitle"),
  description: text("description"),
  imageUrl:    text("image_url"),
  fileUrl:     text("file_url"),
  fileName:    text("file_name"),
  category:    text("category"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_dl_tenant_idx").on(t.tenantId),
  pubIdx: index("site_dl_pub_idx").on(t.isPublished),
}));

export const insertSiteDownloadSchema = createInsertSchema(siteDownloadsTable).omit(omitTs);
export type SiteDownload       = typeof siteDownloadsTable.$inferSelect;
export type InsertSiteDownload = z.infer<typeof insertSiteDownloadSchema>;

// ── Site Faculty ───────────────────────────────────────────────────────────────

export const siteFacultyTable = pgTable("site_faculty", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  name:        text("name").notNull(),
  department:  text("department").notNull().default("Academics"),
  subject:     text("subject"),
  designation: text("designation"),
  photoUrl:    text("photo_url"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_fac_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_fac_pub_idx").on(t.isPublished),
  deptIdx: index("site_fac_dept_idx").on(t.department),
}));

export const insertSiteFacultySchema = createInsertSchema(siteFacultyTable).omit(omitTs);
export type SiteFacultyMember       = typeof siteFacultyTable.$inferSelect;
export type InsertSiteFacultyMember = z.infer<typeof insertSiteFacultySchema>;

// ── Site Fee Structure ─────────────────────────────────────────────────────────

export const siteFeeStructureTable = pgTable("site_fee_structure", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  className:   text("class_name").notNull(),
  feeType:     text("fee_type").notNull(),
  amount:      integer("amount").notNull().default(0),
  currency:    text("currency").notNull().default("PKR"),
  notes:       text("notes"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_fee_tenant_idx").on(t.tenantId),
  classIdx: index("site_fee_class_idx").on(t.className),
  pubIdx:   index("site_fee_pub_idx").on(t.isPublished),
}));

export const insertSiteFeeStructureSchema = createInsertSchema(siteFeeStructureTable).omit(omitTs);
export type SiteFeeStructureItem       = typeof siteFeeStructureTable.$inferSelect;
export type InsertSiteFeeStructureItem = z.infer<typeof insertSiteFeeStructureSchema>;

// ── Site Page Blocks (editable content blocks per page) ────────────────────────

export const sitePageBlocksTable = pgTable("site_page_blocks", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  page:        text("page").notNull(),
  blockKey:    text("block_key").notNull(),
  blockType:   text("block_type").notNull().default("text"),
  content:     text("content"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_pb_tenant_idx").on(t.tenantId),
  pageIdx:  index("site_pb_page_idx").on(t.page),
  pubIdx:   index("site_pb_pub_idx").on(t.isPublished),
}));

export const insertSitePageBlockSchema = createInsertSchema(sitePageBlocksTable).omit(omitTs);
export type SitePageBlock       = typeof sitePageBlocksTable.$inferSelect;
export type InsertSitePageBlock = z.infer<typeof insertSitePageBlockSchema>;

// ── Site Testimonials ─────────────────────────────────────────────────────────

export const siteTestimonialsTable = pgTable("site_testimonials", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  name:        text("name").notNull(),
  role:        text("role").notNull().default(""),
  quote:       text("quote").notNull(),
  photoUrl:    text("photo_url"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_test_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_test_pub_idx").on(t.isPublished),
  sortIdx: index("site_test_sort_idx").on(t.sortOrder),
}));

export const insertSiteTestimonialSchema = createInsertSchema(siteTestimonialsTable).omit(omitTs);
export type SiteTestimonial       = typeof siteTestimonialsTable.$inferSelect;
export type InsertSiteTestimonial = z.infer<typeof insertSiteTestimonialSchema>;

// ── Site Features (homepage why-choose-us cards) ───────────────────────────────

export const siteFeaturesTable = pgTable("site_features", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  iconName:    text("icon_name").notNull().default("Star"),
  title:       text("title").notNull(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_feat_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_feat_pub_idx").on(t.isPublished),
  sortIdx: index("site_feat_sort_idx").on(t.sortOrder),
}));

export const insertSiteFeatureSchema = createInsertSchema(siteFeaturesTable).omit(omitTs);
export type SiteFeature       = typeof siteFeaturesTable.$inferSelect;
export type InsertSiteFeature = z.infer<typeof insertSiteFeatureSchema>;

// ── Site Facilities (homepage campus facilities cards) ─────────────────────────

export const siteFacilitiesTable = pgTable("site_facilities", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  iconName:    text("icon_name").notNull().default("Star"),
  title:       text("title").notNull(),
  description: text("description"),
  imageUrl:    text("image_url"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_facil_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_facil_pub_idx").on(t.isPublished),
  sortIdx: index("site_facil_sort_idx").on(t.sortOrder),
}));

export const insertSiteFacilitySchema = createInsertSchema(siteFacilitiesTable).omit(omitTs);
export type SiteFacility       = typeof siteFacilitiesTable.$inferSelect;
export type InsertSiteFacility = z.infer<typeof insertSiteFacilitySchema>;

// ── Site Quick Links (homepage quick-link cards) ───────────────────────────────

export const siteQuickLinksTable = pgTable("site_quick_links", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tenantId:    tenantId(),
  iconName:    text("icon_name").notNull().default("Link"),
  title:       text("title").notNull(),
  description: text("description"),
  cta:         text("cta").notNull().default("Learn More"),
  href:        text("href").notNull().default("/"),
  isExternal:  boolean("is_external").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder:   integer("sort_order").notNull().default(0),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_ql_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_ql_pub_idx").on(t.isPublished),
  sortIdx: index("site_ql_sort_idx").on(t.sortOrder),
}));

export const insertSiteQuickLinkSchema = createInsertSchema(siteQuickLinksTable).omit(omitTs);
export type SiteQuickLink       = typeof siteQuickLinksTable.$inferSelect;
export type InsertSiteQuickLink = z.infer<typeof insertSiteQuickLinkSchema>;

// ── Site Menu Items (per-tenant website navigation menu) ───────────────────────
// Drives the public website's navigation, in two locations (see `location`):
//   - "header": top-level links, one level of dropdown children (parentId), and
//     the navbar CTA button (isCta).
//   - "footer": footer link groups — a top-level row is a column heading (its
//     `label`), its children (parentId) are the links shown under it.
// Each link either points at an internal site page (linkType "page") or a
// custom/external URL (linkType "url"); openInNewTab controls target=_blank.

export const siteMenuItemsTable = pgTable("site_menu_items", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     tenantId(),
  parentId:     uuid("parent_id"),
  // "header" (top navigation) or "footer" (footer link groups).
  location:     text("location").notNull().default("header"),
  label:        text("label").notNull(),
  linkType:     text("link_type").notNull().default("page"),
  target:       text("target").notNull().default("/"),
  openInNewTab: boolean("open_in_new_tab").notNull().default(false),
  isCta:        boolean("is_cta").notNull().default(false),
  isPublished:  boolean("is_published").notNull().default(true),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_menu_tenant_idx").on(t.tenantId),
  parentIdx: index("site_menu_parent_idx").on(t.parentId),
  pubIdx:    index("site_menu_pub_idx").on(t.isPublished),
  sortIdx:   index("site_menu_sort_idx").on(t.sortOrder),
  locationIdx: index("site_menu_location_idx").on(t.location),
}));

export const insertSiteMenuItemSchema = createInsertSchema(siteMenuItemsTable).omit(omitTs);
export type SiteMenuItem       = typeof siteMenuItemsTable.$inferSelect;
export type InsertSiteMenuItem = z.infer<typeof insertSiteMenuItemSchema>;

// ── Site Exam Results ─────────────────────────────────────────────────────────

export const siteResultsTable = pgTable("site_results", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     tenantId(),
  examName:     text("exam_name").notNull().default(""),
  className:    text("class_name").notNull(),
  academicYear: text("academic_year").notNull().default(""),
  resultDate:   text("result_date"),
  downloadUrl:  text("download_url"),
  notes:        text("description"),
  isPublished:  boolean("is_published").notNull().default(false),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_res_tenant_idx").on(t.tenantId),
  yearIdx: index("site_res_year_idx").on(t.academicYear),
  pubIdx:  index("site_res_pub_idx").on(t.isPublished),
}));

export const insertSiteResultSchema = createInsertSchema(siteResultsTable).omit(omitTs);
export type SiteResult       = typeof siteResultsTable.$inferSelect;
export type InsertSiteResult = z.infer<typeof insertSiteResultSchema>;

// ── Site Alumni (alumni success stories) ───────────────────────────────────────

export const siteAlumniTable = pgTable("site_alumni", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     tenantId(),
  name:         text("name").notNull(),
  batch:        text("batch").notNull().default(""),
  category:     text("category").notNull().default("academia"),
  role:         text("role").notNull().default(""),
  organization: text("organization").notNull().default(""),
  location:     text("location").notNull().default(""),
  quote:        text("quote").notNull().default(""),
  story:        text("story").notNull().default(""),
  achievements: text("achievements").notNull().default(""),
  badge:        text("badge"),
  photoUrl:     text("photo_url"),
  featured:     boolean("featured").notNull().default(false),
  isPublished:  boolean("is_published").notNull().default(false),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx: index("site_alum_tenant_idx").on(t.tenantId),
  pubIdx:  index("site_alum_pub_idx").on(t.isPublished),
  sortIdx: index("site_alum_sort_idx").on(t.sortOrder),
}));

export const insertSiteAlumnusSchema = createInsertSchema(siteAlumniTable).omit(omitTs);
export type SiteAlumnus       = typeof siteAlumniTable.$inferSelect;
export type InsertSiteAlumnus = z.infer<typeof insertSiteAlumnusSchema>;

// ── Site Settings (per-tenant key-value CMS settings) ──────────────────────────
// Composite primary key (tenant_id, key) — each tenant has its own settings map.

export const siteSettingsTable = pgTable("site_settings", {
  tenantId:  uuid("tenant_id").notNull(),
  key:       text("key").notNull(),
  value:     text("value").notNull().default(""),
  label:     text("label").notNull().default(""),
  category:  text("category").notNull().default("general"),
  inputType: text("input_type").notNull().default("text"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pk: primaryKey({ columns: [t.tenantId, t.key] }),
}));

export type SiteSetting = typeof siteSettingsTable.$inferSelect;

// ── Site Contact Submissions (public contact form) ─────────────────────────────
// Messages submitted from the public website Contact page. Tenant-scoped like
// every other site_* row; the API stamps tenant_id on create and filters reads.

export const siteContactSubmissionsTable = pgTable("site_contact_submissions", {
  id:        uuid("id").primaryKey().defaultRandom(),
  tenantId:  tenantId(),
  name:      text("name").notNull(),
  email:     text("email").notNull(),
  phone:     text("phone"),
  subject:   text("subject"),
  message:   text("message").notNull(),
  // unread | read | handled
  status:    text("status").notNull().default("unread"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantIdx:  index("site_contact_tenant_idx").on(t.tenantId),
  statusIdx:  index("site_contact_status_idx").on(t.status),
  createdIdx: index("site_contact_created_idx").on(t.createdAt),
}));

export const insertSiteContactSubmissionSchema = createInsertSchema(siteContactSubmissionsTable).omit(omitTs);
export type SiteContactSubmission       = typeof siteContactSubmissionsTable.$inferSelect;
export type InsertSiteContactSubmission = z.infer<typeof insertSiteContactSubmissionSchema>;
