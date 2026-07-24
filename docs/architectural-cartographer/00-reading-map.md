# 00: The Architectural Reading Map

## The Mental Model
This codebase is a **Server-First Next.js Monolith**. Forget about REST APIs, Redux, or client-side fetch waterfalls. The system is designed so that the server (Node.js) compiles the React components, fetches data directly from the SQLite database using Prisma, and ships fully formed HTML to the browser. Mutations happen via "Server Actions"—JavaScript functions that you can call directly from client-side forms, which execute entirely on the server. The entire platform acts as an integrated "Direct-to-Database UI."

## The Top 10 Files to Read

Read these files in this exact order to build your mental model layer by layer.

1. **`prisma/schema.prisma`**
   - **Why read it now:** Data is the foundation. You must understand the entities (User, Student, Course, ClassSection) before reading the UI that displays them.
   - **Understand before reading:** Basic relational database concepts (one-to-many, foreign keys).
   - **Explain after reading:** How is a `Teacher` related to a `ClassSection`? How does `Enrollment` act as a join table?
2. **`src/packages/shared/index.ts`**
   - **Why read it now:** Defines the core ubiquitous language and Role-Based Access Control (RBAC). 
   - **Understand before reading:** Basic TypeScript unions.
   - **Explain after reading:** What are the 7 `UserRole`s? How does `canPerformAction` determine if a Teacher can grade a submission?
3. **`src/packages/shared/auth.ts`**
   - **Why read it now:** Everything in the app depends on "who is making the request."
   - **Understand before reading:** HTTP Cookies.
   - **Explain after reading:** How does `getActiveUser` retrieve the session without a real auth provider? What happens if no cookie is found?
4. **`src/app/layout.tsx`**
   - **Why read it now:** The global wrapper for every single page in the application.
   - **Understand before reading:** React Server Components (RSCs) vs Client Components (`"use client"`).
   - **Explain after reading:** How does the navigation sidebar receive the `activeUser`? Where are global CSS variables injected?
5. **`src/app/students/[id]/page.tsx`**
   - **Why read it now:** The most complex and feature-rich read-only view in the app. It demonstrates massive relational data fetching.
   - **Understand before reading:** Next.js dynamic routing (`[id]`).
   - **Explain after reading:** How are `supportNotes` filtered based on the `activeUser.role`? Where does the data fetching happen?
6. **`src/app/actions.ts`**
   - **Why read it now:** This is the mutation engine. The "Backend Controller" of the app.
   - **Understand before reading:** Next.js Server Actions (`"use server"`).
   - **Explain after reading:** Walk through `dropStudentAction`. What three side effects happen after the database is updated?
7. **`src/packages/observability/audit.ts`**
   - **Why read it now:** Demonstrates how we handle cross-cutting concerns (telemetry) during mutations.
   - **Understand before reading:** JSON stringification and asynchronous operations.
   - **Explain after reading:** What exactly does `recordAuditEvent` save to the database? Why does it accept `before` and `after` objects?
8. **`src/packages/domain/rules/risk.ts`**
   - **Why read it now:** Shows where pure business logic lives, decoupled from React and Next.js.
   - **Understand before reading:** Pure functions.
   - **Explain after reading:** What combination of absences and grades triggers a "Critical" risk level?
9. **`src/packages/agents/core/orchestrator.ts`**
   - **Why read it now:** Introduces the mock "Agentic" workflows that run background analysis.
   - **Understand before reading:** Switch statements and asynchronous data aggregation.
   - **Explain after reading:** What inputs are gathered to run the `AtRiskStudentDetection` agent?
10. **`src/app/jobs/page.tsx`**
    - **Why read it now:** Shows how background job persistence is rendered to the user.
    - **Understand before reading:** Prisma `findMany` queries.
    - **Explain after reading:** How does the UI determine if a job has "Failed" vs "Succeeded"?

---

## The 3 Most Important Data Flows

1. **The Read Flow (Page Load):**
   Browser requests `/students/123` -> Next.js router invokes `StudentDetailPage` on the server -> Component calls `getActiveUser()` -> Component calls `db.student.findUniqueOrThrow()` -> Server renders HTML -> HTML sent to Browser.
2. **The Mutation Flow (Form Submit):**
   Browser clicks "Drop Student" button -> Form submits to `handleDrop` -> Next.js RPC calls `dropStudentAction` on server -> Action calls `db.enrollment.update()` -> Action calls `recordAuditEvent()` -> Action calls `revalidatePath('/students')` -> Next.js re-renders and pushes updated HTML to Browser.
3. **The Agent Flow (Background Analysis):**
   User clicks "Run Agent" -> Action creates `Pending` AgentRun in DB -> System reads relevant context data (e.g. grades, absences) -> Agent logic runs -> `AgentRun` DB record updated to `Succeeded` -> Audit log written.

---

## Pre-Reading Checklist (10 Questions)
Before diving deep into the code, ensure you can answer these domain questions:
- [ ] Do I understand the difference between a `Course` and a `ClassSection`?
- [ ] Do I know what an `Enrollment` represents?
- [ ] Can I define the 7 user roles in this system?
- [ ] Do I understand the difference between a `SupportNote` and an `InterventionPlan`?
- [ ] What is an "Agent Run" in the context of this platform?
- [ ] What does a React Server Component (RSC) do differently than a standard React component?
- [ ] What is a Next.js Server Action?
- [ ] Why do we use SQLite and Prisma for this application?
- [ ] What does `revalidatePath` do?
- [ ] How does CSS isolation work when we don't use Tailwind?

---

## Code Review Red Flags Checklist
When reading or reviewing code in this repository, aggressively look for these 8 red flags:
1. **Client-Side Data Fetching:** Are they using `useEffect` and `fetch` instead of fetching directly in the Server Component? (Red flag 🚩)
2. **Missing `use server`:** Is a mutation function missing the `"use server"` directive? (Red flag 🚩)
3. **Missing Authorization:** Does an action mutate data without verifying `canPerformAction` or checking the `activeUser.role`? (Red flag 🚩)
4. **Missing Audit Logs:** Does a database mutation occur without a corresponding `recordAuditEvent` call? (Red flag 🚩)
5. **No Revalidation:** Does a Server Action mutate data but forget to call `revalidatePath()`, resulting in stale UI? (Red flag 🚩)
6. **Hardcoded IDs:** Are they hardcoding user or student IDs instead of reading them from the session/context? (Red flag 🚩)
7. **N+1 Queries:** Is a loop running `db.submission.findUnique` inside a map instead of using a single `db.submission.findMany` with an `in` clause? (Red flag 🚩)
8. **Leaking Private Notes:** Is UI rendering `supportNotes` without filtering out `TeacherOnly` or `AdvisorOnly` notes based on the current user? (Red flag 🚩)
