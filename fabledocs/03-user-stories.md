# User Stories — Product Backlog

19 new feature tickets for the EduOps Platform, ordered easy → hard. None of these
duplicate the 10 stories in `docs/user-story-build-path/01-stories.md`.

**Before you start any ticket:** read `01-how-this-app-works.md` and
`02-codebase-gotchas.md`. Several stories are written to close a specific gap listed
there, and the gotchas doc tells you which "bugs" are deliberate teaching fixtures you
should leave alone.

## Definition of Done (applies to every story)

A story is done when **all** of the following are true:

1. Every acceptance criterion is independently verifiable in the running app.
2. `npm run build` exits 0 — this is the strict TypeScript gate.
3. You manually clicked through the feature as **at least two different roles** using the
   header role switcher (one who should have access, one who should not).
4. Any mutation you added writes an `AuditEvent` and is visible on `/audits`.
5. Any new business rule is a **pure function in `src/packages/domain/rules/`**, not logic
   embedded in a page or an action.
6. `npm run db:seed && npm run dev` still produces a working app from a clean database.

## The board

| # | Story | Tier | Est. |
| --- | --- | --- | --- |
| 1 | Real "urgent case" spotlight on the dashboard | Easy | 1–2h |
| 2 | Surface class schedules and teacher subject tags | Easy | 1–2h |
| 3 | Dead-letter safety and requeue for background jobs | Easy | 1–2h |
| 4 | Unit-test harness for the domain rules | Medium | 2–3h |
| 5 | Assignment management for a class section | Medium | 3–4h |
| 6 | Teacher detail page | Medium | 3–4h |
| 7 | Gradebook matrix for a section | Medium | 3–4h |
| 8 | Log Explorer: search, time range, pagination | Medium | 3–4h |
| 9 | Student activity & audit timeline | Medium | 2–3h |
| 10 | Wire the Assignment Feedback agent into grading | Medium-Hard | 4h |
| 11 | A background job runner | Medium-Hard | 4–5h |
| 12 | Waitlist auto-promotion | Medium-Hard | 4h |
| 13 | One permission table for the whole app | Medium-Hard | 4–5h |
| 14 | Zod-validate every server action | Medium-Hard | 4h |
| 15 | Role-scoped data access for Student and Parent | Hard | 5–6h |
| 16 | Coursework sweep: automatic Late and Missing | Hard | 5–6h |
| 17 | Guardian Digest generation and preview | Hard | 6h |
| 18 | Notification centre | Hard | 6–8h |
| 19 | Agent re-run with output diff | Hard | 6–8h |

---

# Tier 1 — Warm-up

## Story 1 — Real "urgent case" spotlight on the dashboard

**Difficulty:** Easy | **Estimate:** 1–2h | **Skills:** Server Components, sorting derived data, conditional rendering

**Story:** As a School Manager, I want the dashboard's urgent-case card to show the
student who is *actually* at highest risk right now, so that I can act on real data
instead of a hardcoded demo name.

**Why it matters:** `src/app/page.tsx:216-242` renders a card about "Maya Johnson", "4
missing Algebra I assignments" and "Advisor Clara Vance" as **string literals**. The card
only appears when `criticalRiskCount > 0`, so it looks dynamic — but graduate Maya and it
will still shout her name. This is the cheapest possible introduction to the risk pipeline.

**Acceptance criteria**

- [ ] The dashboard card names the student with the highest risk, chosen from the
      `students` array the page already computes.
- [ ] Ranking is `Critical` > `High` > `Medium` > `Low`; ties are broken by lower grade
      percentage first, then by higher absence count.
- [ ] The card text is generated from that student's real numbers: grade average, missing
      assignment count, and absence count.
- [ ] If the student has an `Active` intervention plan, the card says so and names the
      plan's creator. If they don't, the card says "No intervention plan on file" and
      links to the student page to create one.
- [ ] The "Investigate" link goes to `/students/<that student's id>`, not `/students`.
- [ ] The card is hidden entirely when no student is above `Medium` risk.
- [ ] No student name appears as a literal anywhere in `src/app/page.tsx`.

**Files you'll touch**

- `src/app/page.tsx` — replace the hardcoded block; the risk loop at lines 41-63 already
  computes what you need, you just discard it today.
- `src/packages/domain/rules/risk.ts` — *optional* stretch: add a `riskLevelRank()` helper
  so the ordering lives in the domain layer.

**Implementation plan**

1. In the existing `for (const stu of students)` loop, stop throwing the result away.
   Build an array of `{ student, risk, gradeCalc, absences, tardies }`.
2. Sort that array with a comparator using the rank order above.
3. Take `[0]`. Only render if its `overallRiskLevel` is `High` or `Critical`.
4. The page already includes `interventionPlans: { where: { status: 'Active' } }` in the
   query (line 32) — use `stu.interventionPlans[0]` for the plan text. To show the
   creator's name you'll need to extend the include to
   `interventionPlans: { where: { status: 'Active' }, include: { createdByUser: true } }`.
5. Feed the card from `risk.evidence` — `calculateStudentRisk` already returns
   human-readable evidence strings. Render the first two as bullets.

**Edge cases**

- Zero students in the database: the sort runs on an empty array. Guard before `[0]`.
- Two students identically critical: your tie-break must be deterministic, or the card
  will flicker between them on every render (`revalidate = 0` means every request
  re-renders).
- Remember `calculateSectionGrade` returns **100%** for a student with no graded work
  (gotcha B1) — a brand-new student will never be the top risk. That's expected.

**How to verify**

`npm run db:seed`, open `/`, confirm the card is about Maya. Then open `/students/<bob>`,
mark several Biology submissions `Missing` via Prisma Studio, reload `/` and confirm the
card switches students.

**Connects to:** Story 9 (student timeline), Story 18 (notifications).

---

## Story 2 — Surface class schedules and teacher subject tags

**Difficulty:** Easy | **Estimate:** 1–2h | **Skills:** Parsing JSON columns, defensive rendering, forms

**Story:** As a Teacher, I want to see when a class section actually meets and what
subjects a colleague teaches, so that I can plan cover and room bookings.

**Why it matters:** `ClassSection.scheduleJSON` and `Teacher.subjectsJSON` are populated
with real data by the seed (`seed.ts:286`, `seed.ts:142`) and **rendered nowhere**. Worse,
the create forms write `JSON.stringify([])` into both (`sections/page.tsx:30`,
`teachers/page.tsx:34`), so anything you create through the UI has an empty schedule. This
is your introduction to the "JSON column" pattern and to why untyped JSON needs a parser.

**Acceptance criteria**

- [ ] `/sections` shows a "Meets" column rendering the schedule as `Mon 10:00-11:30 · Wed 10:00-11:30`.
- [ ] `/sections/[id]` shows the full schedule in the header banner next to Room.
- [ ] `/teachers` shows each teacher's subjects as pills under their department.
- [ ] Empty, malformed, or `null` JSON renders as "Not scheduled" / "No subjects listed" —
      **it never throws**.
- [ ] The create-section form has a repeatable day + time input (2 rows is enough) that
      writes real `scheduleJSON`.
- [ ] The create-teacher form has a comma-separated subjects input that writes real
      `subjectsJSON`.
- [ ] Parsing lives in one shared helper, not copy-pasted into three pages.

**Files you'll touch**

- `src/packages/shared/index.ts` — add `parseSchedule(json: string | null): ScheduleSlot[]`
  and `parseSubjects(json: string | null): string[]`, plus a `formatSchedule()` display
  helper and a `ScheduleSlot` type.
- `src/app/sections/page.tsx` — new column + form fields + write real JSON in
  `createSectionAction`.
- `src/app/sections/[id]/page.tsx` — header banner.
- `src/app/teachers/page.tsx` — subject pills + form field + write real JSON.

**Implementation plan**

1. Define the type: `export interface ScheduleSlot { day: string; time: string }`.
2. Write the parsers with a `try/catch` that returns `[]` on any failure, and an
   `Array.isArray` check after parsing — `JSON.parse('"hello"')` succeeds and returns a
   string.
3. `formatSchedule(slots)` maps to `"Mon 10:00-11:30"` and joins with `" · "`; returns
   `"Not scheduled"` for an empty array.
4. In the forms, read `formData.get('day1')`, `formData.get('time1')`, etc., filter out
   empty rows, and `JSON.stringify` the result.
5. For subjects: `.split(',').map(s => s.trim()).filter(Boolean)`.

**Edge cases**

- A JSON string containing an object rather than an array.
- `JSON.parse(null)` throws — guard the null case first.
- Don't add a `zod` schema here even though it would fit; Story 14 introduces zod
  systematically, and two competing validation styles is worse than none.

