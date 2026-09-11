// Phase 5 (10 Sept 2026) -- "add alerts, not just a view" for Andy's remote/off-site monitoring.
// Called directly by the client (engines/push-alerts.js's sendCoachAlert, wired from
// engines/modification-edit.js's save() whenever an assistant-proposed stroke change gets held back by
// the evidence gate for Andy's review) with the caller's own access token as Authorization -- verify_jwt
// is left ON (see deploy call), so a request never even reaches this code unless it carries a real,
// currently-valid Supabase session JWT. That is deliberately the ONLY access control this needs: no
// separate webhook secret, no database trigger, no pg_net. Two Supabase clients are used for two
// different reasons:
//   - `caller` is built with the incoming Authorization header, so every query through it is subject to
//     the SAME row-level security the real signed-in user would get from the app itself. It is used to
//     (a) confirm the caller is actually a member of the organisation they claim, and (b) insert the
//     durable coach_alerts row AS that caller (so created_by/RLS/audit trail are exactly what they'd be
//     from a normal authenticated insert -- nothing here bypasses the real permission model).
//   - `admin` (service role) is used ONLY for the two things an ordinary member's own RLS could never
//     see: every OTHER org member's push_subscriptions row (Jordan creating the proposal must be able to
//     wake Andy's phone, not just his own), and the VAPID keypair in app_secrets (a table with zero
//     anon/authenticated policies at all -- see supabase/20260910_remote_alerts.sql).
// A push-send failure (expired subscription, unreachable push service, no VAPID configured yet) never
// blocks or rolls back the coach_alerts insert -- that row is the durable, always-available record of
// "this needed Andy's attention," matching the existing pendingStrokeFlag ⚑ already on the Board; push is
// a convenience on top of it, not the only place the alert exists.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const organisationId = String(body.organisation_id || "");
  const sessionId = body.session_id ? String(body.session_id) : null;
  const athleteId = body.athlete_id ? String(body.athlete_id) : null;
  const kind = String(body.kind || "");
  const title = String(body.title || "");
  const alertBody = String(body.body || "");
  if (!organisationId || !kind || !title || !alertBody) return json({ error: "missing_fields" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);
  const userId = userData.user.id;

  // Confirms real org membership using the caller's OWN RLS -- an assistant sees their own membership
  // row (user_id=auth.uid()); the owner sees every row in their organisation, themselves included, since
  // the org's creation flow gives the owner a real organisation_members row too (role='owner'), not just
  // an organisations.owner_id reference. Either way, a hit here means this really is a legitimate member
  // of this exact organisation, not merely someone with a valid Supabase account.
  const { data: membership } = await caller
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return json({ error: "not_a_member" }, 403);

  const { data: alertRow, error: insertErr } = await caller
    .from("coach_alerts")
    .insert({
      organisation_id: organisationId,
      session_id: sessionId,
      athlete_id: athleteId,
      kind,
      title,
      body: alertBody,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insertErr) return json({ error: "insert_failed", detail: insertErr.message }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  let sent = 0, failed = 0, removed = 0;
  try {
    const { data: owners } = await admin
      .from("organisation_members")
      .select("user_id")
      .eq("organisation_id", organisationId)
      .eq("role", "owner");
    const ownerIds = (owners || []).map((o: { user_id: string }) => o.user_id);
    if (ownerIds.length) {
      const { data: subs } = await admin.from("push_subscriptions").select("*").in("user_id", ownerIds);
      const { data: secretRows } = await admin
        .from("app_secrets")
        .select("key,value")
        .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject"]);
      const secrets: Record<string, string> = {};
      (secretRows || []).forEach((r: { key: string; value: string }) => { secrets[r.key] = r.value; });
      if (secrets.vapid_public_key && secrets.vapid_private_key && subs?.length) {
        webpush.setVapidDetails(
          secrets.vapid_subject || "mailto:andymclay5@gmail.com",
          secrets.vapid_public_key,
          secrets.vapid_private_key,
        );
        const payload = JSON.stringify({
          title, body: alertBody, kind,
          sessionId, athleteId, alertId: alertRow?.id,
        });
        const gone: string[] = [];
        const results = await Promise.allSettled(
          (subs as Array<{ endpoint: string; p256dh: string; auth_key: string }>).map((s) =>
            webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload)
          ),
        );
        results.forEach((r, i) => {
          if (r.status === "fulfilled") sent++;
          else {
            failed++;
            const status = (r.reason as { statusCode?: number; status?: number } | undefined)?.statusCode
              ?? (r.reason as { statusCode?: number; status?: number } | undefined)?.status ?? 0;
            if (status === 404 || status === 410) gone.push((subs as Array<{ endpoint: string }>)[i].endpoint);
          }
        });
        if (gone.length) {
          await admin.from("push_subscriptions").delete().in("endpoint", gone);
          removed = gone.length;
        }
      }
    }
  } catch (_e) {
    // Push fan-out is best-effort. The durable coach_alerts row above already exists regardless.
  }

  return json({ ok: true, alertId: alertRow?.id, sent, failed, removed }, 200);
});
