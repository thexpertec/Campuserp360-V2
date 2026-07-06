// Menu items live in one `site_menu_items` table split by `location`. The
// public navbar reads "header" and the footer reads "footer". Anything other
// than an explicit "footer" collapses to "header" so a missing/garbage
// ?location never leaks footer rows into the navbar (and vice versa).
export function normalizeMenuLocation(raw: string | undefined): "header" | "footer" {
  return raw?.trim() === "footer" ? "footer" : "header";
}