**Connects to:** Story 5 (assignments), Story 14 (zod).

---

## Story 3 — Dead-letter safety and requeue for background jobs

**Difficulty:** Easy | **Estimate:** 1–2h | **Skills:** State machines, guard clauses, server actions

**Story:** As a School Manager, I want dead-lettered jobs to be clearly separated from
retryable ones and to require an explicit "Requeue" decision, so that I don't silently
retry a job past its attempt budget.

**Why it matters:** `runJob` moves a job to `DeadLettered` once
`attempts + 1 >= maxAttempts` (`jobs.ts:170-171`), but the retry button is only disabled
for `Succeeded` and `Running` (`jobs/page.tsx:99`). You can click "Retry Now" on a
dead-lettered job forever and drive `attempts` to 8/3. A dead-letter queue that you can
accidentally drain isn't a dead-letter queue. This is a small change that teaches state
machines properly.

**Acceptance criteria**

- [ ] `runJob` refuses to execute a job whose status is `DeadLettered`, `Running`, or
      `Succeeded`, returning a clear reason rather than throwing.
- [ ] `/jobs` disables "Retry Now" for those three statuses.
- [ ] Dead-lettered rows show a distinct "☠️ Dead Letter" treatment and a separate
      **"Requeue"** button (Admin/SchoolManager only).
- [ ] "Requeue" resets `status: 'Queued'`, `attempts: 0`, `errorMessage: null`,
      `startedAt: null`, `finishedAt: null` — and **does not run the job**.
- [ ] Requeue writes an audit event `job.requeue` with the before/after states.
- [ ] A "Dead-lettered: N" counter appears at the top of `/jobs` and on the dashboard KPI
      card next to failed jobs.
- [ ] The legal transitions are documented as a comment or a small map in
      `src/packages/observability/jobs.ts`.

**Files you'll touch**

- `src/packages/observability/jobs.ts` — guard at the top of `runJob`; export a
  `requeueJob(jobId, actorId)` function; add a `JOB_TRANSITIONS` map.
- `src/app/actions.ts` — a `requeueJobAction`; tighten `retryJobAction`.
- `src/app/jobs/page.tsx` — the second button, the counter, the disabled logic.
- `src/app/page.tsx` — dashboard counter (optional but listed in the ACs).

**Implementation plan**

1. Add at the top of `runJob`, after the `findUnique`:
   ```ts
   const TERMINAL: JobStatus[] = ['Succeeded', 'DeadLettered'];
   if (TERMINAL.includes(job.status as JobStatus) || job.status === 'Running') {
     await logger.warn({ service: 'BackgroundJobWorker', message: `Refusing to run job [${jobId}] in status [${job.status}]`, entityType: 'BackgroundJob', entityId: jobId });
     return false;
   }
   ```
2. `requeueJob` fetches the before state, updates the fields listed above, calls
   `recordAuditEvent` with `action: 'job.requeue'`, and logs at info level.
3. In the page, compute `const canRetry = !['Succeeded','Running','DeadLettered'].includes(job.status)`.

**Edge cases**

- `runJob` currently returns `boolean`. Changing the return type ripples into
  `retryJobAction`. Returning `false` (as above) keeps the signature and is the smaller
  change — but say so in your PR description.
- Do **not** "fix" the seeded `AttendanceSummary` failure (gotcha B8). Requeue it, retry
  it three times, watch it dead-letter, then requeue again — that's the demo this story
  enables.

**Connects to:** Story 11 (job runner), Story 18 (notifications).

---

# Tier 2 — Core features

## Story 4 — Unit-test harness for the domain rules

**Difficulty:** Medium | **Estimate:** 2–3h | **Skills:** Node test runner, test design, boundary analysis

**Story:** As an engineer on this team, I want the business rules covered by fast unit
tests, so that I can change a grading or risk threshold without manually clicking through
the app.

**Why it matters:** `package.json:13` already declares
`node --import tsx --test tests/*.test.ts` — **and `tests/` does not exist**. The domain
package was designed to be testable (zero imports, pure functions, plain inputs) and
nothing tests it. Every later story on this board changes behaviour that these tests
would protect.

**Acceptance criteria**

- [ ] A `tests/` directory exists at the repo root and `npm test` runs and passes.
- [ ] One test file per rule module: `grades.test.ts`, `risk.test.ts`,
      `enrollment.test.ts`, `workload.test.ts`.
- [ ] **No test touches the database, Prisma, or Next.js.** If you need a mock, you've
      tested the wrong layer.
- [ ] `grades.test.ts` covers: all-graded, mixed graded+missing, only-ungraded (asserting
      the 100% default of gotcha B1), empty array, and each `classifyGradeScore` boundary
      (89.9/90, 79.9/80, 69.9/70).
- [ ] `risk.test.ts` covers each level (`Low`/`Medium`/`High`/`Critical`), the tardy ×0.3
      weighting, both `Critical` escalation paths (two High areas; grades High with
      average < 55), and `primaryRiskArea` precedence.
- [ ] `enrollment.test.ts` asserts each rejection reason **and the order of the gates** —
      a withdrawn student enrolling in a full section must be rejected for being withdrawn
      (`canWaitlist: false`), not offered a waitlist.
- [ ] `workload.test.ts` covers each status band and the `OnLeave` penalty.
- [ ] At least three tests are written as **characterisation tests** with a comment
      recording surprising current behaviour rather than asserting what "should" happen.

**Files you'll touch**

- `tests/grades.test.ts`, `tests/risk.test.ts`, `tests/enrollment.test.ts`, `tests/workload.test.ts` (new)
- `package.json` — only if the glob doesn't resolve on your shell.

**Implementation plan**

1. Use the built-in runner, no new dependencies:
   ```ts
   import { test } from 'node:test';
   import assert from 'node:assert/strict';
   import { calculateSectionGrade } from '../src/packages/domain/rules/grades';
   ```
   Note the **relative** import — `tests/` is outside the `@/` alias resolution used by
   Next.js, and `tsx` won't read `tsconfig` paths for you by default.
2. Table-drive the boundary cases rather than writing 12 near-identical tests.
3. When a result surprises you, do not change `src/`. Write:
   `// CHARACTERISATION: a student with zero graded work scores 100%. See fabledocs/02 B1.`

**Edge cases**

- On Windows, `tests/*.test.ts` may not expand in every shell. If `npm test` reports "no
  test files found", switch the script to `node --import tsx --test tests/`.
- `strict: true` is on. `calculateSectionGrade` takes `score: number | null` — your
  fixtures must include the nulls.

**Connects to:** Everything. Do this one early.

---

## Story 5 — Assignment management for a class section

**Difficulty:** Medium | **Estimate:** 3–4h | **Skills:** Full-stack CRUD, status lifecycles, fan-out writes

**Story:** As a Teacher, I want to create, publish, and close assignments for my section
from the app, so that I'm not dependent on someone editing the seed script.

**Why it matters:** `Assignment` is a first-class model with a `Draft`/`Published`/`Closed`
lifecycle (`schema.prisma:137`) — and **there is no UI for it at all**. Assignments only
exist because `seed.ts` creates ten of them. This is the largest missing CRUD surface in
the app, and it's the prerequisite for the gradebook (Story 7) and the coursework sweep
(Story 16).

**Acceptance criteria**

- [ ] `/sections/[id]` gains an "Assignments" card listing every assignment for the
      section: title, type, status, due date, points, and a submitted/graded/total tally.
- [ ] Teachers, SchoolManagers, and Admins see a "Create Assignment" form with title,
      description, type (`Homework`/`Quiz`/`Exam`/`Project`/`Discussion`/`Lab`/`Other`),
      due date, and points possible.
- [ ] A new assignment is created with status `Draft` and `createdById` set to the active
      user. **No submissions are created yet.**
- [ ] A "Publish" button transitions `Draft` → `Published` and **creates one `Submission`
      row with status `NotStarted` for every currently `Enrolled` student**.
- [ ] A "Close" button transitions `Published` → `Closed`. Closed assignments cannot be
      re-published.
- [ ] Invalid transitions are rejected in the action (not just hidden in the UI) with a
      clear error.
- [ ] Every transition writes an audit event: `assignment.create`, `assignment.publish`,
      `assignment.close`.
- [ ] Publishing enqueues an `EmailNotification` job carrying `{ assignmentId, studentIds }`.
- [ ] `pointsPossible` must be > 0; `dueDate` must be a valid date.
- [ ] Draft assignments are hidden from student-facing views (currently: not rendered on
      `/students/[id]`).

**Files you'll touch**

- `src/app/actions.ts` — `createAssignmentAction`, `publishAssignmentAction`,
  `closeAssignmentAction`.
