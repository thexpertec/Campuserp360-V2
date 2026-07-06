---
name: CCM two separate fee fields
description: CCM admissions has two distinct fee lifecycles (application vs admission) on the applications table; which UI/gate uses which is easy to confuse.
---

# CCM: `feeStatus` vs `admissionFeeStatus`

The applications table carries TWO independent fee fields:

- `feeStatus` = **Application Fee** — paid to apply / sit the entry test. Managed in the
  **Fee Verification** tab (Verify/Reject). Counters: "App Fee: Pending/Submitted/Paid".
  Values: `pending | submitted | paid | rejected`.
- `admissionFeeStatus` = **Admission Fee** — a separate, later fee. Counters: "Adm Fee: ...".
  Same value set.

**Rule:** Anything that should reflect the *Fee Verification* status (e.g. the Enrollment
tab's "App. Fee" column) must read `feeStatus`, NOT `admissionFeeStatus`.

**Why:** A reported bug — Enrollment "App. Fee" always showed Pending even when the
Application Fee was Paid — was caused by that column reading `admissionFeeStatus` (pending
for everyone) instead of `feeStatus`. Symptom looked tied to Merit List only because
candidates first appear in Enrollment after merit processing.

**Known inconsistency (not yet fixed):** the Enrollment *gate* (backend admin.ts, the
`feeGateMode === "block"` checks) and the enroll-dialog `feeWarning` gate on
`admissionFeeStatus`, while the gate setting's UI copy says "blocked until the application
fee is verified." Wording vs field mismatch — clarify intended semantics before touching.

**How to apply:** `/api/admin/applications` returns both fields, so the frontend row has
both. Pick the field by which fee the surface is actually about; don't assume the label.
