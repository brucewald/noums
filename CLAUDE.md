# noums

Speech-practice web app that counts filler words. Live at https://noums.net
(GitHub Pages, deploys automatically on push to `main`). See README.md for
the architecture, backend setup and roadmap.

The owner has no coding experience: explain things in plain language, and
say so plainly when an idea is a bad one.

## Rules for every notable change

When a change adds, removes or changes something users can see or that
affects their data, update these pages in the same PR:

- `news/index.html`: add a dated entry (newest first) for any new feature or
  notable fix. Describe only what actually shipped.
- `privacy/index.html`: update whenever what is collected, stored, sent to a
  third party, or who can see it changes. Bump the "Last updated" date.
- `help/index.html`: add, fix or remove FAQ answers the change affects
  (browsers, sign-in, modes, pricing, privacy answers).
- `terms/index.html`: only if the rules of using the service change. Bump
  the date.

If none of them need changing, say so in the PR description.

## Keep claims true

Marketing copy (`index.html`) must match what the app does today. No made-up
stats, no listing features as available before they exist (mark them "coming
soon" or "planned"), and no "Pro" or prices implying payment works until it
does. Check the app code before writing any claim.

## Things that are easy to get wrong

- **The footer is duplicated** in `index.html` and in each of `help/`,
  `news/`, `privacy/` and `terms/`. Change all five together. The info pages
  share `site.css`. The landing page keeps its own inline copy of the footer
  CSS.
- **`supabase/functions/transcribe/index.ts` does not deploy with the site.**
  Editing it does nothing until the owner redeploys it in the Supabase
  dashboard (Edge Functions → transcribe). Give them the exact change to
  paste. It must keep `mip_opt_out: "true"`: the privacy policy says Deepgram
  doesn't keep audio for training.
- **Database changes** (`supabase/schema.sql`) must also be run by the owner
  in the Supabase SQL Editor.
- **Settings in other dashboards** (Supabase auth/SMTP, Resend, Squarespace
  DNS, Google OAuth origins) live only there. README.md's Domains and
  Backend sections record what they are set to.
- Each page is a self-contained file with no build step. Test pages with
  Playwright against `python3 -m http.server`. Real mic and speech can't be
  tested here, so fake `SpeechRecognition`.
- "like", "so", "you know" and "kind of" are never silently dropped. When one
  sits mid-sentence with words on both sides that suggest a real word, it is
  shown as a dashed "maybe", not counted until the user taps it
  (`fillerInContext` in `app/index.html`; false means "maybe"). This is the
  owner's chosen design. After changing the rules, run
  `node tests/filler-context.test.js`.
- This environment can't reach noums.net or Supabase directly. Ask the owner
  to check the live site when that matters.
