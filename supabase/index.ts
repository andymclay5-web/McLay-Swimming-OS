// MSOS results sync (19 Oct 2026). Andy: "build the automated way and scrape for historical data of current swimmers to
// update msos and automate future updates as well as have ability to load manually or later integrate with swimify and
// meet mobile".
//
// One job: bring published meet results into MSOS. Sources are adapters that each produce a results file (today:
// SwimInfo NZ "TM Results File" zips, and files a coach uploads; Swimify / Meet Mobile later plug in as further
// adapters). Every file goes through the same importer:
//   read the .hy3 (engines/results-hy3.js, the same reader the app uses) -> match swimmers to MSOS athletes (SNZ
//   membership number first, then exact name + date of birth, then a unique exact name with no conflicting DOB) ->
//   write race_results rows -> record the file in msos_results_sources.
//
// 30 Oct 2026 (Andy: "We don't need to worry about approval just use them. And if a later sweep notes a change then
// update"): results are used as soon as they are read (approved=true). A swim is identified by swimmer, meet, date,
// course, event and round; when a later read of a results file has a different time, status or place for that swim, the
// row is updated rather than a second row added. Results files from the last 10 days are read again on each daily run
// so a corrected file posted at the same address is picked up.
//
// Called by: the daily pg_cron job (x-msos-cron secret, checked in the database), or a signed-in head coach.
// Actions: scan (check recent SwimInfo meets), backfill {year}, import {url}, upload {name,file_b64}, status, probe {url}.
import { createClient } from "npm:@supabase/supabase-js@2";
import "./results-hy3.js";
// deno-lint-ignore no-explicit-any
const R: any = (globalThis as any).MSOS4.resultsFile;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-msos-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
function envJsonKey(name: string) { try { const p = JSON.parse(Deno.env.get(name) || "{}"); return p.default || Object.values(p)[0] || ""; } catch { return ""; } }
const BASE = "https://swiminfo.co.nz/";
const UA = { "User-Agent": "MSOS results sync (McLay Swimming; once a day)" };
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const RECHECK_DAYS = 10;
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const abs = (href: string) => { try { return new URL(decode(href).trim().replace(/ /g, "%20"), BASE).href; } catch { return ""; } };

async function getText(url: string) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} from ${url}`); return await r.text(); }
async function getBytes(url: string) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} downloading the file`); return new Uint8Array(await r.arrayBuffer()); }

