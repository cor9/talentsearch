Next.js & Project Structure
---------------------------
- The Next.js app lives at the repository root (this directory), with `app/` using the App Router.
- `package.json` at the root defines `next@14.2.0`, `react@18.2.0`, and related scripts (`dev`, `build`, `start`, `lint`).
- Vercel should use the repo root as the Project Root Directory (leave this setting empty in Vercel when the app is at the repo root).

Data Source for Talent Page
---------------------------
- The `talent.childactor101.com` page uses Airtable as the source of truth instead of a CSV file.
- Environment variables: `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, and either `AIRTABLE_TABLE_ID` or `AIRTABLE_TABLE_NAME`, plus optional `AIRTABLE_VIEW` (defaults to "Grid view").
- Data is fetched on each request (`export const dynamic = 'force-dynamic'`) from Airtable’s REST API and rendered server-side.
- Airtable attachment fields (e.g., headshots) are normalized or stringified before rendering to avoid React “objects as children” errors.

UI & Styling Decisions
----------------------
- Global styling lives in `app/globals.css` and defines a dark, elevated card-like layout for the page container.
- The hero section and copy blocks on the main page are styled with a premium, marketing-focused look (accent gradient headings, pill badges, subtle glassmorphism).
- The initial data presentation is a scrollable, sticky-header table that matches the dark theme and uses subtle hover states.

Video Embedding Behavior
------------------------
- The `TalentModal` component normalizes URLs before embedding:
  - YouTube and Vimeo links are converted to their respective embed URLs, including support for standard watch URLs, `youtu.be` short links, Shorts, Live URLs, and playlist links.
  - Dropbox share links are converted to `dl.dropboxusercontent.com` direct file URLs for inline playback (avoids forced downloads).
  - Google Drive share links are converted to use the `/file/d/{id}/preview` pattern for iframe-safe playback.
  - Bare domains or URLs without `http(s)://` are automatically prefixed with `https://` so parent-entered values like `drive.google.com/...` still work.
  - Supplemental notes text is "linkified" so that recognizable URLs become clickable links, even if they were entered without a protocol.

Deployment & Workflow
---------------------
- Code changes should be committed and pushed to `main`; Vercel is expected to auto-deploy on each push to this branch.
- If a deployment appears “stuck” or missing, first confirm there is a new commit on `main` and then trigger a redeploy of the latest commit in Vercel if needed.


