'use strict';
// Task #65 (11 Sept 2026) -- Andy's own long-standing complaint that "season plan and weekly plan [are]
// still not loaded into the system" (logged 7 Sept). Ground-truth audit found TWO separate real gaps:
// (1) engines/data-registry.js's generic importer normalized season_plan/weekly_plan rows into a shape far
// too thin for engines/coach-loop-ui.js's real planContext() to ever use -- critically, the weekly date
// field was literally emitted as `week`, not `week_start`, which is the exact field planContext()'s own
// weekScore()/dateInWeek() reads, so an imported weekly row could NEVER match a session's date no matter
// what a coach filled in; (2) Andy's own real AquaGym Winter 2026 season/weekly plan data already existed
// in engines/plan-reference-ch.js but that file was 100% dead code -- never loaded by index.html, only
// reachable via a forbidden retired overlay or a separate prototype page.
//
// Asked Andy directly (AskUserQuestion) whether to also load that real dormant data now, on top of fixing
// the import pipeline itself. He chose "Also import that existing data" rather than starting from empty.
//
// This suite proves: (a) the generic importer's normalizeRow/groupWeeklyRows now produce the rich,
// correctly-named shape coach-loop-ui.js actually reads, for both a flat per-day CSV export (the natural
// shape of a coach's spreadsheet) and a pre-nested JSON weekly document; (b) engines/plan-reference-2026.js
// (the new live replacement for the dead plan-reference-ch.js) seeds the real AquaGym data using the SAME
// bootstrap-once-unless-a-real-import-is-active precedent already trusted for engines/wa-base-times-2026.js,
// independently per type; (c) end-to-end, that seeded real data actually resolves through the REAL
// engines/coach-loop-ui.js's planContext() -- closing the loop the audit identified, including proving the
// day-level technical_focus field-naming fix (session_technical_focus -> technical_focus, matched exactly
// against planContext()'s own weekSession?.technical_focus reader) actually surfaces a day-specific value
// instead of silently always falling back to the week's phase-level text; and (d) two fail-before/pass-
// after checks reproducing the two real historical bugs this closes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const assert = require('assert/strict');

const ROOT = path.join(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'engines', 'data-registry.js');
const PLAN_REF_PATH = path.join(ROOT, 'engines', 'plan-reference-2026.js');
const COACH_LOOP_UI_PATH = path.join(ROOT, 'engines', 'coach-loop-ui.js');
const SCRATCH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'task65-'));

// ---------------------------------------------------------------------------------------------------
// Group 1 helpers: run the REAL engines/data-registry.js end-to-end (parseText -> preview -> commit),
// exactly the established pattern from tests/task64-reference-sync-20260911.cjs (vm.runInNewContext, since
// data-registry.js references the bare global `indexedDB` inside its own openDb() -- a plain `new Function`
// would resolve that against Node's real global instead of a stub).
// ---------------------------------------------------------------------------------------------------
function makeFakeIndexedDB() {
  const dbs = new Map();
  return {
    open(name) {
      const req = {};
      setTimeout(() => {
        if (!dbs.has(name)) dbs.set(name, new Map());
        const dbStores = dbs.get(name);
        const db = {
          objectStoreNames: { contains: n => dbStores.has(n) },
          createObjectStore(storeName, opts) {
            dbStores.set(storeName, { keyPath: opts.keyPath, data: new Map() });
            return dbStores.get(storeName);
          },
          transaction(storeName) {
            const storeObj = dbStores.get(storeName);
            const tx = {};
            const objectStore = {
              put(value) {
                storeObj.data.set(value[storeObj.keyPath], value);
                setTimeout(() => { tx.oncomplete && tx.oncomplete(); }, 0);
              },
              get(key) {
                const getReq = {};
                setTimeout(() => { getReq.result = storeObj.data.get(key); getReq.onsuccess && getReq.onsuccess(); }, 0);
                return getReq;
              },
            };
            tx.objectStore = () => objectStore;
            return tx;
          },
          close() {},
        };
        const isNew = !dbStores.has('datasets');
        req.result = db;
        if (isNew) req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    },
  };
}

function buildRegistryEnv(source) {
  const M = {
    util: {
      seconds: v => { if (typeof v === 'number') return v; const s = String(v || '').trim(); if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s); const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; },
      stableId: (...a) => a.join('-'),
      uid: p => `${p}-${Math.random().toString(36).slice(2)}`,
    },
    state: { athletes: [], settings: {} },
    cloud: {},
    store: { save: () => {} },
  };
  const sandbox = { MSOS4: M, MSOSEngines: {}, indexedDB: makeFakeIndexedDB(), console, setTimeout, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'engines/data-registry.js (test copy)' });
  return { D: M.dataRegistry, M };
}

