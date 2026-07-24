# Mission 25: Write the Docs That Don't Exist (Reference Artifacts)

These are workflow-focused action references—written for someone actively doing work in the codebase, not studying it.

---

## Doc 1: Junior Onboarding Checklist
**Day 1 Actions:**
- [ ] Run `npm install` and `npm run db:push`.
- [ ] Run `npm run db:seed` to get Maya Johnson's mock data.
- [ ] Spin up `npm run dev`. Verify `http://localhost:3000` loads the dashboard.
- [ ] Toggle the Active User dropdown in the top right. Switch between Admin, Teacher, and Student. Watch how the UI changes.

**First PR Checklist:**
- [ ] Did you use `"use client"` only when absolutely necessary (e.g., `onClick`)?
- [ ] Did you add `recordAuditEvent` to your Server Action?
- [ ] Did you call `revalidatePath` so the UI updates?

**Questions to Ask Your Mentor:**
- "How do I test my Server Actions without a full UI?"
- "Where should I put business logic that doesn't fit in `domain/`?"

---

## Doc 2: Architecture Guide for New Engineers
**How to navigate, not just understand.**

- **Need to change a UI layout?** Look in `src/app/`. Folders map exactly to URLs.
- **Need to change a button click behavior?** The button is in `src/app/`, but the function it calls is in `src/app/actions.ts`.
- **Need to change a grade formula?** Go to `src/packages/domain/rules/grades.ts`.
- **Need to see what the AI Agent sees?** Go to `src/packages/agents/core/orchestrator.ts`.
- **Need to add a database column?** Open `prisma/schema.prisma`. Remember to run `npm run db:push` afterwards.

---

## Doc 3: Code Review Checklist
**A reviewer's action list.**

- [ ] **Security:** Does the Server Action trust the client ID payload, or does it call `getActiveUser()`?
- [ ] **Data Fetching:** Are there any `fetch()` calls in components? Reject. They should use direct Prisma calls in Server Components.
- [ ] **Performance:** Is there a `for` loop executing `await db...`? Reject. Request a bulk `findMany` using an `in` array.
- [ ] **Compliance:** Did they mutate a record without firing `recordAuditEvent`? Reject.
- [ ] **UX:** Did they forget `revalidatePath`? Reject. The UI will be stale.

---

## Doc 4: Debugging Playbook
**Step-by-step for the most likely failure modes.**

1. **"The UI is showing old data."**
   - *Action:* Check the Server Action. You forgot `revalidatePath('/path/to/page')`.
2. **"Prisma says 'field does not exist in type'."**
   - *Action:* Your UI form payload does not match the database schema. Check `schema.prisma`.
3. **"TypeScript says role has no overlap."**
   - *Action:* You hit a type narrowing trap. If you returned early on a condition, TypeScript removes that type from the union for subsequent checks.
4. **"The agent run says Pending forever."**
   - *Action:* Check the background job runner logs. The orchestrator might have thrown a silent error.

---

## Doc 5: Change Playbook
**Branch → implement → test → review → merge workflow.**

1. **Branch:** `git checkout -b feature/your-feature`.
2. **Schema:** Modify `schema.prisma` if needed. Run `db:push`.
3. **Action:** Write the Server Action in `actions.ts`. Add your `canPerformAction` check, your `db.update`, your `recordAuditEvent`, and your `revalidatePath`.
4. **UI:** Modify the `page.tsx`. Pass the new data down.
5. **Test:** Run `npm run build`. If TypeScript and Next.js compiler pass, you are 95% good. 
6. **Review:** Request review. Ensure your PR description mentions exactly what you are revalidating.
7. **Merge.**

---

## Doc 6: Senior Ownership Notes
**What to monitor, what to improve, what to leave alone.**

- **Monitor:** The size of `src/app/actions.ts`. It will become unmaintainable soon. Plan to split it by domain (e.g., `actions/studentActions.ts`, `actions/teacherActions.ts`).
- **Improve:** Implement Zod schemas for all Server Action payloads. Currently, we rely purely on Prisma throwing errors.
- **Leave Alone:** The SQLite database. It is perfectly fine for this learning/operations scope. Do not prematurely optimize by migrating to PostgreSQL until necessary.

---

## Doc 7: Interview Walkthrough
**Practice answers for "walk me through a system you built".**

*"I contributed to an Agentic Education Operations platform. My key contribution was adopting a Server-First architecture using Next.js App Router and React Server Components. This allowed us to eliminate the traditional REST API layer and Redux state management, directly querying our SQLite database securely on the server.*

*I'm particularly proud of how we handled side-effects. Instead of relying on client-side triggers, every mutation went through a strictly typed Server Action. This action guaranteed atomicity: it performed the database update, queued a background job for heavy math recalculations, injected an audit log for compliance, and then revalidated the cache so the user's UI updated seamlessly."*
