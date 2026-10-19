# Updraft for LinkedIn

A Chrome extension that watches your LinkedIn feed as you scroll, spots posts gaining engagement
while they are still early, and drafts comments in your own voice with Claude.

Built as a clean-room take on the idea behind Earlybird (earlybirdapp.xyz). It shares no code with
that extension, and the design choices below are its own.

## What it does

- **Rising** – every post you scroll past is scored by *momentum*: weighted engagement per hour
  (reactions ×1, comments ×3, reposts ×4), blended with the rate observed between your own
  sightings of the same post, discounted by age and by how crowded the comment thread already is.
  Posts above a per-stage rate (fresh < 2 h, rising 2–8 h, established 8–36 h) are marked **Hot**.
  Tune the numbers in `src/shared/momentum.ts`.
- **Draft comment** – three drafts in different angles, written from your profile, writing samples
  and style rules (Settings). Optional "angle" box to steer. You copy and post yourself.
- **Consistency** – mark posts as commented; the header tracks your weekly goal and streak.

## Design choices

| | Updraft | Why |
|---|---|---|
| Data source | Reads the DOM LinkedIn already rendered, only for posts that scroll into view | No requests to LinkedIn's private APIs; nothing a normal page view would not show |
| Post time | Decoded from the activity ID (`id >> 22` = ms since epoch), with "3h"-style text as fallback | Exact, and needs no extra request |
| Storage | `chrome.storage.local` only; no backend, no account | Nothing leaves your browser except a draft request |
| AI | Your own Anthropic API key, called from the service worker (`@anthropic-ai/sdk`) | No server to run; the key stays in local extension storage |
| Posting | Never automated | Keeps you in control and within LinkedIn's automation rules |

## Build and install

```bash
npm ci
npm run build          # outputs dist/
```

Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** → choose `dist/`.
Click the toolbar icon to open the side panel; Settings opens on first install.

## Test

```bash
npm test               # unit tests (scoring, URN decoding, DOM extraction, storage, Claude request shape)
npm run typecheck
npm run e2e            # real Chromium: loads dist/, serves fixture feed at linkedin.com/feed, checks the side panel
```

The DOM fixtures in `test/fixtures/` are hand-written to mirror LinkedIn's two current feed markups
(classic `.feed-shared-update-v2` with `data-urn`, and the server-driven `role=listitem` /
`componentkey` layout). They were **not** captured from live LinkedIn, so the selectors in
`src/content/extract.ts` still need checking against your own feed. Expect to adjust them when
LinkedIn changes its markup.

## Layout

```
src/shared/     urn.ts (post identity/time), momentum.ts (scoring), store.ts (merge/prune), streak.ts, types.ts
src/content/    extract.ts (DOM → CaptureInput), index.ts (observers, batching)
src/background/ index.ts (message router), draft.ts (Claude), storage.ts
src/sidepanel/  ranked list, drafting, progress
src/options/    API key, model, effort, voice profile, weekly goal
```

## Ideas not built yet

- Read engagement from the feed's network responses (more reliable than DOM text, but more invasive)
- Detect your own comments automatically instead of the "I commented" button
- Learn your voice from your own activity page instead of pasted samples
- Follower and impression tracking from the analytics pages
- Sync across devices
