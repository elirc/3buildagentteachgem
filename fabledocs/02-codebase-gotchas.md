# Codebase Gotchas

> **This document describes the codebase as originally imported** (commit
> `chore: import EduOps application baseline`). Many of these findings have since been
> fixed by the 19-story build — see [`04-what-changed.md`](04-what-changed.md) for what is
> still true. It is kept unedited on purpose: the *reasoning* about why each one mattered
> is the teaching material, and rewriting history would destroy it.

Everything below was verified against the code in this repo. Line references are accurate
as of writing. Read this before your first ticket — several of the user stories in
`03-user-stories.md` exist specifically to fix things on this list.

Nothing here is a criticism of whoever wrote the app. A teaching codebase deliberately
leaves seams open. Your job is to know which is which.

---

## A. Dead code and unused wiring

These exist, look important, and are connected to nothing. Do not assume they work just
because they compile.

| Thing | Where | Reality |
| --- | --- | --- |
| `canPerformAction(role, action)` | `src/packages/shared/index.ts:17` | A complete 60-line permission table. **Zero call sites.** All real gating is inline `.includes()` arrays in pages. |
| `AssignmentFeedback` agent | `src/packages/agents/registry/AssignmentFeedbackAgent.ts` | Fully implemented and wired into the orchestrator (`orchestrator.ts:170`), but **no page ever triggers it**. It is unreachable from the UI. |
| `zod` | `package.json:24` | Installed as a runtime dependency. Never imported anywhere in `src/`. |
| `getAttendanceStatusStyle` | `src/packages/shared/index.ts:127` | Never called. Pages inline their own `badge-danger`/`badge-warning` ternaries. |
| `@/ui` path alias | `tsconfig.json:32-33` | Points at `src/packages/ui/` — **the directory does not exist**. |
| `AgentTargetType` members | `src/packages/agents/core/types.ts:8` | `'Assignment'`, `'LogGroup'` and `'Job'` are declared but no agent accepts them. |
| `AgentRunResult` interface | `core/types.ts:27` | Declared, never used. The orchestrator returns a bare `string` run id. |
| `Assignment.status` | `prisma/schema.prisma:137` | `Draft`/`Published`/`Closed` — seeded as `Published`, never read or changed by any code. |
| `Submission.attachmentUrl` | `prisma/schema.prisma:158` | Never written, never rendered. |
| `revalidatePath` imports | `students/page.tsx:8`, `sections/[id]/page.tsx:10`, `jobs/page.tsx:6`, others | Imported in pages that never call it directly (the shared actions do). Harmless, but don't cargo-cult it. |

---

## B. Correctness traps

### B1. `calculateSectionGrade` returns **100%** when nothing is graded

`src/packages/domain/rules/grades.ts:64-73`

```ts
if (totalPointsPossible <= 0) {
  return { percentage: 100, classification: 'Excellent', ... };
}
```

A brand-new student with zero submissions shows a 100% average and a `Low` risk tier
everywhere — dashboard, roster, student profile. This is not a bug you should silently
"fix": it's a genuine product decision (innocent until proven guilty) with a real
downside (new students are invisible to the risk system). If a ticket asks you to change
it, change it in the domain rule and add a test, not in the UI.

### B2. Ungraded work is added then subtracted

`grades.ts:43` adds `pointsPossible` to the total, then line 59 subtracts it again for any
status that isn't `Graded`, `Returned`, or `Missing`. Net effect: `Submitted` work is
excluded from the denominator. Correct, but the code reads like a bug — and the
`if (sub.status === 'Draft') continue;` on line 41 is **dead code**, because `Submission.status`
never takes the value `Draft` anywhere in the app.

### B3. "Section average" isn't per-section

`calculateStudentRisk` is called from `/students`, `/students/[id]`, and `/` with
submissions from **all** of a student's sections pooled together
(`students/[id]/page.tsx:38-44`). The badge says "Section Average". A student failing one
class and acing three others averages out to fine. Worth knowing before you trust the
number.

### B4. The dashboard "urgent case" card is hardcoded

`src/app/page.tsx:216-242`. The card is conditional on `criticalRiskCount > 0`, but the
name, the "4 missing Algebra I assignments", the "5 consecutive absences", and "Advisor
Clara Vance" are **string literals**. Enrol a different failing student and the dashboard
will still shout about Maya Johnson. Story 1 fixes this.

