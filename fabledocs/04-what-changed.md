# What Changed — the 19-story build

All 19 stories in [`03-user-stories.md`](03-user-stories.md) were implemented, each through
its own branch and pull request. This file reconciles the other fabledocs with the code as
it now stands, so nobody reads a "known issue" that was fixed three PRs ago.

**Read `02-codebase-gotchas.md` alongside this file.** That document describes the codebase
*as imported*, and it is still the right starting point for understanding why things are
the way they are — but the table below says which of its findings are now history.

```bash
git log --oneline --graph --all      # one bubble per feature
gh pr list --state merged            # 19 PRs, each with its reasoning
```

---

## Gotchas that are now fixed

| Gotcha | Was | Fixed by |
| --- | --- | --- |
| **A** — `canPerformAction` had zero call sites | 20 inline role arrays across 10 files | Story 13 — one typed table, `grep` for `includes(activeUser.role)` returns nothing |
| **A** — `AssignmentFeedback` agent unreachable | Implemented, orchestrated, never called | Story 10 — wired into the grading cockpit |
| **A** — `zod` installed, never imported | — | Story 14 — `shared/schemas.ts`, parsed at every action |
| **A** — `Assignment.status` never read or changed | Draft/Published/Closed unused | Story 5 — full lifecycle with a transition rule |
| **B4** — dashboard hardcoded "Maya Johnson" | String literals behind a dynamic-looking gate | Story 1 — ranked from live risk data |
| **B6** — dead-lettered jobs could be retried forever | UI and worker disagreed | Story 3 — `JOB_TRANSITIONS`, shared `canRunJob` predicate |
| **B7** — nothing ever ran a queued job | `enqueueJob` inserted rows; no worker existed | Story 11 — `claimJob` + `processQueue` |
| **B9** — negative scores accepted | `min={0}` was browser-side only | Story 14 — zod `.min(0)` at the boundary |
| **C2** — any role could read any student | Only support notes were filtered | Story 15 — `buildStudentScope` in the WHERE clause |
| **D** — `/logs` loaded every row to build dropdowns | On the fastest-growing table | Story 8 — constant + `distinct`, plus pagination |
| **E** — `npm test` pointed at a missing directory | `tests/` did not exist | Story 4 — 129 tests today |
| — `Late` / `Missing` never set by any code | Only the seed produced them | Story 16 — the coursework sweep |
| — `GuardianDigest` job did nothing | Fell into the generic sleep branch | Story 17 — real composition + review UI |

## Gotchas that still stand

These were **not** in scope and remain true. Several are deliberate.

| Gotcha | Status |
| --- | --- |
| **B1** — a student with no graded work scores 100% | **Deliberate.** Pinned by a characterisation test in `tests/grades.test.ts`. Changing it moves every risk score in the app, so it needs its own ticket. |
| **B8** — the seeded `AttendanceSummary` failure | **Deliberate fixture.** Story 3 made it *more* useful: you can now watch the full budget-exhaustion cycle and then requeue. |
| **B2** — dead `Draft` branch in `calculateSectionGrade` | Still dead, now pinned by a test so its removal is a decision rather than an accident. |
| **B3** — "section average" pools every section | Still true for risk badges. The **gradebook** (Story 7) is correctly scoped per section. |
| **B5** — "Assigned Advisor" shows the plan's creator | Still mislabelled on `/interventions`. |
| **B11/B12** — attendance date keys, non-transactional bulk write | Unchanged. There is still no `$transaction` anywhere — see Story 12's PR for why introducing the first one wasn't done as a side effect. |
| **B13** — dropped students cannot re-enrol | Unchanged, and now load-bearing: Story 12's promotion **updates** the waitlist row precisely because a second row is impossible. |
| **C1** — Server Actions perform no authorization | **Partially addressed.** Story 13 centralised UI gating; Story 15 scoped reads. Actions still do not re-check permissions — hiding a button does not remove the endpoint. This is the top remaining security item. |
| **C3/C4** — the role switcher and the admin fallback | Unchanged by design. This is a lab, not a deployment. |

---

## New capabilities

**Pages:** `/teachers/[id]`, `/sections/[id]/gradebook`, `/permissions`, `/digests`,
`/digests/[id]`, `/notifications`.

**Models:** `GuardianDigest`, `Notification`.

**Domain rules** (all pure, all tested): `assignments.ts`, `coursework.ts`, `digest.ts`,
plus `selectWaitlistPromotion` in `enrollment.ts` and the ordering helpers in `risk.ts`.

**Jobs:** the queue actually drains (`processQueue`), `CourseworkSweep` and
`GuardianDigest` do real work, and dead letters notify someone.

**Tests:** 129 across 24 suites, ~5s, no framework and no database.

---

## Where the teaching value is

If you read one thing, read the **pull requests**. Each has a `## Why` section naming the
problem and a `## How` section naming **the approach that was rejected and why** — the
part that separates a junior PR from a senior one.

A few worth opening specifically:

- **PR #11** (job runner) — why a queue is not `SELECT` then `UPDATE`, and why
  `updateMany`'s count is the claim.
- **PR #15** (data scoping) — why a `where` fragment beats a post-fetch filter, and why
  `findFirst`-with-scope beats fetch-then-check.
- **PR #13** (permissions) — a full before/after audit table of all 20 inline checks, plus
  two behaviour changes called out rather than slipped in.
- **PR #4** (tests) — what a characterisation test is and why five of them pin behaviour
  nobody endorses.
- **PR #16** (coursework sweep) — why `now` is a parameter, and the `>` vs `>=` boundary.

And in the commits themselves, the pattern is consistent: the subject says *what*, the body
says *why*, and the diff is left to speak for itself.
