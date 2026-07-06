# CCM Admin Dashboard — Specification

A back-office app for the CCM admissions team. Every record an admin touches here is the **same record** the candidate sees in their portal (`/portal`). No parallel data — one source of truth.

---

## 1. Goals

1. Manage the full admission lifecycle: **application → verification → entry test → result → offer → joining**.
2. Sync 1:1 with the candidate portal: status changes here appear instantly in the candidate's portal pages.
3. Generate the **same** Admit Cards and Offer Letters the candidate downloads — produced from the same data + same printable templates.
4. Audit trail for every change (who, when, what, why) — required for admissions disputes.

---

## 2. Roles & Access

| Role | Can do |
|---|---|
| **Super Admin** | Everything + manage users/roles, lock a session, edit fee structure. |
| **Admissions Officer** | Create/edit applicants, verify docs, schedule tests, enter marks, issue offer letters. |
| **Accounts** | Mark fee challans paid, refund, reconcile bank deposits. Read-only on academics. |
| **Examiner** | Enter marks per subject, lock papers. No PII edits. |
| **Viewer** | Read-only dashboard + reports. |

Auth: same auth stack as the candidate portal (separate `users.role` column). Admin routes mounted at `/admin` and guarded by middleware.

---

## 3. Data Model — Shared with Candidate Portal

The admin dashboard reads/writes the **same `applications` table** that powers `PortalUser` in `src/pages/portal/data.ts`. Every field in `PortalUser` is editable by an admin (subject to role); changes propagate to the candidate's portal on next refresh.

### Core entities

```
applications              -- one row per applicant
  id, ref_id, session, class_applying
  first_name, last_name, father_name, dob, blood_group
  email, phone, guardian_mobile, address, city, state
  parent_cnic, parent_cnic_last4
  exam_center, test_venue, test_center_address, test_focal_person
  status (AppStatus enum)
  roll_no, test_date, test_time
  marks, total_marks, merit, result_status (ResultStatus enum)
  offer_date, joining_date, fee_deadline
  student_photo
  created_at, updated_at

application_subjects      -- per-subject marks
  application_id, subject, obtained, total

application_docs          -- doc checklist
  application_id, doc_name, uploaded, verified, file_url, verified_by, verified_at

application_fees          -- challans + payments
  application_id, challan_no, amount, bank, account, due_date, status, paid_at, receipt_url

application_events        -- timeline / audit
  application_id, event_type, title, description, actor_user_id, occurred_at

test_centers              -- pickable list for exam_center / test_venue
  city, name, address, capacity, focal_person

users                     -- admin staff
  id, name, email, role, password_hash, last_login_at
```

All enums (`AppStatus`, `ResultStatus`) live in `@workspace/api-zod` and are imported by both portals so values never drift.

---

## 4. Modules

### 4.1 Dashboard (home)

Snapshot tiles, all live from `applications`:

- Applications received this session (matches the homepage live counter).
- Pending document verification.
- Pending fee verification.
- Test scheduled / Test conducted / Result announced counts.
- Selected vs. waitlisted vs. not selected.
- Recent activity feed (last 20 `application_events`).
- Capacity bar (seats / applications / selected).

### 4.2 Applicants — list + detail

**List view**
- Searchable, filterable table: by status, class, session, exam center, result status, fee status, doc verification status.
- Bulk actions: export CSV, send SMS/email, bulk status change (e.g. "mark verified"), bulk roll-no assignment.
- Saved filters (e.g. "Class VI, Islamabad, docs incomplete").

**Detail view** (one tab per portal section so admin sees what the candidate sees):

| Admin tab | Mirrors candidate portal section |
|---|---|
| Profile | Dashboard + Settings |
| Status & Timeline | StatusSection — admin can move stage, append timeline event |
| Documents | DocumentsSection — verify/reject per doc, upload on candidate's behalf |
| Fee & Challan | ChallanSection + PaymentSection |
| Admit Card | AdmitCardSection — assign roll no, venue → admit card auto-available to candidate |
| Result | ResultSection — enter per-subject marks, merit, result_status |
| Offer Letter | OfferLetterSection — issue / revoke, set joining date + fee deadline |
| Joining | JoiningSection — mark joined, attach uniform kit list |
| Reapplication | ReapplicationSection — link to previous attempt |

### 4.3 Admissions Procedure

Configurable per session:
- Open/close application window.
- Set total seats per class.
- Fee structure (application fee, admission fee, security, uniform).
- Required document checklist (drives `application_docs` rows).
- Default test centres + their focal persons.
- Email/SMS templates per stage.

### 4.4 Entry Test Management

- **Centres**: CRUD `test_centers`, set capacity + focal person.
- **Scheduling**: bulk-assign roll numbers per class, allocate to a centre based on candidate's `exam_center` preference, capacity-aware.
- **Admit cards**: bulk-generate (uses the existing `admitCardHtml` template + the new full-page crest background — same file the candidate prints).
- **Attendance**: mark present/absent on test day; absentees auto-flagged on result entry.
- **Marks entry**: per subject per applicant; supports CSV upload from examiners. Validates against `total_marks` per subject. Locks once "Result Announced".
- **Result publishing**: one click — sets `result_status` based on merit cutoff, advances `status` to `result_announced`, fires notification.

