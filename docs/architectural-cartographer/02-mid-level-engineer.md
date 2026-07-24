# 02: Mid-Level Engineer Guide

Now that you understand the basic routing and mutations, we need to dive into system design, state management, and full-stack tracing.

## Full-Stack Architecture

```text
+-----------------------------------------------------------------------------------+
|                            NEXT.JS SERVER (Node.js)                               |
|                                                                                   |
|  +-----------------------+           +-----------------------------------------+  |
|  |    ROUTING LAYER      |           |           MUTATION LAYER                |  |
|  | (/src/app/page.tsx)   |           | (/src/app/actions.ts)                   |  |
|  |                       |           |                                         |  |
|  | 1. Checks Auth Cookie |           | 1. Form Action Triggered                |  |
|  | 2. Fetches Data       |           | 2. Executes Business Logic              |  |
|  | 3. Applies RBAC       |           | 3. Mutates Database                     |  |
|  | 4. Renders HTML       |           | 4. Triggers Audit Log / Background Job  |  |
|  +----------+------------+           | 5. Calls revalidatePath()               |  |
|             |                        +-------------------+---------------------+  |
|             v                                            |                        |
|  +-------------------------------------------------------v---------------------+  |
|  |                      PRISMA ORM (/src/packages/db)                          |  |
|  +---------------------------------------+-------------------------------------+  |
|                                          |                                        |
+------------------------------------------|----------------------------------------+
                                           |
                                           v
                             +---------------------------+
                             |    SQLite DATABASE        |
                             |       (dev.db)            |
                             +---------------------------+
```

## TypeScript Discipline & RBAC
In this app, we rely on TypeScript's control flow analysis (type narrowing) to enforce Role-Based Access Control (RBAC). Look at this exact block from `src/app/students/[id]/page.tsx` (Lines 67-74):

```typescript
  // 3. Strict RBAC filter for Support Notes visibility!
  const visibleNotes = student.supportNotes.filter((note) => {
    if (note.visibility === 'Shared') return true;
    if (activeUser.role === 'Admin' || activeUser.role === 'SchoolManager') return true;
    
    if (note.visibility === 'TeacherOnly' && activeUser.role === 'Teacher') return true;
    if (note.visibility === 'AdvisorOnly' && activeUser.role === 'Advisor') return true;
    if (note.visibility === 'AdminOnly' && (activeUser.role as string) === 'Admin') return true;
    return false;
  });
```

Notice the cast `(activeUser.role as string) === 'Admin'`. Why is this necessary? Because on the second line, we return if the role is 'Admin'. TypeScript is so smart that by the time execution reaches the 'AdminOnly' check, it *knows* `activeUser.role` can no longer be 'Admin'. This type narrowing is powerful but requires discipline to read correctly.

## State Management (The Missing Piece)
Where is `useState`? Where is Redux?
**There is no client-side state management for domain data.**
In traditional SPAs, you fetch data from an API and store it in Redux. Here, the "State" is simply the SQLite database. Next.js fetches the exact data required for the page directly from the DB on the server, renders the HTML, and sends it to the client. If data changes via an Action, `revalidatePath()` tells Next.js to re-run the server component and push fresh HTML. 

The only "global state" is the user session, which is stored in a cookie and resolved on every server request via `getActiveUser()`.

## Full-Stack Feature Trace: Dropping a Student
Let's trace exactly what happens when a user clicks "Drop" on a student's enrollment.

1. **UI (Client Interaction):** In `src/app/students/[id]/page.tsx`, the user clicks the Drop button. This submits a form mapped to the inline `handleDrop` function.
2. **Server RPC:** `handleDrop` executes on the server and calls `dropStudentAction(enrollId, activeUser.id)` inside `src/app/actions.ts`.
3. **Database Mutation:** The action calls `db.enrollment.update(...)` to change the status to 'Dropped'.
4. **Side Effect 1 (Audit):** The action calls `recordAuditEvent(...)` passing the `before` and `after` database record objects.
5. **Side Effect 2 (Job Queue):** The action queues a background job to recalculate the class section's average grade since the roster changed.
6. **Response / UI Update:** The action calls `revalidatePath('/students')`. The server re-runs the SQL queries for the students page, generates new HTML, and the browser seamlessly updates the DOM without a full page reload.

## Reading Diffs Like an Engineer
Imagine a PR that modifies the `Course` creation action to include `creditHours`.
```diff
-        credits,
+        subject: 'General',
+        gradeLevel: 'High School',
+        creditHours: credits,
+        status: 'Active',
```
**The Mid-Level Read:** Why did the author add `subject`, `gradeLevel`, and `status`? They must be required fields in `prisma/schema.prisma` without default values. If they weren't included, Prisma would throw a runtime error. This tells you the author is mapping UI concepts (credits) directly to strict database models (`creditHours`).

## Socratic Checkpoint 2

1. Draw the data flow of clicking "Complete Case" on the Interventions page. What functions run, and in what order?
2. If `activeUser.role` is 'Teacher', what happens on line 69 of the `visibleNotes` filter? Does it return true or false?
3. Why don't we use Redux to store the list of students?
4. What prevents a 'Viewer' role from creating a new course?
5. How does the database schema enforce that an `Enrollment` is deleted if the associated `ClassSection` is deleted? (Hint: Look at `prisma/schema.prisma`).
6. If `revalidatePath` fails, what is the user-visible symptom?
7. Where does the `recordAuditEvent` data actually go?
8. In the `dropStudentAction`, why is the grade recalculation queued as a background job instead of calculated synchronously?

### How to self-grade:
1. **Data Flow:** Form submit -> `completePlanAction` (inline) -> calls `db.interventionPlan.update` -> calls `recordAuditEvent` -> calls `revalidatePath('/interventions')`.
2. **TypeScript Control Flow:** It evaluates to false, and execution continues to the next lines.
3. **State:** The data lives in the database. RSCs fetch it on demand. Redux would duplicate state, increase client bundle size, and require complex synchronization APIs.
4. **RBAC:** In `src/app/courses/page.tsx`, the UI panel for creation is wrapped in `if (['Admin', 'SchoolManager'].includes(activeUser.role))`. Furthermore, the server action should ideally use `canPerformAction` to validate the backend request.
5. **Referential Integrity:** In the schema, the relation uses `onDelete: Cascade`.
6. **Stale UI:** The database updates, but the user's screen still shows the old data until they hit F5.
7. **Audit Trails:** It is written to the `AuditEvent` table in the SQLite database.
8. **Performance:** Recalculating averages requires fetching all submissions for all students in the section. Doing this synchronously would block the HTTP response and make the UI feel slow to the user clicking "Drop".
