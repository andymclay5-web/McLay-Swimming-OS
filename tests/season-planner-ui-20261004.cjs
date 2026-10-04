'use strict';
// 4 Oct 2026 -- real-browser proof that engines/season-planner.js's data model is actually wired into the
// Data & References screen (engines/data-admin-ui.js), on top of tests/season-planner-20261004.cjs's pure
// logic proof. Covers: the standing weekly template edits persisting, the season generator producing a
// preview and then committing through the real data-registry pipeline, that committing for one squad does
// NOT wipe another squad's still-active plan (the real footgun this app's "replace the whole active set"
// import semantics would otherwise cause here), and that engines/coach-loop-ui.js's planContext() --
// Andy's "feedback as you're putting sessions in" ask, already shipped, just starved of a real plan until
// now -- actually picks up the freshly committed plan for a real session date/squad.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.MSOS4_TEST_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.MSOS4?.storageEngine?.hydrated?.() === true, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.guardian === 'pass', { timeout: 10000 });
    await page.waitForFunction(() => !!window.MSOS4?.seasonPlanner?.generateSeason && !!window.MSOS4?.dataAdminUI?.render, { timeout: 10000 });

    await page.evaluate(() => MSOS4.navigationEngine.go('data', { restore: false }));
    await page.waitForFunction(() => MSOS4.state.settings.view === 'data');
    await page.waitForSelector('[data-wt-squad]');

    // --- 1. The default seeded standing templates render for all four squads, lifted verbatim from the
    // previously-hardcoded Winter 2026 seed. ---
    const squads = await page.$$eval('[data-wt-squad]', (els) => els.map((e) => e.dataset.wtSquad));
    assert.deepEqual(squads, ['National', 'Development', 'Intermediate', 'Junior'], 'the standing weekly template editor must show all four seeded squads');
    console.log('SEASON_PLANNER_UI_SEEDED_TEMPLATES_PASS');

    // --- 2. Editing a day row in National's standing template and saving actually persists it (direct
    // state write, no re-import needed) -- Andy's "adjusted as suits within the app" ask. ---
    const nationalCard = page.locator('[data-wt-squad="National"]');
    const firstFocusInput = nationalCard.locator('[data-wt-day-index="0"] [data-wt-field="session_focus"]');
    await firstFocusInput.fill('Edited via Season planner UI test');
    await nationalCard.locator('[data-wt-save]').click();
    await page.waitForFunction(() => (window.MSOS4.state.weeklyTemplates || []).find((t) => t.squad === 'National')?.days?.[0]?.session_focus === 'Edited via Season planner UI test', { timeout: 5000 });
    console.log('SEASON_PLANNER_UI_STANDING_TEMPLATE_EDIT_PASS');

    // --- 3. Generating a season for National + Development only shows a correct preview, then commits
    // through the real D.preview/D.commit pipeline -- while Intermediate/Junior's pre-existing (seeded
    // Winter 2026) active season/weekly rows must survive completely untouched. ---
    const beforeIntermediateWeeks = await page.evaluate(() => (window.MSOS4.state.weeklyPlans || []).filter((w) => w.squad === 'Intermediate').length);
    assert.ok(beforeIntermediateWeeks > 0, 'sanity: Intermediate must already have active weekly rows from the seed before this generation, or the "other squads survive" check below proves nothing');

    await page.fill('#sgName', 'Summer 2026/27 · National / Development (UI test)');
    await page.selectOption('#sgCourse', 'LCM');
    await page.fill('#sgStart', '2026-10-05');
    await page.fill('#sgMeetName', 'NZ Age Group & Open Championships (UI test)');
    await page.fill('#sgMeetDate', '2027-03-15');
    await page.check('[data-sg-squad][value="National"]');
    await page.check('[data-sg-squad][value="Development"]');
    await page.click('#sgPreview');
    await page.waitForSelector('.sg-weeks');
    const previewWeeksText = await page.$eval('.check-card.ok', (e) => e.textContent);
    assert.match(previewWeeksText, /\d+ weeks/, 'the preview must show a real computed week count');
    console.log('SEASON_PLANNER_UI_GENERATE_PREVIEW_PASS');

    await page.click('#sgCommit');
    await page.waitForFunction(() => (window.MSOS4.state.weeklyPlans || []).some((w) => w.squad === 'National' && w.source === 'MSOS season planner · generated'), { timeout: 5000 });

    const afterState = await page.evaluate(() => ({
      nationalWeeks: (window.MSOS4.state.weeklyPlans || []).filter((w) => w.squad === 'National'),
      intermediateWeeks: (window.MSOS4.state.weeklyPlans || []).filter((w) => w.squad === 'Intermediate'),
      seasonNames: (window.MSOS4.state.seasonPlans || []).map((s) => s.name),
    }));
    assert.ok(afterState.nationalWeeks.length > 0 && afterState.nationalWeeks.every((w) => w.source === 'MSOS season planner · generated'), 'National\'s weekly rows must now all be the newly generated ones');
    assert.equal(afterState.intermediateWeeks.length, beforeIntermediateWeeks, 'Intermediate\'s weekly rows must be completely unaffected by generating a season for National/Development only -- this is the real "replace the whole active set" footgun the merge logic exists to prevent');
    assert.ok(afterState.seasonNames.includes('Summer 2026/27 · National / Development (UI test)'), 'the new season_plan row must be active');
    assert.ok(afterState.seasonNames.some((n) => /Junior.*Intermediate|Intermediate.*Junior/.test(n)), 'the pre-existing Junior/Intermediate season must still be active, untouched by this generation');
    console.log('SEASON_PLANNER_UI_COMMIT_PRESERVES_OTHER_SQUADS_PASS');

    // --- 4. The quick per-week inline editor shows the newly committed weeks and a direct edit persists. ---
    await page.waitForSelector('[data-awp-id]');
    const firstAwp = page.locator('[data-awp-id]').first();
    await firstAwp.locator('[data-awp-field="objective"]').fill('Edited via quick week editor');
    await firstAwp.locator('[data-awp-save]').click();
    await page.waitForFunction(() => (window.MSOS4.state.weeklyPlans || []).some((w) => w.objective === 'Edited via quick week editor'), { timeout: 5000 });
    console.log('SEASON_PLANNER_UI_QUICK_WEEK_EDIT_PASS');

    // --- 5. engines/coach-loop-ui.js's planContext() -- the already-shipped "does this session tie back to
    // the plan" feedback -- actually picks up the freshly committed plan for a real National session dated
    // inside the new season. This is the concrete proof that generating a plan here is what was missing,
    // not a second feedback mechanism. ---
    const ctx = await page.evaluate(() => window.MSOS4.coachLoopUI.planContext({ id: 'ui-test-session', identity: { date: '2026-10-05', squads: ['National'] }, metadata: {} }));
    assert.equal(ctx.linkStatus, 'season+week', 'a real National session dated inside the newly generated season must link to both a season and a week, not "none"');
    assert.ok(ctx.weeklyFocus, 'planContext() must surface a real weekly focus string once a real plan is active');
    console.log('SEASON_PLANNER_UI_PLANCONTEXT_PICKUP_PASS');

    console.log('SEASON_PLANNER_UI_ALL_PASS');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
