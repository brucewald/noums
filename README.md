# noums

**Say what you mean. Skip the "um."**

noums is a speech-coaching web app: it asks you real interview and free-talk
questions, listens while you answer, and shows you every filler word ("um",
"uh", "like", "so"…) you lean on — so you can swap them for confident pauses.

Everything runs in the browser. Speech is transcribed on-device via the Web
Speech API; audio never leaves the user's machine, and session history lives
in `localStorage`.

## Structure

```
noums/
├── index.html          Landing page (the public pitch)
├── app/
│   └── index.html      The app (v0.1) — onboarding, practice, recap,
│                       progress dashboard, settings
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

## Product decisions (v0.1)

- **In-browser speech recognition** (Web Speech API) — free, private, no
  server cost. Known tradeoff: the recognizer sometimes swallows "um"/"uh"
  as noise; detection of "like/so/you know" is reliable. A client-side
  audio-analysis pass to catch vocalized fillers is on the roadmap.
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
- [x] Audio-level filler detection (pitch-stability analysis) + confident-pause and stall tracking
- [ ] Presentation mode (rehearse against your own talking points)
- [ ] Pressure mode (Pro) — see `design/mockup.html`
- [ ] Accounts + sync (first real backend feature, gates the Pro tier)

## Enabling Google sign-in

The button is wired but dormant until an OAuth client ID is set:

1. Go to https://console.cloud.google.com → create a project (e.g. "noums").
2. APIs and Services → OAuth consent screen → External → app name "noums",
   add your email, save through the steps (no scopes needed beyond default).
3. APIs and Services → Credentials → Create credentials → OAuth client ID →
   type "Web application" → add Authorized JavaScript origin
   `https://brucewald.github.io` (add your custom domain later too).
4. Copy the client ID (ends in `.apps.googleusercontent.com`) and paste it
   into `GOOGLE_CLIENT_ID` in `app/index.html`. Push — done.
