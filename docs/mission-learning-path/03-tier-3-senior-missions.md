# Tier 3: Senior Missions

Welcome to Tier 3. Your goal shifts from understanding the codebase to critiquing and fortifying it. You are no longer following the happy path; you are hunting for edge cases, performance bottlenecks, and security vulnerabilities.

---

### Mission 22: The Security Audit
**Tier:** Senior
**Time Estimate:** 20 minutes
**Goal:** Identify a critical Insecure Direct Object Reference (IDOR) vulnerability and design the fix.

**The Concept:** Imagine a bouncer at a club who checks your ID at the front door (the UI component), but leaves the back door (the API/Server Action) completely unguarded. If you know the address of the back door, you can walk right in. 

**Design Intent Before You Read the Code:** 
In Next.js, Server Actions (`"use server"`) are exposed as public HTTP endpoints. If the action does not explicitly verify the user's session and permissions *inside the action body*, anyone can forge a request. We suspect our Server Actions are trusting the UI to enforce permissions.

**Find It In The Code:**
Open `src/app/actions.ts`.
Read the `createSupportNoteAction` function (Line 285).

*Annotations to follow:*
- Notice the signature: `export async function createSupportNoteAction(payload: { ... authorId: string ... })`.
- Notice the body: It immediately calls `db.supportNote.create` using the provided `authorId`.

**The Aha Moment:** The server blindly trusts that the `authorId` provided in the payload is the actual logged-in user. A malicious user can write a script to call this action with the Principal's ID and forge a note.

**Socratic Checkpoint:**
1. How would you fix this vulnerability without breaking the current UI?
2. Why is checking `activeUser.role` inside `src/app/students/[id]/page.tsx` not enough to prevent this?
3. If you fix it, what happens to the `authorId` parameter in the payload?
4. How would you test that your fix works?
5. Is this vulnerability present in `dropStudentAction` as well?

*How to self-grade:*
1. You must call `await getActiveUser()` *inside* `createSupportNoteAction`. You then use `activeSession.id` instead of the payload's `authorId`. You should also verify that `canPerformAction(activeSession.role, 'support.notes.create')` returns true.
2. The UI check only hides the HTML form. A hacker doesn't need the form; they can use Chrome DevTools or `curl` to POST directly to the Server Action URL.
3. It becomes entirely obsolete and should be removed from the payload type to reduce attack surface.
4. You would write an automated test that mocks an active session as a 'Student', calls the action directly, and expects an "Unauthorized" error to be thrown.
5. Yes. `dropStudentAction` blindly accepts `actorId` and `enrollmentId`. A student could technically drop another student.

**Connects To:** Mission 23 (Write the Test That Doesn't Exist) where you will write the test to verify this vulnerability.

---

*(Missions 18-21, 23-24 follow similar patterns, focusing on reverse-engineering architecture, performance profiling (N+1), bug injection, and git history reading. See the full documentation roadmap for further mission outlines).*
