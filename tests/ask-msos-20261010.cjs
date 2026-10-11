'use strict';
// Andy, 10 Oct 2026:
//  1. "we still need to be able to just paste in a session or override / lead the way with writing just with
//     prompts or options to add" -> the coach can choose the session's focus instead of the plan's (saved on
//     the session as metadata.coachFocus, so the check, suggestions, draft and Board banner follow it), and
//     every component in his library is listed by section to add, with or without a plan.
//  2. "I like the option to ask ai -- the question is asked in msos and the answer is given here ... added to
//     the chat feature as well" -> Ask MSOS in the writer and as a coach-chat thread, answered inside the app
//     by the msos-assistant edge function (stubbed here: this sandbox cannot reach Supabase).
//  3. "When I tried to load tv board it just threw me back to here [Connection]" -> the Hub's only TV button
//     was "Coach & TV sign-in", which opens Connection. The Hub now has a real TV Board button.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.seasonPlanner&&window.MSOS4?.sessionMethodology?.FOCUS_OPTIONS&&window.MSOS4?.assistant?.mountWriter,{timeout:20000});
    await page.waitForTimeout(500);

    // 1a. No plan yet: the coach can still lead -- every component is offered, and a chosen focus drives suggestions.
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.waitForSelector('[data-msos-focus-row]');
    assert.ok(await page.$('#modalHost [data-msos-more]'),'with no plan, all components are still listed to add');
    await page.evaluate(()=>document.querySelector('#modalHost').innerHTML='');

    // A season plan exists for the rest of the test (Tue 13 Oct PM = race pace in the generated plan).
    await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;
      const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));}});

    // 1b. Choose a different focus than the plan and lead with it.
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForTimeout(400);
    const planLabel=await page.textContent('[data-msos-focus=""]');
    assert.match(planLabel,/Plan · Anaerobic Power/,`the plan's own focus is the default choice: ${planLabel}`);
    await page.tap('[data-msos-focus="Threshold"]');await page.waitForTimeout(400);
    assert.ok(await page.$('[data-msos-focus="Threshold"].on'),'chosen focus is highlighted');
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00\nWARM DOWN\n200 easy');await page.waitForTimeout(700);
    const brief=await page.textContent('#modalHost [data-msos-brief]');
    assert.match(brief,/Your focus for this session: Aerobic Power \(Threshold\)/,brief);
    assert.match(brief,/the plan says/,'the plan stays visible beside the coach\'s choice');
    assert.match(brief,/you chose Aerobic Power/,'the check judges against the coach\'s choice');
    assert.ok(await page.$('[data-msos-insert="at-rounds"]'),'suggestions follow the chosen focus (threshold sets)');
    assert.ok(!await page.$('.msos-fits > .msos-fit [data-msos-insert="rp-25"]'),'race-pace sets are no longer the top suggestions');
    // All components list stays open while adding from it.
    await page.evaluate(()=>{document.querySelector('#modalHost [data-msos-more]').open=true;});
    await page.tap('[data-msos-more] [data-msos-insert="cl-hr"]');await page.waitForTimeout(600);
    assert.match(await page.inputValue('#coreRaw'),/2 x 200 IM Clearance 20sR HR Gauge/);
    assert.equal(await page.evaluate(()=>document.querySelector('#modalHost [data-msos-more]')?.open),true,'the list stays open after Add');
    // Draft follows the chosen focus.
    await page.tap('[data-msos-start="draft"]');await page.waitForTimeout(600);
    const draft=await page.inputValue('#coreRaw');
    assert.match(draft,/MAIN SET[\s\S]*\bAT\b/,`threshold draft: ${draft}`);
    assert.doesNotMatch(draft,/@100 Pace/,'no race-pace sets in a threshold draft');
    // Saved with the session.
    await page.tap('#coreCreate');await page.waitForTimeout(800);
    const saved=await page.evaluate(()=>{const M=window.MSOS4,s=M.currentSession();return{focus:s?.metadata?.coachFocus,brief:M.sessionMethodology.brief(s)?.coachFocus,plan:M.sessionMethodology.evaluate(s).plan.plannedSystem};});
    assert.deepEqual(saved,{focus:'Threshold',brief:'Threshold',plan:'Threshold'},'the saved session keeps the coach\'s focus');

    // Edit workout: focus can be changed back to the plan.
    await page.evaluate(()=>window.MSOS4.actions.openSessionEdit());await page.waitForSelector('#sessionEditText');
    assert.ok(await page.$('#modalHost [data-msos-focus="Threshold"].on'),'edit opens with the saved focus');
    await page.tap('#modalHost [data-msos-focus=""]');await page.waitForTimeout(300);
    await page.tap('[data-save-session-edit]');await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.MSOS4.currentSession().metadata.coachFocus),null,'back to following the plan');

    // 2a. Ask MSOS in the writer: answered in the app; the suggested session only goes in when the coach taps.
    await page.evaluate(()=>{const M=window.MSOS4;window.__asks=[];M.assistant.available=()=>true;
      const fake=async(path,opts)=>{const body=JSON.parse(opts.body);window.__asks.push({path,body});if(/fail/.test(body.question))throw new Error('Network down');return{answer:'Put the race-pace work after a build.',session_text:'MAIN SET\n6 x 25 @1:00\n#1 Build\n#2-6 @100 Pace',model:'stub'};};
      if(M.cloudSessionEngine)M.cloudSessionEngine.fetch=fake;M.cloud.fetch=fake;});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00');await page.waitForTimeout(400);
    await page.tap('.msos-ask-wrap > summary');
    await page.fill('.msos-ask-wrap [data-ask-input]','How can I improve this draft?');await page.tap('.msos-ask-wrap .ask-form button');
    await page.waitForSelector('.msos-ask-wrap .ask-session');
    const req=await page.evaluate(()=>window.__asks[0]);
    assert.equal(req.path,'/functions/v1/msos-assistant');
    assert.equal(req.body.question,'How can I improve this draft?');
    assert.match(req.body.context,/Draft session text:\nWARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00/,'the draft goes with the question');
    assert.match(req.body.context,/Plan brief \(season plan "Summer 2026\/27"\)/,'the brief goes with the question');
    assert.match(req.body.context,/App session check:/,'the app\'s own check goes with the question');
    assert.match(await page.textContent('.msos-ask-wrap .ask-ai'),/Put the race-pace work after a build/);
    assert.match(await page.inputValue('#coreRaw'),/8 x 200 free steady/,'nothing changes until the coach taps');
    await page.tap('.msos-ask-wrap [data-ask-use][data-mode="append"]');await page.waitForTimeout(300);
    assert.match(await page.inputValue('#coreRaw'),/8 x 200 free steady @3:00\n\nMAIN SET\n6 x 25 @1:00/,'Add to the end appends the suggestion');
    // Follow-up carries the conversation; a failure is shown in place and keeps the box.
    await page.fill('.msos-ask-wrap [data-ask-input]','fail please');await page.tap('.msos-ask-wrap .ask-form button');
    await page.waitForSelector('.msos-ask-wrap .ask-error');
    assert.match(await page.textContent('.msos-ask-wrap .ask-error'),/Network down/);
    assert.equal((await page.evaluate(()=>window.__asks[1].body.history)).length,2,'the earlier question and answer go with a follow-up');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // 2b. Ask MSOS in coach chat.
    await page.evaluate(()=>window.MSOS4.coachChatUI.openPanel());
    await page.waitForSelector('[data-chat-channel="msos-ai"]');
    await page.tap('[data-chat-channel="msos-ai"]');await page.waitForSelector('[data-chat-ai] [data-ask-input]');
    await page.fill('[data-chat-ai] [data-ask-input]','What should tonight focus on?');await page.tap('[data-chat-ai] .ask-form button');
    await page.waitForSelector('[data-chat-ai] .ask-session');
    assert.match(await page.evaluate(()=>window.__asks.at(-1).body.context),/^Session: /,'chat sends the session open on the Board');
    await page.tap('[data-chat-ai] [data-ask-use][data-mode="replace"]');await page.waitForSelector('#coreRaw');await page.waitForTimeout(500);
    assert.match(await page.inputValue('#coreRaw'),/^MAIN SET\n6 x 25 @1:00/,'"Start a session with this" opens the writer with it');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // 3. Hub: TV Board opens the TV Board; the sign-in link no longer says TV.
    await page.evaluate(()=>window.MSOS4.nav.show('hub'));await page.waitForSelector('[data-hub-tv]',{timeout:8000});
    assert.equal(await page.textContent('[data-hub-team]'),'Coaches & sign-in');
    await page.tap('[data-hub-tv]');await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'tv');
    assert.equal(await page.evaluate(()=>document.querySelector('#tvView').hidden),false);

    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('ASK_MSOS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
