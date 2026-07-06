---
name: CCM stage-tab status cells
description: Why Interview/Entry Test tab status cells need a *StatusValue currentValue mapping
---
# Stage-tab status cells (CCM Admin Applications)

The Entry Test and Interview tabs render the status column with `InlineStatusCell`
restricted to that stage's two statuses (`ENTRY_TEST_STATUS_OPTIONS` = test_scheduled/test_taken;
`INTERVIEW_STATUS_OPTIONS` = interview_scheduled/interview_taken).

**Rule:** For an applicant already at a LATER pipeline stage (result_announced, admitted,
enrolled, on_hold, rejected), the cell's `activeValue` won't be in the restricted option
list, so it silently falls back to the placeholder ("Schedule A Test" / "Schedule An
Interview") — even when marks are recorded. You MUST pass `currentValue={xStatusValue(r.status)}`
which collapses any at-or-past-stage status to the stage's "taken/completed" value.
`entryTestStatusValue` / `interviewStatusValue` (built on `derivedInterviewStatus` /
`derivedEntryTestStatus`) do this.

**Why:** A missing `currentValue` was the real cause of "marks 25/30 Passed but status
says Schedule An Interview" — a DISPLAY bug, not stuck data. Auto-advance on marks entry
was already correct; records were at interview_taken-or-later, just rendered as the placeholder.

**How to apply:** Any new stage tab (or new later status) reusing `InlineStatusCell` with a
restricted `allowedStatuses` must also supply a matching `currentValue` mapper, or terminal/
advanced applicants will misleadingly show the "not started" placeholder.