- `src/app/sections/[id]/page.tsx` — the assignments card, the form, the wrapper handlers.
- `src/packages/domain/rules/assignments.ts` (**new**) —
  `validateAssignmentTransition(from, to)` and `validateAssignmentInput(...)` as pure
  functions.

**No schema change is required** — the model and the status field already exist.

**Implementation plan**

1. Write the domain rule first: a transition map
   `{ Draft: ['Published'], Published: ['Closed'], Closed: [] }` and a validator returning
   `{ isValid, reason }`. Mirror the shape of `validateEnrollmentRules`.
2. `createAssignmentAction`: validate → `db.assignment.create` → audit → `revalidatePath`.
3. `publishAssignmentAction`: load the assignment **and** the section's `Enrolled`
   enrollments → check the transition → update status → `db.submission.createMany` with
   `{ assignmentId, studentId, status: 'NotStarted' }` → audit → `enqueueJob` → revalidate.
4. Prefer `db.submission.createMany({ data })` for the fan-out. **Verify it works against
   this SQLite setup first** — `createMany` support on SQLite depends on the Prisma
   version, and if yours rejects it, fall back to
   `db.$transaction(rows.map(r => db.submission.create({ data: r })))`. Either way,
   remember the `@@unique([assignmentId, studentId])` constraint: a re-publish would
   collide, which is exactly why the transition map forbids it.

**Edge cases**

- Publishing a section with zero enrolled students: `createMany` with an empty array is
  valid, but assert it rather than crashing.
- A student enrolled *after* publication has no submission row and will be invisible in
  the gradebook. Decide and document: either backfill on enrolment (touching
  `enrollStudentAction`) or accept it and note it in the PR. Backfilling is the better
  answer; it's also Story 7's problem if you don't.
- The grading cockpit only lists submissions with status `Submitted`
  (`sections/[id]/page.tsx:43`), so your `NotStarted` rows won't appear there. That's
  correct — Story 7 gives them a home.

**Connects to:** Story 7 (gradebook), Story 16 (coursework sweep), Story 10 (feedback agent).

---

## Story 6 — Teacher detail page

**Difficulty:** Medium | **Estimate:** 3–4h | **Skills:** Dynamic routes, aggregation, reusing domain rules

**Story:** As a School Manager, I want a detail page for each teacher showing their
sections, grading backlog and workload history, so that I can have an evidence-based
staffing conversation.

**Why it matters:** Students get a 522-line detail page. Teachers get a card in a grid and
nothing else — there is no `/teachers/[id]` route. This story is deliberately similar to
an existing page: your job is to **reuse** the workload rule and the agent-run panel
rather than reinvent them.

**Acceptance criteria**

- [ ] `/teachers/[id]` exists; the name on `/teachers` links to it.
- [ ] Header shows name, department, employment status, office, email, and subject pills
      (reuse the Story 2 parser if it's merged; otherwise parse inline).
- [ ] A workload panel reuses `calculateTeacherWorkload` and shows the score, status band,
      and **every** warning — `/teachers` only shows `warnings[0]` today
      (`teachers/page.tsx:201`).
- [ ] A sections table lists all sections (not just `Active`) with course, term, room,
      enrolled/capacity, and ungraded count, each linking to `/sections/[id]`.
- [ ] A "Grading backlog" list shows every `Submitted` submission across the teacher's
      sections, oldest first, with a link to the section's grading cockpit.
- [ ] The last 5 `TeacherWorkloadInsight` agent runs for this teacher are listed with
      confidence and a link to the trace; the "Run agent" button is here too
      (Admin/SchoolManager only).
- [ ] An `employmentStatus` control lets Admin/SchoolManager set
      `Active`/`OnLeave`/`Inactive`, writing a `teacher.status.change` audit event.
- [ ] Setting a teacher to `Inactive` while they have `Active` sections shows a warning
      (their sections become un-enrollable — see `enrollment.ts:71-77`).

**Files you'll touch**

- `src/app/teachers/[id]/page.tsx` (**new**)
- `src/app/teachers/page.tsx` — wrap the name in a `<Link>`.
- `src/app/actions.ts` — `updateTeacherStatusAction`.

**Implementation plan**

1. Copy the structural skeleton (not the content) of `src/app/students/[id]/page.tsx`:
   `export const revalidate = 0`, `async function Page({ params })`, `getActiveUser()`,
   one big `findUniqueOrThrow` with includes, then inline `'use server'` handlers.
2. Fetch in **one** query where possible:
   ```ts
   include: { classSections: { include: { course: true, enrollments: { include: { student: true } } } } }
   ```
   then a separate `db.submission.findMany({ where: { assignment: { classSectionId: { in: ids } } } })`.
3. **Do not** copy the per-student loop from `teachers/page.tsx:81-97` — that's the N+1 in
   gotcha D. Fetch all submissions for the teacher's sections once, group them by
   `studentId` in memory, and call `calculateSectionGrade` per group.

**Edge cases**

- A teacher with no sections: `calculateTeacherWorkload` returns score 0 / `Underloaded`.
  Render an empty state, don't divide by zero in a percentage bar.
- `findUniqueOrThrow` on a bad id throws a raw Prisma error. Consider `notFound()` from
  `next/navigation` for a real 404.

**Connects to:** Story 7, Story 13.

---

## Story 7 — Gradebook matrix for a section

**Difficulty:** Medium | **Estimate:** 3–4h | **Skills:** Data pivoting, table UX, in-memory joins

**Story:** As a Teacher, I want a students × assignments grid for my section, so that I can
see at a glance who is missing what.

**Why it matters:** Grading today is a flat list of *submitted-but-ungraded* work
(`sections/[id]/page.tsx:43`). There is no way to see the shape of the class. This is a
pure data-transformation exercise: one query, one pivot, zero new tables. Note that
`saveGradeAction` already calls `revalidatePath('/sections/<id>/gradebook')`
(`actions.ts:209`) — the route was planned and never built.

**Acceptance criteria**

- [ ] `/sections/[id]/gradebook` exists and is linked from the section page.
- [ ] Rows are `Enrolled` students (alphabetical by last name); columns are the section's
      `Published` and `Closed` assignments (by due date ascending).
- [ ] Each cell shows the score as `score/points` plus a status colour: graded (green),
      submitted-ungraded (amber), missing (red), not started (grey).
- [ ] A final "Average" column per student uses `calculateSectionGrade` **scoped to this
      section only**.
- [ ] A final "Class average" row per assignment uses `calculateClassAverage`.
- [ ] Cells for ungraded submissions link to the grading cockpit for that submission.
- [ ] Empty states: no assignments, no enrolled students.
- [ ] The whole grid comes from **at most 3 database queries**, regardless of class size.
- [ ] The table scrolls horizontally without breaking the page layout.

**Files you'll touch**

- `src/app/sections/[id]/gradebook/page.tsx` (**new**)
- `src/app/sections/[id]/page.tsx` — add the link.
- `src/packages/domain/rules/grades.ts` — reuse only; no changes expected.

**Implementation plan**

1. Query 1: the section with `enrollments: { where: { status: 'Enrolled' }, include: { student: true } }`.
2. Query 2: `db.assignment.findMany({ where: { classSectionId, status: { in: ['Published','Closed'] } }, orderBy: { dueDate: 'asc' } })`.
3. Query 3: `db.submission.findMany({ where: { assignmentId: { in: assignmentIds } } })`.
4. Build `Map<`${studentId}:${assignmentId}`, Submission>` and read cells out of it. Never
   query inside the render loop.
5. Per-student average: filter that student's submissions, map to
   `{ status, score, pointsPossible }` using the assignment lookup, call
   `calculateSectionGrade`.

**Edge cases**

- A student enrolled after an assignment was published has **no submission row** — render
  grey "—", not a crash (this is the loose end from Story 5).
- 10+ assignments will overflow. Wrap in `<div className="table-wrapper">` with
  `overflow-x: auto` and consider a sticky first column.
- Gotcha B1 again: a student with only ungraded work shows 100%. Correct per the domain
  rule; don't special-case it in the view.

**Connects to:** Story 5, Story 10, Story 16.

---

## Story 8 — Log Explorer: search, time range, and pagination

**Difficulty:** Medium | **Estimate:** 3–4h | **Skills:** URL state, Prisma filtering, pagination

**Story:** As an engineer on call, I want to search log messages, restrict to a time
window, and page through results, so that I can find the one line that matters instead of
scrolling 50 rows.

**Why it matters:** `/logs` filters by level and service via URL search params — a good
pattern — but it hard-caps at 50 rows with no pagination, no search, no time filter, and
it **loads every `SystemLog` row** just to compute the filter dropdowns
(`logs/page.tsx:20-24`). Every log call in the app writes a row, so this table is the
fastest-growing thing in the database.

**Acceptance criteria**

- [ ] A search box filters on `message` (case-insensitive substring) via a `?q=` param.
- [ ] Time range presets — Last hour / 24h / 7d / All — via a `?range=` param.
- [ ] Pagination via `?page=`, 25 rows per page, with Previous/Next and "Showing X–Y of Z".
- [ ] Existing level and service filters keep working, and **all filters compose**
      (changing one preserves the others in the URL).
- [ ] The page never loads more than `pageSize` log rows plus one `count`.
- [ ] The filter dropdown options are derived without loading every row — use
      `distinct: ['service']` with `select: { service: true }`, or hardcode the level list
      from the `LogLevel` union.
- [ ] A "Clear filters" link resets to `/logs`.
- [ ] Clicking a fingerprint filters to that fingerprint (`?fingerprint=`) — cheap and
      very useful for grouping repeats.
- [ ] The page stays a Server Component. The search box submits with a plain
      `<form method="get">`.

**Files you'll touch**

- `src/app/logs/page.tsx` — the whole file.

**Implementation plan**

1. Widen the `searchParams` type:
   `{ level?: string; service?: string; q?: string; range?: string; page?: string; fingerprint?: string }`.
2. Build the `where` object incrementally. For search on SQLite:
   ```ts
   if (q) whereClause.message = { contains: q };
   ```
   **Note:** Prisma's `mode: 'insensitive'` is **not supported on SQLite**. SQLite's
   `LIKE` is already case-insensitive for ASCII, so plain `contains` is what you want —
   adding `mode` will throw at runtime.
3. Range → `whereClause.createdAt = { gte: new Date(Date.now() - ms) }`.
4. `const [logs, total] = await Promise.all([db.systemLog.findMany({ where, orderBy, skip, take }), db.systemLog.count({ where })])`.
5. Write one `buildLogHref(overrides)` helper so every link preserves the other params
   instead of the current `?level=X&service=Y` string concatenation.

**Edge cases**

- `page=0`, `page=-1`, `page=999` past the end: clamp to `[1, Math.ceil(total/pageSize)]`.
- Non-numeric `page`: `Number('abc')` is `NaN` and `skip: NaN` throws.
- A search string containing `%` or `_`: Prisma parameterises the query so it's not
  injectable, but they are LIKE wildcards. Note the behaviour; escaping is a stretch goal.

**Connects to:** Story 11, Story 18.

---

## Story 9 — Student activity & audit timeline

**Difficulty:** Medium | **Estimate:** 2–3h | **Skills:** Querying sidecar tables, merging heterogeneous events, presentation

**Story:** As an Advisor, I want a single chronological timeline of everything that has
happened to a student, so that I can prepare for a parent meeting in two minutes instead
of cross-referencing five tables.

**Why it matters:** `AuditEvent` and `SystemLog` have **no foreign keys** into the academic
graph — they store `entityType` + `entityId` as loose strings. Reconstructing "everything
about this student" means querying by id across several entity types and merging in
memory. That is exactly how real event-sourced audit trails are read, and it teaches why
that design has a cost.

**Acceptance criteria**

- [ ] `/students/[id]` gains a "Timeline" card, newest first, capped at 30 entries with a
      "Show more" link.
- [ ] The timeline merges: audit events for the student, their enrollments, their
      submissions, their support notes and intervention plans; plus agent runs targeting
      the student; plus attendance records marked `Absent` or `Tardy`.
- [ ] Each entry shows an icon, a timestamp (`formatDateTime`), a human sentence
      ("Guinevere Vance graded *Algebra Homework 1* — 85/100"), and the actor's **name**,
      not their UUID.
- [ ] Audit rows are matched by `entityId` across the student's related record ids, not by
      a string search on the JSON blobs.
- [ ] Actor UUIDs are resolved to names in a single batched `db.user.findMany({ where: { id: { in: actorIds } } })`.
- [ ] `actorId === 'system'` renders as "💻 System".
- [ ] A filter chip row toggles categories: All / Grades / Attendance / Support / Agents.
- [ ] Empty state when there is no history.

**Files you'll touch**

- `src/app/students/[id]/page.tsx` — the card.
- `src/packages/observability/timeline.ts` (**new**) — `buildStudentTimeline(studentId)`
  returning a sorted `TimelineEntry[]`.

**Implementation plan**

1. Define `interface TimelineEntry { at: Date; kind: 'grade'|'attendance'|'enrollment'|'support'|'agent'; icon: string; title: string; detail: string; actorId: string | null; href?: string }`.
2. Collect the student's related ids first (enrollment ids, submission ids, note ids, plan
   ids) — you already have them from the page's main query if you pass them in.
