# 03: Senior Engineer Ownership Guide

As a senior engineer, your job is not just to understand the code, but to own its quality, security, performance, and evolution. This guide shifts from reading to critique.

## Architectural Critique

| Area | Score (1-5) | Critique |
| :--- | :---: | :--- |
| **Scalability** | 3/5 | Relies heavily on SQLite and massive Prisma `include` joins (e.g., fetching a student, their enrollments, courses, teachers, and submissions in one query). Fine for a school; will bottleneck at district scale without pagination or caching. |
| **TypeScript Discipline** | 4/5 | Strong use of Prisma generated types and strict compiler checks. The use of Type Narrowing for RBAC is clever but brittle if modified by juniors without care. |
| **Separation of Concerns** | 2/5 | `src/app/actions.ts` is a god-file. UI routes define inline data-fetching requirements. Business rules are mostly abstracted to `domain/`, which is good, but controllers are bloated. |
| **Testability** | 2/5 | RSCs and inline database calls make unit testing UI nearly impossible without complex mocking. Business logic in `domain/` is highly testable, but `actions.ts` is not. |
| **Security Posture** | 3/5 | RBAC is enforced in UI rendering (hiding buttons), but `actions.ts` lacks consistent backend validation using `canPerformAction` before mutating data. This is an Insecure Direct Object Reference (IDOR) vulnerability waiting to happen. |

## Security Audit: The IDOR Vulnerability
**Finding:** Server actions trust the client to provide authorized IDs.
Look at `createSupportNoteAction` in `src/app/actions.ts`. It accepts `authorId`. A malicious user could intercept the network request and change `authorId` to the principal's ID, forging a note.

**Correction Snippet:**
Never trust the client for session data.
```typescript
// BAD
export async function createSupportNoteAction(payload: { authorId: string, content: string }) { ... }

// GOOD
export async function createSupportNoteAction(payload: { content: string }) {
  const activeSession = await getActiveUser(); // ALWAYS verify on the server
  if (!['Teacher', 'Advisor', 'Admin'].includes(activeSession.role)) throw new Error("Unauthorized");
  
  await db.supportNote.create({
    data: { authorId: activeSession.id, content: payload.content }
  });
}
```

## Performance Audit: N+1 Queries
**Finding:** In `src/app/teachers/page.tsx`, the code loops over every student to calculate at-risk counts, executing a database query *inside* a `for` loop.
```typescript
// Current code (Lines 82-86)
for (const stuId of studentIds) {
  const submissions = await db.submission.findMany({
    where: { studentId: stuId },
    include: { assignment: true },
  });
  // ... calculates grade
}
```
**Correction Snippet:**
Fetch all submissions for all students in one query, then group in memory.
```typescript
const allSubmissions = await db.submission.findMany({
  where: { studentId: { in: studentIds } },
  include: { assignment: true },
});

// Group by studentId in memory, reducing DB round-trips from O(N) to O(1)
```

## Bug Injection Challenge
Here are 5 realistic bugs. Diagnose the root cause without modifying production code.

1. **Symptom:** A teacher clicks "Waitlist Student", the page reloads, but the student doesn't appear on the waitlist until the teacher manually hits F5.
   *Scenario:* UI is stale after mutation.
2. **Symptom:** In the Teacher Workload dashboard, a teacher on leave with 0 active sections has a "Critically Overloaded" score.
   *Scenario:* Math/Logic error in workload rules.
3. **Symptom:** The `TeacherWorkloadInsight` agent crashes with `Error: Agent [TeacherWorkloadInsight] expects target Teacher, got [Student]`.
   *Scenario:* Target type mismatch during orchestrator routing.
4. **Symptom:** A parent views the student details page and sees an `AdminOnly` support note.
   *Scenario:* Flawed RBAC visibility filter narrowing.
5. **Symptom:** `npm run build` fails with `Type error: 'creditHours' does not exist in type 'CourseCreateInput'`.
   *Scenario:* UI payload mapping does not match the Prisma Schema contract.

## "If I Owned This Codebase" Refactor Plan

1. **Implement a Service Layer (Effort: Medium, Impact: High)**
   - Move database interactions out of `src/app/actions.ts` into `src/packages/services/`. This isolates Next.js Server Actions to just request parsing and response handling.
2. **Enforce Backend RBAC (Effort: Medium, Impact: Critical)**
   - Wrap every Server Action with a permission check utilizing `canPerformAction` to close IDOR vulnerabilities.
3. **Paginate Roster Views (Effort: Low, Impact: High)**
   - Add `take` and `skip` to `db.student.findMany()` in `/students`. A school with 5,000 students will crash the current page load.
4. **Centralize UI State Validation (Effort: Medium, Impact: Medium)**
   - Implement `zod` schemas for form validation before invoking Server Actions. Currently, the database constraints are the only validation layer.
