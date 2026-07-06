---
name: Entry test marks require test_taken
description: Domain invariant + enforcement points + a helper gotcha for recording entry-test marks in the CCM admissions pipeline.
---

# Entry test marks may only be recorded once status is `test_taken`

**Rule:** In the admissions pipeline, an applicant's entry-test `resultMarks`
can only be set when their status is `test_taken` or a later stage. While the
status is still before that (`received`, `under_review`, `verified`,
`test_scheduled`) marks entry must be blocked. The status must be advanced to
Test Taken *first*, then marks entered.

**Why:** Business requirement — marks can't exist before the test is actually
conducted. The system previously auto-advanced `test_scheduled → test_taken` the
moment marks were typed, which let marks be recorded against a scheduled (not-yet-
taken) test. That auto-advance was removed.

**How to apply — keep these enforcement points in sync (all in ccm-admin `Applications.tsx` Entry Test tab + api-server `routes/admin.ts`):**
- Frontend inline marks cell (DataTable column) — disabled for the before-test set.
- Frontend bulk-edit grid — marks cell editable only when the row's real status is
  already test_taken+ OR the admin explicitly switched the in-grid status dropdown
  to Test Taken (so it unlocks in the same save).
- Backend `PATCH /admin/applications/:referenceId/marks` — 409 if `resultMarks` sent
  while status is before test_taken.
- Backend `PATCH /admin/applications/bulk-update-entry-test` — rejects a row's
  `resultMarks` when the *effective* status (`updates.status ?? pre.status`) is before
  test_taken (so setting status + marks in the same entry is allowed).
- Backend `PATCH /admin/applications/bulk/marks` (merit-list bulk) — skips
  `resultMarks` for pre-test-taken rows too (closes the bypass); interviewMarks/
  previousMarks unaffected.

**Gotcha:** `entryTestStatusValue()` maps *any* non-`test_scheduled` status —
including pre-test ones like `received`/`verified` — to `"test_taken"`. Do NOT use
it as the marks-enable gate; use the explicit `ET_BEFORE_TEST_TAKEN` list instead,
or pre-test rows will look editable while the backend rejects them.
