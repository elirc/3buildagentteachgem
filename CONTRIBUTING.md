# Contributing — the workflow this repo teaches

This repository is a **learning artifact**. The application code matters, but the *git
history* matters just as much: every feature on this project was delivered through the
same branch → commit → pull request → review → merge loop that you will use on a real
engineering team.

If you are new here, read this file before you read any code. Then read the history:

```bash
git log --oneline --graph --all
```

That graph is the curriculum.

---

## 1. The loop

Every unit of work follows exactly six steps. There are no shortcuts, and the small
stories follow the same loop as the large ones — that consistency is the point.

```
1. Pick a ticket        fabledocs/03-user-stories.md
2. Branch               git switch -c feat/05-assignment-management
3. Commit as you go     small, focused, explained
4. Open a PR            with a body that a reviewer can act on
5. Review               read your own diff before anyone else does
6. Merge                --no-ff, then delete the branch
```

### Why `--no-ff`?

A fast-forward merge erases the fact that a branch ever existed. `--no-ff` creates an
explicit merge commit, so `git log --graph` shows one bubble per feature. Six months from
now, "which commits shipped together as story 12?" is answerable in one command. That is
worth the extra commit.

---

## 2. Branch naming

```
<type>/<story-number>-<short-kebab-summary>
```

| Type | Use for |
| --- | --- |
| `feat/` | A new capability a user can see. |
| `fix/` | A defect repair. |
| `refactor/` | Behaviour is unchanged; structure improves. |
| `test/` | Tests only. |
| `chore/` | Tooling, config, dependencies, docs. |

Examples from this repo's history:

```
feat/01-dashboard-urgent-case
test/04-domain-rule-harness
refactor/13-central-permission-table
```

One branch per story. If you find a second problem while working, **write it down and
finish the first one**. Mixed-purpose branches are the single most common reason a PR
sits unreviewed for three days.

---

## 3. Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The format is:

```
<type>(<scope>): <imperative summary under ~72 chars>

Why this change exists — the problem, not the diff. The reviewer can see
*what* changed by reading the code. They cannot see *why* unless you tell
them. This is where you explain the decision, the trade-off you made, and
the thing you rejected.

Refs: Story 5 (fabledocs/03-user-stories.md)
```

### The rules that actually matter

1. **Imperative mood.** "add waitlist promotion", not "added" or "adds". Read it as
   *"if applied, this commit will…"* — the sentence should complete naturally.
2. **The subject line says what. The body says why.** If the body just restates the diff
   in English, delete it and write the real reason instead.
3. **One logical change per commit.** A commit that adds a domain rule *and* a UI *and*
   fixes an unrelated typo is three commits.
4. **A commit should leave the repo working.** Someone should be able to check out any
   commit on `main` and have `npm run build` pass.
5. **Reference the ticket.** `Refs: Story 12` costs nothing and saves a future engineer
   twenty minutes of archaeology.

### Good vs bad

```
❌ fix stuff
❌ updated jobs.ts
❌ feat: changed runJob so that it now checks the status of the job before running it
   and also I added a requeue function and updated the jobs page

✅ fix(jobs): refuse to execute jobs in a terminal state

   runJob() only skipped Running jobs, so the "Retry Now" button on /jobs
   would happily re-execute a DeadLettered job and drive attempts past
   maxAttempts. A dead-letter queue you can accidentally drain is not a
   dead-letter queue.

   Returns false rather than throwing so the existing boolean contract with
   retryJobAction is preserved.

   Refs: Story 3
```

### Why we don't squash

Many teams squash-merge. We do not, here, on purpose: the intermediate commits are the
teaching material. In this repo you can watch a feature get built in the order a real
engineer would build it — domain rule first, then the action, then the UI, then the
polish. Squashing would throw that away.

On a real team, follow your team's convention. Know *why* each convention exists.

---

## 4. Commit sequencing — build inside-out

Look at any feature branch here and you will see the same shape:

```
1. test(domain):    the rule's tests, written against the intended behaviour
2. feat(domain):    the pure function that satisfies them
3. feat(actions):   the server action that calls it and writes the audit event
4. feat(ui):        the page that calls the action
5. docs/chore:      anything left over
```