3. `db.auditEvent.findMany({ where: { entityId: { in: allIds } } })`, plus
   `db.agentRun.findMany({ where: { targetType: 'Student', targetId: studentId } })`.
4. Map each source into `TimelineEntry`, concatenate, sort by `at` descending.
5. Batch-resolve actor names last, then render.

**Edge cases**

- `beforeJSON`/`afterJSON` can be `null` (creates) or malformed. Wrap `JSON.parse` in
  `try/catch` and fall back to a generic sentence.
- Audit `entityId` values are not unique across types — always pair with `entityType`.
- Don't call `db.user.findUnique` inside the map. That's an N+1 and this file is where
  juniors always write one.

**Connects to:** Story 1, Story 18.

---

# Tier 3 — Wiring the platform properly

## Story 10 — Wire the Assignment Feedback agent into grading

**Difficulty:** Medium-Hard | **Estimate:** 4h | **Skills:** Agent orchestration, human-in-the-loop UX

**Story:** As a Teacher, I want the platform to draft feedback for a submission that I can
review, edit, and accept, so that clearing a grading backlog takes minutes instead of an
evening.

**Why it matters:** `AssignmentFeedbackAgent` is fully written, fully wired into the
orchestrator (`orchestrator.ts:170-199`), and **completely unreachable** — no page ever
calls it (gotcha A). It's the only agent whose output is meant to be *edited by a human
and written back*, which makes it the best vehicle for learning human-in-the-loop design:
the agent proposes, the human disposes, and the audit trail records which happened.

**Acceptance criteria**

- [ ] Each card in the grading cockpit (`/sections/[id]`) gains a "Draft feedback with
      agent 🤖" button, visible to Teacher/SchoolManager/Admin.
- [ ] Clicking it runs `executeAgentRun({ agentType: 'AssignmentFeedback', targetType: 'Submission', targetId })`.
- [ ] After the run, the card shows the agent's `metadata.draftFeedback` (student-facing)
      and `metadata.teacherNotes` (internal), plus the confidence score and any
      `limitations`.
- [ ] An "Use this draft" button copies `draftFeedback` into the feedback input so the
      teacher can edit before submitting. The teacher is never forced to accept it.
- [ ] The grade form is unchanged otherwise — grading still works with the agent never run.
- [ ] When a grade is saved after an agent draft was shown, the audit event's `metadata`
      records `{ agentRunId, feedbackAcceptedVerbatim: boolean }`.
- [ ] A submission's most recent `AssignmentFeedback` run is shown on reload rather than
      re-running the agent.
- [ ] If the agent run fails, the card shows the error and grading still works.
- [ ] The agent's `AgentRun` row appears on `/agent-runs` with `targetType: 'Submission'`
      and its trace renders correctly on `/agent-runs/[id]` with no changes to that page.

**Files you'll touch**

- `src/app/sections/[id]/page.tsx` — the button, the draft panel, the wrapper handler.
- `src/app/actions.ts` — extend `saveGradeAction` to accept an optional
  `agentRunId`/`acceptedDraft` for the audit metadata.
- **No changes to `orchestrator.ts` or the agent itself** — if you find yourself editing
  them, you've misread the ticket.

**Implementation plan**

1. Add a handler alongside `handleGrade`:
   ```ts
   async function handleDraftFeedback(formData: FormData) {
     'use server';
     await runAgentAction({ agentType: 'AssignmentFeedback', targetType: 'Submission', targetId: formData.get('submissionId') as string, createdById: activeUser.id });
   }
   ```
2. Before rendering, fetch the latest run per submission in **one** query:
   `db.agentRun.findMany({ where: { agentType: 'AssignmentFeedback', targetType: 'Submission', targetId: { in: submissionIds } }, orderBy: { createdAt: 'desc' } })`,
   then reduce to a `Map<targetId, run>` keeping the first (newest) per id.
