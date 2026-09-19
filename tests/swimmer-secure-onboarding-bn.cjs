'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const text=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=text('swimmer-portal.html'),portal=text('swimmer-portal.js'),coach=text('engines/swimmer-invite-bn.js'),context=text('engines/swimmer-experience-cl.js'),instant=text('engines/swimmer-instant-open-cn.js'),sql=text('supabase/20260824_secure_swimmer_portal.sql'),interactionSql=text('supabase/20260824_swimmer_session_interactions.sql'),index=text('index.html'),sw=text('sw.js');
assert.ok(html.includes('swimmer-portal.js'),'secure portal shell is not wired');
assert.ok(!html.includes('seed.js'),'swimmer portal must never load coach seed/roster data');
assert.ok(!html.includes('app.js'),'swimmer portal must not load coach application shell');
assert.ok(!html.includes('v4-poolside-core.js'),'swimmer portal must not load coach canonical runtime');
assert.ok(portal.includes('msos_claim_swimmer_invite'),'one-time invite claim missing');
assert.ok(portal.includes('msos_swimmer_portal_snapshot'),'device-token snapshot missing');
assert.ok(portal.includes("history.replaceState({},'',location.pathname)"),'invite token is not removed from URL after claim');
assert.ok(portal.includes("TAB='session'"),'swimmer portal must open on the swimmer session');
assert.ok(portal.includes('function pathwayDetail')&&portal.includes("kind=k=>({qualifying:'QT',finalist:'Final',medal:'Medal',winner:'Win'"),'swimmer portal lost QT-to-final-to-medal-to-win pathway semantics');
assert.ok(portal.includes("otherC=c==='SCM'?'LCM':'SCM'")&&portal.includes('sp-outlook'),'swimmer portal lost the second-course outlook');
assert.ok(portal.includes('Strongest performance first.')&&portal.includes('Tap an event for the full pathway, PB race and splits.'),'Performance must remain compact and event-led behind the Session home');
assert.ok(portal.includes('Finish session with Andy')||portal.includes('Finish session with your coach'),'session finish action missing');
assert.ok(portal.includes('Challenge this set')&&portal.includes('Edit your version'),'swimmer session challenge/edit contract missing');
assert.ok(portal.includes('msos_swimmer_submit_session_action'),'secure session-action submit missing');
assert.ok(coach.includes('Give swimmer access'),'coach access action missing');
assert.ok(coach.includes('msos_publish_swimmer_payload'),'athlete-specific projection publish missing');
assert.ok(coach.includes("['shared','swimmer']"),'coach-private captures are not explicitly excluded');
assert.ok(coach.includes('msos_revoke_swimmer_devices'),'coach revoke control missing');
assert.ok(coach.includes('prepareAthlete'),'QR publish no longer verifies complete athlete evidence');
assert.ok(coach.includes('readinessFor'),'QR publish no longer has a swimmer-readiness gate');
assert.ok(coach.includes('pathwaysForAthlete'),'secure payload is not using the forward-looking performance engine');
assert.ok(coach.includes("schema:'msos-swimmer-portal-v6'"),'secure payload schema did not advance with the calendar session picker');
assert.ok(coach.includes('function sessionsFor(a)')&&coach.includes('candidateSessionsFor'),'secure payload lost the calendar session picker list');
assert.ok(coach.includes('session=sessions.find(s=>s.id===currentId)||safeSession(a)'),'secure payload lost current athlete session projection (or its calendar-picker fallback to safeSession(a))');
assert.ok(coach.includes('pathway:{SCM:scm,LCM:lcm}'),'secure payload lost both pathway tracks');
// 19 Sept 2026: payloadFor's return object switched from `tests:safeTests(a)`/`meet:safeMeet(a)` to
// shorthand `tests`/`meet` (commit c4d2d13) when per-sub-step breadcrumb checkpoints were added — each value
// is now built one line earlier (`const tests=safeTests(a);`/`const meet=safeMeet(a);`) so a step() call can
// fire between them. Same data reaching the same payload keys, just no longer a same-line literal call --
// this was a stale assertion left behind by that refactor, not a real product regression.
assert.ok(coach.includes('const tests=safeTests(a);')&&coach.includes('const meet=safeMeet(a);')&&/\btests,meet\b/.test(coach),'secure payload must contain swimmer-only tests and meet data');
assert.ok(context.includes('disabled:true'),'legacy swimmer experience layer must remain retired');
assert.ok(!context.includes('MutationObserver'),'retired swimmer context layer must not install observer loops');
assert.ok(instant.includes('quickRanked'),'fast local swimmer surface is missing');
assert.ok(instant.includes('Tap to load pathway, PB race and splits'),'coach swimmer view must keep detail behind event tap');
cp.execFileSync(process.execPath,['--check',path.join(root,'engines/swimmer-experience-cl.js')],{stdio:'pipe'});
cp.execFileSync(process.execPath,['--check',path.join(root,'engines/swimmer-instant-open-cn.js')],{stdio:'pipe'});
cp.execFileSync(process.execPath,['--check',path.join(root,'swimmer-portal.js')],{stdio:'pipe'});
assert.ok(sql.includes('enable row level security'),'RLS is not enabled');
assert.ok(sql.includes('revoke all on public.msos_swimmer_payloads from anon, authenticated'),'payload table is directly readable');
assert.ok(sql.includes('consumed_at is null and expires_at>now()'),'invite is not one-time + expiring');
assert.ok(sql.includes('revoked_at is null'),'revoked device protection missing');
assert.ok(sql.includes("encode(digest(raw_device,'sha256'),'hex')"),'raw device token is stored server-side');
assert.ok(interactionSql.includes('enable row level security')&&interactionSql.includes('msos_swimmer_submit_session_action'),'swimmer interaction layer is not server-protected');
assert.ok(interactionSql.includes("action_type in ('challenge','edit_request','finish')"),'swimmer interaction action allow-list missing');
// 19 Sept 2026: these three checks used to pin an exact allow-list of historical `?v=` cache-bust tags for
// each engine, so every routine version bump (there have been several since -- most recently
// 20260919-qr-concurrent-attempt-guard for swimmer-invite-bn.js) required coming back here to extend the
// list, even though the actual thing worth checking (this engine IS loaded at all) never stopped being true.
// Checking the base path with any `?v=` value instead matches the stated intent of each failure message
// without needing to be re-pinned on every future bump; swimmer-experience-cl.js below is intentionally left
// exact-pinned since CLAUDE.md documents it as a retired shim that should not be touched/re-versioned again.
assert.ok(/engines\/swimmer-invite-bn\.js\?v=[^"'\s]+/.test(index),'coach QR engine not loaded');
assert.ok(/engines\/swimmer-performance-ci\.js\?v=[^"'\s]+/.test(index),'swimmer integrity model not loaded');
assert.ok(index.includes('engines/swimmer-experience-cl.js?v=20260824cp'),'retired swimmer compatibility shim is not loaded safely');
assert.ok(/engines\/swimmer-instant-open-cn\.js\?v=[^"'\s]+/.test(index),'unified swimmer surface is not loaded');
assert.ok(!index.includes('engines/swimmer-performance-bm.js?v=20260824bm'),'regressed DOM takeover is still active');
assert.ok(sw.includes("u.pathname.endsWith('/swimmer-portal.html')"),'service worker would route swimmer portal into coach app');
assert.ok(sw.includes("'./swimmer-portal.html'"),'secure portal is not available through installed PWA cache');
console.log('SWIMMER_SECURE_ONBOARDING_BN_PASS');
