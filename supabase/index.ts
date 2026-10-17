// MSOS coach join (12 Oct 2026; 17 Oct 2026 re-sign-in). Andy: "Tried to get Jordan set up -- didn't work." Jordan's
// phone never reached Supabase sign-in at all: the old path asked him to find the Connection screen, get an emailed
// sign-in code (Supabase's built-in email only delivers to the project's own team unless custom SMTP is set up) and
// paste a 48-character invite code. This makes the invite itself the way in: Andy sends a join link; opening it calls
// this function with the invite token, which makes sure the invited email has an account and returns a one-time
// sign-in token for it -- no email needed. The app then signs in with that token and accepts the invite through the
// existing mclay_accept_assistant_invite, which still checks the signed-in email matches the invite and marks it used.
//
// 17 Oct 2026 (Emma; Jordan on 15 Oct): on an iPhone the join link often opens in one copy of MSOS (a mail app's
// browser, or Safari) while the coach then uses another (the home-screen icon) that has its own, empty sign-in. The
// link was single-use, so that second copy could never be signed in without Andy making a new invite. Now an ALREADY
// ACCEPTED link signs the same coach in again -- only while the link is still within its expiry date, only if the
// invite has not been withdrawn, and only if the coach who accepted it is still an active member of the team -- and
// says so (rejoin:true) so the app reloads the coach's access instead of joining twice. Revoking the coach (owner) or
// the link expiring ends it.
// No JWT (the coach is not signed in yet); the unguessable, expiring invite token is the credential.
import { createClient } from "npm:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
function envJsonKey(name: string) { try { const p = JSON.parse(Deno.env.get(name) || "{}"); return p.default || Object.values(p)[0] || ""; } catch { return ""; } }
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || "").trim();
    if (!/^[a-f0-9]{24,128}$/i.test(token)) return json({ error: "This join link is not complete. Ask for a new one." }, 400);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envJsonKey("SUPABASE_SECRET_KEYS");
    const admin = createClient(url, String(service), { auth: { persistSession: false } });
    const { data: inv, error: ie } = await admin.from("coach_invitations").select("organisation_id,email,display_name,assigned_squads,active,accepted_at,accepted_by,expires_at").eq("token", token).maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!inv || Date.parse(inv.expires_at) <= Date.now()) return json({ error: "This join link has expired. Ask Andy for a new one." }, 410);
    let rejoin = false;
    if (inv.accepted_at) {
      // re-sign-in: the coach who accepted must still be an active member of the team
      if (!inv.accepted_by) return json({ error: "This join link has already been used. Ask Andy for a new one." }, 410);
      const { data: mem } = await admin.from("organisation_members").select("active").eq("organisation_id", inv.organisation_id).eq("user_id", inv.accepted_by).maybeSingle();
      if (!mem || mem.active === false) return json({ error: "This join link is no longer active. Ask Andy for a new one." }, 410);
      const { data: u } = await admin.auth.admin.getUserById(inv.accepted_by);
      if (!u?.user?.email || String(u.user.email).toLowerCase() !== String(inv.email || "").toLowerCase()) return json({ error: "This join link is no longer active. Ask Andy for a new one." }, 410);
      rejoin = true;
    } else if (!inv.active) {
      return json({ error: "This join link has been withdrawn. Ask Andy for a new one." }, 410);
    }
    const email = String(inv.email || "").toLowerCase();
    if (!rejoin) {
      const { error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (ce && !/already|registered|exists/i.test(ce.message)) throw new Error(ce.message);
    }
    const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (le) throw new Error(le.message);
    const hashed = (link as any)?.properties?.hashed_token;
    if (!hashed) throw new Error("Could not create a sign-in for this invite.");
    return json({ email, token_hash: hashed, display_name: inv.display_name || "", assigned_squads: inv.assigned_squads || [], rejoin, organisation_id: rejoin ? inv.organisation_id : undefined });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
