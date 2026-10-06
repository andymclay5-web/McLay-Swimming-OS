'use strict';
// Andy, 6 Oct 2026: the app is "to help write and assess a training session and ... have all the tools in
// front of you to ensure that the session that you're writing hits the brief of those overriding plans."
// Step 1 of the agreed plan: the session's brief in view WHILE writing, with a live check.
//
// Proves, in a real phone-sized browser against the real app:
//  1. With no season plan covering the date, the brief comes from the standard week for that squad/day/
//     slot (Tue PM National = Anaerobic Power), labelled as the standard week -- and last season's stale
//     week is never used.
//  2. The check uses the MAIN SET (warm-up/easy volume no longer outweighs the purpose) and today's slot
//     system first.
//  3. "@100p" deck shorthand doses as Race pace (was the structural Development default), via the
//     race-target-intent engine.
//  4. The Add session and Edit workout modals show the brief and it updates live as the coach types.
//  5. The Board shows one collapsed brief line, not a dashboard.
//  6. With a season plan covering the date, the brief comes from that season's week/day row.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ON='WARM UP\n400 free\n4 x 100 IM\nMAIN SET\n3 x (4 x 50 #1 @100p @1:30\n200 easy)\nWARM DOWN\n200 easy';
const OFF='WARM UP\n400 free\nMAIN SET\n6 x 200 free steady 20s rest\nWARM DOWN\n200 easy';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.sessionMethodology?.brief,{timeout:15000});
    await page.waitForTimeout(800);

    // 1-3: engine level.
    const r=await page.evaluate(({ON,OFF})=>{const M=window.MSOS4,SM=M.sessionMethodology,mk=(t,id,date,part)=>{const s=M.parser.parse(t,{date,dayPart:part,squads:['National'],course:'SCM'});s.id=id;s.identity={...s.identity,date,dayPart:part,squads:['National']};return s;};
      const on=mk(ON,'b-on','2026-10-06','PM'),off=mk(OFF,'b-off','2026-10-06','PM');
      const b=SM.brief(on),c1=SM.evaluate(on).plan,c2=SM.evaluate(off).plan;
      const sh=M.parser.parse('MAIN SET\n4 x 50 #1 @100p @1:30',{date:'2026-10-06',id:'sh'}),dose=M.dosageEngine.session(sh,M.state,{delivered:false});
      return{b,c1,c2,shorthandRP:dose.systems['Race pace'].metres,shorthandDev:dose.systems['Development'].metres};},{ON,OFF});
    assert.equal(r.b.source,'standard',`with no season covering 6 Oct the brief must come from the standard week, got ${r.b.source}`);
    assert.match(r.b.system,/Anaerobic Power/,'Tue PM National standard week is Anaerobic Power');
    assert.equal(r.b.staleWeek,true,'last season\'s week must be recognised as not covering this date');
    assert.equal(r.c1.checked,true);assert.equal(r.c1.basis,'main set');assert.equal(r.c1.plannedSystem,'Race pace');assert.equal(r.c1.dominantSystem,'Race pace');assert.equal(r.c1.matches,true,'a race-pace main set is on an Anaerobic Power brief even with large easy/warm-up volume');
    assert.equal(r.c2.matches,false,'an aerobic main set is off an Anaerobic Power brief');
    assert.equal(r.shorthandRP,200,'"@100p" shorthand must dose as Race pace');assert.equal(r.shorthandDev,0);

    // 4: Add session modal -- live update.
    await page.tap('#newSessionBtn');await page.waitForSelector('#modalHost [data-msos-brief]',{timeout:5000});
    await page.fill('#coreRaw',OFF);await page.waitForTimeout(600);
    const t1=await page.evaluate(()=>document.querySelector('#modalHost [data-msos-brief]').innerText);
    await page.fill('#coreRaw','');await page.waitForTimeout(600);
    const t0=await page.evaluate(()=>document.querySelector('#modalHost [data-msos-brief]').innerText);
    assert.notEqual(t1,t0,'the brief panel must update as the coach types');
    assert.match(t0,/check updates as you type|several energy systems/,'an empty draft shows the brief without a verdict');
    await page.tap('[data-core-close]');await page.waitForTimeout(300);

    // 4b + 5: saved Tue PM session -> Board line and Edit workout panel.
    await page.evaluate(ON=>{const M=window.MSOS4;const s=M.parser.parse(ON,{date:'2026-10-06',dayPart:'PM',squads:['National'],course:'SCM'});s.id='b-board';s.identity={...s.identity,date:'2026-10-06',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.selectedSessionId='b-board';M.store.save(M.state);M.ui.renderCurrent();},ON);
    await page.waitForSelector('.msos-brief-board summary',{timeout:5000});
    const board=await page.evaluate(()=>({line:document.querySelector('.msos-brief-board summary').innerText,open:document.querySelector('.msos-brief-board').open}));
    assert.match(board.line,/Anaerobic Power[\s\S]*on brief/,`Board line: ${board.line}`);assert.equal(board.open,false,'the Board brief stays collapsed');
    await page.evaluate(()=>window.MSOS4.actions.openSessionEdit());await page.waitForSelector('#modalHost [data-msos-brief]',{timeout:5000});
    assert.match(await page.evaluate(()=>document.querySelector('#modalHost [data-msos-brief]').innerText),/Main set is Anaerobic Power \(Race pace\) — on brief/);
    await page.fill('#sessionEditText',OFF);await page.waitForTimeout(600);
    assert.match(await page.evaluate(()=>document.querySelector('#modalHost [data-msos-brief]').innerText),/brief asks for Anaerobic Power/,'editing the text live re-checks against the brief');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});

    // 6: a season plan covering the date takes over from the standard week.
    const s6=await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;
      const g=SP.generateSeason({name:'Test Summer',course:'SCM',seasonStart:'2026-10-05',targetMeetName:'Test Champs',targetMeetDate:'2027-03-15',squads:['National']});
      for(const [type,rows] of [['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){const pre=D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-05',source:'test'});await D.commit(pre);}
      const s=M.state.canonicalSessions['b-board'];return M.sessionMethodology.brief(s);});
    assert.equal(s6.source,'season',`a covering season plan must supply the brief, got ${s6.source}`);
    assert.match(s6.seasonName,/Test Summer/);assert.match(s6.system,/Anaerobic Power/);assert.match(s6.weekFocus,/Base Skills/);

    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('SESSION_BRIEF_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