### B5. "Assigned Advisor" shows the wrong person

`src/app/interventions/page.tsx:70` labels a column "Assigned Advisor" and line 92 renders
`{p.createdByUser.name}` — the person who *created* the plan. The student's actual advisor
is `Student.advisorId` → `User` (`schema.prisma:64-65`). Today they happen to be the same
person in the seed data, which is exactly why nobody noticed.

### B6. Retrying a dead-lettered job runs it again

`src/packages/observability/jobs.ts:170` sets `DeadLettered` once
`attempts + 1 >= maxAttempts`, but the retry button on `/jobs:99` is only disabled for
`Succeeded` and `Running`. So you can keep retrying a dead-lettered job forever and push
`attempts` past `maxAttempts`. Story 3 fixes this.

### B7. Nothing ever runs a queued job

`enqueueJob` inserts a row and returns. There is no worker, no cron, no polling. The
`GradeRecalculation` job that `saveGradeAction` enqueues after every grade will sit at
`Queued` until someone opens `/jobs` and clicks "Retry Now" — which is why
`Enrollment.finalGrade` frequently looks stale. Story 11 addresses this.

### B8. The failed `AttendanceSummary` job is a fixture, not a defect

`jobs.ts:131-135` explicitly throws a fabricated `TypeError` when `runDate` is null, and
the seed creates a job with `runDate: null` to match. It exists so you can practise
reading a callstack in the job monitor. Leave it alone unless a ticket says otherwise.

### B9. Score validation is one-sided

`saveGradeAction` (`src/app/actions.ts:180`) rejects `score > pointsPossible` but accepts
negative numbers. The `min={0}` on the input (`sections/[id]/page.tsx:275`) is browser-side
only and a Server Action can be called without the form.

### B10. Escalation keywords are extremely broad

`orchestrator.ts:147` matches notes against
`['absence','fail','struggling','missed','absent','behind','backlog']`. Any support note
mentioning an absence adds +10 to the risk score, including a note saying the absence was
*excused*.

### B11. Attendance dates are `DateTime`, keyed to midnight UTC

The unique constraint is `[studentId, classSectionId, date]` where `date` is a full
`DateTime`. `recordAttendanceAction` does `new Date("2026-05-22")` → midnight UTC, so the
upsert is idempotent **as long as every writer uses a bare `YYYY-MM-DD` string**. Pass a
date with a time component and you'll create a duplicate row for the same day.

### B12. Bulk attendance is not transactional

`recordAttendanceAction` (`actions.ts:228-270`) loops over students doing an `upsert` plus
an audit write per student. A failure halfway through leaves a half-recorded register.
There is no `db.$transaction` anywhere in the codebase.

### B13. Dropped students can never re-enrol

`Enrollment` has `@@unique([studentId, classSectionId])` and `dropStudentAction` sets
`status: 'Dropped'` rather than deleting the row. `validateEnrollmentRules` then rejects
the student for "already enrolled" (`enrollment.ts:30-36`) because
`hasExistingEnrollment` is computed with `findUnique` regardless of status
(`actions.ts:67-69`). Re-enrolment is impossible without reactivating the existing row.

---

## C. Security seams

These are the deliberate teaching gaps. Treat them as real vulnerabilities when you write
new code — don't add more of them.

1. **Server Actions do no authorization.** Every action in `src/app/actions.ts` accepts an
   `actorId`/`authorId` parameter and trusts it. Buttons are hidden in the UI, but a
   Server Action is a POST endpoint; hiding the button doesn't remove the endpoint.
2. **No data scoping for `Student` / `Parent`.** Any role can open `/students/<any-id>`
   and read another student's full profile, grades, and attendance. Only *support notes*
   are filtered (`students/[id]/page.tsx:67-74`). Story 15 fixes this.
3. **`switchUserAction` lets anyone become anyone**, including `Admin`, by setting a
   cookie (`actions.ts:15-18`). This is the intended dev switcher — just never let this
   pattern near a real deployment.
4. **`getActiveUser()` falls back to the admin account** whenever the cookie is missing or
   points at a deleted user (`shared/auth.ts:32-37`). Fail-open by default.
