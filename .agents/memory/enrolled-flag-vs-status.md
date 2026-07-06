---
name: Enrolled state derives from student record, not application.status
description: CCM enrollment UI/logic must treat a candidate as enrolled when a student record exists, because application.status can drift out of sync.
---

Treat a CCM applicant as **enrolled** when a student record exists for that
application (tenant-scoped) OR `application.status === "enrolled"` — never from
`status` alone.

**Why:** `application.status` can drift: a `students` row can exist while the
application still reads `admitted` (Qualified). Deciding "enrolled" from status
alone showed a live Enroll button that always failed with HTTP 409
"already enrolled".

**How to apply:**
- API list endpoints that feed enrollment/fee grids join `students` **tenant-
  scoped** (`students.application_id = applications.id AND students.tenant_id
  IS NOT DISTINCT FROM applications.tenant_id`) so another tenant's record can't
  make a candidate look enrolled/blocked, and expose `isEnrolled` + `applicantId`.
- The enrollment grid (`artifacts/ccm-admin/src/pages/Applications.tsx`) drives
  the Enrolled badge, hides the single Enroll button (`EnrollButton` returns null
  when enrolled), excludes bulk-enroll selection, and counts totals/filters from
  `isEnrolled || status==="enrolled"`.
- A boot reconciliation (`migrate-enrolled-status.ts`) sets drifted
  `admitted`+has-student rows to `enrolled` (idempotent, tenant-safe).
