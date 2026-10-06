# User Story Build Path

> **Status (2026-10-06):** these 10 stories are separate from the 19-story
> fabledocs backlog, which has shipped in full (PRs #1–#22,
> `fabledocs/04-what-changed.md`). The fabledocs backlog was deliberately
> written not to overlap these 10, so they remain open build exercises —
> but the codebase has grown since they were written, so before building
> one, search the code and PR list for the feature area first, and prefer
> extending a shipped pattern over inventing a parallel one.

Welcome to your first sprint. This suite contains a progressive set of 10 user stories—real features that a user of the Agentic Education Operations platform would actually want. 

## How to Use These Stories
You are no longer reading or tracing code. You are writing it. 

The stories progress from Easy to Expert:
- **Easy (1-3):** Modifying existing UI, adding small fields.
- **Medium (4-7):** Adding new UI that reads existing data, adding simple state or new endpoints.
- **Hard (8-9):** Full-stack features touching UI, Actions, and the Database schema.
- **Expert (10):** A significant architectural feature.

## When Is A Story "Done"?
A story is not done when the code compiles. A story is done when:
1. Every Acceptance Criterion is independently verifiable and met.
2. You have manually tested the UI in the browser.
3. You have run `npm run build` and it passes with Exit Code 0 (meaning strict TypeScript checks pass).
4. You have checked the audit logs (`http://localhost:3000/logs`) to ensure your mutation was recorded.

## Getting Unstuck (Using AI)
If you get stuck, do not ask Claude or ChatGPT to write the code for you. That defeats the purpose of the training. Use this exact prompt:

> "I'm working on Story X. I'm stuck on Y. Here is what I've tried: Z. Don't give me the solution — ask me questions that help me figure it out."

Good luck. Your first ticket awaits in `01-stories.md`.
