'use strict';
// Task #64 (11 Sept 2026) -- Andy's own "is that still set up... can I just drop a team file and results in"
// question. Ground-truth audit found athletes/CSV-results/reference-standards imported through the generic
// importer (engines/data-registry.js) never reached Supabase at all: absent from C.CORE_WRITE_TABLES/
// SCHEMA_CONTRACT, no project/stage functions, and the importer's own commit()/activate() never called
// M.cloud for anything. This suite proves the wiring closes that gap for athletes -> athletes,
// results/tm_results -> coach_results (Andy's own choice from three real candidates, via AskUserQuestion),
// test_results -> the ALREADY-existing training_test_results path, and wa_points/national_standards ->
// world_aquatics_base_times/pathway_standards -- and that every Meet-specific import type (meet_schedule/
// meet_entries/live_meet_results/meet_qualifying) is deliberately left untouched, per the standing
// "Meet is shelved" instruction.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// ---- extraction helpers -----------------------------------------------------------------------------
// extractIIFEContaining: app.js cannot be require()'d directly (its IIFEs touch document/window
// throughout, no jsdom here). Rather than re-implement the whole cloud-sync engine's logic by hand (which
// would test a re-guess, not the real shipped code), this locates the specific `(function(g){...})
// (globalThis);` IIFE that contains a distinctive marker string and lifts its body out whole, so it can be
// evaluated against a minimal stub `g` exactly the way the real file evaluates it against the real
// `globalThis` in a browser. Matches this repo's established "extraction by brace counting" convention
// (see tests/session-authorship-reconcile-20260911.cjs's extractFunctionDecl/extractArrowFn).
function extractIIFEContaining(source, marker) {
  const markerIdx = source.indexOf(marker);
  if (markerIdx < 0) throw new Error(`marker not found: ${marker}`);
  const fnIdx = source.lastIndexOf('(function(g){', markerIdx);
  if (fnIdx < 0) throw new Error(`enclosing IIFE not found for marker: ${marker}`);
  const openBraceIdx = source.indexOf('{', fnIdx);
  let depth = 0, i = openBraceIdx;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`unbalanced braces extracting IIFE for marker: ${marker}`);
  return source.slice(openBraceIdx + 1, i);
}

// Real U.clock, copied verbatim from app.js line 23, so result_time_text/qualifying_time_text assertions
// below check against the app's REAL clock formatting, not a re-implementation's guess.
function clock(sec) {
  sec = Number(sec);
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = sec - m * 60, dec = Math.abs(s - Math.round(s)) > 0.000001 ? 2 : 0, txt = s.toFixed(dec);
  if (!m) return txt;
  const parts = txt.split('.'), whole = parts[0].padStart(2, '0');
  return `${m}:${whole}${parts.length > 1 ? '.' + parts[1] : ''}`;
}

