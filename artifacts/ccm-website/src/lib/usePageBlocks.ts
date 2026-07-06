import { useTenantResource } from "./tenant-cache";

export type PageBlocks = Record<string, string>;

/**
 * Load a page's editable text blocks for the CURRENT tenant.
 *
 * Backed by the per-tenant localStorage content cache so that on a refresh the
 * correct tenant's hero/section copy paints on the first frame instead of the
 * hardcoded "|| Cadet College Murree" fallbacks flashing until the network
 * returns. Cold start (first ever visit) is an empty map — never another
 * tenant's content.
 */
export function usePageBlocks(page: string): PageBlocks {
  return useTenantResource<PageBlocks>(
    `page-blocks:${page}`,
    `/api/website/page-blocks?page=${encodeURIComponent(page)}`,
    {},
    (data) => {
      const map: PageBlocks = {};
      if (Array.isArray(data)) {
        for (const row of data as Array<{ blockKey?: string; content?: unknown }>) {
          if (row.blockKey && row.content != null) map[row.blockKey] = String(row.content);
        }
      }
      return map;
    },
    // Gate the first paint on page-blocks: they carry the hero title / section
    // headings whose hardcoded fallback is CCM's name, so they must resolve before
    // a cold/preview load is revealed — otherwise CCM text flashes for other tenants.
    true,
  );
}
