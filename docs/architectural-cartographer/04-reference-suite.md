# 04: Architectural Reference Suite

This is a permanent reference document containing essential playbooks and checklists for operating, reviewing, and extending the codebase.

---

## Doc 1: Junior Onboarding Guide
**How to orient, set up, and read this codebase from day one.**

1. **Setup:**
   - Clone the repo.
   - Run `npm install`.
   - Run `npm run db:push` to generate the SQLite dev.db.
   - Run `npm run db:seed` to populate mock data.
   - Run `npm run dev` and navigate to `http://localhost:3000`.
2. **Mental Orientation:**
   - This is a Next.js App Router monolith.
   - There are no APIs. The UI queries the database directly on the server.
   - There are no client state managers (Redux). State is the database.
3. **First Reading Assignment:**
   - Read `prisma/schema.prisma` to understand the domain models.
   - Read `src/packages/shared/index.ts` to understand the roles.
   - Trace the `SwitcherLink.tsx` component to see how server actions are invoked.

---

## Doc 2: Mid-Level Architecture Guide
**System design, data flows, and component contracts.**

- **Architecture:** "Direct-to-Database UIs". Next.js handles routing and React Server Components (RSCs) handle data fetching. `src/app/actions.ts` handles all mutations.
- **Data Flow Contract:**
  1. RSC fetches data via Prisma (`db.model.findMany`).
  2. HTML is shipped to the client.
  3. Client submits a form pointing to a Server Action.
  4. Server Action executes business logic (`src/packages/domain`).
  5. Server Action updates DB, writes Audit Log, and calls `revalidatePath()`.
- **Component Contracts:** UI components should almost always be "dumb" pure functions receiving props. The parent Page (`page.tsx`) owns the database query and passes data down.

---

## Doc 3: Senior Ownership Guide
**Critique, technical debt register, and upgrade path.**

- **Tech Debt Register:**
  - `src/app/actions.ts` is too large. It violates SRP by mixing routing, validation, business logic, and database interactions.
  - Missing backend RBAC. Actions blindly trust the `authorId` passed from the UI.
  - N+1 Query vulnerabilities in `src/app/teachers/page.tsx` during workload calculations.
- **Upgrade Path:**
  - Isolate business logic into a `services/` directory.
  - Implement Zod schema validation for all Server Actions.
  - Implement pagination for all list views (`/students`, `/teachers`).

---

## Doc 4: Code Review Guide
**What to check, in what order.**

1. **Check the Schema:** Did the PR modify `schema.prisma`? If so, did they provide a default value or handle existing data?
2. **Check the Action:** Does the new Server Action have `"use server"`?
3. **Check Authorization:** Does the UI hide the button based on `activeUser.role`? Does the Server Action double-check the role on the backend?
4. **Check the Audit Trail:** Is there a `recordAuditEvent` call for the mutation? Are the `before` and `after` states accurate?
5. **Check Revalidation:** Does the action call `revalidatePath()` to refresh the UI?
6. **Check N+1:** Are there any `await db...` calls inside a `.map()` or `for` loop? Reject if so.

---

## Doc 5: Debugging Guide
**How to trace bugs in this specific stack.**

1. **Symptom: The UI didn't update after I submitted a form.**
   - *Fix:* Check the Server Action in `src/app/actions.ts`. Did you forget `revalidatePath()`? Did you revalidate the *correct* path?
2. **Symptom: `Error: 'field' does not exist in type 'ModelCreateInput'` during `npm run build`.**
   - *Fix:* You are passing data from the UI that doesn't match the exact Prisma schema definition. Verify your payload mapping.
3. **Symptom: I'm getting a TypeScript error about `activeUser.role` not overlapping.**
   - *Fix:* You are experiencing Type Narrowing. If you already checked `if (role === 'Admin') return true`, the compiler knows `role` is no longer 'Admin' on the next line.
4. **Symptom: The Agent Run crashed.**
   - *Fix:* Check `src/packages/agents/core/orchestrator.ts`. The inputs provided to the agent likely don't match the expected `targetType`.

---

## Doc 6: Change Playbook
**How to safely add a feature end-to-end.**

1. **Database:** Update `prisma/schema.prisma` if necessary. Run `npm run db:push`.
2. **Domain:** Add any necessary pure business logic functions in `src/packages/domain/`.
3. **Action:** Create the Server Action in `src/app/actions.ts`. 
   - Fetch 'before' state.
   - Mutate DB.
   - Write Audit log.
   - Call `revalidatePath()`.
4. **UI:** Create or update the page in `src/app/`. Fetch the data in the RSC and render the form to trigger your new action.
5. **Test:** Run `npm run build` to ensure strict TypeScript and Next.js compilation succeeds.

---

## Doc 7: Interview Walkthrough
**How to explain this system out loud.**

*"I built an Agentic Education Operations platform. The architecture is a modern Next.js monolith utilizing React Server Components. We intentionally bypassed the traditional SPA/REST API pattern to reduce client-side complexity. Data is fetched securely on the server using Prisma ORM and SQLite, and UI mutations are handled via Next.js Server Actions.* 

*For scalability and maintainability, I abstracted cross-cutting concerns. For example, every mutation routes through a centralized auditing decorator that captures before/after JSON diffs for compliance. The core business logic—like teacher workload scoring and student risk analysis—is completely decoupled from the UI layer. Finally, the system includes a robust 'Agentic' orchestrator that simulates background heuristic processes, demonstrating asynchronous job execution and complex data aggregation."*
