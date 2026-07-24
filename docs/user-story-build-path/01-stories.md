# User Stories

## Story 1: Display Course Grade Level in Catalog
**Difficulty:** Easy
**Estimated Time:** 0.5 hours
**Skills You'll Practice:** React Server Components, JSX rendering

**The Story:** As an Administrator, I want to see the target Grade Level for each course in the catalog so that I know which students should be enrolling.

**Acceptance Criteria:**
- [ ] The `/courses` page displays the `gradeLevel` field next to the `subject` pill on each course card.
- [ ] If a course does not have a `gradeLevel`, it gracefully defaults to "All Grades".

**Files You'll Likely Touch:**
- `src/app/courses/page.tsx`: The UI for the course catalog.

**High-Level Implementation Plan:**
1. Open `src/app/courses/page.tsx`.
2. Locate the `.map()` function rendering each `c` (Course).
3. Find the `<div>` displaying `c.subject`. Add a sibling `<span>` or `<div>` that displays `c.gradeLevel || 'All Grades'`.

**Tips:**
- Look at how `c.subject` is styled using inline styles and CSS variables (e.g., `var(--color-primary-light)`). Try to match the visual language.

**What Could Go Wrong:**
- You might try to add `gradeLevel` to the `course` query, but it is already being fetched because Prisma `findMany` fetches all scalar fields by default.

**Stretch Goal:** Make the Grade Level pill a different color depending on the level (e.g., green for High School, blue for Middle School).
**Connects To:** Story 2, where you will mutate data.

---

## Story 2: Soft-Delete a Class Section
**Difficulty:** Easy
**Estimated Time:** 1 hour
**Skills You'll Practice:** Server Actions, Prisma mutations, Revalidation

**The Story:** As a School Manager, I want to cancel (soft-delete) a class section so that it no longer shows up as Active, but retains historical records.

**Acceptance Criteria:**
- [ ] A "Cancel Section" button exists on the `/sections/[id]` detail page.
- [ ] Clicking the button changes the section's status to `Cancelled` in the database.
- [ ] An Audit Event is recorded for the action.
- [ ] The UI immediately reflects the new status.

**Files You'll Likely Touch:**
- `src/app/sections/[id]/page.tsx`: To add the button.
- `src/app/actions.ts`: To write the mutation logic.

**High-Level Implementation Plan:**
1. Open `src/app/actions.ts` and write a new async function `cancelSectionAction(sectionId: string, actorId: string)`.
2. Inside the action, fetch the before state, update the DB status to `Cancelled`, write the audit event, and revalidate the path `/sections/[id]`.
3. Open `src/app/sections/[id]/page.tsx`, import your new action, and create an inline `handleCancel` function tied to a button.

**Tips:**
- Use the `dropStudentAction` as your template for the Server Action structure.
- Remember to import `revalidatePath`.

**What Could Go Wrong:**
- Forgetting `revalidatePath` means clicking the button will appear to do nothing.

**Stretch Goal:** Hide the "Cancel" button if the section is already cancelled.
**Connects To:** Story 4, adding UI that aggregates data.

---

## Story 3: Add "Parent" to Support Note Visibility Options
**Difficulty:** Easy
**Estimated Time:** 1 hour
**Skills You'll Practice:** TypeScript Union Types, Form inputs, RBAC

**The Story:** As a Teacher, I want to write support notes that are visible to Parents, so I can communicate behavior issues home.

**Acceptance Criteria:**
- [ ] The "Visibility" dropdown when creating a note includes a "ParentOnly" option.
- [ ] If the active user has the role `Parent`, they can see `ParentOnly` notes.
- [ ] `ParentOnly` notes are hidden from `Student` roles.

**Files You'll Likely Touch:**
- `src/packages/shared/index.ts`: To update the `NoteVisibility` TypeScript type.
- `src/app/students/[id]/page.tsx`: To update the form dropdown and the RBAC filtering logic.

**High-Level Implementation Plan:**
1. Add `'ParentOnly'` to the relevant TypeScript types. (Note: you may need to update the Prisma schema if `NoteVisibility` is an Enum in the database! Check `schema.prisma` first).
2. Update the `<select>` in `src/app/students/[id]/page.tsx`.
3. Update the `visibleNotes` array filter to allow `ParentOnly` if `activeUser.role === 'Parent'`.

**Tips:**
- Remember that `Admin` should probably also be able to see `ParentOnly` notes.

**What Could Go Wrong:**
- If the visibility is a Prisma Enum, you must update `schema.prisma` and run `npm run db:push` before writing code.

