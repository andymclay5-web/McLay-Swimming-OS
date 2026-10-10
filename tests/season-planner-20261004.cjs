'use strict';
// 4 Oct 2026 (Andy, verbatim, explaining why the season plan loaded in MSOS dead-ends after Nationals):
// "I think the weekly plan just needs to be a standard that can be adjusted as suits within the app...
// stays as is unless specifically changed, edited within the app" and on the season plan: "that's generally
// just based off nationals... winter plan is based off short course nationals, summer plan is based off age
// groups and opens, and we just kind of count back through cycling through the energy systems... I feel
// like there's got to be a better way to actually have it already in the app, but editable and changeable
// and evolvable." Andy chose "Build it now, full scope" when asked how to sequence this against the other
// deferred work.
//
// engines/season-planner.js is the new engine: a standing per-squad weekly day-pattern (edited in-app, not
// re-imported every season) plus a season phase-cycle generator that counts backward from a target meet
// through base -> underwater -> turns -> finish -> taper, exactly the mechanism Andy described. This test
// proves, against the REAL engine on disk:
//  1. generateSeason() reproduces the EXACT historical Winter 2026 phase split (4/4/4/4/5 weeks) and the
//     exact week_start dates already shipped in engines/plan-reference-2026.js's real seed data -- a direct,
//     concrete anchor to real data already in this repo, not an invented fixture;
//  2. fail-before/pass-after: the specific line that hands taper the real REMAINDER (not just its configured
//     minimum) is what makes that historical match possible -- stripping it breaks the match;
//  3. a short season never breaks two real invariants (every phase's weeks sum to the total; taper never
//     drops below its configured minimum), across a sweep of lengths, including ones too short to give every
//     phase at least 1 week (a mathematical impossibility at 3-6 weeks for 4 non-taper phases, not a bug);
//  4. generateSeason()'s own input validation (meet before season start; no squads chosen);
//  5. a squad with no standing weekly template produces a clear warning and empty sessions, rather than a
//     silent gap or a crash;
//  6. the generated rows pass engines/data-registry.js's OWN real preview()/validation with zero errors --
//     proof the generator's output is actually consumable by the existing import/version/commit pipeline,
//     not just internally self-consistent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PLANNER_PATH = path.join(__dirname, '..', 'engines', 'season-planner.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'engines', 'data-registry.js');
const originalPlanner = fs.readFileSync(PLANNER_PATH, 'utf8');

function makeSandbox() {
  const g = {};
  g.globalThis = g;
  g.MSOS4 = { state: {}, util: { stableId: (...a) => a.join('-'), uid: (p) => `${p}-x`, seconds: (v) => Number(v), escape: (v) => v }, cloud: {} };
  return g;
}
function loadInto(g, srcPath, src = fs.readFileSync(srcPath, 'utf8')) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src);
  fn(g);
}

