# fabledocs — Onboarding & Backlog Pack

This folder is the **practical onboarding pack** for the EduOps Platform (`agentic-edu-ops`).
It was written by reading every file in `src/`, `prisma/`, and the config, so everything in
here is claimed against code that actually exists in this repo today.

## Who this is for

A junior software engineer who has just been handed this repository and needs to:

1. Understand what the product does and why the code is shaped the way it is.
2. Know where things live and which patterns to copy.
3. Pick up a ticket and ship it without breaking the existing architecture.

## The files

| File | What it gives you | Read when |
| --- | --- | --- |
| [`01-how-this-app-works.md`](01-how-this-app-works.md) | The product, the data model, the layered architecture, the request lifecycle, a page-by-page and file-by-file map, and how to run it locally. | **First. Read it end to end.** |
| [`02-codebase-gotchas.md`](02-codebase-gotchas.md) | Verified quirks, dead code, unused dependencies, N+1 queries, and correctness traps in the current code. | Before you write your first line of code. |
| [`03-user-stories.md`](03-user-stories.md) | 19 new feature tickets, tiered from easy to hard, each with acceptance criteria, a file list, an implementation plan, and edge cases. | When you're ready to build. |

## Relationship to the existing `docs/` folder

The repo already has a `docs/` folder with three learning suites
(`architectural-cartographer/`, `mission-learning-path/`, `user-story-build-path/`).
Those are good background reading, but **be careful**: a few of their exercises reference
fields and functions that do not exist in this codebase (see the "Documentation drift"
section of `02-codebase-gotchas.md`). When the docs and `prisma/schema.prisma` disagree,
the schema wins.

`fabledocs/` does not replace `docs/` — it adds a verified architecture walkthrough, a
known-issues list, and a fresh backlog that does not overlap with the 10 stories already
in `docs/user-story-build-path/01-stories.md`.

## The 60-second version

EduOps is a **school operations cockpit**: students, teachers, courses, sections,
enrollments, assignments, grades, attendance, and counseling interventions — plus an
**observability layer** (structured logs, audit events, a background job table) and an
**agent layer** (five deterministic "mock LLM" analysts that read the database, reason in
traceable steps, and write their findings back as records you can inspect).

It's a **Next.js 14 App Router modular monolith**: React Server Components read directly
from Prisma, Server Actions perform mutations, and all business math lives in
dependency-free pure functions under `src/packages/domain/`.

Start with [`01-how-this-app-works.md`](01-how-this-app-works.md).