// ---------- SwimInfo adapter ----------
// Results listing for a year: meet links (ShowItem.php?ID=n) with the date shown above them.
function listMeets(html: string) {
  const out: { id: string; url: string; title: string; date: string | null }[] = []; const seen = new Set<string>();
  const re = /(\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4}))|<a[^>]+href\s*=\s*["']?([^"'>\s]*ShowItem\.php\?ID=(\d+))[^>]*>([\s\S]*?)<\/a>/gi;
  let date: string | null = null; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) { const mo = MONTHS[m[3].toLowerCase()]; date = mo ? `${m[4]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}` : date; continue; }
    const id = m[6]; if (seen.has(id)) continue; seen.add(id);
    out.push({ id, url: abs(m[5]), title: strip(m[7]), date });
  }
  return out;
}
// A meet page: the results files on it ("TM Results File", zips that are not entry/event files).
function resultFiles(html: string) {
  const out: { url: string; label: string }[] = [];
  const re = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1], label = strip(m[2]); if (!/\.(zip|hy3)(\?|$)/i.test(href)) continue;
    const both = `${label} ${decodeURIComponent(href)}`;
    if (/event|entr|psych|program/i.test(both) && !/result/i.test(both)) continue;
    if (!/result/i.test(both)) continue;
    out.push({ url: abs(href), label });
  }
  return out;
}
const titleOf = (html: string) => strip((html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const started = Date.now(); let budget = 120000; const timeLeft = () => budget - (Date.now() - started);
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || envJsonKey("SUPABASE_PUBLISHABLE_KEYS");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || envJsonKey("SUPABASE_SECRET_KEYS");
    const admin = createClient(url, String(service), { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const org = String(body.organisation_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(org)) return json({ error: "organisation_id required" }, 400);
    // ---- who is calling: the daily job, or the head coach ----
    let actor: string | null = null;
    const cron = req.headers.get("x-msos-cron") || "";
    if (cron) { const { data: ok } = await admin.rpc("msos_results_cron_ok", { p_secret: cron }); if (!ok) return json({ error: "Not allowed" }, 403); actor = "cron"; }
    else {
      const auth = req.headers.get("Authorization") || ""; if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
      const user = createClient(url, String(anon), { auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
      const { data: owner, error } = await user.rpc("mclay_is_owner", { target_org: org });
      if (error || !owner) return json({ error: "Only the head coach can bring in results." }, 403);
      const { data: u } = await user.auth.getUser(); actor = u?.user?.id || "owner";
    }
    const action = String(body.action || "status");
    // reading a big results file is heavy: the repeating backfill takes one file per call, inside 50 seconds
    if (Number(body.budget_ms) > 0) budget = Math.min(120000, Number(body.budget_ms));
    const maxFiles = Number(body.max_files) > 0 ? Number(body.max_files) : (action === "backfill" ? 1 : 3);
    let filesRead = 0;

    // ---- shared importer ----
    const { data: athletes } = await admin.from("athletes").select("id,full_name,date_of_birth,membership_number,active,is_visitor,membership_type,source_profile").eq("organisation_id", org);
    // regular visitors (e.g. Ashburton swimmers on our Roll every week, added on the Roll as "Regular") count as ours
    const current = (athletes || []).filter((a: any) => a.active !== false && (!a.is_visitor || String(a.membership_type || "").toLowerCase() === "regular"));
    const match = R.matcher(current); const suggest = R.suggester(current);
    let existing: Set<string> | null = null;
    async function loadExisting() {
      if (existing) return existing; existing = new Set();
      for (let from = 0; ; from += 1000) {
        const { data } = await admin.from("race_results").select("athlete_id,course,distance,stroke,result_time_seconds,result_date").eq("organisation_id", org).range(from, from + 999);
        for (const r of data || []) existing.add(`${r.athlete_id}|${r.course}|${r.distance}|${String(r.stroke).toLowerCase()}|${Number(r.result_time_seconds).toFixed(2)}|${r.result_date}`);
        if (!data || data.length < 1000) break;
      }
      return existing;
    }
    async function sha(s: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32); }
    async function source(fileUrl: string, meta: Record<string, unknown>) {
      const { data: s } = await admin.from("msos_results_sources").select("*").eq("organisation_id", org).eq("url", fileUrl).maybeSingle();
      if (s) return s;
      const { data: ins, error } = await admin.from("msos_results_sources").insert({ organisation_id: org, url: fileUrl, ...meta }).select("*").single();
      if (error) throw new Error(error.message); return ins;
    }
    // One swim, whatever its time: swimmer, date, course, event, round.
    const swimKey = (x: any) => `${x.athlete_id}|${x.result_date}|${x.course}|${x.distance}|${String(x.stroke).toLowerCase()}|${String(x.round || "").toLowerCase()}`;
    async function importFile(bytes: Uint8Array, fileUrl: string, meta: Record<string, unknown>) {
      const src = await source(fileUrl, meta);
      // race_results.import_batch_id points at result_import_batches; one batch per results file, same id as the source
      await admin.from("result_import_batches").upsert({ id: src.id, organisation_id: org, source_filename: fileUrl.slice(0, 300), source_type: "TM_HY3", status: "staged", notes: `MSOS results sync · ${src.source || ""}` }, { onConflict: "id", ignoreDuplicates: true });
      if (src.status === "imported" && !body.force) return { skipped: true, source: src.id, meet: src.meet_name };
      let parsed: any;
      try { parsed = await R.read(bytes, String(meta.page_title || "")); }
      catch (e) { await admin.from("msos_results_sources").update({ status: "no_results", error: String((e as Error).message).slice(0, 300) }).eq("id", src.id); return { source: src.id, error: (e as Error).message }; }
      const course = parsed.meet.course || parsed.results[0]?.course || null;
      // meet (unique on organisation, name, start date, course)
      let meetId: string | null = null;
      { const q = await admin.from("meets").select("id").eq("organisation_id", org).ilike("meet_name", parsed.meet.name).eq("start_date", parsed.meet.start).eq("course", course || "").maybeSingle();
        if (q.data) meetId = q.data.id;
        else { const ins = await admin.from("meets").insert({ organisation_id: org, meet_name: parsed.meet.name, start_date: parsed.meet.start, end_date: parsed.meet.end, course: course || "", venue: parsed.meet.facility || null, country: "NZL", governing_body: meta.source === "swiminfo" ? "SwimInfo NZ (Hy-Tek results)" : "Hy-Tek results file", external_key: fileUrl.slice(0, 200), source_file: fileUrl.slice(0, 300) }).select("id").single(); meetId = ins.data?.id || null; } }
      const have = await loadExisting();
      // swims already held for this meet, so a changed time / status / place updates the same row
      const held = new Map<string, any>();
      if (meetId) for (let from = 0; ; from += 1000) {
        const { data } = await admin.from("race_results").select("id,athlete_id,result_date,course,distance,stroke,round,result_time_seconds,result_status,official_place,approved").eq("organisation_id", org).eq("meet_id", meetId).neq("result_status", "REJECTED").range(from, from + 999);
        for (const x of data || []) held.set(swimKey(x), x);
        if (!data || data.length < 1000) break;
      }
      const ours = new Map<string, any>(), clubs = new Set<string>(), rows: any[] = [], updates: any[] = [];
      for (const sw of parsed.swimmers) { const m = ((match as any).__swap || match)(sw); if (m) { ours.set(sw.key, m); if (sw.teamCode) clubs.add(sw.teamCode); } }
      for (const r of parsed.results) {
        const m = ours.get(r.swimmer.key); if (!m || !r.distance || !r.stroke || !r.course) continue;
        if (!["OK", "DQ", "DNF"].includes(r.status)) continue;
        const sec = r.timeSec ? Math.round(r.timeSec * 100) / 100 : null; const date = r.date || parsed.meet.start;
        const timeText = r.status === "OK" ? r.timeText : r.status, timeSec = r.status === "OK" ? sec : null;
        const prior = held.get(swimKey({ athlete_id: m.athlete.id, result_date: date, course: r.course, distance: r.distance, stroke: r.stroke, round: r.round || null }));
        if (prior) {
          const changed = prior.result_status !== r.status || (timeSec ?? null) !== (prior.result_time_seconds == null ? null : Number(prior.result_time_seconds)) || (r.place || null) !== (prior.official_place ?? null);
          if (changed || !prior.approved) updates.push({ id: prior.id, result_time_text: timeText, result_time_seconds: timeSec, result_status: r.status, official_place: r.place || null, splits: r.splits?.length ? r.splits : null, approved: true, approved_at: new Date().toISOString(), source_file: fileUrl.slice(0, 300), changed });
          continue;
        }
        const k = `${m.athlete.id}|${r.course}|${r.distance}|${r.stroke.toLowerCase()}|${sec?.toFixed(2)}|${date}`;
        if (r.status === "OK" && have.has(k)) continue;
        have.add(k);
        rows.push({ organisation_id: org, import_batch_id: src.id, meet_id: meetId, athlete_id: m.athlete.id, raw_swimmer_name: `${r.swimmer.first} ${r.swimmer.last}`.trim(), club_code: r.swimmer.teamCode || null, club_name: r.swimmer.teamName || null,
          result_date: date, age_at_meet: r.swimmer.age, sex: r.swimmer.sex || null, course: r.course, distance: r.distance, stroke: r.stroke, round: r.round || null,
          result_time_text: timeText, result_time_seconds: timeSec, official_place: r.place || null, result_status: r.status,
          s_class: r.swimmer.classes?.s || null, sb_class: r.swimmer.classes?.sb || null, sm_class: r.swimmer.classes?.sm || null, relay_result: false, relay_leadoff: false, intermediate_split: false, official_result: true, source_file: fileUrl.slice(0, 300),
          source_row_key: `${parsed.fileName}|${r.swimmer.key}|${r.event}|${r.round}`, dedupe_key: await sha(`${org}|${m.athlete.id}|${String(parsed.meet.name).toLowerCase()}|${date}|${r.course}|${r.distance}|${r.stroke}|${r.round}|${r.status}|${sec}`),
          match_confidence: m.confidence, approved: true, approved_at: new Date().toISOString(), date_precision: "day", splits: r.splits?.length ? r.splits : null });
      }
      for (let i = 0; i < rows.length; i += 400) { const { error } = await admin.from("race_results").upsert(rows.slice(i, i + 400), { onConflict: "organisation_id,dedupe_key", ignoreDuplicates: true }); if (error) throw new Error(`Saving results: ${error.message}`); }
      let updated = 0;
      for (const u of updates) { const { id, changed, ...patch } = u; const { error } = await admin.from("race_results").update(patch).eq("id", id).eq("organisation_id", org); if (error) throw new Error(`Updating results: ${error.message}`); if (changed) updated++; }
      const unmatched = parsed.swimmers.filter((s: any) => !ours.has(s.key) && s.teamCode && clubs.has(s.teamCode)).map((s: any) => ({ name: `${s.first} ${s.last}`.trim(), reg: s.regId || null, dob: s.dob, club: s.teamCode, swims: parsed.results.filter((x: any) => x.swimmer.key === s.key && x.status === "OK").length, suggest: suggest(s) })).slice(0, 80);
      await admin.from("msos_results_sources").update({ status: "imported", meet_id: meetId, meet_name: parsed.meet.name, meet_start: parsed.meet.start, meet_end: parsed.meet.end, course, swims_total: parsed.results.length, swims_ours: rows.length + updates.length, swimmers_ours: ours.size, unmatched, error: null, imported_at: new Date().toISOString() }).eq("id", src.id);
      return { source: src.id, meet: parsed.meet.name, start: parsed.meet.start, course, swims_total: parsed.results.length, swimmers_ours: ours.size, swims_added: rows.length, swims_updated: updated, unmatched: unmatched.length, by: Object.fromEntries([...ours.values()].reduce((m: Map<string, number>, x: any) => m.set(x.confidence, (m.get(x.confidence) || 0) + 1), new Map())) };
    }
    // check one SwimInfo meet page; import any results file on it (recheck: read files already imported again)
    async function checkPage(p: { url: string; title: string; date: string | null }, recheck = false) {
      const html = await getText(p.url); const files = resultFiles(html); const out: any[] = [];
      for (const f of files) {
        const { data: s } = await admin.from("msos_results_sources").select("status").eq("organisation_id", org).eq("url", f.url).maybeSingle();
        if (s && s.status !== "new" && !body.force && !recheck) continue;
        if (filesRead >= maxFiles || timeLeft() < 15000) break;
        filesRead++;
        const forceBefore = body.force; if (recheck) body.force = true;
        try { out.push(await importFile(await getBytes(f.url), f.url, { source: "swiminfo", page_url: p.url, page_title: titleOf(html) || p.title, meet_start: p.date })); }
        catch (e) { await source(f.url, { source: "swiminfo", page_url: p.url, page_title: p.title }).then(s2 => admin.from("msos_results_sources").update({ status: "error", error: String((e as Error).message).slice(0, 300) }).eq("id", s2.id)); out.push({ url: f.url, error: (e as Error).message }); }
        finally { body.force = forceBefore; }
      }
      return { page: p.url, title: p.title, files: files.length, results: out };
    }
    async function yearList(year: number) { return listMeets(await getText(`${BASE}results.php?Year=${year}&year=${year}`)); }

    if (action === "probe") { const h = await getText(abs(String(body.url || "results.php"))); const i = Math.max(0, Number(body.from || 0)); return json({ length: h.length, html: h.slice(i, i + Number(body.len || 6000)), meets: listMeets(h).slice(0, 8), files: resultFiles(h) }); }
    if (action === "link") {
      // The coach confirms an unmatched results-file swimmer is one of theirs (e.g. a different date of birth in meet
      // files). Remembered on the athlete (source_profile.results_aliases) so every future file matches, and every file
      // already imported that listed this swimmer is imported again for them.
      if (actor === "cron") return json({ error: "Not allowed" }, 403);
      const name = String(body.name || "").trim(), dob = String(body.dob || "").slice(0, 10), aid = String(body.athlete_id || "");
      const a = (athletes || []).find((x: any) => x.id === aid); if (!a || !name || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({ error: "Swimmer, name and date of birth needed" }, 400);
      const prof = a.source_profile && typeof a.source_profile === "object" ? a.source_profile : {}; const aliases = Array.isArray(prof.results_aliases) ? prof.results_aliases : [];
      if (!aliases.some((x: any) => R.norm(x.name) === R.norm(name) && x.dob === dob)) aliases.push({ name, dob, linked_at: new Date().toISOString(), by: actor });
      const { error: ue } = await admin.from("athletes").update({ source_profile: { ...prof, results_aliases: aliases } }).eq("id", aid).eq("organisation_id", org); if (ue) throw new Error(ue.message);
      a.source_profile = { ...prof, results_aliases: aliases };
      const fresh = R.matcher(current); (match as any).__swap = fresh;
      const { data: srcs } = await admin.from("msos_results_sources").select("id,url,page_url,page_title,source,unmatched").eq("organisation_id", org).eq("status", "imported");
      const hit = (srcs || []).filter((x: any) => (x.unmatched || []).some((u: any) => R.norm(u.name) === R.norm(name) && u.dob === dob) && /^https:\/\/swiminfo\.co\.nz\//.test(x.url));
      body.force = true; const redone: any[] = [];
      for (const x of hit) { if (timeLeft() < 20000) break; try { redone.push(await importFile(await getBytes(x.url), x.url, { source: x.source, page_url: x.page_url, page_title: x.page_title })); } catch (e) { redone.push({ url: x.url, error: (e as Error).message }); } }
      return json({ linked: true, athlete: a.full_name, files: hit.length, redone });
    }
    if (action === "status") { const { data } = await admin.from("msos_results_sources").select("status").eq("organisation_id", org); const c: Record<string, number> = {}; for (const r of data || []) c[r.status] = (c[r.status] || 0) + 1; return json({ ok: true, files: c }); }
    if (action === "import") { const f = abs(String(body.url || "")); if (!/^https:\/\/swiminfo\.co\.nz\//.test(f)) return json({ error: "Only SwimInfo NZ links for now" }, 400); return json(await importFile(await getBytes(f), f, { source: "swiminfo", page_url: body.page_url || null, page_title: body.title || null })); }
    if (action === "upload") {
      const name = String(body.name || "results").slice(0, 120), b64 = String(body.file_b64 || ""); if (!b64) return json({ error: "No file" }, 400);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); if (bytes.length > 15_000_000) return json({ error: "File too large" }, 413);
      return json(await importFile(bytes, `upload:${name}:${await sha(b64)}`, { source: String(body.source || "upload").slice(0, 20), page_title: name }));
    }
    if (action === "scan" || action === "backfill") {
      // scan: this year's meets (and last year's in January) dated in the last 60 days or not dated, plus anything new,
      // then results files from the last RECHECK_DAYS days read again for corrections.
      // backfill: every meet in one year. Pages already imported are skipped; the run stops before the time limit and
      // says how many are left so the caller runs it again.
      const now = new Date(); const years: number[] = action === "backfill" ? (Array.isArray(body.years) ? body.years.map(Number) : [Number(body.year)]) : (now.getUTCMonth() === 0 ? [now.getUTCFullYear() - 1, now.getUTCFullYear()] : [now.getUTCFullYear()]);
      if (action === "backfill") { const { data: fin } = await admin.from("msos_results_sources").select("id").eq("organisation_id", org).eq("url", `backfill:done:${years.join(",")}`).maybeSingle(); if (fin && !body.force) return json({ action, years, done: true }); }
      if (!years.every(y => y >= 2010 && y <= 2100)) return json({ error: "year required" }, 400);
      let meets: any[] = []; for (const y of years) meets = meets.concat((await yearList(y)).map(m => ({ ...m, year: y })));
      const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10), today = now.toISOString().slice(0, 10);
      // every page already settled (paged: the list passes the 1,000-row read limit once history is in)
      const donePages = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data: done } = await admin.from("msos_results_sources").select("page_url").eq("organisation_id", org).in("status", ["imported", "no_results"]).not("page_url", "is", null).order("id").range(from, from + 999);
        for (const d of done || []) donePages.add(d.page_url);
        if (!done || done.length < 1000) break;
      }
      const settled = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      let todo = meets.filter(m => !donePages.has(m.url) && (!m.date || m.date <= today));
      if (action === "scan") todo = todo.filter(m => !m.date || m.date >= cutoff);
      const results: any[] = []; let checked = 0;
      for (const m of todo) { if (timeLeft() < 15000 || filesRead >= maxFiles) break; try { const r = await checkPage(m); checked++; if (r.files) { results.push(r);
          // every file on the page handled (some pages link a file already read from another meet page): the page is done
          if (!(r.results || []).some((x: any) => x.error)) await admin.from("msos_results_sources").upsert({ organisation_id: org, url: m.url, page_url: m.url, page_title: m.title, meet_start: m.date, source: "swiminfo-page", status: "imported" }, { onConflict: "organisation_id,url", ignoreDuplicates: true }); }
          // a meet page more than 30 days old with no results file: remember it so it isn't fetched again
          else if (m.date && m.date < settled) await admin.from("msos_results_sources").upsert({ organisation_id: org, url: m.url, page_url: m.url, page_title: m.title, meet_start: m.date, source: "swiminfo-page", status: "no_results", error: "No Team Manager results file on this meet page" }, { onConflict: "organisation_id,url", ignoreDuplicates: true });
        } catch (e) { results.push({ page: m.url, error: (e as Error).message }); checked++; } }
      // corrections: read recent results files again (a corrected file is often posted at the same address)
      const rechecked: any[] = [];
      if (action === "scan" && body.recheck !== false) {
        const since = new Date(Date.now() - RECHECK_DAYS * 86400000).toISOString().slice(0, 10);
        const recent = meets.filter(m => m.date && m.date >= since && m.date <= today && donePages.has(m.url));
        for (const m of recent) { if (timeLeft() < 20000 || filesRead >= maxFiles + 2) break; try { const r = await checkPage(m, true); rechecked.push({ title: m.title, updated: (r.results || []).reduce((n: number, x: any) => n + (x.swims_updated || 0), 0), added: (r.results || []).reduce((n: number, x: any) => n + (x.swims_added || 0), 0) }); } catch (e) { rechecked.push({ title: m.title, error: (e as Error).message }); } }
      }
      if (action === "backfill" && checked === todo.length) await admin.from("msos_results_sources").upsert({ organisation_id: org, url: `backfill:done:${years.join(",")}`, source: "swiminfo-page", status: "no_results", page_title: `History backfill finished ${new Date().toISOString().slice(0, 10)}` }, { onConflict: "organisation_id,url", ignoreDuplicates: true });
      return json({ action, years, meets_listed: meets.length, to_check: todo.length, checked, remaining: todo.length - checked, rechecked, results: results.map((r: any) => ({ title: r.title, results: (r.results || []).map((x: any) => ({ meet: x.meet, swims_added: x.swims_added, swims_updated: x.swims_updated, swimmers_ours: x.swimmers_ours, error: x.error, skipped: x.skipped })) })) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