5. **`AdminOnly` support notes are visible to `SchoolManager`.** The early return on
   `students/[id]/page.tsx:69` grants Admin *and* SchoolManager everything, before the
   `AdminOnly` branch on line 72 is ever evaluated (which is also unreachable for the same
   reason).

---

## D. Performance

The database has 4 students, so nothing is slow today. All of these become real at 400.

| Issue | Where | Detail |
| --- | --- | --- |
| N+1 in teacher metrics | `src/app/teachers/page.tsx:63-97` | For each teacher, a `submission.count`, an `enrollment.findMany`, **and one `submission.findMany` per enrolled student**. |
| Same N+1 in the orchestrator | `agents/core/orchestrator.ts:283-299` | `TeacherWorkloadInsight` loops over every student to compute at-risk counts. |
| Whole-table dashboard scan | `src/app/page.tsx:28-63` | Loads every student with **all** attendance and **all** submissions with their assignments, then recomputes risk in JS on every render. |
| Log filter dropdowns | `src/app/logs/page.tsx:20-24` | Loads **every** `SystemLog` row just to derive the distinct level/service lists, then queries again for 50 rows. |
| No pagination anywhere | `/jobs`, `/audits`, `/agent-runs`, `/interventions` | Unbounded `findMany`. `/logs` is the only page with a `take`. |
| `revalidate = 0` on every page | all pages | Nothing is ever cached. Correct for a live cockpit, expensive at scale. |
| Layout fetches all users | `src/app/layout.tsx:20` | On every single request, for the role-switcher dropdown. |
| Logging amplifies writes | `observability/logging.ts:52` | Every log call is a DB insert, and `recordAuditEvent` logs too — so one grade action writes ~4 rows beyond the update itself. |

---

## E. Environment and tooling

- **`node_modules/` is absent.** Run `npm install` before anything else.
- **`git log` is empty** — the repo has no commits yet. There is no history to consult and
  no `.gitignore` protecting `node_modules/` or `prisma/dev.db`.
- **`npm test` is a lie.** The script is `node --import tsx --test tests/*.test.ts` and
  `tests/` does not exist. Story 4 creates it.
- **`npm run lint` will prompt you.** There is no `.eslintrc*` in the repo, so `next lint`
  drops into its interactive setup wizard. Don't run it inside CI or a non-interactive
  shell.
- **`npm run build` is the real gate.** It runs the strict TypeScript check across the
  whole project. Use it as your definition of "compiles".
- **`db:push`, not migrate.** There is no `prisma/migrations/` folder. Schema changes are
  pushed directly. Adding a **required** column to a table with existing rows will fail —
  add it optional (`String?`), backfill, then tighten if needed.
- **Restart `npm run dev` after a schema change**, or the generated Prisma types stay stale.
- **`prisma/dev.db` is committed and seeded.** `npm run db:seed` **deletes everything**
  first (`seed.ts:9-25`). That's your reset button, not a merge.

### One cosmetic oddity

`src/app/components/SwitcherLink.tsx:1` has a stray `'use html';` directive above
`'use client';`. It parses as part of the directive prologue so `'use client'` still takes
effect, but it means nothing. Also, the sidebar label on `layout.tsx:119` reads
`👨‍Grad Students` — a mangled emoji.

---

## F. Documentation drift

The pre-existing `docs/` folder is worth reading, but parts of it describe a version of
the schema that doesn't exist. Confirmed mismatches:

| Claim | Where | Reality |
| --- | --- | --- |
| `Enrollment.absences` field | `docs/user-story-build-path/01-stories.md` Story 5 | No such field. Absences are counted from the `Attendance` table. |
| `InterventionPlan.advisorId` | Story 7 | The model has `createdById`, not `advisorId`. The *student* has `advisorId`. |
| `completePlanAction` in `actions.ts` | `docs/architecture.md` Lab 3 | It's an inline action inside `src/app/interventions/page.tsx:15`, not in `actions.ts`. |
| "check whether `NoteVisibility` is an Enum" | Story 3 | Fair as a prompt, but the answer is always no — there are no Prisma enums anywhere in this schema. Every status is a `String`. |
| `src/packages/ui` | implied by `tsconfig` | Does not exist. |

**Rule of thumb: `prisma/schema.prisma` and the code are the source of truth.** If a doc
tells you a field exists, grep for it first.
