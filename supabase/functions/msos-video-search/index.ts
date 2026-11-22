// MSOS video search (16 Oct 2026). Andy: "on the pool side really typing a YouTube address is not an option ... we
// could have that AI where you go find a YouTube video of ... Caeleb Dressel's butterfly starts ... and that would
// come back with that. The address needs to just be pasted in automatically, and you just hit enter."
//
// 23 Nov 2026 (Andy: "elite swimmer push-off breakouts ... gave me a 1 hour long clip. That's no help to me poolside";
// the search "needs to be a little bit more tied to swimming ... maybe stroke specific. Clips can only be a short time"):
// it asks for short swimming technique clips, checks each video's real length on YouTube, and returns only clips of
// maxSeconds or less (default 5 minutes), shortest first, with their length.
//
// One job: turn a spoken/typed description into a few real YouTube video links. The AI searches the web (YouTube
// only); every link it returns is then checked against YouTube's own oEmbed endpoint, so only videos that really
// exist come back, with YouTube's own title and channel. Nothing is stored. Coaches of the organisation only.
// Provider: Anthropic (web search tool) when ANTHROPIC_API_KEY is set, otherwise OpenAI (web_search tool) with the
// OPENAI_API_KEY the other MSOS functions already use.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_SEARCH_MODEL") || "gpt-5-mini";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_SEARCH_MODEL") || "claude-haiku-5-5";
const COACH_ROLES = ["owner", "head_coach", "assistant_coach", "coach"];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
function envJsonKey(name: string) { try { const p = JSON.parse(Deno.env.get(name) || "{}"); return p.default || Object.values(p)[0] || ""; } catch { return ""; } }

const PROMPT = (q: string, maxMin: number) => `Find short YouTube clips for a swimming coach to show swimmers on a pool-deck TV between sets.
Request: "${q}"
It is about competitive swimming technique (strokes, starts, turns, underwater kicking, breakouts, finishes, drills, races).
Search YouTube and pick up to 8 videos that best match. Strongly prefer:
- clips of ${maxMin} minutes or less (YouTube Shorts are welcome); never full-length talks, livestreams, webinars, podcasts or whole race sessions
- clear technique footage (underwater or side-on views, slow motion) of good swimmers, or a real race / start clip
- reputable swimming channels
Reply with JSON only, no other text: {"videos":[{"url":"https://www.youtube.com/watch?v=..."}]}`;

function videoIds(text: string): string[] {
  const ids: string[] = [];
  const re = /(?:youtube\.com\/(?:watch\?[^"'\s]*?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

async function searchAnthropic(q: string, maxMin: number) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1500, messages: [{ role: "user", content: PROMPT(q, maxMin) }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_domains: ["youtube.com", "youtu.be"] }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic failed (${r.status})`);
  return JSON.stringify(data?.content || []);
}

async function searchOpenAI(q: string, maxMin: number) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, input: PROMPT(q, maxMin), tools: [{ type: "web_search" }], max_output_tokens: 1500 }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI failed (${r.status})`);
  return JSON.stringify(data?.output || []);
}

// A video's real length, from its own YouTube page. null when YouTube doesn't say.
async function seconds(id: string): Promise<number | null> {
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "Accept-Language": "en", "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/itemprop="duration" content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
    if (!m) return null;
    if (m.length === 2) return Number(m[1]);
    return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
  } catch { return null; }
}

async function verify(id: string) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (!r.ok) return null;
    const o = await r.json();
    return { url: `https://www.youtube.com/watch?v=${id}`, id, title: String(o?.title || ""), channel: String(o?.author_name || ""), thumbnail: String(o?.thumbnail_url || ""), seconds: await seconds(id) };
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || envJsonKey("SUPABASE_PUBLISHABLE_KEYS");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envJsonKey("SUPABASE_SECRET_KEYS");
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in to search for videos." }, 401);
    const { data: u, error: ue } = await createClient(url, String(anon), { auth: { persistSession: false } }).auth.getUser(auth.slice(7));
    if (ue || !u?.user) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
    const admin = createClient(url, String(service), { auth: { persistSession: false } });
    const { data: rows } = await admin.from("organisation_members").select("role,active").eq("user_id", u.user.id);
    if (!(rows || []).some((r: any) => r.active !== false && COACH_ROLES.includes(String(r.role)))) return json({ error: "Video search is for coaches of this team." }, 403);
    const body = await req.json().catch(() => ({}));
    if (body.action === "health") return json({ ok: Boolean(ANTHROPIC_KEY || OPENAI_KEY), provider: ANTHROPIC_KEY ? "anthropic" : OPENAI_KEY ? "openai" : "" });
    let q = String(body.query || "").trim().slice(0, 300);
    if (!q) return json({ error: "Say what video you want first." }, 400);
    if (!/swim/i.test(q)) q = `swimming ${q}`;
    const maxSeconds = Math.max(30, Math.min(1200, Number(body.maxSeconds) || 300));
    if (!ANTHROPIC_KEY && !OPENAI_KEY) return json({ error: "No AI key is set up in Supabase yet (ANTHROPIC_API_KEY or OPENAI_API_KEY)." }, 503);
    const raw = ANTHROPIC_KEY ? await searchAnthropic(q, Math.round(maxSeconds / 60)) : await searchOpenAI(q, Math.round(maxSeconds / 60));
    const ids = videoIds(raw).slice(0, 10);
    const checked = (await Promise.all(ids.map(verify))).filter(Boolean) as any[];
    const short = checked.filter((v) => v.seconds != null && v.seconds <= maxSeconds).sort((a, b) => a.seconds - b.seconds);
    const unknown = checked.filter((v) => v.seconds == null);
    const videos = [...short, ...unknown].slice(0, 4);
    const tooLong = checked.filter((v) => v.seconds != null && v.seconds > maxSeconds).length;
    if (!videos.length) return json({ videos: [], tooLong, error: tooLong ? `Only long videos came back (over ${Math.round(maxSeconds / 60)} minutes). Try different words.` : "No YouTube video found for that. Try different words." });
    return json({ videos, tooLong });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
