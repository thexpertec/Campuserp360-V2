---
name: CCM admission payment gateways
description: How online payment gateways (JazzCash/PayFast) are gated on the public admissions form
---

# Two independent gates per online gateway

An online gateway (JazzCash / PayFast) has TWO separate conditions on the public admissions payment step:

1. **enabled** — `enableJazzcash` / `enablePayfast` admin toggle, stored per-tenant in `admission_payment_config` (served by `resolvePaymentConfig`).
2. **configured** — whether credentials actually exist. Comes from `resolveGatewayCredentials(tenantId)` (`creds.jazzcash.configured`), DB-first with env-var fallback (`gateways.ts` computes `configured: Boolean(merchantId && ...)`). NOT stored in `admission_payment_config`.

**Rule:** the website must only show a gateway when BOTH are true. Showing an enabled-but-unconfigured gateway lets a candidate pick it and hit a 503 "not configured" at checkout.

**How to apply:** the public endpoint `GET /website/admissions/payment-config` merges `jazzcashConfigured`/`payfastConfigured` (from `resolveGatewayCredentials`) onto the config. These fields live in the `PublicPaymentConfig` schema in `lib/api-spec/openapi.yaml` — after editing that schema you MUST run `pnpm --filter @workspace/api-spec run codegen` to regenerate the typed client before the website can read the new fields.

# Field-specific submit validation

`POST /api/applications` (and `/applications/payment/initiate`) return `{ error, fields: [{field, message}] }` on a 400 Zod failure (via `zodFieldErrors`). The website's `onSubmit` catch maps `fields` onto RHF via `form.setError`, jumps to the earliest step using the `fieldToStep` reverse map of `stepFields`, and names the fields via `FIELD_LABELS`. Bank-transfer uses this same submit path (no gateway-specific submit), so its failures now name the exact field instead of "Some details look invalid".
