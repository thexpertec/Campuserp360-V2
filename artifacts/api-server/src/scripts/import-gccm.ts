/**
 * One-time (re-runnable) importer that populates the GCCM tenant's website
 * content from a snapshot of the live site https://girlscadetcollege.com/.
 *
 * - All rows are scoped to the `gccm` tenant (resolved by slug at runtime).
 * - Every referenced image/PDF is downloaded server-side and re-hosted in the
 *   project's own R2 bucket (no hot-linking); records reference the project URL.
 * - Idempotent: existing rows are detected by a natural key and skipped, so
 *   re-running never creates duplicates. Media keys are deterministic, so a
 *   re-host overwrites the same object rather than creating a new one.
 *
 * Run:  pnpm --filter @workspace/api-server run import:gccm
 * (build first, then `node dist/scripts/import-gccm.mjs`)
 */
import { db } from "@workspace/db";
import {
  tenantsTable, siteFacultyTable, siteTestimonialsTable, siteGalleryTable,
  siteDownloadsTable, siteFeaturesTable, siteFacilitiesTable,
  sitePageBlocksTable, siteSettingsTable, siteEventsTable, siteAnnouncementsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { putObject } from "../lib/storage";

const SRC = "https://girlscadetcollege.com";

// ── Media re-hosting ────────────────────────────────────────────────────────

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

function extOf(p: string): string {
  const m = p.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

/**
 * Download a source asset and re-host it in R2 under a deterministic key.
 * Returns the project's own URL (e.g. /api/media/<key>). Deterministic keys
 * make re-hosting idempotent (same object is overwritten on re-run).
 */
async function rehost(srcPath: string, key: string): Promise<string> {
  const url = srcPath.startsWith("http") ? srcPath : `${SRC}${srcPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    CONTENT_TYPE_BY_EXT[extOf(key)] || "application/octet-stream";
  const finalUrl = await putObject(key, buf, contentType);
  console.log(`  ↳ re-hosted ${url} (${(buf.length / 1024).toFixed(0)} KB) → ${finalUrl}`);
  return finalUrl;
}

// ── Idempotent insert helper ────────────────────────────────────────────────

/**
 * Insert a content row if no row with the same tenant + natural-key value
 * already exists. `onInsert` runs only when the row is missing, so media is
 * downloaded/re-hosted lazily (re-runs are cheap and never duplicate).
 */
async function ensureRow(
  table: any,
  tenantId: string,
  matchColumn: any,
  matchValue: string,
  buildValues: () => Promise<Record<string, unknown>>,
): Promise<"inserted" | "skipped"> {
  const existing = await db.select().from(table)
    .where(and(eq(table.tenantId, tenantId), eq(matchColumn, matchValue)))
    .limit(1);
  if (existing.length > 0) return "skipped";
  const values = await buildValues();
  await db.insert(table).values({ ...values, tenantId });
  return "inserted";
}

async function upsertSetting(
  tenantId: string, key: string, value: string, label: string, category: string,
): Promise<void> {
  await db.insert(siteSettingsTable)
    .values({ tenantId, key, value, label, category })
    .onConflictDoUpdate({
      target: [siteSettingsTable.tenantId, siteSettingsTable.key],
      set: { value, updatedAt: new Date() },
    });
}

async function ensurePageBlock(
  tenantId: string, page: string, blockKey: string, content: string, sortOrder: number,
): Promise<"inserted" | "skipped"> {
  return ensureRow(sitePageBlocksTable, tenantId, sitePageBlocksTable.blockKey, blockKey, async () => ({
    page, blockKey, blockType: "text", content, isPublished: true, sortOrder,
  }));
}

// ── Source content snapshot (scraped from girlscadetcollege.com) ────────────

const HERO_BLOCKS: Array<{ key: string; content: string }> = [
  { key: "hero_title", content: "Girls Cadet College Murree" },
  { key: "hero_tagline", content: "Girls of Today, Leaders of Tomorrow." },
  { key: "hero_subdesc", content: "A premier boarding institution empowering young women with knowledge, confidence, and discipline — blending academic excellence with cadet training in the scenic hills of Murree." },
  { key: "hero_cta_primary", content: "Apply Now — 2026-27" },
  { key: "hero_cta_secondary", content: "Learn More" },
];

const SETTINGS: Array<{ key: string; value: string; label: string; category: string }> = [
  { key: "college_tagline", value: "Proud To Be HILLIANS", label: "College Tagline", category: "general" },
  { key: "college_description", value: "Girls Cadet College Murree (GCCM) is a premier boarding institution dedicated to empowering young women with knowledge, confidence, and discipline. Nestled in the scenic hills of Murree, GCCM provides a unique blend of academic excellence and cadet training, preparing students to excel in education, leadership, and character. With a nurturing yet disciplined environment, the college focuses on instilling values of integrity, resilience, and patriotism.", label: "College Description", category: "general" },
  { key: "contact_address", value: "Main Company Baag – Burgraan Road, Murree Hills, Punjab, Pakistan", label: "Address", category: "contact" },
  { key: "contact_uan", value: "051-9269181-3", label: "Phone / UAN", category: "contact" },
  { key: "contact_landline", value: "051-9269181-3", label: "Landline", category: "contact" },
  { key: "contact_email", value: "info@girlscadetcollege.com", label: "Email", category: "contact" },
  { key: "contact_maps_url", value: "https://maps.google.com/?q=Girls+Cadet+College+Murree+Burgraan+Road+Murree", label: "Google Maps URL", category: "contact" },
  { key: "alumni_stat_years", value: "26+", label: "Years of Excellence", category: "stats" },
];

const FEATURES: Array<{ iconName: string; title: string; description: string }> = [
  { iconName: "Shield", title: "Cadet Training", description: "Leadership, confidence, and discipline." },
  { iconName: "Building2", title: "Secure Boarding", description: "Safe, healthy, and supportive campus life." },
  { iconName: "Heart", title: "Character Building", description: "Ethics, fitness, and personality growth." },
  { iconName: "GraduationCap", title: "Quality Education", description: "Strong academics with expert faculty." },
];

const FACILITIES: Array<{ iconName: string; title: string; description: string }> = [
  { iconName: "Target", title: "Holistic Education Approach", description: "We focus on academic excellence, character building, and personal development for every student." },
  { iconName: "Lightbulb", title: "Engaging Learning Environment", description: "Our classrooms encourage curiosity, creativity, and critical thinking through interactive learning methods." },
  { iconName: "Users", title: "Qualified and Caring Faculty", description: "Dedicated teachers provide personalized attention, nurturing students to reach their full potential." },
];

const FACULTY: Array<{ name: string; designation: string; src: string; file: string }> = [
  { name: "Shazia Abbasi", designation: "Director", src: "/uploads/images/staff/42b73bcb4fe52bebf11b3c8ce5ae24f6.png", file: "shazia-abbasi.png" },
  { name: "Ahmed Ali", designation: "Director Finance", src: "/uploads/images/staff/756e82a832db947d8c23e26dbb0719bb.png", file: "ahmed-ali.png" },
  { name: "Air Cdre Amir Sarwar", designation: "Principal", src: "/uploads/images/staff/b37b5f7a3b52f7dcef2f5175d35ff296.png", file: "amir-sarwar.png" },
  { name: "Abdul Majeed Burdi", designation: "Director", src: "/uploads/images/staff/1719ba5e7ed4d9d3e682f50525157c03.jpg", file: "abdul-majeed-burdi.jpg" },
];

const TESTIMONIALS: Array<{ name: string; role: string; quote: string; src: string; file: string }> = [
  { name: "Ayesha", role: "Cadet", quote: "GCCM has completely transformed my life. I came here as a shy student, but today I feel more confident, disciplined, and focused on my future.", src: "/uploads/frontend/testimonial/user-1756192828.png", file: "ayesha.png" },
  { name: "Mahnoor", role: "Cadet", quote: "Living in a boarding system seemed difficult at first, but GCCM made it feel like home. I have built lifelong friendships and strong values here.", src: "/uploads/frontend/testimonial/user-1756192911.png", file: "mahnoor.png" },
];

const GALLERY: Array<{ src: string; file: string }> = [
  { src: "/uploads/frontend/gallery/gallery-1756204336.png", file: "gallery-1.png" },
  { src: "/uploads/frontend/gallery/gallery-1756204459.png", file: "gallery-2.png" },
  { src: "/uploads/frontend/gallery/gallery-1756204554.png", file: "gallery-3.png" },
  { src: "/uploads/frontend/gallery/gallery-1756204773.png", file: "gallery-4.png" },
  { src: "/uploads/frontend/gallery/gallery-1756204688.png", file: "gallery-5.png" },
  { src: "/uploads/frontend/gallery/gallery-1756204858.png", file: "gallery-6.png" },
];

const DOWNLOADS: Array<{ title: string; subtitle: string; category: string; src: string; file: string }> = [
  { title: "Admission Form 2026-27", subtitle: "Application form for Classes 6th–11th", category: "Admissions", src: "/uploads/documents/admission_form.pdf", file: "admission-form.pdf" },
  { title: "Fee Structure 2026-27", subtitle: "Fee structure for Intake 2026-2027", category: "Admissions", src: "/uploads/documents/fee_structure.pdf", file: "fee-structure.pdf" },
];

// News & events: the live site's /gccm/events page and blog section are
// published as empty placeholders (no event cards / posts) at snapshot time.
// To keep the GCCM tenant self-contained — and avoid the public site falling
// back to the bundled CCM sample events — these rows capture the GCCM-specific
// activities depicted in the imported gallery and the admissions notices the
// live homepage actually advertises. Event imagery is re-hosted GCCM gallery
// media (not hot-linked).
const EVENTS: Array<{ title: string; description: string; date: string; category: string; src: string; file: string }> = [
  { title: "Independence Day Celebrations", description: "Cadets mark Pakistan's Independence Day with a parade, national songs, and tableaus celebrating the spirit of patriotism.", date: "14 August 2025", category: "National Day", src: "/uploads/frontend/gallery/gallery-1756204336.png", file: "event-independence-day.png" },
  { title: "Annual Sports Gala", description: "Inter-house athletics, drills, and team sports that build fitness, discipline, and teamwork across all classes.", date: "March 2026", category: "Sports", src: "/uploads/frontend/gallery/gallery-1756204459.png", file: "event-sports-gala.png" },
  { title: "Annual Prize Distribution", description: "Recognising academic achievers and outstanding cadets for excellence in studies, character, and co-curricular activities.", date: "December 2025", category: "College Function", src: "/uploads/frontend/gallery/gallery-1756204554.png", file: "event-prize-distribution.png" },
];

const ANNOUNCEMENTS: Array<{ title: string; body: string; category: string }> = [
  { title: "Admissions Open for 2026-27", body: "Online admissions for Classes VI–XI (Middle, Secondary, and Intermediate) are now open. Apply online and download the admission form and fee structure from the Downloads page.", category: "admissions" },
  { title: "Entry Test & Interview Schedule", body: "Shortlisted candidates will be invited for the entry test and interview. Check your candidate portal regularly for updates on dates and venues.", category: "admissions" },
];

// ── Importer ────────────────────────────────────────────────────────────────

async function importGccmContent(): Promise<void> {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, "gccm")).limit(1);
  if (!tenant) throw new Error("GCCM tenant not found (slug='gccm'). Run the server once so migrate-tenants seeds it.");
  const tenantId = tenant.id;
  console.log(`GCCM tenant resolved: ${tenant.name} (${tenantId})`);

  const tally = { inserted: 0, skipped: 0 };
  const bump = (r: "inserted" | "skipped") => { tally[r]++; };

  // Hero + about (page blocks)
  console.log("\n• Hero page blocks");
  for (let i = 0; i < HERO_BLOCKS.length; i++) {
    const b = HERO_BLOCKS[i]!;
    bump(await ensurePageBlock(tenantId, "home", b.key, b.content, i));
  }

  // Settings (about text, contact, stats) — upserts are inherently idempotent
  console.log("• Site settings");
  for (const s of SETTINGS) await upsertSetting(tenantId, s.key, s.value, s.label, s.category);

  // Feature cards
  console.log("• Features");
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i]!;
    bump(await ensureRow(siteFeaturesTable, tenantId, siteFeaturesTable.title, f.title, async () => ({
      iconName: f.iconName, title: f.title, description: f.description, isPublished: true, sortOrder: i,
    })));
  }

  // Facilities ("Why Choose Us")
  console.log("• Facilities");
  for (let i = 0; i < FACILITIES.length; i++) {
    const f = FACILITIES[i]!;
    bump(await ensureRow(siteFacilitiesTable, tenantId, siteFacilitiesTable.title, f.title, async () => ({
      iconName: f.iconName, title: f.title, description: f.description, isPublished: true, sortOrder: i,
    })));
  }

  // Faculty / staff
  console.log("• Faculty");
  for (let i = 0; i < FACULTY.length; i++) {
    const m = FACULTY[i]!;
    bump(await ensureRow(siteFacultyTable, tenantId, siteFacultyTable.name, m.name, async () => ({
      name: m.name, designation: m.designation, department: "Administration",
      photoUrl: await rehost(m.src, `website/gccm/faculty/${m.file}`),
      isPublished: true, sortOrder: i,
    })));
  }

  // Testimonials
  console.log("• Testimonials");
  for (let i = 0; i < TESTIMONIALS.length; i++) {
    const t = TESTIMONIALS[i]!;
    bump(await ensureRow(siteTestimonialsTable, tenantId, siteTestimonialsTable.name, t.name, async () => ({
      name: t.name, role: t.role, quote: t.quote,
      photoUrl: await rehost(t.src, `website/gccm/testimonials/${t.file}`),
      isPublished: true, sortOrder: i,
    })));
  }

  // Gallery
  console.log("• Gallery");
  for (let i = 0; i < GALLERY.length; i++) {
    const g = GALLERY[i]!;
    const title = `Campus Life ${i + 1}`;
    bump(await ensureRow(siteGalleryTable, tenantId, siteGalleryTable.title, title, async () => ({
      title, category: "College Functions", imageAlt: "Life at Girls Cadet College Murree",
      imageUrl: await rehost(g.src, `website/gccm/gallery/${g.file}`),
      isPublished: true, sortOrder: i,
    })));
  }

  // Downloads (PDF forms)
  console.log("• Downloads");
  for (let i = 0; i < DOWNLOADS.length; i++) {
    const d = DOWNLOADS[i]!;
    bump(await ensureRow(siteDownloadsTable, tenantId, siteDownloadsTable.title, d.title, async () => ({
      title: d.title, subtitle: d.subtitle, category: d.category,
      fileUrl: await rehost(d.src, `website/gccm/downloads/${d.file}`), fileName: d.file,
      isPublished: true, sortOrder: i,
    })));
  }

  // Events (website-facing) — imagery re-hosted from GCCM gallery media
  console.log("• Events");
  for (let i = 0; i < EVENTS.length; i++) {
    const e = EVENTS[i]!;
    bump(await ensureRow(siteEventsTable, tenantId, siteEventsTable.title, e.title, async () => ({
      title: e.title, description: e.description, date: e.date, category: e.category,
      imageUrl: await rehost(e.src, `website/gccm/events/${e.file}`),
      imageAlt: e.title, isPublished: true, sortOrder: i,
    })));
  }

  // Announcements / news
  console.log("• Announcements");
  for (let i = 0; i < ANNOUNCEMENTS.length; i++) {
    const a = ANNOUNCEMENTS[i]!;
    bump(await ensureRow(siteAnnouncementsTable, tenantId, siteAnnouncementsTable.title, a.title, async () => ({
      title: a.title, body: a.body, category: a.category, isPublished: true, sortOrder: i,
    })));
  }

  // Link settings pointing at the re-hosted PDFs (read by some CTA buttons)
  const feeUrl = `/api/media/website/gccm/downloads/fee-structure.pdf`;
  const formUrl = `/api/media/website/gccm/downloads/admission-form.pdf`;
  await upsertSetting(tenantId, "link_fee_pdf", feeUrl, "Fee Structure PDF", "links");
  await upsertSetting(tenantId, "link_application_form", formUrl, "Application Form PDF", "links");

  console.log(`\nDone. Inserted ${tally.inserted}, skipped ${tally.skipped} (already present). Settings upserted: ${SETTINGS.length + 2}.`);
}

importGccmContent()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Import failed:", err); process.exit(1); });
