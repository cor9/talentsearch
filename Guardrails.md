Permanent Guardrails & Principles
---------------------------------

Architecture & Structure
------------------------
- Do not re-architect the app or change the overall folder structure unless explicitly requested.
- Keep the Next.js App Router structure rooted at `app/` and avoid moving the entry page unless directed.
- Preserve working functionality; avoid touching code that is not related to the current task.

Styling & UI
------------
- Prefer semantic HTML and clean React components.
- Avoid inline styles whenever possible; use `app/globals.css` (or component-level styling) instead.
- Maintain the existing dark, elevated visual style on the talent page (glassmorphism, gradients, subtle borders and shadows).
- Match any provided design/CSS snippets closely when implementing new UI on this page.

Data & Integrations
-------------------
- Use Airtable as the source of truth for talent data on `talent.childactor101.com` (no going back to static CSV for production).
- Do not hardcode secrets; always read Airtable configuration from environment variables (`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, table/view IDs/names).
- When rendering Airtable data, never pass raw objects or arrays directly into JSX children; normalize or stringify them first.

Workflow & Deployment
---------------------
- Before starting a new task, review both `context_Decisions.md` and this `Guardrails.md` file.
- After any significant technical or design decision (e.g., new data source, new UI pattern), update `context_Decisions.md`.
- After any new permanent restriction or principle is established, update this `Guardrails.md`.
- Always commit and `git push` changes when a change set is complete so that Vercel can build and deploy.
- Do not rely on the user to confirm build/deploy status; inspect Vercel build/deployment logs or states directly when possible.

Safety & Code Changes
---------------------
- Avoid deleting large blocks of code; prefer commenting out sections if they need to be removed, unless the user approves deletion.
- Add comments where behavior is non-obvious, especially around data normalization or deployment-related edge cases.
- Keep changes minimal and focused on the requested behavior or feature.


