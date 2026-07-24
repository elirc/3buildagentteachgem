# Tier 2: Mid-Level Missions

Welcome to Tier 2. Now that you can read the map, it is time to understand the traffic patterns. We are shifting focus from reading components to understanding side-effects, API boundaries (Server Actions), and component contracts.

---

### Mission 14: End-to-End Feature Trace
**Tier:** Mid-Level
**Time Estimate:** 25 minutes
**Goal:** Trace a single user click all the way through the database and back to the screen without getting lost.

**The Concept:** A web application is just a very fast Rube Goldberg machine. A button click drops a ball, which hits a function, which hits a database, which triggers a background job, which drops a flag saying "Done." Your job is to follow the ball.

**Design Intent Before You Read the Code:** 
We will trace dropping a student from a class. We expect:
1. A UI button inside a form.
2. A server action that handles the click.
3. A database update via Prisma.
4. An audit log capturing the event.
5. A mechanism to tell the UI to refresh.

**Find It In The Code:**
*Step 1: The UI Trigger*
Open `src/app/students/[id]/page.tsx`.
Find line 301. Notice the form wrapping the "Drop" button. It calls `action={handleDrop}`.
Find `handleDrop` at line 94. Notice it calls `dropStudentAction`.

*Step 2: The Action*
Open `src/app/actions.ts`.
Find `dropStudentAction` at line 133.
Read the block carefully. Notice the four distinct phases: Fetching "before" state, mutating DB, writing audit log, revalidating cache.

*Step 3: The Side Effects*
Notice on line 160: `db.backgroundJob.create(...)`. This queues a grade recalculation job because dropping a student changes the section's average.

**The Aha Moment:** Server Actions are the true API of this application. They handle business logic, database transactions, auditing, and background job queuing all in one secure server-side closure.

**Socratic Checkpoint:**
1. If the background job creation on line 160 fails and throws an error, does the student get dropped?
2. What is the purpose of passing `before` and `after` into `recordAuditEvent`?
3. What is the difference between `revalidatePath('/students')` and calling a traditional REST API to fetch new data?
4. How do we ensure that a malicious user doesn't call `dropStudentAction` with someone else's ID?
5. Why don't we calculate the section grade synchronously inside `dropStudentAction`?

*How to self-grade:*
1. No. Because it's an async function, if the job creation throws an unhandled error, the entire request fails. (Wait, the DB update for enrollment already happened on line 140! This means the DB is updated, but the request crashes before returning. This is a subtle transaction bug! A Senior engineer would wrap the entire thing in a Prisma `$transaction`).
2. It allows administrators to see exactly what changed in the database.
3. `revalidatePath` tells Next.js to dump its cache for that route and completely re-render the HTML on the server. A REST API just returns JSON that the client must manually merge into state.
4. Currently... we don't. The action blindly accepts `enrollmentId` and `actorId`. This is a critical security vulnerability you will explore in Tier 3.
5. Calculating section grades might be slow. We want the user's "Drop" action to feel instant, so we offload the heavy math to a background queue.

**Connects To:** Mission 15 (Read the Diff Like an Engineer) and Mission 22 (The Security Audit).

---

*(Missions 9-13, 15-17 follow similar patterns, focusing on state philosophy, hook absence, API contracts, and diff reading. See the full documentation roadmap for further mission outlines).*
