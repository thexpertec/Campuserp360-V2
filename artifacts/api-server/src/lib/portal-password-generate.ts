import crypto from "node:crypto";

/** One-time portal password shown to the applicant after submission. */
export function generatePortalPassword(): string {
  return crypto.randomBytes(4).toString("hex");
}
