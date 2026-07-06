import crypto from "node:crypto";

// CAPTCHA-equivalent challenge for the public contact form.
//
// Rather than rely on a third-party CAPTCHA, the server issues a short-lived,
// HMAC-signed challenge token the client must fetch (GET /website/contact/challenge)
// before it can submit. This blocks the common "blindly POST the form" bot because:
//   1. The token is signed — a bot cannot forge a valid one.
//   2. It is bound to the resolving tenant — tokens cannot be reused across sites.
//   3. It carries an issue timestamp, enforcing BOTH a minimum fill time (real
//      humans take more than a couple of seconds) and a maximum lifetime.

const CHALLENGE_SECRET =
  process.env["CONTACT_CHALLENGE_SECRET"] ??
  process.env["PORTAL_TOKEN_SECRET"] ??
  "ccm-contact-challenge-dev-secret-change-me";

if (!process.env["CONTACT_CHALLENGE_SECRET"] && !process.env["PORTAL_TOKEN_SECRET"]) {
  console.error(
    "\n⚠️  SECURITY WARNING ⚠️\n" +
    "   CONTACT_CHALLENGE_SECRET is not set — using an insecure hardcoded default.\n" +
    "   Set this in Replit Secrets before going to production.\n",
  );
}

// A real human cannot read the page, fill name/email/subject/message and submit
// in under this many ms. Anything faster is almost certainly automated.
const MIN_AGE_MS = 3_000;            // 3 seconds
// Tokens older than this are stale (page left open too long); reload required.
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(payload: string): string {
  return base64url(crypto.createHmac("sha256", CHALLENGE_SECRET).update(payload).digest());
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Issue a signed challenge token bound to the given tenant. */
export function issueContactChallenge(tenantId: string): string {
  const body = { iat: Date.now(), t: tenantId, n: base64url(crypto.randomBytes(9)) };
  const encoded = base64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

export type ChallengeVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "too_fast" | "expired" | "wrong_tenant" };

/**
 * Verify a challenge token for the given tenant. Returns a verdict describing
 * why verification failed so the caller can respond appropriately.
 */
export function verifyContactChallenge(token: unknown, tenantId: string): ChallengeVerdict {
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "invalid" };
  const [encoded, signature] = parts;
  if (!encoded || !signature) return { ok: false, reason: "invalid" };
  if (!timingSafeEqualStr(signature, sign(encoded))) return { ok: false, reason: "invalid" };

  let body: { iat?: number; t?: string };
  try {
    body = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (typeof body.iat !== "number") return { ok: false, reason: "invalid" };
  if (body.t !== tenantId) return { ok: false, reason: "wrong_tenant" };

  const age = Date.now() - body.iat;
  if (age < MIN_AGE_MS) return { ok: false, reason: "too_fast" };
  if (age > MAX_AGE_MS) return { ok: false, reason: "expired" };

  return { ok: true };
}
