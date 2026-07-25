# noums

**Say what you mean. Skip the "um."**

noums is a speech-coaching web app: it asks you real interview and free-talk
questions, listens while you answer, and shows you every filler word ("um",
"uh", "like", "so"…) you lean on — so you can swap them for confident pauses.

The front end is a zero-build static site and session history lives in
`localStorage`, syncing to Supabase when signed in.

A note on audio, since it's easy to get wrong: live transcription uses the Web
Speech API, which in Chrome sends audio to Google's servers — it is not
on-device unless a site explicitly opts in. For the recap, the session
recording is posted to the `transcribe` edge function, which forwards it to
Deepgram with filler-word detection enabled and discards it. Recordings are
never stored. Users can turn the second pass off in Settings, which falls back
to the on-device acoustic estimate.

## Structure

```
noums/
├── index.html          Landing page (the public pitch)
├── app/
│   └── index.html      The app — onboarding, mic calibration, practice,
│                       recap, progress dashboard, settings
├── admin/
│   └── index.html      Founder dashboard (visits, users, sessions),
│                       gated by RLS on the signed-in email
├── supabase/
│   ├── schema.sql      Tables, RLS policies, grants — the whole backend
│   ├── emails/         Themed auth templates (not applied: Supabase
│   │                   locks these until custom SMTP is configured)
│   └── functions/
│       └── transcribe/ Edge function: session audio → Deepgram
└── design/
    └── mockup.html     Static design reference (includes the Pro
                        "pressure mode" concept, not yet built)
```

Each page is deliberately a self-contained single file — no build step, no
dependencies, no framework. Open it and it works.

## Run locally

Option 1 — just open it:

> Double-click `index.html` (Chrome or Edge recommended; the Web Speech API
> is not supported in Firefox, and only partially in Safari).

Option 2 — serve it (needed for some browser permission contexts):

```
npx serve .
```

Then open http://localhost:3000 — the landing page links into `/app/`.

## Product decisions

- **Two recognizers, two jobs.** The Web Speech API drives the live
  transcript during a session: free, instant, and good enough to show you
  that you're being heard. It cannot count vocalized fillers — mainstream
  recognizers strip "um"/"uh" deliberately, as noise. So when the session
  ends, the recording goes once to Deepgram (`nova-3`, `filler_words=true`)
  and the recap is rebuilt from that. Live transcript = fast; recap =
  correct. Word fillers ("like", "so", "you know") are caught reliably by
  both.
- **Why not fix it on-device?** An acoustic detector was built and tuned
  over three rounds (pitch stability, then spectral flux/centroid plus a
  per-user "um" fingerprint from mic calibration) and never got accurate
  enough to trust. It survives as the fallback when the second pass is off
  or unavailable. The purpose-built open models (CrisperWhisper,
  PodcastFillers) are non-commercially licensed.
- **Camera optional, off by default** — the value is in audio analysis;
  video is shown (mirrored) but never recorded.
- **Free tier**: interview + free-talk modes, live filler counter, session
  recap, local history.
- **Pro (planned, $9/mo)**: streaks, unlimited history + sync, pressure
  mode (interrupting interviewer), saved recordings.

## Domains

`noums.com` is registered (held since 2014, unused, expires 2027-01) —
would require a purchase approach. Available as of 2026-07-21:
`noums.app`, `noums.io`, `noums.co`, `noums.ai`, `getnoums.com`,
`trynoums.com`.

## Roadmap

- [x] Deployed — https://brucewald.github.io/noums/ (GitHub Pages, auto-deploys on push to main)
- [x] Confident-pause and stall tracking
- [x] Accounts + sync — Supabase auth (magic link + Google) and per-user session history
- [x] Reliable filler detection — Deepgram second pass (needs `DEEPGRAM_API_KEY` set to go live)
- [ ] Support Safari and iOS — recording is currently blocked without the Web Speech API
- [ ] Presentation mode (rehearse against your own talking points)
- [ ] Custom SMTP — the built-in mailer caps magic links at a few per hour
- [ ] Pressure mode (Pro) — see `design/mockup.html`
- [ ] Payments for Pro

## Google sign-in

Live. `GOOGLE_CLIENT_ID` in `app/index.html` holds the production OAuth
client (Google Cloud project "noums"), with `https://brucewald.github.io`
as an authorized JavaScript origin.

It uses the Google Identity Services **ID-token** flow —
`signInWithIdToken` with a hashed nonce, behind Google's own rendered
button — rather than `signInWithOAuth`. The reason is cosmetic but worth
keeping: the redirect flow shows the raw `<project-ref>.supabase.co` host
on the consent screen, which looks like a phishing page to anyone paying
attention. The redirect flow remains as a fallback.

Two things this setup depends on: the client ID must be in Supabase's
Google provider "Client IDs" field (the same field serves both OAuth and
One Tap), and **"Skip nonce checks" must stay off**.

Adding a custom domain later means adding it as an authorized origin here
and to the auth redirect allowlist in Supabase.

## Backend (Supabase)

Live — `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `app/index.html` point at
the production project. The app stays local-first regardless (it works
signed out, with history in `localStorage`); the backend layers on top:

- Sign-in becomes real: email magic links (verified) and Google OAuth,
  both through Supabase Auth.
- Sessions sync: local history uploads on first sign-in, server history
  merges down, new sessions push as they finish. Cross-device works.
- Row Level Security (see `supabase/schema.sql`) ensures each user can
  only ever read/write their own rows.

To stand this up from scratch: create a project at supabase.com, run
`supabase/schema.sql` in the SQL Editor, set the Site URL (Authentication →
URL Configuration) to the app's URL and add `<app-url>/*` to the redirect
allowlist, enable the Google provider (see above), then paste the project
URL + anon key into `app/index.html`. Note that Supabase's newer permission
model needs the table grants to the `authenticated` role that
`schema.sql` includes — without them RLS passes and the queries still fail.

The `transcribe` edge function needs `DEEPGRAM_API_KEY` set as a secret.
Until it is, the function returns 503 and the app silently falls back to
its on-device estimate — so this failure is invisible; check it directly.

Note: the free tier's built-in email service is rate-limited (a few magic
links per hour) — fine for testing; configure custom SMTP before real users.