3. Parse `run.outputJSON` and read `metadata.draftFeedback` / `metadata.teacherNotes`.
4. "Use this draft" is a pure-UI concern. The page is a Server Component, so either make a
   tiny client component with `useState` over the textarea, or use a `defaultValue` on the
   feedback input populated from the run — the second is simpler and stays server-only.
   Pick one and justify it in the PR.

**Edge cases**

- `outputJSON` is nullable in the schema and null for failed runs. Guard before
  `JSON.parse`.
- The agent's "Missing" branch (`AssignmentFeedbackAgent.ts:45`) returns early with
  `isMissing: true` and no score-based feedback. Render that path differently.
- The grading cockpit only lists `Submitted` submissions, so the agent's ungraded branch
  is the one you'll hit most. Its confidence drops to 0.85 with a stated limitation —
  surface that, don't hide it.

**Connects to:** Story 7, Story 19.

---

## Story 11 — A background job runner

**Difficulty:** Medium-Hard | **Estimate:** 4–5h | **Skills:** Queue semantics, concurrency, idempotency

**Story:** As a School Manager, I want queued jobs to actually run, so that recalculated
grades appear without me manually clicking retry on every job.

**Why it matters:** This is the single biggest lie in the app. `enqueueJob` inserts a row
and **nothing ever picks it up** (gotcha B7). Every `GradeRecalculation` enqueued by
`saveGradeAction`, `enrollStudentAction`, and `dropStudentAction` sits at `Queued` forever,
which is why `Enrollment.finalGrade` goes stale. You'll learn why real queues need claim
semantics rather than "select then update".

**Acceptance criteria**

- [ ] A "Process queue" button on `/jobs` (Admin/SchoolManager) runs every `Queued` and
      `Failed` job in FIFO order and reports "Processed N: X succeeded, Y failed".
- [ ] `processQueue(limit = 20)` lives in `src/packages/observability/jobs.ts`.
- [ ] Jobs are **claimed** before execution: a job moves `Queued` → `Running` in a guarded
      update, and a job already `Running` is skipped, so two concurrent runners can't
      double-execute the same job.