function loadRegistrySource() { return fs.readFileSync(REGISTRY_PATH, 'utf8'); }

// ---------------------------------------------------------------------------------------------------
// Group 2 helper: run the REAL engines/coach-loop-ui.js's planContext() against a given
// seasonPlans/weeklyPlans array, exactly the pattern already established and trusted by
// tests/plan-reference-ch.cjs (plain global stubs, no DOM). require.cache is busted before each load since
// this needs to run coach-loop-ui.js's top-level IIFE fresh against a different global.MSOS4 each time.
// ---------------------------------------------------------------------------------------------------
function runPlanContext({ seasonPlans = [], weeklyPlans = [] }, session, coachLoopUiSourcePath = COACH_LOOP_UI_PATH) {
  global.addEventListener = () => {};
  global.MSOS4 = {
    state: { settings: {}, seasonPlans, weeklyPlans },
    ui: {}, actions: {},
    util: { text: v => String(v ?? '').replace(/\s+/g, ' ').trim(), escape: v => String(v ?? ''), clock: v => String(v ?? '') },
    store: { legacy: () => ({}) }, refs: { get: () => [] }, correct: {},
    currentSession: () => session,
  };
  delete require.cache[require.resolve(coachLoopUiSourcePath)];
  require(coachLoopUiSourcePath);
  return global.MSOS4.coachLoopUI.planContext(session);
}

function loadPlanReference2026(initialState, planRefSourcePath = PLAN_REF_PATH) {
  global.addEventListener = () => {};
  global.MSOS4 = { state: initialState };
  delete require.cache[require.resolve(planRefSourcePath)];
  require(planRefSourcePath);
  return global.MSOS4.state;
}

// ==================== Group A: normalizeRow/groupWeeklyRows produce the real, correctly-named shape ====

async function testWeeklyPlanFlatCsvGroupsWithRealFieldNames() {
  const { D, M } = buildRegistryEnv(loadRegistrySource());
  const csv = [
    'week_start,squad,day,day_part,session_focus,technical_focus,day_technical_focus,primary_system,objective',
    '2026-09-14,National,Monday,AM,Kick technique,Weekly focus: streamline,Day focus: kick timing,Aerobic Capacity,Streamline block',
    '2026-09-14,National,Tuesday,AM,Pull work,Weekly focus: streamline,,Aerobic Power,Streamline block',
    '2026-09-14,Development,Monday,PM,Endurance swim,Weekly focus: endurance,,Aerobic Capacity,Endurance block',
  ].join('\n');
  const parsed = D.parseText(csv, 'weekly-plan.csv');
  const pre = D.preview('weekly_plan', parsed, {});
  assert.equal(pre.errors.length, 0, 'a real weekly-plan CSV must not be rejected for missing required fields');
  await D.commit(pre);

  const plans = M.state.weeklyPlans;
  assert.equal(plans.length, 2, 'rows must be grouped into one record per (week_start, squad), not left as flat rows');

  const national = plans.find(p => p.squad === 'National');
  assert.ok(national, 'National group must exist');
  assert.equal(national.week_start, '2026-09-14', 'week_start (not `week`) must be the emitted date field -- this is the exact field coach-loop-ui.js\'s weekScore()/dateInWeek() read');
  assert.equal(national.sessions.length, 2);
  const mon = national.sessions.find(s => s.day === 'Monday');
  const tue = national.sessions.find(s => s.day === 'Tuesday');
  assert.equal(mon.technical_focus, 'Day focus: kick timing', 'a day-specific technical-focus column must override the week-level one for that day');
  assert.equal(tue.technical_focus, 'Weekly focus: streamline', 'with no day-specific override, a day must fall back to the week-level technical_focus column');
  assert.equal(mon.primary_system, 'Aerobic Capacity');
  assert.equal(tue.primary_system, 'Aerobic Power');

  const development = plans.find(p => p.squad === 'Development');
  assert.ok(development, 'Development group must be kept separate from National even though both share the same week_start');
  assert.equal(development.sessions.length, 1);
  console.log('  weekly_plan flat CSV -> grouped, real field names: PASS');
}

