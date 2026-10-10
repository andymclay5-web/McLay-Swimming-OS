// MSOS assistant (10 Oct 2026). Andy: "I like the option to ask ai -- it would need to be where the question
// is asked in msos and the answer is given here, not taken away to an external page. This could be added to
// the chat feature as well."
//
// One job: answer a coach's question about a session, the brief or the programme, grounded in Andy's own
// written methodology (methodology.ts, generated from docs/METHODOLOGY_McLay_20261010.md) and the context the
// app sends (today's brief, the draft, the session check, the season week). It never writes anything: a
// suggested session comes back as text and the coach decides whether to use it in the app.
//
// Access: signed-in coaches of the organisation only (owner / head coach / assistant coach). Swimmer
// accounts are refused. No swimmer data is sent by the app -- only plan and session text.
//
// Provider: Anthropic when ANTHROPIC_API_KEY is set, otherwise OpenAI with the OPENAI_API_KEY that the
// transcribe-capture function already uses. Models are overridable with ANTHROPIC_ASSISTANT_MODEL /
// OPENAI_ASSISTANT_MODEL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { METHODOLOGY } from "./methodology.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_ASSISTANT_MODEL") || "gpt-5";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_ASSISTANT_MODEL") || "claude-sonnet-5-5";
const COACH_ROLES = ["owner", "head_coach", "assistant_coach", "coach"];
const MAX_QUESTION = 2000, MAX_CONTEXT = 24000, MAX_HISTORY = 8;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
}
function envJsonKey(name: string) {
  try { const p = JSON.parse(Deno.env.get(name) || "{}"); return p.default || Object.values(p)[0] || ""; } catch { return ""; }
}

const SYSTEM = `You are the session-writing assistant inside McLay Swimming OS, working for head coach Andy McLay and his assistant coaches.
The coach is the author. You advise, explain and draft; you never decide for the coach and you never claim something was saved or changed.

Ground every answer in Andy's methodology below and in the CONTEXT the app sends (today's brief from the season and weekly plan, the draft session, the app's session check, the season week). If the context does not say something, say you don't know rather than inventing it. Never invent swimmer names, times, PBs or target times.

Energy-system vocabulary as Andy uses it in this app (settled 4 Oct 2026):
- Aerobic Capacity -> Development (aerobic base; Regeneration is easy aerobic).
- Aerobic Power -> Threshold (AT), with Clearance (CL) at the top end of aerobic power. Overload (OL) sits between Development and Threshold.
- Anaerobic Capacity -> top-end speed / ATP-PC: MAX efforts, assisted and resisted, long recovery.
- Anaerobic Power -> race pace and lactate tolerance (@100 Pace, @200 Pace). Progression: AC, AP, AnP, AnC.

Write sets in Andy's shorthand so the app can read them: section headings WARM UP, PRE SET, MAIN SET, POST SET, WARM DOWN on their own lines; one set per line, e.g. "8 x 100 Dev 10sR", "6 x 25 @1:00" followed by "#1 Build" and "#2-6 @100 Pace", "3 Rounds:" followed by its lines, zones as Reg / Dev / OL / AT / CL, "MAX", send-offs as @1:30, rest as 10sR. Race-pace recovery: 100-pace about 1:2 work:rest; 200-pace about 30-40s. Aerobic work uses real rest (about 10-30s).

Answer like an experienced coach talking to a colleague on deck: short, specific, practical. Lead with the answer. Use plain sentences or a few short bullet lines; no long essays, no headings unless you are writing a session.

Return JSON only: {"answer": string, "session_text": string}. Put a full or partial session in session_text ONLY when the coach asks you to write, rewrite, fix or extend a session (in the shorthand above, with section headings); otherwise session_text is "". Do not repeat session_text inside answer.

=== ANDY McLAY'S METHODOLOGY ===
${METHODOLOGY}`;

function clip(v: unknown, n: number) { return String(v ?? "").slice(0, n); }