- [ ] Failed jobs are retried up to `maxAttempts`, then dead-lettered (existing behaviour
      in `runJob` — reuse it, don't reimplement it).
- [ ] `GradeRecalculation` is **idempotent**: running it twice produces the same
      `finalGrade` values and no duplicate rows.
- [ ] A summary line logs at info level with counts.
- [ ] Optional (stretch): a `runOnEnqueue` flag on `enqueueJob` that fires the job inline
      immediately, defaulted **off**, with a comment explaining why doing work inline in a
      request is a trap.
- [ ] `/jobs` shows queue-depth counters by status.
- [ ] Processing an empty queue is a no-op that reports "Nothing to process".

**Files you'll touch**

- `src/packages/observability/jobs.ts` — `processQueue`, `claimJob`.
- `src/app/actions.ts` — `processQueueAction`.
- `src/app/jobs/page.tsx` — button + counters.

**Implementation plan**

1. `claimJob(jobId)`: a conditional update that only matches a claimable row.
   ```ts
   const claimed = await db.backgroundJob.updateMany({
     where: { id: jobId, status: { in: ['Queued', 'Failed'] } },
     data: { status: 'Running', startedAt: new Date() },
   });
   if (claimed.count === 0) return false; // someone else got it
   ```
   `updateMany` returning a count is the trick — `update` would throw or blindly overwrite.
2. `processQueue`: fetch candidate ids `orderBy: { createdAt: 'asc' }, take: limit`, then
   for each: claim, and if claimed, `await runJob(id)`.
3. **`runJob` currently sets `Running` itself** (`jobs.ts:73-81`). Refactor so the claim
   happens in exactly one place, or `runJob` will happily re-set a job you just claimed.
   Decide the ownership boundary and write it in a comment.
4. Idempotency: `GradeRecalculation` already only calls `enrollment.update` with a computed
   value, so it is naturally idempotent. Verify by running twice and diffing.

**Edge cases**

- SQLite is single-writer. Long loops will hold the write lock; keep `limit` small.
- `runJob` sleeps 500ms for several job types (`jobs.ts:144`). Twenty of those is a 10s
  request. Cap `limit`, and mention the timeout risk in your PR.
- Don't process `DeadLettered` jobs — that's Story 3's `requeueJob`.

**Connects to:** Story 3, Story 16, Story 17.

---

## Story 12 — Waitlist auto-promotion

**Difficulty:** Medium-Hard | **Estimate:** 4h | **Skills:** Domain rules, ordering fairness, transactional thinking

**Story:** As a School Manager, I want the longest-waiting student to be promoted
automatically when a seat frees up, so that waitlists aren't managed by whoever happens to
notice.

**Why it matters:** `validateEnrollmentRules` already produces `canWaitlist: true` at
capacity and `enrollStudentAction` creates `Waitlisted` rows (`actions.ts:83-102`). The
section page even renders a waitlist table. **Nothing ever promotes anybody.** This story
also forces you to confront the re-enrolment trap in gotcha B13.

**Acceptance criteria**

- [ ] When `dropStudentAction` frees a seat, the longest-waiting `Waitlisted` student in
      that section (oldest `createdAt`) is promoted to `Enrolled`.
- [ ] Promotion is skipped if the section is not `Active`, if the promoted student's
      `enrollmentStatus` is `Withdrawn`/`Graduated`, or if the section is somehow still at
      capacity — each skip is logged with its reason.
- [ ] Promotion writes an `enrollment.promote` audit event with before/after.
- [ ] Promotion enqueues `GradeRecalculation` for the section and an `EmailNotification`
      job addressed to the promoted student.
- [ ] The promotion decision lives in a **pure function** in
      `src/packages/domain/rules/enrollment.ts` — e.g.
      `selectWaitlistPromotion(candidates, seatsAvailable, sectionStatus)` — and is unit
      tested (Story 4 harness).
- [ ] A manual "Promote" button on the section's waitlist table (Admin/SchoolManager) uses
      the same code path.
- [ ] Promoting when the waitlist is empty is a clean no-op.
- [ ] The section page's Enrolled/Waitlisted counters reflect the change immediately.

**Files you'll touch**

- `src/packages/domain/rules/enrollment.ts` — the selection rule.
- `src/app/actions.ts` — `promoteFromWaitlist(sectionId, actorId)` helper called by
  `dropStudentAction`, plus a `promoteWaitlistAction` for the manual button.
- `src/app/sections/[id]/page.tsx` — the button.
- `tests/enrollment.test.ts` — coverage.

**Implementation plan**

1. Pure rule signature:
   ```ts
   export function selectWaitlistPromotion(input: {
     candidates: Array<{ enrollmentId: string; studentId: string; studentStatus: string; queuedAt: Date }>;
     currentEnrollmentCount: number;
     sectionCapacity: number;
     sectionStatus: string;
   }): { enrollmentId: string; studentId: string } | { skipped: true; reason: string }
   ```
2. In `dropStudentAction`, after the update and audit, call the promotion helper. Recount
   `Enrolled` *after* the drop — using a stale count is the classic bug here.
3. Update the existing waitlist row (`status: 'Enrolled'`). **Do not create a new
   `Enrollment`** — `@@unique([studentId, classSectionId])` forbids it.

**Edge cases**

- A student who was `Dropped` from this section cannot be re-added (gotcha B13). If your
  promotion logic ever tries to create rather than update, you'll hit the constraint.
- Two simultaneous drops could promote two students into one seat. SQLite's single writer
  makes this unlikely locally; note it in the PR and describe how a `$transaction` with a
  re-check would fix it properly.
- `Waitlisted` rows are counted by `section.enrollments.filter(e => e.status === 'Waitlisted')`
  on the page, but `sections/page.tsx:51` only includes `Enrolled` — check both pages
  still agree after your change.

**Connects to:** Story 5, Story 18.

---

## Story 13 — One permission table for the whole app

**Difficulty:** Medium-Hard | **Estimate:** 4–5h | **Skills:** Refactoring, RBAC design, consistency auditing

**Story:** As a Security Engineer, I want every permission decision to come from one
table, so that a role change is a one-line edit instead of a hunt through fifteen files.

**Why it matters:** `canPerformAction(role, action)` (`src/packages/shared/index.ts:17`) is
a complete, well-structured permission map with **zero call sites**. Meanwhile pages
hard-code `['Admin','SchoolManager'].includes(activeUser.role)` about fifteen times, and
they don't agree with each other or with the table. Example: the table says
`agent.run.student` is for `Teacher`/`Advisor`/`SchoolManager`, but
`students/[id]/page.tsx:197` also allows `Admin` — which is *correct*, because the table's
own `Admin` short-circuit on line 21 handles it. Finding these mismatches **is** the ticket.

> This is deliberately **not** the same as Story 9 in `docs/user-story-build-path/`. That
> story is about actions re-deriving the session server-side. This one is about a single
> source of truth for *what each role may do*. Doing this one first makes that one trivial.

**Acceptance criteria**

- [ ] An audit table in the PR description lists every current inline role check, the file
      and line, and the `canPerformAction` action string it maps to.
- [ ] Every inline `.includes(activeUser.role)` in `src/app/**` is replaced by
      `canPerformAction(activeUser.role, '<action>')`.
- [ ] Missing actions are **added to the table**, not worked around in the page:
      `job.requeue`, `assignment.create`, `assignment.publish`, `teacher.status.change`,
      `enrollment.promote`, `agent.run.feedback`, and any others your refactor surfaces.
- [ ] `canPerformAction` takes a typed action union (`export type PermissionAction = ...`)
      rather than a bare `string`, so a typo is a **compile error**.
- [ ] Behaviour is preserved except where you documented an intentional change.
- [ ] A `/permissions` page (Admin only) renders the full role × action matrix, generated
      from the table, so the rules are visible without reading code.
- [ ] Every `🔒` lock message names the roles that *would* be allowed, derived from the
      table rather than hardcoded prose.

**Files you'll touch**

- `src/packages/shared/index.ts` — the union type, new actions, exported action list.
- Every page under `src/app/` that gates UI (`students/`, `students/[id]/`, `teachers/`,
  `courses/`, `sections/`, `sections/[id]/`, `interventions/`, `jobs/`).
- `src/app/permissions/page.tsx` (**new**).

**Implementation plan**

1. **Audit first, refactor second.** `grep -rn "activeUser.role" src/app` and build the
   table. Do not start editing until the list is complete.
2. Convert the action strings to a union and export
   `export const PERMISSION_ACTIONS: PermissionAction[] = [...]` for the matrix page.
3. Replace call sites one page at a time, running `npm run build` between each.
4. Write `describeAllowedRoles(action)` that loops `USER_ROLES` calling
   `canPerformAction` — that's how both the matrix page and the lock messages get their text.

**Edge cases**

- `canPerformAction` returns `true` for `Admin` before the switch, and its `default` case
  returns `false` — so an action string you forget to add silently locks everyone out
  except Admin. The typed union is what stops this.
- Note the existing dead branch: `students/[id]/page.tsx:72` checks `visibility === 'AdminOnly' && role === 'Admin'`,
  but line 69 already returned `true` for Admin. Preserve the *behaviour*, and mention the
  dead code in the PR.
- Support-note visibility filtering is **data** filtering, not action gating. Leave it
  alone here; Story 15 handles data scoping.

**Connects to:** Story 15, and Story 9 of `docs/user-story-build-path/`.

---

## Story 14 — Zod-validate every server action

**Difficulty:** Medium-Hard | **Estimate:** 4h | **Skills:** Schema validation, error surfacing, form UX

**Story:** As an engineer, I want every server action to validate its input against a
schema before touching the database, so that bad data fails loudly at the boundary instead
of corrupting a table.

**Why it matters:** `zod` is a declared dependency (`package.json:24`) that is **never
imported**. Meanwhile actions do `formData.get('score') as string` and `Number(...)` with
no checks, and the schema has no enums — so `status: 'Grded'` will happily persist forever
(gotcha: "statuses are strings"). Server Actions are public POST endpoints; the browser's
`required` and `min` attributes protect nobody.

**Acceptance criteria**

- [ ] Every exported action in `src/app/actions.ts` parses its input through a zod schema
      as its first statement.
- [ ] Status/enum-ish fields validate against `z.enum([...])` matching the comments in
      `prisma/schema.prisma` — enrollment status, submission status, attendance status,
      note visibility, note type, risk area, job type, agent type, agent target type.
- [ ] The enums live in **one** place (`src/packages/shared/schemas.ts`) and the existing
      TypeScript unions are derived from them (`z.infer`), so they cannot drift apart.
- [ ] Numeric fields are coerced and bounded: `score` is `z.coerce.number().min(0)` and
      **also** checked against `pointsPossible` (which zod can't know) — the existing
      check on `actions.ts:180` stays, but negative scores are now rejected too
      (gotcha B9).
- [ ] Dates are validated: `followUpDate` and attendance `date` must parse to a valid
      `Date`.
- [ ] Validation failures throw an error whose message is safe to show a user and are
      logged at `warn` with the field path.
- [ ] Forms display validation errors instead of crashing to the Next.js error overlay.
- [ ] At least one test asserts a rejected payload (extend the Story 4 harness).

**Files you'll touch**

- `src/packages/shared/schemas.ts` (**new**) — all zod schemas and derived types.
- `src/packages/shared/index.ts` — re-export; replace the hand-written `UserRole` union
  with the derived one.
- `src/app/actions.ts` — every function.
- Inline actions in `teachers/page.tsx`, `students/page.tsx`, `courses/page.tsx`,
  `sections/page.tsx`, `interventions/page.tsx`.

**Implementation plan**

1. Start with the enums:
   ```ts
   export const enrollmentStatusSchema = z.enum(['Enrolled', 'Dropped', 'Completed', 'Waitlisted']);
   export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;
   ```
2. Then per-action input schemas, named `saveGradeInput`, `enrollStudentInput`, etc.
3. In each action: `const input = saveGradeInput.parse(payload);` and use `input` from
   then on — this also removes the `as string` casts, which is half the value.
4. For form error display, wrap `.parse` in a helper that catches `ZodError` and rethrows
   with a flattened, human-readable message.

**Edge cases**

- `formData.get()` returns `FormDataEntryValue | null`. `z.coerce.number()` turns `null`
  into `0` — use `z.string().min(1)` first for required text, or you'll silently accept
  blanks.
- A checkbox that isn't ticked is absent from `FormData`, not `false`.
- Don't add zod to `src/packages/domain/` — that would break the zero-dependency rule that
  makes the domain layer testable. Validate at the boundary; the domain trusts its inputs.

**Connects to:** Story 4, Story 5, Story 13.

---

# Tier 4 — Hard / architectural

## Story 15 — Role-scoped data access for Student and Parent

**Difficulty:** Hard | **Estimate:** 5–6h | **Skills:** Authorization design, query scoping, defence in depth

**Story:** As a Student, I want to see only my own record, and as a Parent only my own
child's, so that the platform doesn't expose everyone's grades to everyone.

**Why it matters:** This is the most serious gap in the app. Any role can open
`/students/<any-id>` and read a full profile — grades, attendance, guardian contact. Only
support notes are filtered (`students/[id]/page.tsx:67-74`). Everything else is wide open,
and the roster page lists every student to everyone. You'll learn the difference between
hiding a button, filtering a result, and scoping a query — and why only the last one is
security.

**Acceptance criteria**

- [ ] A `Student` role viewing `/students` sees **only themselves**.
- [ ] A `Student` opening another student's `/students/[id]` gets a 403-style "Not
      authorised" page, not a partial render and not a crash.
- [ ] A `Parent` sees only students whose `guardianEmail` matches their user email
      (the only link that exists in the schema today — say so explicitly in the PR, and
      propose a proper `guardianId` relation as follow-up work).
- [ ] `Teacher` sees only students enrolled in a section they teach; opening any other
      student is denied.
- [ ] `Advisor` sees students where `Student.advisorId` is their user id, **plus** any
      student with an intervention plan they created.
- [ ] `Admin`, `SchoolManager` and `Viewer` keep full read access.
- [ ] Scoping is enforced by a **`where` clause built server-side**, not by filtering an
      array after fetching everything.
- [ ] The dashboard's risk distribution respects the same scope — a Student sees their own
      status only.
- [ ] `/sections/[id]`, `/interventions` and `/agent-runs` apply the same scoping.
- [ ] One shared helper, `buildStudentScope(session): Prisma.StudentWhereInput`, is used
      everywhere. There is exactly one implementation.
- [ ] Denied access is logged at `warn` with the actor, the target, and the reason.

**Files you'll touch**

- `src/packages/shared/scope.ts` (**new**) — `buildStudentScope`, `canViewStudent`.
- `src/app/students/page.tsx`, `src/app/students/[id]/page.tsx`, `src/app/page.tsx`,
  `src/app/interventions/page.tsx`, `src/app/sections/[id]/page.tsx`,
  `src/app/agent-runs/page.tsx`.
- `src/app/forbidden.tsx` or a shared `<Forbidden />` component.

**Implementation plan**

1. Write `buildStudentScope` returning a Prisma `where` fragment per role:
   ```ts
   case 'Advisor': return { OR: [ { advisorId: session.id }, { interventionPlans: { some: { createdById: session.id } } } ] };
   case 'Teacher': return { enrollments: { some: { classSection: { teacher: { userId: session.id } } } } };
   case 'Student': return { userId: session.id };
   case 'Parent':  return { guardianEmail: session.email };
   default:        return {};
   ```
2. Spread it into every student query: `where: { ...scope }`.
3. For detail pages, use `db.student.findFirst({ where: { id: params.id, ...scope } })` —
   `findFirst` with the scope means an unauthorised id returns `null` and you render
   Forbidden. **Never** `findUniqueOrThrow` then check afterwards; that leaks existence
   through timing and error messages.
4. Note the profile-id subtlety: `ActiveSession.profileId` is `student?.id || teacher?.id`
   (`auth.ts:49`) — a `Teacher` scope needs `teacher: { userId: session.id }`, not
   `teacherId: session.profileId`, unless you're certain the profile link exists.

**Edge cases**

- A `Student` user with no `Student` profile row (the seed's `Viewer`, for instance):
  `{ userId: session.id }` matches nothing, which is the safe outcome. Render an empty
  state, not a crash.
- Guardian matching by email is fragile (case, duplicates). Lowercase both sides and call
  the weakness out.
- Story 13's permission table gates *actions*; this story scopes *data*. You need both.

**Connects to:** Story 13, Story 9, Story 17.

---

## Story 16 — Coursework sweep: automatic Late and Missing

**Difficulty:** Hard | **Estimate:** 5–6h | **Skills:** Batch jobs, time-based logic, cascading side effects

**Story:** As a Teacher, I want overdue work marked `Late` or `Missing` automatically, so
that the risk engine reflects reality without me maintaining it by hand.

**Why it matters:** `Submission.status` supports `Late` and `Missing`, and the whole risk
pipeline keys off `missingCount` — but **nothing ever sets those values**. They exist only
because `seed.ts` hardcodes them. Every derived number in the app (student risk, teacher
workload, dashboard distribution) is downstream of a status transition nobody performs.

**Acceptance criteria**

- [ ] A new job type `CourseworkSweep` is added to `JobType` and handled in `runJob`.
- [ ] The sweep finds `Published` assignments whose `dueDate` has passed and updates their
      submissions: `NotStarted` → `Missing`; `Submitted` with
      `submittedAt > dueDate` → `Late`.
- [ ] It never touches `Graded` or `Returned` submissions.
- [ ] It is **idempotent** — running it twice changes nothing the second time, and the log
      line proves it ("0 updated").
- [ ] Every status change writes an audit event with `actorId: 'system'`.
- [ ] After a sweep, `GradeRecalculation` is enqueued once per affected section (deduped,
      not once per submission).
- [ ] A "Run coursework sweep" button on `/jobs` enqueues it (Admin/SchoolManager).
- [ ] The sweep is safe to run against 10,000 submissions: batched, bounded, and it does
      not load every submission into memory.
- [ ] Transition rules live as a pure function in `src/packages/domain/rules/coursework.ts`
      and are unit tested, including the exactly-on-the-deadline boundary.
- [ ] A summary is logged: assignments scanned, submissions marked missing, marked late,
      sections queued.

**Files you'll touch**

- `src/packages/domain/rules/coursework.ts` (**new**) —
  `resolveSubmissionStatus({ current, dueDate, submittedAt, now })`.
- `src/packages/observability/jobs.ts` — the `JobType` union and the `case`.
- `src/app/jobs/page.tsx` — the button.
- `src/app/actions.ts` — `runCourseworkSweepAction`.
- `tests/coursework.test.ts`.

**Implementation plan**

1. Pure rule first — this is the whole ticket in miniature:
   ```ts
   export function resolveSubmissionStatus(i: { current: string; dueDate: Date; submittedAt: Date | null; now: Date }): string | null
   // returns the new status, or null when no change is needed
   ```
   Taking `now` as a parameter (rather than calling `new Date()` inside) is what makes it
   testable. Do not skip that.
2. In the job: page through overdue assignments with `take`/`skip`, load their submissions,
   map through the rule, and `updateMany` grouped by target status.
3. Collect affected `classSectionId`s in a `Set`, then enqueue one `GradeRecalculation` each.

**Edge cases**

- **Timezones.** `dueDate` is a `DateTime`; "overdue" at 23:59 local vs UTC differs by a
  day. Pick UTC, state it in a comment, and test the boundary.
- A submission with `submittedAt: null` but status `Submitted` — the data allows it. Decide
  and document.
- `updateMany` doesn't return the changed rows, so you can't write per-row audit events
  from it. Either fetch ids first and audit those, or write one summary audit event per
  sweep. Both are defensible; choose and justify.
- Marking work `Missing` immediately changes risk scores, which changes the dashboard and
  teacher workload. Re-run the agents afterwards and check the numbers move sensibly.

**Connects to:** Story 5, Story 7, Story 11.

---

## Story 17 — Guardian Digest generation and preview

**Difficulty:** Hard | **Estimate:** 6h | **Skills:** Composing derived reports, job payloads, preview UX

**Story:** As a Parent, I want a weekly digest of my child's grades, attendance, and
upcoming work, so that I find out about problems before the report card.

**Why it matters:** `GuardianDigest` is a declared `JobType` (`jobs.ts:11`), the seed
creates a `Succeeded` one, and its handler falls into the generic 500ms-sleep branch
(`jobs.ts:138-145`) — it does **nothing**. This story turns a fake job into a real one,
which means reading across five tables, composing a document, and storing it. It's the
best exercise in the set for "aggregate a lot of data into one artefact".

**Acceptance criteria**

- [ ] A new `GuardianDigest` model stores each generated digest (see schema below).
- [ ] The job composes a digest for a student covering the last 7 days: current average
      per section, new grades with scores, absences and tardies, missing assignments,
      assignments due in the next 7 days, and any active intervention plan.
- [ ] The digest body is generated by a **pure function** in
      `src/packages/domain/rules/digest.ts` — data in, formatted strings out, no DB access.
- [ ] The digest is persisted with `status: 'Draft'`; **no email is sent** (there is no
      mail transport, and that's fine — say so in the UI).
- [ ] `/digests` lists generated digests with student, period, and status; `/digests/[id]`
      renders one as it would appear in an inbox.
- [ ] An advisor/manager can "Approve & mark sent", which sets `status: 'Sent'`,
      `sentAt`, and writes a `digest.send` audit event.
- [ ] A "Generate digests for all active students" button enqueues one job per student.
- [ ] Regenerating for the same student and period **updates** the existing draft rather
      than creating a duplicate.
- [ ] A student with no activity in the period produces a short "no changes this week"
      digest, not an empty one.
- [ ] The digest respects support-note visibility — `TeacherOnly`/`AdvisorOnly`/`AdminOnly`
      notes must never appear in a guardian-facing document.

**Schema change**

```prisma
model GuardianDigest {
  id           String   @id @default(uuid())
  studentId    String
  student      Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  periodStart  DateTime
  periodEnd    DateTime
  status       String   // Draft, Sent, Failed
  subject      String
  bodyText     String
  metricsJSON  String   // computed numbers, for rendering + debugging
  sentAt       DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([studentId, periodStart])
}
```

Add the back-relation `guardianDigests GuardianDigest[]` to `model Student`, then
`npm run db:push` and restart the dev server.

**Files you'll touch**

- `prisma/schema.prisma`
- `src/packages/domain/rules/digest.ts` (**new**)
- `src/packages/observability/jobs.ts` — implement the `GuardianDigest` case.
- `src/app/digests/page.tsx`, `src/app/digests/[id]/page.tsx` (**new**)
- `src/app/actions.ts` — `generateDigestsAction`, `approveDigestAction`.

**Implementation plan**

1. Design the input type for the pure function first — it should be the *only* contract
   between the job (which queries) and the composer (which formats).
2. In the job handler, gather: enrollments with `finalGrade`, submissions graded in the
   window, attendance in the window, `Missing` submissions, assignments due in the next 7
   days, active intervention plans, and **only `Shared` support notes**.
3. Use `upsert` on `@@unique([studentId, periodStart])` for the regenerate-safety AC.
4. Normalise `periodStart` to midnight UTC on the Monday of the week, or the unique
   constraint won't dedupe.

**Edge cases**

- A student with no guardian email: still generate, but flag it in the UI as
  undeliverable.
- The visibility filter is the security-relevant part of this ticket. Write it as an
  explicit allowlist (`visibility === 'Shared'`), never a denylist.
- Prisma `DateTime` comparisons on SQLite need real `Date` objects, not ISO strings.

**Connects to:** Story 11, Story 15, Story 18.

---

## Story 18 — Notification centre

**Difficulty:** Hard | **Estimate:** 6–8h | **Skills:** Cross-cutting feature design, fan-out, read state

**Story:** As an Advisor, I want a notification inbox that tells me when a student becomes
critical, a job dead-letters, or a plan follow-up is due, so that I don't have to
poll five dashboards.

**Why it matters:** The app generates plenty of signals — agent recommendations with an
`urgency` and a `recommendedOwner`, dead-lettered jobs, intervention follow-up dates — and
surfaces none of them to a person. This is the broadest ticket on the board: a new model,
a fan-out producer, a consumer UI, read state, and role-based routing. It is the closest
thing here to owning a feature end to end.

**Acceptance criteria**

- [ ] A `Notification` model exists (see schema below).
- [ ] A `createNotification()` helper in `src/packages/observability/notifications.ts` is
      the single write path.
- [ ] Producers: (a) an agent run whose output contains a `High`/`Critical` recommendation
      creates one notification per recommendation, routed by `recommendedOwner`; (b) a job
      transitioning to `DeadLettered` notifies Admins and SchoolManagers; (c) an
      intervention plan whose `followUpDate` is today or past notifies its creator.
- [ ] Routing maps `recommendedOwner` (`Teacher`/`Advisor`/`Admin`/`Guardian`/`Student`)
      to actual user ids: the student's advisor, the section's teacher, all admins, etc.
      Unroutable owners are logged and dropped, never silently lost.
- [ ] A bell in the header (`layout.tsx`) shows the unread count for the active user and
      updates when the role switcher changes.
- [ ] `/notifications` lists notifications newest-first with unread emphasis, filterable
      by read/unread and by kind.
- [ ] Marking one read, and "mark all read", both work and persist.
- [ ] Each notification deep-links to its subject (`/students/[id]`, `/jobs`,
      `/agent-runs/[id]`).
- [ ] Notifications are **deduplicated**: the same agent run cannot produce duplicate rows
      if the agent is run twice within an hour for the same student and action.
- [ ] Users only ever see their own notifications — enforced with a `where` clause.
- [ ] Creating notifications never breaks the producing action: wrap in try/catch and log,
      following the fail-open precedent in `recordAuditEvent`.

**Schema change**

```prisma
model Notification {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation("UserNotifications", fields: [userId], references: [id], onDelete: Cascade)
  kind       String   // AgentRecommendation, JobDeadLettered, InterventionFollowUp, System
  urgency    String   // Low, Medium, High, Critical
  title      String
  body       String
  linkPath   String?
  entityType String?
  entityId   String?
  dedupeKey  String   // e.g. "agentrec:<studentId>:<hash(action)>"
  readAt     DateTime?
  createdAt  DateTime @default(now())

  @@index([userId, readAt])
  @@unique([userId, dedupeKey])
}
```

Add `notifications Notification[] @relation("UserNotifications")` to `model User`.

**Files you'll touch**

- `prisma/schema.prisma`
- `src/packages/observability/notifications.ts` (**new**)
- `src/packages/agents/core/orchestrator.ts` — fan out after a successful run.
- `src/packages/observability/jobs.ts` — fan out on dead-letter.
- `src/app/notifications/page.tsx` (**new**), `src/app/layout.tsx` (bell),
  `src/app/actions.ts` (mark read).

**Implementation plan**

1. Build the model and `createNotification` first, with the dedupe key as an argument.
   `upsert` on `@@unique([userId, dedupeKey])` gives you idempotency for free.
2. Write the routing resolver as a pure-ish function
   `resolveRecipients(owner, context)` → `userId[]`, with the DB lookups passed in.
3. Hook the orchestrator **after** the `Succeeded` update, inside its own try/catch, so a
   notification failure can never fail an agent run.
4. The bell is a Server Component read in `layout.tsx` — it re-renders on navigation, which
   is good enough. Don't add polling.

**Edge cases**

- Include a time bucket in the dedupe key (e.g. the hour) or a legitimately repeated alert
  a week later will be swallowed forever by the unique constraint.
- The layout already queries all users on every request; adding an unread count makes
  every page one query heavier. Use `db.notification.count`, not `findMany().length`.
- The header changes identity whenever the role switcher is used — the count must follow
  the *active* user, not a cached one.

**Connects to:** Stories 1, 3, 12, 16, 19.

---

## Story 19 — Agent re-run with output diff

**Difficulty:** Hard | **Estimate:** 6–8h | **Skills:** Versioned records, diffing, evaluation thinking

**Story:** As a School Manager, I want to re-run an agent and see exactly what changed
since last time, so that I can tell whether an intervention is working.

**Why it matters:** `AgentRun` rows are already immutable and append-only, with the input
snapshot, the output, and the full trace stored per run — so the history you need already
exists and nobody looks at it. Building a diff view teaches the evaluation mindset that
matters for any AI-adjacent system: not "what did the model say?" but "what changed, and
why?". When these heuristics are eventually swapped for a real LLM, this page becomes the
regression harness.

**Acceptance criteria**

- [ ] `/agent-runs/[id]` gains a "Re-run this agent" button (permission-gated) that runs
      the same agent against the same target and redirects to the new run.
- [ ] `/agent-runs/[id]` gains a "Compare with previous" panel when an earlier run of the
      same `agentType` + `targetId` exists.
- [ ] The comparison shows, side by side: confidence delta (with direction and colour),
      the summary of each, added/removed/unchanged **findings**, added/removed
      **concerns** and **strengths**, added/removed **recommendations** (matched on
      `action`), and changed `metadata` scalar values (e.g. `rawRiskScore` 78 → 52).
- [ ] Input-snapshot fields that changed between the two runs are listed — this is the
      *why* behind the output change and is the most valuable part of the page.
- [ ] The trace diff is available but collapsed by default (traces are long and noisy).
- [ ] A "Run history" strip on the target's page (`/students/[id]`, `/teachers/[id]`) plots
      confidence and the agent's headline metric across runs.
- [ ] Diffing is a **pure function** in `src/packages/agents/core/diff.ts`:
      `diffAgentOutputs(previous, current)` → a structured result, unit tested.
- [ ] The panel handles a `Failed` previous run, a null `outputJSON`, and a first-ever run
      gracefully.
- [ ] Comparing two runs of *different* agent types is impossible (guarded, not just
      hidden).

**Files you'll touch**

- `src/packages/agents/core/diff.ts` (**new**)
- `src/app/agent-runs/[id]/page.tsx` — the panel and the re-run button.
- `src/app/agent-runs/page.tsx` — a "compare" affordance on rows sharing a target.
- `src/app/students/[id]/page.tsx`, `src/app/teachers/[id]/page.tsx` — the history strip.
- `tests/agent-diff.test.ts`.

**Implementation plan**

1. Find the previous run:
   ```ts
   db.agentRun.findFirst({
     where: { agentType: run.agentType, targetId: run.targetId, status: 'Succeeded', createdAt: { lt: run.createdAt } },
     orderBy: { createdAt: 'desc' },
   })
   ```
2. `diffAgentOutputs` works on parsed `AgentOutput` objects. String arrays diff with `Set`s;
   recommendations match on the `action` string; metadata diffs shallowly over scalar keys.
   Keep it pure — parsing JSON is the caller's job.
3. Input-snapshot diff: both snapshots are `Record<string, any>` with different shapes per
   agent, so write a generic shallow scalar diff and ignore nested arrays (or render
   "3 items → 5 items" for arrays).
4. The history strip is an inline SVG or a CSS bar row — do **not** add a charting library
   for this.

**Edge cases**

- Older runs may have `inputSnapshotJSON` of `'{}'` — the orchestrator writes `'{}'` at
  creation and only fills it in on success (`orchestrator.ts:30`, `:332`). Handle the empty
  case.
- Agents are deterministic, so re-running with unchanged data produces an identical
  output. Your diff must render "no changes" clearly — that's the *expected* result and
  proves determinism.
- A `Failed` run has `outputJSON: null` and `confidenceScore: null`. Exclude failed runs
  from the "previous" lookup (as above) but still show them in the history strip, marked.

**Connects to:** Story 10, Story 16, Story 18.

---

## Suggested order

If you're working through these solo, this sequence keeps each story unblocked:

**4** (tests) → **1**, **2**, **3** (warm-up) → **5** (assignments) → **7** (gradebook) →
**11** (job runner) → **16** (sweep) → **13** (permissions) → **14** (zod) → **15**
(scoping) → **6**, **8**, **9** (surfaces) → **10**, **12** → **17**, **18**, **19**.

Stories 13, 14 and 15 are the ones that make the codebase genuinely safer. Do not leave
them for last just because they are refactors.
