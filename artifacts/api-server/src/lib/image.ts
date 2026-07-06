/**
 * Image conversion helpers.
 *
 * Centralises WebP conversion so both the upload path and the bulk-convert
 * endpoint share one implementation and one default quality.
 */

/** Default WebP quality — a sensible balance of size vs. visual fidelity. */
export const WEBP_QUALITY = 80;

/**
 * Convert an image buffer (PNG, JPEG, GIF, SVG, …) to a WebP buffer.
 * `animated: true` preserves frames of animated GIFs/WebPs; it is a no-op for
 * static images.
 *
 * @param input    Source image bytes
 * @param quality  WebP quality 1–100 (default {@link WEBP_QUALITY})
 */
export async function convertToWebp(input: Buffer, quality = WEBP_QUALITY): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(input, { animated: true }).webp({ quality }).toBuffer();
}
