# Mission Suite Design Journal

## Mission Design Rationale
Active learning is the only way to build real muscle memory. While the Architectural Cartographer suite provides the map, this suite forces the engineer to walk the terrain. The missions are designed to be short, highly constrained, and focused on specific files so the reader isn't overwhelmed by the entire monolith at once.

## Order of Missions
1. **Tier 1 (Junior):** Focuses entirely on tracing the "Happy Path" and understanding the basic building blocks (React Server Components, basic Prisma queries, simple TypeScript).
2. **Tier 2 (Mid-Level):** Shifts from reading to understanding *contracts* and *side effects*. Missions focus on Server Actions, RBAC type narrowing, Audit logging, and background job queuing.
3. **Tier 3 (Senior):** Shifts from understanding to *critique*. Missions focus on finding performance bottlenecks (N+1 queries), security holes (IDOR in `actions.ts`), and architectural inconsistencies.

## Code Paths Chosen & Why
- `src/app/students/[id]/page.tsx`: This is the perfect training ground because it contains almost every pattern in the app: massive Prisma `include` joins, strict RBAC array filtering, Server Component data fetching, and inline Server Action invocation.
- `src/app/actions.ts`: Used heavily in Tier 2 missions to teach side-effects. Tracing `dropStudentAction` perfectly demonstrates how a single UI click orchestrates a database update, an audit log insertion, a background job queue, and a cache revalidation.
- `src/packages/shared/index.ts`: Used in Tier 1 and Tier 2 to teach TypeScript unions and how pure function contracts (`canPerformAction`) define the system's security posture.

## What a Senior Engineer Does Differently at Checkpoints
When a Junior hits a checkpoint, they often just try to remember what they just read. When a Senior hits a checkpoint, they intuitively ask: "Wait, what if this fails?" or "Is there a race condition here?" The self-grading rubrics are designed to push Juniors toward that Senior-level skepticism. For example, when tracing the `dropStudentAction`, the rubric explicitly asks why the grade recalculation isn't done synchronously—pushing the engineer to think about performance and blocking operations.
