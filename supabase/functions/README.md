# Edge functions

## `transcribe` — accurate filler detection

The app's own acoustic detector guesses at "um"/"uh" from pitch and spectrum,
and it is not reliable. Deepgram's Nova models have `filler_words=true`, which
detects `uh, um, mhmm, mm-mm, uh-uh, uh-huh, nuh-uh` as an explicit, supported
feature. This function is the bridge: the browser can't hold an API key, so it
posts the session audio here and this function adds the key.

The client treats the result as authoritative for the **recap** only. The live
transcript still comes from the Web Speech API so it stays instant, and if this
function is unavailable the recap silently keeps the local estimate.

### One-time setup

1. Create an account at <https://deepgram.com> and copy an API key.
   New accounts include $200 of credit — roughly 46,000 minutes, or about
   9,000 five-minute sessions.

2. Store the key as a secret (it never goes in the repo):

   ```bash
   supabase secrets set DEEPGRAM_API_KEY=your_key_here --project-ref fkzvfciptxvctewlcizu
   ```

3. Deploy:

   ```bash
   supabase functions deploy transcribe --project-ref fkzvfciptxvctewlcizu
   ```

Until step 2 is done the function returns `503 not_configured` and the app
falls back to its local estimate, so deploying early is harmless.

### Notes

- Callers must be signed in. The function verifies the JWT belongs to a real
  user, so the public anon key alone can't spend Deepgram credit.
- Sign-up is open, so being signed in isn't enough protection on its own.
  Each call must pass `transcribe_claim` (in `supabase/schema.sql`, v0.4):
  20 checks and 120 minutes per user per 24 hours, and 1,000 minutes for
  everyone combined. Over the limit the function returns `429 daily_limit`
  and the app keeps its local estimate. If the limit check itself fails the
  function refuses (fail closed) instead of spending credit.
- Only `audio/webm`, `audio/ogg` and `audio/mp4` are accepted, and the
  browser-facing CORS origin is `https://noums.net`.
- Deepgram error details go to the function logs, not back to the caller.
- Audio is capped at 12 MB (~25 minutes at the 64 kbps the app records).
- Nothing is stored: audio is streamed to Deepgram and discarded.