async function testWeeklyPlanPreNestedJsonNotDoubleNested() {
  const { D, M } = buildRegistryEnv(loadRegistrySource());
  const json = JSON.stringify([{
    id: 'week-custom-1', week_start: '2026-09-21', squad: 'Junior', programme: 'Junior', objective: 'Race prep week',
    sessions: [{ day: 'Friday', dayPart: 'PM', session_focus: 'Race pace 50s', technical_focus: 'Starts and finishes', primary_system: 'Anaerobic Power' }],
  }]);
  const parsed = D.parseText(json, 'weekly-plan.json');
  const pre = D.preview('weekly_plan', parsed, {});
  assert.equal(pre.errors.length, 0);
  await D.commit(pre);

  const plans = M.state.weeklyPlans;
  assert.equal(plans.length, 1);
  assert.equal(plans[0].week_start, '2026-09-21');
  assert.equal(plans[0].sessions.length, 1, 'a row that already arrives pre-nested (a JSON weekly document) must be kept as its own group, never double-nested by the flat-CSV grouping path');
  assert.equal(plans[0].sessions[0].day, 'Friday');
  console.log('  weekly_plan pre-nested JSON -> preserved, not double-nested: PASS');
}

async function testSeasonPlanCsvRichShape() {
  const { D, M } = buildRegistryEnv(loadRegistrySource());
  const csv = [
    'name,start_date,end_date,squads,overarching_goal,psychological_focus',
    'Spring Development 2027,2027-01-05,2027-04-01,"National,Development",Build aerobic base then race speed,Confidence and consistency',
  ].join('\n');
  const parsed = D.parseText(csv, 'season-plan.csv');
  const pre = D.preview('season_plan', parsed, {});
  assert.equal(pre.errors.length, 0);
  await D.commit(pre);

  const seasons = M.state.seasonPlans;
  assert.equal(seasons.length, 1);
  const s = seasons[0];
  assert.equal(s.name, 'Spring Development 2027');
  assert.equal(s.start_date, '2027-01-05');
  assert.equal(s.end_date, '2027-04-01');
  // Array.from(...) rehomes the array into this realm -- s.squads was built inside a vm.runInNewContext
  // sandbox (a separate realm with its own Array constructor), so a direct deepStrictEqual against an
  // outer-realm array literal would fail on prototype identity alone despite identical contents.
  assert.deepEqual(Array.from(s.squads), ['National', 'Development'], 'a comma-separated squads cell must split into a real array');
  assert.equal(s.overarching_goal, 'Build aerobic base then race speed');
  assert.equal(s.psychological_focus, 'Confidence and consistency');
  console.log('  season_plan CSV -> rich shape with start_date/end_date/squads array: PASS');
}

// ==================== Group B: engines/plan-reference-2026.js bootstrap-once seeding ====================

function testSeedsWhenNoRealImportActive() {
  const state = loadPlanReference2026({ seasonPlans: [], weeklyPlans: [], dataRegistry: { active: {} } });
  assert.equal(state.seasonPlans.length, 2, 'both AquaGym Winter 2026 seasons must seed');
  assert.equal(state.weeklyPlans.length, 84, 'National/Development (21 weeks each from the nd table) + Intermediate/Junior (21 weeks each from the ji table) must all seed');
  assert.ok(state.weeklyPlans.some(w => w.id === 'week-aquagym-national-2026-08-24'));
  console.log('  plan-reference-2026 seeds season+weekly plans when no real import is active: PASS');
}