async function askOpenAI(messages: Array<{ role: string; content: string }>) {
  const input = [{ role: "developer", content: [{ type: "input_text", text: SYSTEM }] },
    ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }] }))];
  const schema = { type: "object", additionalProperties: false, required: ["answer", "session_text"], properties: { answer: { type: "string" }, session_text: { type: "string" } } };
  const body: Record<string, unknown> = { model: OPENAI_MODEL, input, max_output_tokens: 4000, text: { format: { type: "json_schema", name: "msos_assistant", strict: true, schema } } };
  if (/^(gpt-5|o\d)/.test(OPENAI_MODEL)) body.reasoning = { effort: "low" };
  const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `OpenAI failed (${r.status})`);
  let text = typeof data?.output_text === "string" ? data.output_text : "";
  if (!text) for (const item of data?.output || []) for (const part of item?.content || []) if (part?.type === "output_text") text += part.text || "";
  return { text, model: data.model || OPENAI_MODEL, provider: "openai" };
}

async function askAnthropic(messages: Array<{ role: string; content: string }>) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, system: SYSTEM, messages: messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `Anthropic failed (${r.status})`);
  const text = (data?.content || []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
  return { text, model: data.model || ANTHROPIC_MODEL, provider: "anthropic" };
}

function parseReply(text: string) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { const p = JSON.parse(clean); return { answer: String(p.answer || ""), session_text: String(p.session_text || "") }; } catch {}
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s >= 0 && e > s) { try { const p = JSON.parse(clean.slice(s, e + 1)); return { answer: String(p.answer || ""), session_text: String(p.session_text || "") }; } catch {} }
  return { answer: clean, session_text: "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || envJsonKey("SUPABASE_PUBLISHABLE_KEYS");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envJsonKey("SUPABASE_SECRET_KEYS");
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Sign in to use the assistant." }, 401);
    const { data: u, error: ue } = await createClient(url, String(anon), { auth: { persistSession: false } }).auth.getUser(auth.slice(7));
    if (ue || !u?.user) return json({ error: "Your sign-in has expired. Sign in again." }, 401);
    const admin = createClient(url, String(service), { auth: { persistSession: false } });
    const { data: rows } = await admin.from("organisation_members").select("role,active").eq("user_id", u.user.id);
    if (!(rows || []).some((r: any) => r.active !== false && COACH_ROLES.includes(String(r.role)))) return json({ error: "The assistant is for coaches of this team." }, 403);
    const body = await req.json().catch(() => ({}));
    if (body.action === "health") return json({ ok: Boolean(ANTHROPIC_KEY || OPENAI_KEY), provider: ANTHROPIC_KEY ? "anthropic" : OPENAI_KEY ? "openai" : "", model: ANTHROPIC_KEY ? ANTHROPIC_MODEL : OPENAI_MODEL });
    const question = clip(body.question, MAX_QUESTION).trim();
    if (!question) return json({ error: "Ask a question first." }, 400);
    if (!ANTHROPIC_KEY && !OPENAI_KEY) return json({ error: "No AI key is set up in Supabase yet (ANTHROPIC_API_KEY or OPENAI_API_KEY)." }, 503);
    const context = clip(typeof body.context === "string" ? body.context : JSON.stringify(body.context || {}, null, 1), MAX_CONTEXT);
    const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: clip(m?.content, 4000) })).filter((m: any) => m.content);
    const messages = [...history, { role: "user", content: `CONTEXT FROM THE APP:\n${context || "(none)"}\n\nCOACH'S QUESTION:\n${question}` }];
    const out = ANTHROPIC_KEY ? await askAnthropic(messages) : await askOpenAI(messages);
    const reply = parseReply(out.text);
    if (!reply.answer && !reply.session_text) throw new Error("The assistant returned an empty answer. Try again.");
    return json({ ...reply, provider: out.provider, model: out.model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
