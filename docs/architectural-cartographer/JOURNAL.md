# Architectural Cartographer's Journal

## First-Pass Mental Model
This application is a monolith designed specifically to leverage the Next.js App Router and React Server Components (RSCs). It completely bypasses traditional separate frontend/backend paradigms. 
The mental model here is **"Direct-to-Database UIs"**. There is no REST API or GraphQL layer. The UI components directly query the database via Prisma (`src/packages/db`), and mutations occur via Next.js Server Actions (`src/app/actions.ts`). Cross-cutting concerns like audit logging and access control (RBAC) are interwoven directly into the server actions and page loaders rather than sitting in traditional middleware.

## Inspection Discoveries
1. **Server Actions as the API:** The `src/app/actions.ts` file acts as a massive controller. Every major mutation (enrollment, grading, agent running) goes through here.
2. **Missing Custom Hooks:** Because the application heavily uses RSCs, there is almost no client-side state (`useState`, `useEffect`) and therefore no custom React hooks. Data is fetched server-side and passed down. This is an intentional architectural choice to reduce client bundle size, but it makes the application feel foreign to engineers used to Single Page Applications (SPAs).
3. **The Agentic Layer:** `src/packages/agents/core/orchestrator.ts` represents a complex business logic layer that simulates long-running or intelligent processes. It is deeply tied to the domain and intercepts multiple data points before mutating the database.
4. **RBAC via Server-Side Narrowing:** Role-Based Access Control is enforced directly inside component render logic and server actions using simple type narrowing and boolean checks (e.g., `src/packages/shared/index.ts` -> `canPerformAction`).

## Why Teaching Anchors Were Chosen
- **`src/app/page.tsx` & `src/app/students/[id]/page.tsx`:** I chose these to demonstrate how RSCs fetch massive amounts of related data (using Prisma `include`) and render it without loading spinners or client-side fetch waterfalls. 
- **`src/app/actions.ts`:** This file is the single source of truth for mutations. Tracing `dropStudentAction` perfectly illustrates the "Action -> DB -> Audit -> Revalidate" cycle that powers the entire app.
- **`src/packages/shared/auth.ts`:** Chosen because understanding how the `getActiveUser` function mocks session state is critical to understanding how the rest of the application handles permissions.

## Cognitive Load & Friction Points
- **Where a Junior gets confused:** They will look for `fetch()` calls or `axios` instances. They will be confused by `revalidatePath()` and how the page magically updates after a form submission without Redux or React Context.
- **Where a Mid-Level slows down:** The lack of a formalized service layer. Business rules are split between `src/packages/domain/` and directly inside `src/app/actions.ts`. They will need to adjust to putting business logic closer to the edge rather than in abstracted services.
- **Where a Senior gets skeptical:** The lack of strict middleware for authorization (auth is manually checked in every page/action), the monolithic `actions.ts` file which violates Single Responsibility Principle, and the coupling of UI routing with data fetching.

## Using Checkpoints for Self-Study
The checkpoints in this suite are specifically designed to test *tracing capability* and *architectural deduction*. They force the reader to open the codebase and verify assumptions rather than relying solely on the written text.