function testWeeklyImportActiveStepsAsidePermanently() {
  const state = loadPlanReference2026({
    seasonPlans: [],
    weeklyPlans: [{ id: 'real-week-1', week_start: '2026-01-01', squad: 'National' }],
    dataRegistry: { active: { weekly_plan: 'dataset-real-1' } },
  });
  assert.equal(state.weeklyPlans.length, 1, 'once a real weekly_plan import is active, the seed must never merge in on top of it');
  assert.equal(state.weeklyPlans[0].id, 'real-week-1');
  assert.equal(state.seasonPlans.length, 2, 'season_plan seeding is independent -- it must still seed since only weekly_plan is active');
  console.log('  a real weekly_plan import permanently supersedes the seed (season seed unaffected): PASS');
}

// ==================== Group C: end-to-end -- real seeded data resolves through the real planContext() ====

function testEndToEndPlanContextResolvesRealSeededData() {
  const state = loadPlanReference2026({ seasonPlans: [], weeklyPlans: [], dataRegistry: { active: {} } });
  const session = { id: 'e2e-1', identity: { date: '2026-08-24', dayPart: 'AM', squads: ['National'], venue: 'AquaGym', course: 'SCM' }, metadata: {} };
  const ctx = runPlanContext({ seasonPlans: state.seasonPlans, weeklyPlans: state.weeklyPlans }, session);

  assert.equal(ctx.linkStatus, 'season+week', 'Coach Hub / session-methodology.js Board banner must resolve BOTH season and week for a real seeded date+squad');
  assert.match(ctx.seasonName, /Winter 2026/);
  assert.match(ctx.seasonGoal, /Finish & Breath Control/);
  assert.match(ctx.weeklyFocus, /Fly/);
  assert.match(ctx.weeklyFocus, /Finish & Breath Control/);
  assert.match(ctx.weeklyFocus, /Anaerobic Power/);
  assert.match(ctx.weeklyFocus, /South Island SC Champs/);
  assert.equal(ctx.todayFocus, 'Aerobic Capacity', 'National Monday AM\'s day-specific primary_system must win over the week-level value');
  assert.equal(ctx.technicalFocus, 'Kick strength · posture · body line · skills set up the week',
    'the day-specific technical_focus must surface (proves the session_technical_focus -> technical_focus field rename actually reaches planContext()\'s weekSession?.technical_focus reader) -- not the week\'s generic phase-level text');
  console.log('  end-to-end: real seeded AquaGym data resolves through the real planContext(): PASS');
}

// ==================== Group D: fail-before/pass-after -- the two real historical bugs this closes =======

async function testFailBeforePassAfterWeekFieldNameBug() {
  const realSrc = loadRegistrySource();
  assert.match(realSrc, /week_start:alias\(r,'week_start','week','date'\)/, 'sanity: real source must contain the week_start fix this test protects');
  // Reproduces the exact historical bug the audit found: the weekly date field emitted as `week`, not
  // `week_start` -- the literal field name coach-loop-ui.js's weekScore()/dateInWeek() read.
  const buggySrc = realSrc.replace(
    "week_start:alias(r,'week_start','week','date'),squad:",
    "week:alias(r,'week_start','week','date'),squad:"
  );
  assert.notStrictEqual(buggySrc, realSrc, 'sanity: bug injection must actually change the source');

  // Two real, distinct weeks for the same squad -- only their date tells them apart (same squad, so
  // squad-score alone can never distinguish them). The session's date falls inside week 2's range. The
  // source column is deliberately named `week` (not `week_start`) -- the exact real historical shape the
  // audit found (a coach's own spreadsheet column literally called "week"). With `week_start:alias(...)`
  // renamed to `week:alias(...)`, normalizeRow's `{...base}` spread of the raw row carries the raw `week`
  // value straight through either way, so this only actually exposes the bug when the raw column is NOT
  // already (coincidentally) named `week_start` -- exactly the real-world case that broke.
  const csv = [
    'week,squad,objective',
    '2026-08-17,National,Week1 objective text',
    '2026-08-24,National,Week2 objective text',
  ].join('\n');
  const session = { id: 'fb-1', identity: { date: '2026-08-24', dayPart: 'AM', squads: ['National'], venue: 'AquaGym', course: 'SCM' }, metadata: {} };

  const { D: buggyD, M: buggyM } = buildRegistryEnv(buggySrc);
  await buggyD.commit(buggyD.preview('weekly_plan', buggyD.parseText(csv, 'weekly-plan.csv'), {}));
  // Losing week_start also collapses grouping (every row keys to the same `${undefined}|National`), so the
  // two real weeks silently merge into one and week 2's own data is lost outright -- not just mismatched.
  assert.equal(buggyM.state.weeklyPlans.length, 1, 'sanity: without week_start, two distinct real weeks collapse into a single group (fail-before)');
  const buggyCtx = runPlanContext({ weeklyPlans: buggyM.state.weeklyPlans }, session);
  assert.equal(buggyCtx.weeklyFocus, 'Week1 objective text', 'sanity: with date-matching disabled, the session lands on whichever week happened to import first, not the week its own date actually falls in (fail-before)');

  const { D: realD, M: realM } = buildRegistryEnv(realSrc);
  await realD.commit(realD.preview('weekly_plan', realD.parseText(csv, 'weekly-plan.csv'), {}));
  assert.equal(realM.state.weeklyPlans.length, 2, 'the real fixed code must keep two distinct real weeks separate');
  const realCtx = runPlanContext({ weeklyPlans: realM.state.weeklyPlans }, session);
  assert.equal(realCtx.weeklyFocus, 'Week2 objective text', 'the real fixed code must match the week the session\'s own date actually falls in (pass-after)');
  console.log('  fail-before/pass-after (week -> week_start field-name bug): PASS');
}