function buildCloudEnv(stateOverrides = {}) {
  const body = extractIIFEContaining(appSrc, 'const C=M.cloud={};');
  const pending = [];
  const state = Object.assign({
    settings: { organisationId: 'org-1' },
    athletes: [],
    resultsEventHistory: [],
    worldAquaticsBaseTimes: [],
    nationalStandards: [],
    pending,
  }, stateOverrides);
  const savedCalls = [];
  const M = {
    util: {
      now: () => '2026-09-11T00:00:00.000Z',
      clock,
      clone: x => JSON.parse(JSON.stringify(x)),
      uid: p => `${p}-fixture`,
      stableId: (...a) => a.join('|'),
    },
    state,
    store: {
      config: () => ({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key' }),
      auth: () => ({ access_token: 'tok', user: { id: 'user-1' } }),
      save: s => { savedCalls.push(s); },
    },
    currentSession: () => null,
  };
  const g = { MSOS4: M };
  new Function('g', body)(g);
  return { C: M.cloud, state, savedCalls };
}

// ---- Group 1: app.js's new project*/stage* functions -----------------------------------------------
function testContractMembership() {
  const { C } = buildCloudEnv();
  for (const t of ['athletes', 'coach_results', 'world_aquatics_base_times', 'pathway_standards']) {
    assert.ok(C.CORE_WRITE_TABLES.includes(t), `CORE_WRITE_TABLES must include ${t}`);
    assert.ok(Array.isArray(C.SCHEMA_CONTRACT[t]) && C.SCHEMA_CONTRACT[t].length > 0, `SCHEMA_CONTRACT must declare ${t}`);
  }
  console.log('  contract membership: PASS');
}

function testProjectAthlete() {
  const { C } = buildCloudEnv();
  const row = { id: 'ath-1', full_name: 'Alex Auer', squad: 'National', sex: 'M', date_of_birth: '2008-04-01', classification: 'S9', active: true, modifications: 'Shoulder protocol' };
  const projected = C.projectAthlete(row);
  assert.equal(projected.id, 'ath-1');
  assert.equal(projected.organisation_id, 'org-1');
  assert.equal(projected.full_name, 'Alex Auer');
  assert.equal(projected.squad, 'National');
  assert.equal(projected.active, true);
  assert.equal(projected.current_s_class, 'S9', 'classification must map onto current_s_class');
  assert.equal(projected.modifications, 'Shoulder protocol');
  assert.equal(projected.created_by, 'user-1');
  // Must never trip the production schema guard -- every key it produces must be an allowed column.
  assert.doesNotThrow(() => C.assertSchema('athletes', projected), 'projectAthlete output must satisfy its own SCHEMA_CONTRACT entry');
  console.log('  projectAthlete: PASS');
}

function testProjectAthleteInactiveDefault() {
  const { C } = buildCloudEnv();
  const projected = C.projectAthlete({ id: 'ath-2', full_name: 'New Swimmer', squad: '', active: false });
  assert.equal(projected.active, false, 'active:false must be preserved, not defaulted to true');
  assert.equal(projected.current_s_class, null, 'no classification given must stay null, never invented');
  console.log('  projectAthlete inactive/no-classification default: PASS');
}

function testStageAthleteQueues() {
  const { C, state } = buildCloudEnv();
  const ok = C.stageAthlete({ id: 'ath-3', full_name: 'Ruby Stace', squad: 'Development', active: true });
  assert.equal(ok, true);
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].table, 'athletes');
  assert.equal(state.pending[0].record.id, 'ath-3');
  assert.equal(C.stageAthlete(null), false, 'a falsy row must be rejected, not queued as a broken record');
  console.log('  stageAthlete queues a real pending write: PASS');
}

function testProjectCoachResultNameFallback() {
  const { C } = buildCloudEnv({ athletes: [{ id: 'ath-9', full_name: 'Coral Sturla' }] });
  // No athlete_name on the row itself -- must resolve the swimmer's real name via athlete_id, exactly the
  // same fallback pattern already proven for training_test_results (source_swimmer_name).
  const row = { id: 'res-1', athlete_id: 'ath-9', result_date: '2026-08-01', pool_course: 'LCM', distance: 200, stroke: 'Butterfly', result_seconds: 135.42, meet_name: 'Winter Champs', source_type: 'result_import' };
  const projected = C.projectCoachResult(row);
  assert.equal(projected.swimmer_name, 'Coral Sturla', 'swimmer_name (NOT NULL, no server default) must never be left blank when a real athlete match exists');
  assert.equal(projected.source_swimmer_name, 'Coral Sturla');
  assert.equal(projected.course, 'LCM');
  assert.equal(projected.distance, 200);
  assert.equal(projected.result_seconds, 135.42);
  assert.equal(projected.result_time_text, clock(135.42), 'result_time_text must be derived from result_seconds via the real U.clock formatter');
  assert.doesNotThrow(() => C.assertSchema('coach_results', projected));
  console.log('  projectCoachResult name-fallback + clock text: PASS');
}

function testProjectCoachResultNoMatchStillHasName() {
  const { C } = buildCloudEnv();
  const projected = C.projectCoachResult({ id: 'res-2', athlete_name: 'Visiting Swimmer', distance: 50, stroke: 'Freestyle', result_seconds: 24.1 });
  assert.equal(projected.swimmer_name, 'Visiting Swimmer');
  assert.equal(projected.result_time_text, clock(24.1));
  console.log('  projectCoachResult direct athlete_name: PASS');
}

