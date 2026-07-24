# 01: Junior Engineer Orientation

Welcome to the team. This guide will get you oriented, set up locally, and walking through your first component and backend action.

## Local Environment Setup
To run this project locally, you need Node.js and npm installed.

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Initialize the Database:**
   This project uses SQLite for ease of local development. Push the Prisma schema to the database:
   ```bash
   npm run db:push
   ```
3. **Seed the Database:**
   Populate the database with realistic educational mock data (Students, Teachers, Enrollments):
   ```bash
   npm run db:seed
   ```
4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

*Note: Environment variables are not strictly required out-of-the-box because the SQLite database URL (`file:./dev.db`) is hardcoded in the `prisma/schema.prisma` file.*

## Folder Orientation

### Top-Level Folders
- `/src/app`: The Next.js App Router. Every folder inside here represents a URL route (e.g., `/src/app/students` is the `localhost:3000/students` route). This is where all UI lives.
- `/src/packages`: The core business logic, database setup, and shared utilities. This is where the "brains" of the application live, entirely decoupled from Next.js routing.
- `/prisma`: Contains the database schema (`schema.prisma`) and the seed script (`seed.ts`).

### Deep Dive: `/src/app`
- **`/app/students`:** Contains the student roster and the complex student detail view.
- **`/app/components`:** Reusable UI elements (like the `SwitcherLink.tsx`).
- **`/app/actions.ts`:** The central hub for all server-side mutations (creating, updating, deleting data).

### Deep Dive: `/src/packages`
- **`/packages/db`:** Initializes the Prisma ORM client. 
- **`/packages/domain`:** Contains pure business logic. If you need to know how a grade is calculated, look here (`rules/grades.ts`).
- **`/packages/shared`:** Contains authorization logic (`auth.ts`) and TypeScript interfaces.

## Domain Glossary
- **Course:** The syllabus or curriculum template (e.g., "Algebra 101").
- **ClassSection:** A specific instance of a Course, taught by a specific Teacher, at a specific time, in a specific room (e.g., "Algebra 101 - Fall - Room 4B").
- **Enrollment:** The join record linking a Student to a ClassSection.
- **SupportNote:** An observational log written by a teacher or advisor about a student. Has strict visibility rules.
- **InterventionPlan:** A formal, actionable plan to help a struggling student, assigned to an Advisor.
- **Agent:** A simulated AI/heuristic process that runs in the background to analyze data (e.g., "At-Risk Student Detection Agent").

## Anatomy of a Simple Component
Let's look at a simple, reusable component: `SwitcherLink.tsx`.

```tsx
// src/app/components/SwitcherLink.tsx

'use client'; // This directive tells Next.js this component runs in the browser, allowing interactivity like onClick.

import React, { useTransition } from 'react';
import { setActiveUserCookie } from '@/shared/auth';
import { useRouter } from 'next/navigation';

export function SwitcherLink({ userId, name, role, isActive }: { userId: string, name: string, role: string, isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // This is the click handler. It calls a server action to update the cookie.
  const handleSwitch = () => {
    startTransition(async () => {
      await setActiveUserCookie(userId); // Updates the session cookie on the server
      router.refresh(); // Forces Next.js to reload the page data with the new user session
    });
  };

  return (
    <button 
      onClick={handleSwitch}
      disabled={isPending}
      className={`dropdown-item ${isActive ? 'active' : ''}`}
    >
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{role}</div>
    </button>
  );
}
```

## Anatomy of a Server Action (Backend Route)
This is how we mutate data. Look at `dropStudentAction` in `src/app/actions.ts`.

```typescript
// src/app/actions.ts

'use server'; // This directive exposes all exported functions in this file as secure POST endpoints.

import { db } from '@/db';
import { recordAuditEvent } from '@/observability/audit';
import { revalidatePath } from 'next/cache';

// The function receives raw arguments. No req/res objects!
export async function dropStudentAction(enrollmentId: string, actorId: string) {
  
  // 1. Fetch the "before" state for the audit log
  const before = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });

  // 2. Perform the database mutation
  const enrollment = await db.enrollment.update({
    where: { id: enrollmentId },
    data: { status: 'Dropped', droppedAt: new Date() },
    include: { classSection: true },
  });

  // 3. Write the audit log
  await recordAuditEvent({
    actorId,
    action: 'enrollment.drop',
    entityType: 'Enrollment',
    entityId: enrollmentId,
    before,
    after: enrollment,
  });

  // 4. Force Next.js to clear the cache for the students page so the UI updates
  revalidatePath('/students');
}
```

## Socratic Checkpoint 1

1. If you wanted to change the formula for how a student's risk level is calculated, which folder would you look in?
2. Why does `SwitcherLink.tsx` have `'use client'` at the top?
3. What happens if you forget to call `revalidatePath('/students')` at the end of a Server Action?
4. In the `dropStudentAction`, why do we fetch the enrollment (`findUniqueOrThrow`) before updating it?
5. How is a `Course` different from a `ClassSection`?
6. If you wanted to add a new page at `localhost:3000/reports`, where would you create the file?
7. How do you reset the database and start fresh locally?

### How to self-grade:
1. **Domain logic location:** You should look in `src/packages/domain/rules/`. Specifically, `risk.ts`.
2. **Client Components:** It uses interactive browser features (`onClick`, `useTransition`, `useRouter`) which are not available in Server Components.
3. **Revalidation:** The database will update, but the UI will not reflect the change until the user manually refreshes the browser, leading to a confusing user experience.
4. **Audit Trails:** We need the "before" state to save in the audit log so we can see exactly what changed during the mutation.
5. **Domain Definitions:** A `Course` is the syllabus (e.g., Algebra). A `ClassSection` is the actual scheduled class taught by a teacher in a room.
6. **Routing:** You would create a file at `src/app/reports/page.tsx`.
7. **Setup:** Delete the `prisma/dev.db` file, then run `npm run db:push` followed by `npm run db:seed`.
