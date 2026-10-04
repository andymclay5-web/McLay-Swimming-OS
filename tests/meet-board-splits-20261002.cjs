'use strict';
// 2 Oct 2026 (Andy, verbatim): "the race splits for the targets just show 100 meter splits, whereas I'd
// really like that to show 50 meter splits and 100 meter splits sort of thing" -- then, correcting an
// over-broad first read of that ask: "We've got 50m splits in there already" (true for the 50m/100m/200m
// target rows, which already stepped by 25m/50m). The real gap was specifically the LONGER events:
// engines/meet-board-ay.js's splitPoints(d) hardcoded 400m/800m/1500m+ target-split rows to 100m increments
// only. meet-board-ay.js is the one live owner of this "Next 3 performance bumps + target splits" section
// (index.html/sw.js both load it); the near-identical engines/meet-intelligence-ax.js is dead code -- not
// wired into index.html or sw.js at all -- so it was deliberately left untouched, per the one-owner rule.
//
// Fixed by replacing the old hardcoded per-distance branch table with one uniform rule: 25m steps through
// 100m (unchanged -- 50m/100m targets already showed fine-grained splits), 50m steps beyond that for every
// distance including 400/800/1500. Every 100m row a coach already relied on survives (100/200/300/400 are
// all exact 50m multiples); the 50m rows between them are now also shown.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';
const AY_PATH = path.join(__dirname, '..', 'engines', 'meet-board-ay.js');
const AX_PATH = path.join(__dirname, '..', 'engines', 'meet-intelligence-ax.js');
const originalAy = fs.readFileSync(AY_PATH, 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

(async () => {
  // 0. Confirm which file is actually the live owner before trusting a fix to it -- meet-intelligence-ax.js
  // has an identical splitPoints() but must NOT be loaded anywhere; fixing it alone would ship nothing.
  assert.ok(indexHtml.includes('meet-board-ay.js'), 'meet-board-ay.js must be the file index.html actually loads');
  assert.ok(swJs.includes('meet-board-ay.js'), 'meet-board-ay.js must be in sw.js REQUIRED too');
  assert.ok(!indexHtml.includes('meet-intelligence-ax.js'), 'meet-intelligence-ax.js must stay unwired in index.html -- it is dead code, fixing it alone would ship nothing real');
  assert.ok(!swJs.includes('meet-intelligence-ax.js'), 'meet-intelligence-ax.js must stay unwired in sw.js too');
  assert.ok(fs.existsSync(AX_PATH), 'meet-intelligence-ax.js is expected to still exist on disk as the known-dead duplicate this test deliberately does not touch');
  console.log('MEET_BOARD_SPLITS_LIVE_OWNER_CONFIRMED_PASS');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForFunction(() => !!window.MSOS4?.meetBoardAY?.paceGuide, { timeout: 10000 });

    const cases = await page.evaluate(() => {
      const g = window.MSOS4.meetBoardAY.paceGuide;
      const dists = d => g({ distance: d }, d).map(s => s.distance);
      return { d50: dists(50), d100: dists(100), d200: dists(200), d400: dists(400), d800: dists(800), d1500: dists(1500) };
    });

    // 1. unchanged behaviour for distances that already had fine-grained splits.
    assert.deepEqual(cases.d50, [25, 50], '50m targets must keep their existing 25m-step rows');
    assert.deepEqual(cases.d100, [25, 50, 75, 100], '100m targets must keep their existing 25m-step rows');
    assert.deepEqual(cases.d200, [50, 100, 150, 200], '200m targets must keep their existing 50m-step rows');

    // 2. the actual fix: longer events now get every 50m row, not just the old 100m-only markers.
    assert.deepEqual(cases.d400, [50, 100, 150, 200, 250, 300, 350, 400], '400m targets must now show every 50m split, not just the four legacy 100m rows');
    assert.deepEqual(cases.d800, [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800], '800m targets must now show every 50m split too');
    assert.deepEqual(
      cases.d1500,
      [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500],
      '1500m targets must now show every 50m split, not just the five legacy markers'
    );

    // 3. nothing lost: every pre-existing 100m split a coach already relied on is still a subset.
    for (const d of [400, 800, 1500]) {
      const legacy100s = [];
      for (let x = 100; x <= d; x += 100) legacy100s.push(x);
      const got = cases[`d${d}`];
      for (const x of legacy100s) assert.ok(got.includes(x), `the 50m-stepped list for ${d}m must still include the ${x}m split coaches already relied on`);
    }
    console.log('MEET_BOARD_SPLITS_UNIFORM_50M_PASS');

    // 4. fail-before: reproduce the exact OLD hardcoded function inline (not a hypothetical) and show it
    // genuinely differs from what the live engine now returns for a 400m target -- this is the real gap
    // Andy reported, not a cosmetic rename.
    const oldBehavior = await page.evaluate(() => {
      function oldSplitPoints(d) { d = Number(d); if (d <= 25) return [d]; if (d === 50) return [25, 50]; if (d === 100) return [25, 50, 75, 100]; if (d === 200) return [50, 100, 150, 200]; if (d === 400) return [100, 200, 300, 400]; if (d === 800) return [200, 400, 600, 800]; if (d >= 1500) return [300, 600, 900, 1200, d]; const step = d <= 200 ? 50 : 100, out = []; for (let x = step; x < d; x += step) out.push(x); out.push(d); return out; }
      return { d400: oldSplitPoints(400), d800: oldSplitPoints(800), d1500: oldSplitPoints(1500) };
    });
    assert.deepEqual(oldBehavior.d400, [100, 200, 300, 400], 'fail-before sanity: the old function really did produce only 100m rows for a 400m target');
    assert.notDeepEqual(cases.d400, oldBehavior.d400, 'the live engine must now behave differently from the old 100m-only logic for a 400m target');
    assert.notDeepEqual(cases.d800, oldBehavior.d800, 'the live engine must now behave differently from the old 100m-only logic for an 800m target');
    assert.notDeepEqual(cases.d1500, oldBehavior.d1500, 'the live engine must now behave differently from the old sparse-marker logic for a 1500m target');
    console.log('MEET_BOARD_SPLITS_FAILBEFORE_DIFFERS_PASS');

    // 5. confirm the actual on-disk source no longer contains the old hardcoded branch table (not just a
    // coincidentally-matching runtime behaviour).
    const OLD_LINE = 'if(d===400)return[100,200,300,400];if(d===800)return[200,400,600,800];if(d>=1500)return[300,600,900,1200,d];';
    assert.ok(!originalAy.includes(OLD_LINE), 'the live source must no longer contain the old 100m-only hardcoded branches for 400/800/1500');
    console.log('MEET_BOARD_SPLITS_OLD_BRANCHES_REMOVED_PASS');

    console.log('MEET_BOARD_SPLITS_ALL_PASS');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