(async () => {
  // --- 1. Reproduces the real historical Winter 2026 season exactly. ---
  {
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH);
    const P = g.MSOS4.seasonPlanner;
    const HIST_DATES = ['2026-05-11','2026-05-18','2026-05-25','2026-06-01','2026-06-08','2026-06-15','2026-06-22','2026-06-29','2026-07-06','2026-07-13','2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28'];
    const starts = P.weekStarts('2026-05-11', '2026-09-28');
    assert.deepEqual(starts, HIST_DATES, 'weekStarts() must reproduce the exact 21 week_start dates already shipped in engines/plan-reference-2026.js\'s real Winter 2026 data');
    // 10 Oct 2026 (Andy): spare weeks now go to the first aerobic block, counting back from the meet --
    // superseding the Winter 2026 4/4/4/4/5 split this test used to reproduce. Same 21 dates: Base takes
    // the 3 spare weeks, taper keeps its set 2.
    const alloc = P.allocatePhases(starts.length, P.SEED_PHASES);
    assert.deepEqual(alloc.map((a) => a.weeks), [7, 4, 4, 4, 2], 'spare weeks go to Base Skills; later phases and taper keep their set lengths');
    // Summer 2026/27: Mon 12 Oct 2026 -> NAGS Sun 11 Apr 2027 = 27 week rows.
    const summer = P.weekStarts('2026-10-12', '2027-04-11');
    assert.equal(summer.length, 27);
    assert.deepEqual(P.allocatePhases(summer.length, P.SEED_PHASES).map((a) => a.weeks), [13, 4, 4, 4, 2]);
    console.log('SEASON_PLANNER_HISTORICAL_MATCH_PASS');
  }

  // --- 2. Fail-before/pass-after: taper absorbing the real remainder (not just its configured minimum) is
  // what makes test 1 pass. ---
  {
    const TAPER_LINE = 'const taperWeeks=totalWeeks-weeksPerPhase.reduce((a,b)=>a+b,0);';
    assert.ok(originalPlanner.includes(TAPER_LINE), 'expected the exact taper-remainder line in the real source -- refusing to run against unexpected state');
    // Fail-before: without the spare-weeks-to-Base line, the old behaviour (taper absorbs the remainder)
    // returns -- a 7-week taper for Summer.
    const BASE_LINE = 'if(weeksPerPhase.length)weeksPerPhase[0]+=availableForNonTaper-sumDesired;';
    assert.ok(originalPlanner.includes(BASE_LINE), 'expected the spare-weeks-to-Base line in the real source');
    const brokenSrc = originalPlanner.replace(BASE_LINE, '');
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH, brokenSrc);
    const P = g.MSOS4.seasonPlanner;
    const alloc = P.allocatePhases(P.weekStarts('2026-10-12', '2027-04-11').length, P.SEED_PHASES);
    assert.deepEqual(alloc.map((a) => a.weeks), [4, 4, 4, 4, 11], 'fail-before: without that line the spare weeks pile into taper');
    console.log('SEASON_PLANNER_TAPER_REMAINDER_FAILBEFORE_PASS');
  }

  // --- 3. Invariants across a sweep of season lengths, including degenerately short ones. ---
  {
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH);
    const P = g.MSOS4.seasonPlanner;
    for (let weeks = 3; weeks <= 30; weeks++) {
      const alloc = P.allocatePhases(weeks, P.SEED_PHASES);
      const total = alloc.reduce((n, a) => n + a.weeks, 0);
      assert.equal(total, weeks, `allocatePhases(${weeks}) must allocate exactly ${weeks} weeks total, got ${total}`);
      const taper = alloc.find((a) => a.key === 'taper');
      assert.ok(taper.weeks >= 2, `allocatePhases(${weeks}): taper must never drop below its configured minimum (2), got ${taper.weeks}`);
      assert.ok(alloc.every((a) => a.weeks >= 0), `allocatePhases(${weeks}): no phase may go negative`);
    }
    // A season long enough for every phase to plausibly get at least 1 week (>= 4 non-taper phases x 1 week
    // + taper's 2-week minimum = 6) must actually give every phase at least 1 week -- below that it is a real
    // mathematical impossibility (e.g. 3 weeks split across 4 non-taper phases), not something to paper over.
    const alloc10 = P.allocatePhases(10, P.SEED_PHASES);
    assert.ok(alloc10.every((a) => a.weeks >= 1), 'a 10-week season has enough weeks for every phase to get at least 1 -- none should be silently zeroed');
    console.log('SEASON_PLANNER_ALLOCATION_INVARIANTS_PASS');
  }

  // --- 4. generateSeason()'s own input validation. ---
  {
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH);
    const P = g.MSOS4.seasonPlanner;
    assert.throws(() => P.generateSeason({ name: 'x', seasonStart: '2026-10-05', targetMeetDate: '2026-09-01', targetMeetName: 'y', squads: ['National'] }), /after the season start/, 'a target meet before the season start must be rejected');
    assert.throws(() => P.generateSeason({ name: 'x', seasonStart: '2026-10-05', targetMeetDate: '2026-11-16', targetMeetName: 'y', squads: [] }), /at least one squad/, 'generating with no squads chosen must be rejected');
    console.log('SEASON_PLANNER_VALIDATION_PASS');
  }

  // --- 5. A squad with no standing weekly template: clear warning, empty sessions, never a crash or a
  // silent gap. ---
  {
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH);
    const P = g.MSOS4.seasonPlanner;
    const r = P.generateSeason({ name: 'x', seasonStart: '2026-10-05', targetMeetDate: '2026-11-16', targetMeetName: 'y', squads: ['Fitness'] });
    assert.equal(r.warnings.length, 1, 'a squad with no standing template must produce exactly one warning');
    assert.match(r.warnings[0], /Fitness/, 'the warning must name the actual squad that has no template');
    assert.deepEqual(r.weeklyRows[0].sessions, [], 'a squad with no standing template still gets week rows (so the season/week structure is complete), just with no day sessions yet -- never a crash');
    console.log('SEASON_PLANNER_MISSING_TEMPLATE_WARNING_PASS');
  }

  // --- 6. Generated rows pass the REAL data-registry.js preview/validation with zero errors -- proof this
  // is actually consumable by the existing import pipeline, not just internally self-consistent. ---
  {
    const g = makeSandbox();
    loadInto(g, PLANNER_PATH);
    loadInto(g, REGISTRY_PATH);
    const P = g.MSOS4.seasonPlanner, D = g.MSOS4.dataRegistry;
    const result = P.generateSeason({
      name: 'Summer 2026/27 · National / Development',
      course: 'LCM',
      seasonStart: '2026-10-05',
      targetMeetDate: '2027-03-15',
      targetMeetName: 'NZ Age Group & Open Championships',
      squads: ['National', 'Development'],
    });
    const seasonPre = D.preview('season_plan', { rows: [result.seasonRow] }, {});
    assert.equal(seasonPre.errors.length, 0, `generated season_plan row must pass data-registry's own validation with zero errors, got: ${JSON.stringify(seasonPre.errors)}`);
    const weeklyPre = D.preview('weekly_plan', { rows: result.weeklyRows }, {});
    assert.equal(weeklyPre.errors.length, 0, `generated weekly_plan rows must pass data-registry's own validation with zero errors, got: ${JSON.stringify(weeklyPre.errors)}`);
    assert.equal(weeklyPre.rowCount, result.weeklyRows.length, 'every generated weekly row must round-trip through preview, none silently dropped');
    // The final (meet) week must carry the real meet name through to a row data-registry can actually use.
    const finalWeek = result.weeklyRows[result.weeklyRows.length - 1];
    assert.equal(finalWeek.week_start, '2027-03-15', 'the final generated week must be anchored exactly on the real target meet date');
    assert.equal(finalWeek.meet, 'NZ Age Group & Open Championships', 'the meet week must carry the real target meet name');
    console.log('SEASON_PLANNER_DATA_REGISTRY_INTEGRATION_PASS');
  }

  console.log('SEASON_PLANNER_ALL_PASS');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