function testProjectWaBaseTimeSeasonFallback() {
  const { C } = buildCloudEnv();
  // season is NOT NULL with no server default on the live table -- table_version (the field the generic
  // importer's wa_points type actually produces) must always resolve to something non-null.
  const withVersion = C.projectWaBaseTime({ id: 'wa-1', course: 'SCM', sex: 'F', distance: 100, stroke: 'Freestyle', base_seconds: 51.5, table_version: 'WA 2026' });
  assert.equal(withVersion.season, 'WA 2026');
  const withoutVersion = C.projectWaBaseTime({ id: 'wa-2', course: 'LCM', sex: 'M', distance: 200, stroke: 'IM', base_seconds: 116.2 });
  assert.ok(withoutVersion.season && typeof withoutVersion.season === 'string' && withoutVersion.season.length > 0, 'season must never be null/empty -- the live column is NOT NULL with no default');
  assert.doesNotThrow(() => C.assertSchema('world_aquatics_base_times', withVersion));
  console.log('  projectWaBaseTime season fallback: PASS');
}

function testProjectPathwayStandardNotNullFallbacks() {
  const { C } = buildCloudEnv();
  // Deliberately a minimal row -- the generic importer's national_standards type has no "programme" or
  // "progression order" concept at all, so every NOT NULL pathway_standards column without a server
  // default must still resolve to something, never left to fail the insert outright.
  const bare = { id: 'std-1', distance: 100, stroke: 'Breaststroke', standard_seconds: 78.4 };
  const projected = C.projectPathwayStandard(bare);
  assert.ok(projected.programme, 'programme (NOT NULL, no default) must never be blank');
  assert.ok(projected.season, 'season (NOT NULL, no default) must never be blank');
  assert.equal(typeof projected.progression_order, 'number', 'progression_order (NOT NULL, no default) must always be a number');
  assert.equal(projected.course, 'BOTH', 'an unspecified course must default to BOTH, matching P.standardMatches which already treats BOTH as matching either course');
  assert.equal(projected.qualifying_time_text, clock(78.4));
  assert.equal(projected.qualifying_seconds, 78.4);
  assert.doesNotThrow(() => C.assertSchema('pathway_standards', projected));
  // Now with a richer row -- real values must be preferred over the fallbacks, not overridden by them.
  const rich = { id: 'std-2', standard_name: 'NZSC Qualifying', course: 'LCM', sex: 'F', age_group: '15-16', distance: 200, stroke: 'IM', standard_seconds: 145.0, version: '2026-27', effective_from: '2026-09-01', reference_kind: 'national_standards', source: 'Swimming NZ' };
  const projectedRich = C.projectPathwayStandard(rich);
  assert.equal(projectedRich.programme, 'NZSC Qualifying');
  assert.equal(projectedRich.course, 'LCM');
  assert.equal(projectedRich.season, '2026-27');
  assert.equal(projectedRich.effective_from, '2026-09-01');
  console.log('  projectPathwayStandard NOT-NULL fallbacks + real-value precedence: PASS');
}

function testRecordForRederivesFreshState() {
  const { C, state } = buildCloudEnv({ athletes: [{ id: 'ath-5', full_name: 'Original Name', squad: 'A', active: true }] });
  C.stageAthlete(state.athletes[0]);
  const queued = state.pending[0];
  // Simulate the athlete's name being corrected locally AFTER staging but BEFORE flush -- C.recordFor must
  // pull the freshest row at send time, exactly like the existing training_test_results/sessions branches.
  state.athletes[0].full_name = 'Corrected Name';
  const fresh = C.recordFor(queued);
  assert.equal(fresh.full_name, 'Corrected Name', 'C.recordFor must re-derive athletes from the freshest local state, not the stale queued snapshot');
  console.log('  C.recordFor re-derives athletes/coach_results/wa/pathway tables: PASS');
}

// ---- Group 2: engines/data-registry.js's commit()/activate() -> cloud stage wiring -------------------
// A minimal in-memory IndexedDB, sufficient for data-registry.js's own openDb()/putDataset()/getDataset()
// usage pattern -- not a general-purpose fake, just enough surface for the real commit()/activate() code
// path to run unmodified in Node.
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

