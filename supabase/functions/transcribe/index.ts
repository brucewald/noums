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

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 12 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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

  const body = await req.arrayBuffer();
  if (!body.byteLength) return json({ error: "empty_audio" }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "audio_too_large" }, 413);

  const lang = (new URL(req.url).searchParams.get("lang") || "en").slice(0, 5);
  const qs = new URLSearchParams({
    model: "nova-3",
    filler_words: "true",
    punctuate: "true",
    smart_format: "false",
    language: lang,
  });

  let dg: Response;
  try {
    dg = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": req.headers.get("content-type") || "audio/webm",
      },
      body,
    });
  } catch (e) {
    return json({ error: "deepgram_unreachable", detail: String(e) }, 502);
  }

  if (!dg.ok) {
    return json({ error: "deepgram_failed", status: dg.status, detail: await dg.text() }, 502);
  }

  const data = await dg.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) return json({ error: "no_transcript" }, 502);

  const words = (alt.words || []).map((w: Record<string, unknown>) => ({
    w: String(w.punctuated_word ?? w.word ?? ""),
    start: Number(w.start ?? 0),
    end: Number(w.end ?? 0),
  })).filter((w: { w: string }) => w.w);

  return json({ transcript: alt.transcript || "", words });
});
