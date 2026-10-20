// noums — session audio → Deepgram, with filler words kept.
//
// A static site can't hold an API key, so the browser posts audio here and
// this function adds the key. Deepgram's `filler_words=true` is the whole
// point: every other recognizer strips "um"/"uh" before we ever see them.
//
// Deploy:  supabase functions deploy transcribe
// Secret:  supabase secrets set DEEPGRAM_API_KEY=<key from deepgram.com>
//
// Returns { transcript, words: [{ w, start, end }] } — the client decides
// which words count as fillers, so the Settings list stays authoritative.
//
// Every call costs Deepgram credit, so each one is checked against a daily
// limit per user and for everyone (transcribe_claim in supabase/schema.sql).

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://noums.net",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const MAX_BYTES = 12 * 1024 * 1024;
// What the app's MediaRecorder produces. Anything else isn't from noums.
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Calls a database function as the service role (bypasses RLS).
async function rpc(name: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key!, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "post_only" }, 405);

  const key = Deno.env.get("DEEPGRAM_API_KEY");
  // Until the secret is set the client silently keeps its local estimate.
  if (!key) return json({ error: "not_configured" }, 503);

  // The platform checks that a JWT is present; this checks it belongs to a
  // real signed-in user, so the anon key alone can't spend Deepgram credit.
  const auth = req.headers.get("Authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!auth.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    return json({ error: "unauthorized" }, 401);
  }
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: anonKey },
  });
  if (!who.ok) return json({ error: "unauthorized" }, 401);
  const uid = (await who.json())?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);

  const type = (req.headers.get("content-type") || "audio/webm").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(type)) return json({ error: "unsupported_type" }, 415);

  // Refuse early when the header already says it's too big, before reading it.
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) {
    return json({ error: "audio_too_large" }, 413);
  }
  const body = await req.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty_audio" }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "audio_too_large" }, 413);

  const lang = new URL(req.url).searchParams.get("lang") || "en";
  if (!/^[a-z]{2}$/.test(lang)) return json({ error: "bad_lang" }, 400);

  // Daily limit. If the check itself fails, refuse rather than spend credit.
  let usageId: number | null;
  try {
    usageId = await rpc("transcribe_claim", { p_uid: uid });
  } catch {
    return json({ error: "limit_check_failed" }, 503);
  }
  if (!usageId) return json({ error: "daily_limit" }, 429);
  const qs = new URLSearchParams({
    model: "nova-3",
    filler_words: "true",
    punctuate: "true",
    smart_format: "false",
    language: lang,
    // Keep users' audio out of Deepgram's Model Improvement Program, so
    // "noums never keeps your recordings" holds for our vendor too. The
    // privacy policy (privacy/index.html) relies on this.
    mip_opt_out: "true",
  });

  let dg: Response;
  try {
    dg = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": type,
      },
      body,
    });
  } catch (e) {
    console.error("deepgram unreachable", e);
    return json({ error: "deepgram_unreachable" }, 502);
  }

  if (!dg.ok) {
    // Details go to the function logs, not back to the caller.
    console.error("deepgram failed", dg.status, await dg.text());
    return json({ error: "deepgram_failed" }, 502);
  }

  const data = await dg.json();
  // Record the real length so the minutes limit counts what was billed.
  try {
    await rpc("transcribe_done", { p_id: usageId, p_secs: Number(data?.metadata?.duration) || 0 });
  } catch (e) {
    console.error("transcribe_done failed", e);
  }
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) return json({ error: "no_transcript" }, 502);

  const words = (alt.words || []).map((w: Record<string, unknown>) => ({
    w: String(w.punctuated_word ?? w.word ?? ""),
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
  })).filter((w: { w: string }) => w.w);

  return json({ transcript: alt.transcript || "", words });
});
