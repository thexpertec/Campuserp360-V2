import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMenuLocation } from "../lib/menu-location.js";

// The navbar and footer share one `site_menu_items` table, split by `location`.
// A missing or unexpected ?location must NOT leak footer rows into the navbar
// (or vice versa); it collapses to "header".

test("explicit footer is preserved", () => {
  assert.equal(normalizeMenuLocation("footer"), "footer");
});

test("explicit header is preserved", () => {
  assert.equal(normalizeMenuLocation("header"), "header");
});

test("missing location defaults to header (legacy navbar fetch stays clean)", () => {
  assert.equal(normalizeMenuLocation(undefined), "header");
});

test("empty / garbage location defaults to header", () => {
  assert.equal(normalizeMenuLocation(""), "header");
  assert.equal(normalizeMenuLocation("   "), "header");
  assert.equal(normalizeMenuLocation("sidebar"), "header");
});

test("whitespace-padded footer is trimmed and preserved", () => {
  assert.equal(normalizeMenuLocation("  footer  "), "footer");
});