**Connects To:** Story 6, requiring new backend endpoints.

---

## Story 4: Teacher Dashboard Roster Count
**Difficulty:** Medium-Easy
**Estimated Time:** 1.5 hours
**Skills You'll Practice:** Prisma relation aggregations (count)

**The Story:** As a Teacher, I want to see the total number of unique students I teach across all my sections on the `/teachers` page.

**Acceptance Criteria:**
- [ ] The Teacher card displays "Total Unique Students: X".
- [ ] The number accurately counts students, without double-counting a student who is enrolled in two of the teacher's sections.

**Files You'll Likely Touch:**
- `src/app/teachers/page.tsx`: The data fetching happens at the top of the file.

**High-Level Implementation Plan:**
1. In the `page.tsx` data fetch, you are already fetching teachers and their sections.
2. Modify the Prisma query to fetch the enrollments within those sections.
3. In memory, extract all `studentId`s from the teacher's enrollments. Put them in a `Set` to remove duplicates. Render the size of the set.

**Tips:**
- Doing the unique count in JS/TS memory using a `Set` is often easier than writing a highly complex Prisma `groupBy` or raw SQL query for this specific use case.

**What Could Go Wrong:**
- Forgetting to `include: { enrollments: true }` in the nested `sections` relation will leave you without the data needed to count.

**Connects To:** Story 5.

---

## Story 5: Student Absences Warning Flag
**Difficulty:** Medium-Easy
**Estimated Time:** 1.5 hours
**Skills You'll Practice:** Business rule integration

**The Story:** As an Advisor, I want a visual warning flag on a student's profile if they have more than 5 total absences across all classes.

**Acceptance Criteria:**
- [ ] The Student Detail page aggregates the `absences` field across all the student's enrollments.
- [ ] If the total is > 5, a red "High Absences" warning badge appears at the top of the page.

**Files You'll Likely Touch:**
- `src/app/students/[id]/page.tsx`: To sum the absences and render the badge.

**High-Level Implementation Plan:**
1. After fetching the `student` and their `enrollments`, write a simple `reduce` function to sum `enrollment.absences`.
2. Conditionally render a warning badge if the sum > 5.

**Tips:**
- Do not modify the database. The `absences` data is already on the `Enrollment` model.

**Stretch Goal:** Abstract the threshold (5) into `src/packages/domain/rules/risk.ts`.

---

## Story 6: Toggle Assignment Submission Status
**Difficulty:** Medium
**Estimated Time:** 2 hours
**Skills You'll Practice:** Full-stack mutation lifecycle

**The Story:** As a Teacher, I want a button next to an assignment submission to toggle it between "Graded" and "Needs Grading" so I can mark things I want to review again.

**Acceptance Criteria:**
- [ ] A button appears next to each submission in the UI.
- [ ] Clicking it changes the database status.
- [ ] The UI updates immediately.
- [ ] An audit event is recorded.

**Files You'll Likely Touch:**
- `src/app/actions.ts`: Create the `toggleSubmissionStatus` action.
- `src/app/students/[id]/page.tsx`: Add the button to the UI where submissions are rendered.

**High-Level Implementation Plan:**
1. Write the server action. It needs `submissionId` and `actorId`.
2. Fetch the current submission to find its current status.
3. Update the database to the opposite status. Write audit log. `revalidatePath`.
4. Add the form and submit button to the UI.

**Tips:**
- Use the `<input type="hidden">` trick to pass the `submissionId` inside the `<form action={...}>`.

**What Could Go Wrong:**
- You might try to fetch the data in the client using `onClick`. Stick to the `<form action={...}>` pattern used elsewhere in the codebase.

**Connects To:** Story 8.

---

## Story 7: "My Interventions" Filter
**Difficulty:** Medium
**Estimated Time:** 2 hours
**Skills You'll Practice:** URL Search Parameters, Next.js dynamic routing

**The Story:** As an Advisor, I want to click a button on the `/interventions` page to only see Intervention Plans assigned to me, rather than all active plans.

**Acceptance Criteria:**
- [ ] A toggle link/button exists for "All Plans" vs "My Plans".
- [ ] The URL updates to `?filter=mine` when clicked.
- [ ] The server component reads the search parameter and filters the Prisma query accordingly using `activeUser.profileId`.

**Files You'll Likely Touch:**
- `src/app/interventions/page.tsx`: To read `searchParams` and modify the Prisma `where` clause.

**High-Level Implementation Plan:**
1. Update the signature of `InterventionsPage` to accept `{ searchParams }: { searchParams: { filter?: string } }`.
2. Modify the Prisma query: if `filter === 'mine'`, add `advisorId: activeUser.profileId` to the `where` clause.
3. Add `<Link href="?filter=mine">` to the UI.