This ordering is deliberate. The domain layer has no dependencies, so it can be built and
proven correct in isolation. The UI is the *last* thing you build, because it is the layer
most likely to change and the least likely to be right the first time.

If you find yourself starting with the JSX, stop and ask what business rule you are
actually implementing.

---

## 5. Pull requests

Open the PR **as soon as the branch has one commit on it**, even if it is nowhere near
done. A draft PR is a conversation; a finished PR is a verdict.

### The PR body template

```markdown
## What
One paragraph. What can a user do now that they could not do before?

## Why
The problem this solves. Link to the story. If it fixes something listed in
fabledocs/02-codebase-gotchas.md, name the gotcha.

## How
The approach, and — more importantly — the approach you *rejected* and why.

## Testing
Exactly what you did to convince yourself this works. Commands and click paths.

## Risks / follow-ups
What you are not sure about. What you deliberately left out of scope.
```

The **Why** and the **How I rejected** sections are what separate a junior PR from a
senior one. Anyone can describe a diff. Describing the option you didn't take proves you
considered more than one.

### Reviewing your own PR

Before you request a review, read your own diff on GitHub — not in your editor. The
different rendering makes you notice things. You are looking for:

- Debug logging you forgot to remove.
- A function that got long enough to need splitting.
- A comment explaining *what* the code does (delete it, or make the code clearer) instead
  of *why* (keep it).
- Anything you'd be embarrassed to explain out loud.

Leave review comments on your own PR for anything you consciously decided to accept. That
tells the reviewer "I saw this too" and moves the conversation forward by a full round trip.

---

## 6. Code comments

Comments in this codebase follow one rule: **explain why, never what**.

```ts
// ❌ Loop over the students and calculate their risk
for (const stu of students) { ... }

// ✅ Recomputed per request rather than cached: the cockpit is expected to be
// live, and at ~100 students this is a single query plus in-memory math. Revisit
// with a materialised risk column if the roster grows past ~1k.
for (const stu of students) { ... }
```

Where a decision is genuinely surprising, say so and link the reasoning:

```ts
// A student with zero graded work scores 100%, not 0% — innocent until proven
// guilty. This means new students are invisible to the risk engine until their
// first grade lands. See fabledocs/02-codebase-gotchas.md B1.
```

---

## 7. Definition of Done

A story is not done when the code compiles. It is done when:

1. Every acceptance criterion in the story is verifiable in the running app.
2. `npm run build` exits 0 — this is the strict TypeScript gate.
3. `npm test` passes.
4. You clicked through the feature as **at least two roles** (one allowed, one denied).
5. Any mutation writes an `AuditEvent` and shows up on `/audits`.
6. New business rules are pure functions in `src/packages/domain/rules/`, with tests.
7. `npm run db:seed && npm run dev` still works from a clean database.

---

## 8. Commands

```bash
npm install          # first run only
npm run db:push      # sync schema -> prisma/dev.db (no migrations folder in this repo)
npm run db:seed      # WIPES the database and rebuilds the demo scenario
npm run dev          # http://localhost:3000
npm run build        # the real gate: full strict TypeScript check
npm test             # domain rule unit tests
npm run db:studio    # browse the database in a GUI
```

After changing `prisma/schema.prisma`: run `npm run db:push` **and restart the dev
server**, or the generated Prisma types will be stale.

`prisma/dev.db` is generated and gitignored. Do not commit it — a binary that must stay in
lockstep with the schema will drift, and a stale database produces `table does not exist`
errors on every page that look exactly like application bugs.

---

## 9. Reading the history like a book

```bash
# The shape of the project: one bubble per feature
git log --oneline --graph --all

# Everything that shipped for one story
git log --oneline --grep "Story 12"

# Why does this line look like this?
git log -p --follow src/packages/domain/rules/enrollment.ts

# Who changed this line, in which commit, and what did that commit say?
git blame src/packages/observability/jobs.ts

# What did a whole feature look like as one diff?
git diff main~1 main
```

`git log -p --follow` on a single domain rule is the highest-value thing in this list.
Pick `enrollment.ts` and read its whole life story — you will see a rule get written,
tested, extended for waitlist promotion, and hardened. That progression is what real
software looks like.
