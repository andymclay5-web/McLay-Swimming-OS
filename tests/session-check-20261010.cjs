'use strict';
// Andy, 10 Oct 2026: "Can we give more suggestions and assessment around session building".
// Proves in a real phone-sized browser that the session writer's SESSION CHECK reports, from the draft and
// the app's own data: time vs the slot, missing warm-up / warm-down, whether the brief's technical focus is
// named, the stroke of the week, distance vs the last same-slot session, strokes the squad hasn't touched
// this week (IM counts as all four), and an idea only when the main set is off brief.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.seasonPlanner&&window.MSOS4?.sessionMethodology?.assess,{timeout:20000});
    await page.waitForTimeout(500);
    const r=await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry,SM=M.sessionMethodology;
      const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));}
      const mk=(id,date,part,t,save=true)=>{const s=M.parser.parse(t,{date,dayPart:part,squads:['National'],course:'SCM'});s.id=id;s.identity={...s.identity,date,dayPart:part,squads:['National'],start:'18:30',end:'20:00'};if(save)M.store.putSession(M.state,s);return s;};
      mk('w-mon','2026-10-12','AM','WARM UP\n400 free\nMAIN SET\n10 x 100 free @1:30\nWARM DOWN\n200 easy');
      mk('w-prev','2026-10-06','PM','WARM UP\n600 free\nMAIN SET\n20 x 100 free @1:30\nWARM DOWN\n200 easy');
      const off=mk('draft-off','2026-10-13','PM','WARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00\nPOST SET\n4 x 50 kick',false);
      const on=mk('draft-on','2026-10-13','PM','WARM UP\n400 free\n4 x 100 IM\nPRE SET\n6 x 50 turns and breakouts @1:00\nMAIN SET\n3 x (4 x 50 free @100p @1:30\n200 easy)\nWARM DOWN\n200 easy',false);
      const long=mk('draft-long','2026-10-13','PM','WARM UP\n1000 free\nMAIN SET\n40 x 100 free @1:40\nWARM DOWN\n400 easy',false);
      const k=(s)=>{const b=SM.brief(s),c=SM.evaluate(s).plan;return SM.assess(s,M.state,b,c).map(x=>`${x.kind}:${x.ok}:${x.text}`);};
      return{off:k(off),on:k(on),long:k(long)};});
    const has=(rows,re)=>rows.some(x=>re.test(x));
    assert.ok(has(r.off,/^time:true:About .* of a 1:30 session — fits/),`time: ${r.off}`);
    assert.ok(has(r.off,/^structure:false:No warm-down block/));
    assert.ok(has(r.off,/^technical:false:Technical focus \(Turns/));
    assert.ok(has(r.off,/^stroke:true:Stroke of the week \(Freestyle\)/));
    assert.ok(has(r.off,/^last:true:Last Tuesday PM \(2026-10-06\): 2,800m — this one 2,200m \(−21%\)/));
    assert.ok(has(r.off,/^week:false:This week so far \(2 sessions\) has no Backstroke or Breaststroke or Butterfly/));
    assert.ok(has(r.off,/^idea:null:Idea — Anaerobic Power: race-pace/),'an off-brief main set gets an idea');
    assert.ok(!has(r.on,/^structure:/),'warm-up and warm-down present → no structure warning');
    assert.ok(has(r.on,/^technical:true:Technical focus in the session: Turns/));
    assert.ok(!has(r.on,/^week:/),'IM work counts as all four strokes');
    assert.ok(!has(r.on,/^idea:/),'no idea when the main set is on brief');
    assert.ok(has(r.long,/^time:false:About .* min over the 1:30 slot/),`long session must be flagged: ${r.long}`);
    // Shown in the writer.
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00');await page.waitForTimeout(700);
    assert.ok(await page.$('#modalHost [data-msos-check]'),'the writer shows the session check');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('SESSION_CHECK_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