### 4.5 Offer Letters

- Auto-issue for `result_status = "selected"`; admin reviews then publishes.
- Uses same `offerLetterHtml.ts` template the candidate sees → identical PDF.
- Editable: joining date, fee deadline, custom note.
- Revoke / re-issue with reason; both events written to `application_events`.
- Bulk send (email/SMS link to candidate portal).

### 4.6 Reports & Exports

- Applications by district / city / school / class.
- Conversion funnel: applied → verified → tested → selected → joined.
- Fee collection report (by bank, by date).
- Merit list (printable + CSV).
- Attendance sheet per test centre.
- Custom date-range CSV of any filtered list.

### 4.7 Audit & Settings

- `application_events` log shown per applicant + a global activity log.
- User & role management.
- Session lock (read-only after session closes).
- SMS/email gateway config.

---

## 5. Candidate ↔ Admin Sync — what changes where

| Admin action | Effect on candidate portal |
|---|---|
| Verify a document | DocumentsSection shows the green "Verified" badge |
| Mark fee paid | ChallanSection + PaymentSection show "Paid", receipt URL appears |
| Assign roll no + venue | AdmitCardSection unlocks; printable Admit Card available |
| Enter marks + publish result | ResultSection shows marks/merit; status badge updates |
| Issue offer letter | OfferLetterSection unlocks with Print/Save-as-PDF |
| Mark joined | JoiningSection moves to "Joined" stage, status = `admitted` |
| Add timeline event | StatusSection timeline gains a new row |
| Edit any profile field | Settings + Dashboard reflect new values |

Sync mechanism: shared DB + the candidate portal already polls / refetches on tab focus. No websockets needed for v1; can be added later for live ticking.

---

## 6. API Surface (admin namespace)

All routes prefixed `/api/admin`, role-gated. Reuses the existing `applications` table and zod schemas.

```
POST   /admin/auth/login
POST   /admin/auth/logout
GET    /admin/me

GET    /admin/dashboard/summary
GET    /admin/applications?status=&class=&center=&q=&page=
GET    /admin/applications/:refId
PATCH  /admin/applications/:refId            -- partial profile edits
POST   /admin/applications/:refId/status     -- {status, note}
POST   /admin/applications/:refId/events     -- append timeline event

POST   /admin/applications/:refId/docs/:docName/verify
POST   /admin/applications/:refId/docs/:docName/reject
POST   /admin/applications/:refId/docs/:docName/upload

POST   /admin/applications/:refId/fee/mark-paid
POST   /admin/applications/:refId/fee/refund

POST   /admin/applications/:refId/test/assign     -- {rollNo, testDate, venueId}
POST   /admin/applications/:refId/test/attendance -- {present:bool}
POST   /admin/applications/:refId/marks           -- {subjects:[{name,obtained,total}]}

POST   /admin/results/publish        -- {session, class, cutoff}
POST   /admin/offers/issue           -- {refIds[], joiningDate, feeDeadline}
POST   /admin/offers/:refId/revoke

GET    /admin/test-centers
POST   /admin/test-centers
PATCH  /admin/test-centers/:id

GET    /admin/reports/funnel?session=
GET    /admin/reports/merit?session=&class=  (csv)
GET    /admin/exports/applications.csv?...
```

Response shapes reuse the candidate portal's `PortalUser` where possible so the frontend can share types.

---

## 7. Tech Stack (consistent with the rest of the project)

- **Frontend**: React + Vite + Tailwind + shadcn + wouter + Framer Motion, deployed as a new artifact `artifacts/ccm-admin/` mounted at preview path `/admin`. Reuses the design tokens (`#064A1A`, `#03CC0B`, `#faf7ee`) and the same CCM crest.
- **Backend**: extends the existing `artifacts/api-server` with an `/api/admin` router and role middleware.
- **DB**: same Postgres + Drizzle, schemas added to `@workspace/db`.
- **Shared**: enums, zod schemas, and printable HTML templates (`offerLetterHtml`, `admitCardHtml`) are imported from shared packages so admin-generated PDFs are byte-identical to candidate-generated ones.

---

## 8. Build Phases

**Phase 1 — Read-only (1 week)**
Login, dashboard tiles, applicants list + detail (no edits), reports.

**Phase 2 — Lifecycle edits (1 week)**
Doc verify, fee mark-paid, status transitions, timeline events.

**Phase 3 — Entry test (1 week)**
Test centres, roll-no assignment, bulk admit-card generation, marks entry, result publish.

**Phase 4 — Offers + joining (3 days)**
Issue/revoke offers, joining tracking, kit lists.

**Phase 5 — Audit, exports, polish (3 days)**
Full event log, CSV exports, SMS/email gateway, role management.

---

## 9. Open Questions

1. Where do real fee receipts come from — bank file upload, manual entry, or both?
2. SMS gateway: any existing provider account, or set up Twilio / a Pakistani SMS aggregator?
3. Should the admin be able to mass-import applicants from a CSV (for offline applications), or are all applicants created via the public form?
4. Photo storage: stay with current local approach or move to Object Storage now (recommended before going live)?
5. Should we expose a "candidate impersonation" view for support staff to see exactly what the candidate sees?