// engines/data-registry.js is a plain `(function(g){ ... })(globalThis);` file with no DOM dependency
// (confirmed: no document/window reference anywhere in it), but it does reference the bare global
// `indexedDB` inside its own openDb() -- so it must run inside a real separate vm context (exactly the
// established pattern in tests/reference-data-regression.cjs, `sandbox.globalThis=sandbox` +
// `vm.runInNewContext`), not a plain `new Function`, since a bare identifier inside `new Function` would
// resolve against Node's real global object rather than a stubbed one.
function buildRegistryEnv(dataRegistrySource) {
  const calls = { stageAthlete: [], stageCoachResult: [], stageTrainingTestResult: [], stageWaBaseTime: [], stagePathwayStandard: [] };
  const M = {
    util: {
      seconds: v => { if (typeof v === 'number') return v; const s = String(v || '').trim(); if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s); const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; },
      stableId: (...a) => a.join('-'),
      uid: p => `${p}-${Math.random().toString(36).slice(2)}`,
    },
    state: { athletes: [], settings: {} },
    cloud: {
      stageAthlete: row => { calls.stageAthlete.push(row); },
      stageCoachResult: row => { calls.stageCoachResult.push(row); },
      stageTrainingTestResult: row => { calls.stageTrainingTestResult.push(row); },
      stageWaBaseTime: row => { calls.stageWaBaseTime.push(row); },
      stagePathwayStandard: row => { calls.stagePathwayStandard.push(row); },
    },
    store: { save: () => {} },
  };
  const sandbox = { MSOS4: M, MSOSEngines: {}, indexedDB: makeFakeIndexedDB(), console, setTimeout, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(dataRegistrySource, sandbox, { filename: 'engines/data-registry.js (test copy)' });
  return { D: M.dataRegistry, calls, M };
}

function loadRegistrySource() {
  return fs.readFileSync(path.join(ROOT, 'engines', 'data-registry.js'), 'utf8');
}

async function testSwimmersImportStagesAthlete() {
  const { D, calls } = buildRegistryEnv(loadRegistrySource());
  const parsed = D.parseText('full_name,squad,sex,dob,classification\nMcKenzie Drage,National,F,2007-02-14,', 'roster.csv');
  assert.equal(D.detect(parsed), 'swimmers');
  const pre = D.preview('swimmers', parsed, {});
  assert.equal(pre.validCount, 1);
  await D.commit(pre);
  assert.equal(calls.stageAthlete.length, 1, 'importing a swimmer must stage exactly one athletes row to cloud');
  assert.equal(calls.stageAthlete[0].full_name, 'McKenzie Drage');
  console.log('  swimmers import -> stageAthlete: PASS');
}

async function testResultsImportStagesCoachResult() {
  const { D, calls } = buildRegistryEnv(loadRegistrySource());
  const parsed = D.parseText('athlete,distance,stroke,time,meet\nCharlotte Murphy,100,Freestyle,58.20,Winter Champs', 'results.csv');
  assert.equal(D.detect(parsed), 'results');
  const pre = D.preview('results', parsed, {});
  assert.equal(pre.validCount, 1);
  await D.commit(pre);
  assert.equal(calls.stageCoachResult.length, 1, 'importing a race result must stage exactly one coach_results row to cloud');
  assert.equal(calls.stageCoachResult[0].athlete_name, 'Charlotte Murphy');
  console.log('  results import -> stageCoachResult: PASS');
}

async function testTestResultsImportStagesExistingT400Path() {
  const { D, calls } = buildRegistryEnv(loadRegistrySource());
  const parsed = D.parseText('athlete,time,test_key\nAlex Auer,5:23.0,t400_freestyle', 'test-import.csv');
  assert.equal(D.detect(parsed), 'test_results');
  const pre = D.preview('test_results', parsed, {});
  assert.equal(pre.validCount, 1);
  await D.commit(pre);
  assert.equal(calls.stageTrainingTestResult.length, 1, 'CSV-imported T400 rows must reach the SAME already-existing training_test_results stage function the hand-entry/bulk-paste UI uses -- no second write path');
  console.log('  test_results import -> the pre-existing stageTrainingTestResult: PASS');
}

