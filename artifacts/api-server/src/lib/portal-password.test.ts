import test from "node:test";
import assert from "node:assert/strict";
import { isPortalPasswordHashed, verifyPortalPassword } from "./portal-password.js";

test("isPortalPasswordHashed detects bcrypt hashes", () => {
  assert.equal(isPortalPasswordHashed("$2b$12$abcdefghijklmnopqrstuv"), true);
  assert.equal(isPortalPasswordHashed("12345"), false);
});

test("verifyPortalPassword accepts legacy plaintext and flags rehash", async () => {
  const result = await verifyPortalPassword("secret", "secret");
  assert.equal(result.valid, true);
  assert.equal(result.needsRehash, true);
});

test("verifyPortalPassword rejects wrong plaintext", async () => {
  const result = await verifyPortalPassword("wrong", "secret");
  assert.equal(result.valid, false);
  assert.equal(result.needsRehash, false);
});
