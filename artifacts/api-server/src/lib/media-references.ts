import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveUrl } from "./storage";

/**
 * When a Media Library image is converted to WebP its stored URL changes (new
 * uuid + `.webp`). The media_library record is updated in place, but any
 * website/CMS content that previously hardcoded the OLD URL into a column
 * (image fields, rich-text HTML, settings values) would keep pointing at the
 * now-deleted object and 404.
 *
 * These helpers find and rewrite those stale references across every site_*
 * content table so the public website keeps rendering the image after a
 * conversion.
 */

export type UrlMapping = { oldUrl: string; newUrl: string };

export type ReferenceLocation = { table: string; column: string; count: number };

export type ReferenceReport = {
  total: number;
  locations: ReferenceLocation[];
};

// Every content column (per tenant) that can store a media URL — either as the
// whole value (image_url/photo_url/file_url/download_url/value) or embedded
// inside rich-text HTML (body/story/content). All listed tables have a
// tenant_id column. Table/column names are hardcoded here, never user input, so
// interpolating them via sql.raw is safe.
const CONTENT_FIELDS: { table: string; columns: string[] }[] = [
  { table: "site_announcements", columns: ["image_url", "body"] },
  { table: "site_events",        columns: ["image_url"] },
  { table: "site_gallery",       columns: ["image_url"] },
  { table: "site_downloads",     columns: ["image_url", "file_url"] },
  { table: "site_faculty",       columns: ["photo_url"] },
  { table: "site_page_blocks",   columns: ["content"] },
  { table: "site_testimonials",  columns: ["photo_url"] },
  { table: "site_facilities",    columns: ["image_url"] },
  { table: "site_alumni",        columns: ["photo_url", "story"] },
  { table: "site_results",       columns: ["download_url"] },
  { table: "site_settings",      columns: ["value"] },
];

/**
 * A media URL may be stored in content in more than one form. The media_library
 * row keeps the raw value returned by putObject (e.g. `/api/media/media/<uuid>`
 * or a legacy full R2 `https://…` URL), but content typically stores the
 * display-resolved form (what GET /api/admin/media returns). Match against both
 * so we catch every reference regardless of which form was saved.
 */
function oldUrlCandidates(oldUrl: string): string[] {
  const set = new Set<string>();
  const raw = (oldUrl ?? "").trim();
  if (raw) set.add(raw);
  const resolved = resolveUrl(raw);
  if (resolved) set.add(resolved);
  return Array.from(set);
}

/**
 * Report (without modifying anything) where the given media URLs are referenced
 * across website/CMS content for a tenant. Useful for warning admins which
 * content still points at an old URL.
 */
export async function findMediaReferences(
  tenantId: string,
  urls: string[],
): Promise<ReferenceReport> {
  const candidates = Array.from(
    new Set(urls.flatMap(oldUrlCandidates).filter(Boolean)),
  );
  const locations: ReferenceLocation[] = [];
  let total = 0;
  if (candidates.length === 0) return { total, locations };

  for (const { table, columns } of CONTENT_FIELDS) {
    for (const column of columns) {
      let count = 0;
      for (const candidate of candidates) {
        const result = await db.execute<{ n: number }>(sql`
          SELECT COUNT(*)::int AS n
          FROM ${sql.raw(table)}
          WHERE tenant_id = ${tenantId}
            AND ${sql.raw(column)} LIKE ${"%" + candidate + "%"}
        `);
        count += Number(result.rows[0]?.n ?? 0);
      }
      if (count > 0) {
        locations.push({ table, column, count });
        total += count;
      }
    }
  }
  return { total, locations };
}

/**
 * Rewrite old → new media URLs in place across all website/CMS content for a
 * tenant. Returns a report of which table/column rows were changed. Each mapping
 * is applied for every candidate form of the old URL. Self-referential mappings
 * (old === new) are skipped.
 */
export async function rewriteMediaReferences(
  tenantId: string,
  mappings: UrlMapping[],
): Promise<ReferenceReport> {
  const locations: ReferenceLocation[] = [];
  let total = 0;
  if (mappings.length === 0) return { total, locations };

  for (const { table, columns } of CONTENT_FIELDS) {
    for (const column of columns) {
      let count = 0;
      for (const { oldUrl, newUrl } of mappings) {
        if (!newUrl) continue;
        for (const candidate of oldUrlCandidates(oldUrl)) {
          if (!candidate || candidate === newUrl) continue;
          const result = await db.execute(sql`
            UPDATE ${sql.raw(table)}
            SET ${sql.raw(column)} = REPLACE(${sql.raw(column)}, ${candidate}, ${newUrl})
            WHERE tenant_id = ${tenantId}
              AND ${sql.raw(column)} LIKE ${"%" + candidate + "%"}
          `);
          count += result.rowCount ?? 0;
        }
      }
      if (count > 0) {
        locations.push({ table, column, count });
        total += count;
      }
    }
  }
  return { total, locations };
}