**Tips:**
- Next.js Server Components accept `searchParams` as a prop out of the box.

**What Could Go Wrong:**
- If you use `onClick` and `router.push`, you have to turn the page into a `"use client"` component. Use an HTML `<a>` or Next.js `<Link>` instead to keep it a Server Component.

---

## Story 8: Add "Notes" field to Enrollments
**Difficulty:** Hard
**Estimated Time:** 3 hours
**Skills You'll Practice:** Prisma Schema modifications, DB Migrations

**The Story:** As an Administrator, I want to add an internal note to a student's specific enrollment record (e.g., "Student requested to sit in front row"). 

**Acceptance Criteria:**
- [ ] The `Enrollment` database table has a new `notes` column (optional string).
- [ ] The UI allows editing this note.
- [ ] The note is saved and displayed persistently.

**Files You'll Likely Touch:**
- `prisma/schema.prisma`: Add the field.
- `src/app/actions.ts`: Create an `updateEnrollmentNote` action.
- `src/app/students/[id]/page.tsx`: Add a text input and save button.

**High-Level Implementation Plan:**
1. Open `schema.prisma`. Add `notes String?` to `model Enrollment`.
2. Run `npm run db:push` in the terminal to update the local database.
3. Write the server action to update it.
4. Add the UI form.

**Tips:**
- Whenever you change `schema.prisma`, you must restart the `npm run dev` server for Prisma Client to pick up the new types.

**What Could Go Wrong:**
- If you make the field required (`String` instead of `String?`), `db:push` will fail because existing records won't have a value.

---

## Story 9: Enforce Backend RBAC in Server Actions
**Difficulty:** Hard
**Estimated Time:** 4 hours
**Skills You'll Practice:** Security fortification, Code refactoring

**The Story:** As a Security Engineer, I want to ensure that no Server Action trusts the client. All actions must verify the `activeUser` session and use `canPerformAction` before mutating data.

**Acceptance Criteria:**
- [ ] `dropStudentAction` calls `getActiveUser()`.
- [ ] `createSupportNoteAction` calls `getActiveUser()`.
- [ ] Remove `actorId` and `authorId` from the action parameters, as they are no longer needed from the client.
- [ ] Throw an `Error("Unauthorized")` if the user lacks the correct role.

**Files You'll Likely Touch:**
- `src/app/actions.ts`: Refactor the actions.
- `src/app/students/[id]/page.tsx`: Update the form bindings to no longer pass the `actorId`.

**High-Level Implementation Plan:**
1. Go through `actions.ts`. For every mutation, add `const session = await getActiveUser();`.
2. Check `canPerformAction(session.role, 'action.name')`.
3. Use `session.id` in place of any passed-in `actorId`.
4. Fix the UI components that were previously passing `activeUser.id` as arguments.

**Tips:**
- This is a critical refactor. Do one action at a time and manually test it.

---

## Story 10: Build a "Low Attendance" Agent
**Difficulty:** Expert
**Estimated Time:** 6+ hours
**Skills You'll Practice:** Asynchronous orchestrators, Agentic workflows

**The Story:** As a School Manager, I want a new Agent that analyzes a student's total absences. If absences > 10, it should automatically create a "High Absences" Support Note and open an Intervention Plan.

**Acceptance Criteria:**
- [ ] A new `AgentType` exists: `LowAttendanceDetection`.
- [ ] When the agent runs, it aggregates absences for the target student.
- [ ] It creates a `SupportNote` (Visibility: Shared) mentioning the absences.
- [ ] It creates an `InterventionPlan` assigned to the first available Advisor.
- [ ] The agent is integrated into `src/packages/agents/core/orchestrator.ts`.

**Files You'll Likely Touch:**
- `src/packages/agents/core/orchestrator.ts`: Add the new switch case.
- `prisma/schema.prisma`: Add the new `AgentType` if it is an Enum.

**High-Level Implementation Plan:**
1. Define the new Agent type.
2. Inside the orchestrator, add a `case 'LowAttendanceDetection':`.
3. Fetch the student and their enrollments.
4. Sum the absences.
5. If > 10, use `db.supportNote.create` and `db.interventionPlan.create`.
6. Update the `AgentRun` status to `Succeeded`.

**Tips:**
- Look at the `AtRiskStudentDetection` logic as your template.
- Make sure you handle the case where absences are < 10 (the agent should just Succeed without doing anything, or add a trace message saying "Student attendance is acceptable").