async function testWaPointsAndNationalStandardsImportStage() {
  const { D, calls } = buildRegistryEnv(loadRegistrySource());
  const wa = D.parseText('course,sex,distance,stroke,base_seconds\nSCM,F,100,Freestyle,50.25', 'wa-base.csv');
  await D.commit(D.preview('wa_points', wa, { version: '2027' }));
  assert.equal(calls.stageWaBaseTime.length, 1);

  const qt = D.parseText('standard_name,course,sex,age_group,distance,stroke,time\nNAGS 2027,SCM,F,14,100,Breaststroke,1:21.50', 'nags.csv');
  await D.commit(D.preview('national_standards', qt, { version: '2027' }));
  assert.equal(calls.stagePathwayStandard.length, 1);
  console.log('  wa_points/national_standards imports -> stageWaBaseTime/stagePathwayStandard: PASS');
}

async function testMeetTypesNeverStageAnything() {
  const { D, calls } = buildRegistryEnv(loadRegistrySource());
  const entries = D.parseText('meet_id,athlete,event,heat,lane\nm1,Luke Thompson,100 Free,3,4', 'entries.csv');
  await D.commit(D.preview('meet_entries', entries, {}));
  const schedule = D.parseText('title,date\nSouth Islands,2026-10-01', 'meet.csv');
  await D.commit(D.preview('meet_schedule', schedule, {}));
  for (const key of Object.keys(calls)) assert.equal(calls[key].length, 0, `Meet-specific import types must never call M.cloud.${key} -- Meet stays shelved`);
  console.log('  Meet-specific import types stage nothing to cloud: PASS');
}

// ---- fail-before/pass-after: prove this suite actually catches the original gap -----------------------
// Reverts the exact fix (removing syncToCloud(...) from commit()/activate(), leaving them exactly as they
// were before Task #64 -- apply()+invalidate() only) against a scratch copy of the real source, and
// confirms the very same test above would have failed against the pre-fix code.
async function testFailBeforePassAfterCommitWiring() {
  const realSrc = loadRegistrySource();
  assert.match(realSrc, /syncToCloud\(pre\.type,pre\.rows\)/, 'sanity: real source must contain the fix this test protects');
  const buggySrc = realSrc.replace('invalidate(pre.type,TYPES[pre.type].impact);syncToCloud(pre.type,pre.rows);return meta;', 'invalidate(pre.type,TYPES[pre.type].impact);return meta;');
  assert.notStrictEqual(buggySrc, realSrc, 'sanity: bug injection must actually change the source');

  const { D: buggyD, calls: buggyCalls } = buildRegistryEnv(buggySrc);
  const parsed = buggyD.parseText('full_name,squad\nTest Swimmer,National', 'roster.csv');
  await buggyD.commit(buggyD.preview('swimmers', parsed, {}));
  assert.equal(buggyCalls.stageAthlete.length, 0, 'sanity: the pre-Task-#64 code must reproduce the original gap (no cloud stage call at all)');

  const { D: realD, calls: realCalls } = buildRegistryEnv(realSrc);
  await realD.commit(realD.preview('swimmers', realD.parseText('full_name,squad\nTest Swimmer,National', 'roster.csv'), {}));
  assert.equal(realCalls.stageAthlete.length, 1, 'the real fixed code must stage the athlete');
  console.log('  fail-before/pass-after (commit() cloud-sync wiring): PASS');
}

async function main() {
  testContractMembership();
  testProjectAthlete();
  testProjectAthleteInactiveDefault();
  testStageAthleteQueues();
  testProjectCoachResultNameFallback();
  testProjectCoachResultNoMatchStillHasName();
  testProjectWaBaseTimeSeasonFallback();
  testProjectPathwayStandardNotNullFallbacks();
  testRecordForRederivesFreshState();
  await testSwimmersImportStagesAthlete();
  await testResultsImportStagesCoachResult();
  await testTestResultsImportStagesExistingT400Path();
  await testWaPointsAndNationalStandardsImportStage();
  await testMeetTypesNeverStageAnything();
  await testFailBeforePassAfterCommitWiring();
  console.log('task64-reference-sync PASS 15/15');
}

main().catch(e => { console.error(e); process.exit(1); });