async function testFailBeforePassAfterTechnicalFocusFieldNameBug() {
  const realSrc = fs.readFileSync(PLAN_REF_PATH, 'utf8');
  assert.match(realSrc, /\(\[day,dayPart,session_focus,technical_focus,primary_system\]\)/, 'sanity: real source must contain the technical_focus fix this test protects');
  const buggySrc = realSrc.replace(
    'const sessionRows=rows=>rows.map(([day,dayPart,session_focus,technical_focus,primary_system])=>({day,dayPart,session_focus,technical_focus,primary_system}));',
    'const sessionRows=rows=>rows.map(([day,dayPart,session_focus,technical_focus,primary_system])=>({day,dayPart,session_focus,session_technical_focus:technical_focus,primary_system}));'
  );
  assert.notStrictEqual(buggySrc, realSrc, 'sanity: bug injection must actually change the source');
  const buggyPath = path.join(SCRATCH_DIR, 'plan-reference-2026-buggy.js');
  fs.writeFileSync(buggyPath, buggySrc);

  const session = { id: 'fb-2', identity: { date: '2026-08-24', dayPart: 'AM', squads: ['National'], venue: 'AquaGym', course: 'SCM' }, metadata: {} };

  const buggyState = loadPlanReference2026({ seasonPlans: [], weeklyPlans: [], dataRegistry: { active: {} } }, buggyPath);
  const buggyCtx = runPlanContext({ seasonPlans: buggyState.seasonPlans, weeklyPlans: buggyState.weeklyPlans }, session);
  assert.notEqual(buggyCtx.technicalFocus, 'Kick strength · posture · body line · skills set up the week',
    'sanity: naming the day-level field session_technical_focus (the pre-fix name) must NOT surface the day-specific text (fail-before)');

  const realState = loadPlanReference2026({ seasonPlans: [], weeklyPlans: [], dataRegistry: { active: {} } }, PLAN_REF_PATH);
  const realCtx = runPlanContext({ seasonPlans: realState.seasonPlans, weeklyPlans: realState.weeklyPlans }, session);
  assert.equal(realCtx.technicalFocus, 'Kick strength · posture · body line · skills set up the week',
    'the real fixed field name must let the day-specific technical focus surface (pass-after)');
  console.log('  fail-before/pass-after (session_technical_focus -> technical_focus field-name bug): PASS');
}

async function main() {
  await testWeeklyPlanFlatCsvGroupsWithRealFieldNames();
  await testWeeklyPlanPreNestedJsonNotDoubleNested();
  await testSeasonPlanCsvRichShape();
  testSeedsWhenNoRealImportActive();
  testWeeklyImportActiveStepsAsidePermanently();
  testEndToEndPlanContextResolvesRealSeededData();
  await testFailBeforePassAfterWeekFieldNameBug();
  await testFailBeforePassAfterTechnicalFocusFieldNameBug();
  console.log('task65-plan-import PASS 8/8');
}

main().catch(e => { console.error(e); process.exit(1); });
