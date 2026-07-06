---
name: CCM ID prefix pool
description: How applicant + register ID prefixes share one global uniqueness pool across tenants
---

# Global ID prefix pool

Both the Candidate Applicant ID prefix and the Register (GR) ID prefix draw from ONE global pool across ALL tenants — a code may belong to exactly one field of one tenant, matched case-insensitively (a tenant's own saved value never conflicts with itself).

**Why:** the college wants a code like `CCM` or `ICM` to belong to only one place, and `students.applicant_id` has a global unique index — reused prefixes could collide.

**How to apply:**
- Both formats live in one `admissions_settings` row per tenant, key `gr_format:{tenantId}`; the candidate format is nested under a `candidate` key in the JSON. Older rows have no `candidate` key — GET fills defaults, and a PUT without `candidate` (legacy client) must preserve the saved candidate format.
- Any new prefix-bearing setting must be added to the shared pool builder in the gr-format endpoints, not checked in isolation.
- 409 responses include a `field` ("gr" | "candidate") so the UI can attach the error to the right input.
- Known gaps (follow-ups filed): applicant reference generation still hardcodes `CCM-`, and the default candidate prefix is "CCM" for every tenant (first saver claims it).
- Testing note: node:test fetch probes against a locally started server can fail via `localhost`; the workflow name for the API server is `artifacts/api-server: API Server` — restart it to rebuild, tests run against port 8080.
