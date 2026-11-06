// MSOS coach join (12 Oct 2026; 17 Oct 2026 re-sign-in; 3 Nov 2026 the link stays his while he's on the team).
// Andy: "Tried to get Jordan set up -- didn't work." Opening a join link calls this function with the invite
// token, which makes sure the invited email has an account and returns a one-time sign-in token for it -- no email
// needed. The app then signs in with that token and accepts the invite through mclay_accept_assistant_invite, which
// still checks the signed-in email matches the invite and marks it used.
//
// 17 Oct 2026 (Emma; Jordan on 15 Oct): on an iPhone the join link often opens in one copy of MSOS (a mail app's
// browser, or Safari) while the coach then uses another (the home-screen icon) with its own, empty sign-in. An
// ALREADY ACCEPTED link signs the same coach in again (rejoin:true) so the app reloads his access instead of
// joining twice.
//
// 3 Nov 2026 (Andy: "Jordan's link has expired. We don't really want him to have to hit a link each time. He should
// be able to just download it and have it on his phone"). Accepted links used to stop working 14 days after they
// were made, so a coach whose phone needed signing in again was locked out until Andy made a new invite. Now:
//   - an UNACCEPTED invite still expires after its 14 days and can be withdrawn;
//   - once accepted, the link is that coach's own way back in for as long as he is an active member of the team
//     and it is his most recent accepted invite (sending him a new invite retires the old link);
//   - removing the coach from the team ends it.
// No JWT (the coach is not signed in yet); the unguessable invite token is the credential.
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
    if (!/^[a-f0-9]{24,128}$/i.test(token)) return json({ error: "This join link is not complete. Ask Andy for a new one." }, 400);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envJsonKey("SUPABASE_SECRET_KEYS");
    const admin = createClient(url, String(service), { auth: { persistSession: false } });
    const { data: inv, error: ie } = await admin.from("coach_invitations").select("organisation_id,email,display_name,assigned_squads,active,accepted_at,accepted_by,expires_at").eq("token", token).maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!inv) return json({ error: "This join link is not recognised. Ask Andy for a new one." }, 410);
    let rejoin = false;
    if (inv.accepted_at) {
      // His own link: valid while he is an active member and this is his latest accepted invite.
      if (!inv.accepted_by) return json({ error: "This join link has already been used. Ask Andy for a new one." }, 410);
      const { data: mem } = await admin.from("organisation_members").select("active").eq("organisation_id", inv.organisation_id).eq("user_id", inv.accepted_by).maybeSingle();
      if (!mem || mem.active === false) return json({ error: "You're no longer on the team in MSOS. Ask Andy to add you again." }, 410);
      const { data: newer } = await admin.from("coach_invitations").select("accepted_at").eq("organisation_id", inv.organisation_id).eq("accepted_by", inv.accepted_by).gt("accepted_at", inv.accepted_at).limit(1);
      if (newer && newer.length) return json({ error: "Andy has sent you a newer join link. Use that one." }, 410);
      const { data: u } = await admin.auth.admin.getUserById(inv.accepted_by);
      if (!u?.user?.email || String(u.user.email).toLowerCase() !== String(inv.email || "").toLowerCase()) return json({ error: "This join link is no longer active. Ask Andy for a new one." }, 410);
      rejoin = true;
    } else {
      if (Date.parse(inv.expires_at) <= Date.now()) return json({ error: "This join link has expired. Ask Andy for a new one." }, 410);
      if (!inv.active) return json({ error: "This join link has been withdrawn. Ask Andy for a new one." }, 410);
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
