# Tier 1: Junior Missions

Welcome to Tier 1. Your goal is to map the physical terrain of the codebase. You are not building anything yet; you are learning how to read the map.

---

### Mission 1: The App's Heartbeat
**Tier:** Junior
**Time Estimate:** 10 minutes
**Goal:** Prove that you know how the server determines "who" is looking at the screen.

**The Concept:** Every interaction in this app requires a "badge scan." The server must know who you are before it shows you data or lets you change it. In a normal app, this is a complex JWT validation middleware. Here, it is drastically simplified for training.

**Design Intent Before You Read the Code:** 
We expect to find a function that reads a cookie from the incoming request, looks up a user in the database matching that cookie, and returns their profile. If they don't have a cookie, it should probably default to someone safe so the app doesn't crash during local dev.

**Find It In The Code:**
Open `src/packages/shared/auth.ts`.
Read the `getActiveUser` function (Lines 18-51).

*Annotations to follow:*
- Notice `cookies().get('mock_user_id')`. This relies heavily on Next.js server context.
- Notice the fallback: `where: { username: 'admin' }`. This is a deliberate choice to make local onboarding frictionless, avoiding login screens entirely.

**The Aha Moment:** The server *pretends* someone is logged in if they don't have a cookie, ensuring the developer can immediately see the UI.

**Socratic Checkpoint:**
1. What happens if the `admin` user is deleted from the SQLite database?
2. Does this function run in the user's browser, or on the server?
3. What is the return type of `getActiveUser`?

*How to self-grade:*
1. The app will throw a fatal error: `❌ Critical Setup Error: No admin user found`.
2. It runs entirely on the server. `cookies()` from `next/headers` is a server-only API.
3. It returns a Promise resolving to `ActiveSession`, which contains the `UserRole` and `profileId`.

**Connects To:** Mission 2 (Your First React Component) heavily relies on calling `getActiveUser()`.

---

### Mission 2: Your First React Component
**Tier:** Junior
**Time Estimate:** 15 minutes
**Goal:** Understand how a page fetches data and renders it without any loading spinners.

**The Concept:** Imagine going to a restaurant where the chef already knows what you want, cooks it before you sit down, and hands you the plate the second you pull out your chair. That's a React Server Component.

**Design Intent Before You Read the Code:**
We expect to see a component that looks like a normal React component, but it will be `async` and it will make database calls directly inside the render body. It should *not* have `useState` or `useEffect`.

**Find It In The Code:**
Open `src/app/page.tsx` (The Dashboard).
Read lines 10-30.

*Annotations to follow:*
- `export default async function DashboardPage()`: It's an async function!
- `const activeUser = await getActiveUser();`: Boom, the heartbeat from Mission 1.
- `const studentsCount = await db.student.count();`: Direct database access right inside the React component.

**The Aha Moment:** React Server Components eliminate the need for `fetch()` calls and loading states because the server does all the work before sending the HTML.

**Socratic Checkpoint:**
1. Could you add a `onClick` handler to a `<div>` inside `DashboardPage`? Why or why not?
2. If `db.student.count()` takes 5 seconds, what happens to the user?
3. Where is the data stored on the client side?

*How to self-grade:*
1. No. `onClick` requires browser interactivity. RSCs run on the server and send static HTML. You would need to move the interactive part to a separate `"use client"` component.
2. The user sees a blank white screen for 5 seconds while the server waits for the DB query to finish before sending the HTML.
3. It isn't! There is no client-side state. The data is baked directly into the DOM as HTML text.

**Connects To:** Mission 3 (Following Data Into the App).

---

*(Missions 3-8 follow similar patterns, focusing on basic TypeScript types, simple routing, and navigating the file structure. See the full documentation roadmap for further mission outlines).*
