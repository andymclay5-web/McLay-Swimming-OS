'use strict';
// Andy, 13 Oct 2026 (built Tue AM from the suggestions): "I don't know if using the prompts should put you off
// brief? I love the sets to select, we just need to increase the range a bit. Does it remember new sets that are
// added? ... a couple of weird things like 500 fr, 300 fr 200 rev IM, that contradicts itself" -- and his Edit text
// held "#1 Development ... #12 Clearance" as well as "#1-3 Dev ...", and "Desc 1-4" twice.
// Proves in a real browser:
//  A. Saving/editing writes his lines once: no expanded #1..#12 copy, no repeated cue; a session already holding
//     both is cleaned on the next edit; distance unchanged. A swim split into strokes has no single stroke.
//  B. "Aerobic + Anaerobic Capacity" asks for both Development and Speed/Max: his zone-ladder session is flagged for
//     the missing top-end speed (not "mostly Development vs Overload"); adding a MAX set puts it on brief;
//     suggestions and the draft offer both systems.
//  C. More library sets, and his own sets from saved sessions come back under YOUR SETS.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ANDY=`WARM-UP\n500 (300 Free / 200 Reverse IM)\n12 x 50 Scull / Drill / Swim Perfect Technique\n\nPRE-SET\n3 x 200 Pull Desc Stroke Count 1-3\n5 x 50 Kick Build @1:00\n\nMAIN SET\n12 x 100 10sR\n#1 Development\n#2 Development\n#3 Development\n#4 Overload\n#5 Overload\n#6 Overload\n#7 Threshold\n#8 Threshold\n#9 Threshold\n#10 Clearance\n#11 Clearance\n#12 Clearance\n#1-3 Dev\n#4-6 OL\n#7-9 AT\n#10-12 CL\n\nPOST-SET\n8 x 75 Pull @1:30 Desc 1-4\nDesc 1-4\n8 x 25 UW Fins @0:45\n\nWARM-DOWN\n200 Easy\nTOTAL 4150m`;
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.sessionMethodology?.comboSystems&&window.MSOS4?.storageEngine?.ready,{timeout:20000});await page.waitForTimeout(500);
    // A
    const a=await page.evaluate(T=>{const M=window.MSOS4;const s=M.parser.parse(T,{date:'2026-10-13',dayPart:'AM',squads:['National'],id:'andy-tue'});const out=M.session.serialize(s);const s2=M.parser.parse(out,{date:'2026-10-13',dayPart:'AM',squads:['National'],id:'andy-tue'});return{out,total:M.session.total(s),total2:M.session.total(s2),again:M.session.serialize(s2),stroke:s.blocks[0].items[0].stroke};},ANDY);
    assert.equal(a.total,4150);assert.equal(a.total2,4150);
    assert.doesNotMatch(a.out,/#1 Development|#12 Clearance/,'the expanded copy is gone');
    assert.match(a.out,/12 x 100 10sR\n#1-3 Dev\n#4-6 OL\n#7-9 AT\n#10-12 CL\n/);
    assert.match(a.out,/8 x 75 Pull @1:30 Desc 1-4\n8 x 25 UW Fins/,'Desc 1-4 once');
    assert.equal(a.again,a.out,'stable on every edit');
    assert.equal(a.stroke,'','a 300 Free / 200 Reverse IM swim is not labelled Freestyle');
    // B
    const b=await page.evaluate(T=>{const M=window.MSOS4,SM=M.sessionMethodology;const id={date:'2026-10-13',dayPart:'AM',squads:['National'],start:'05:30',end:'07:15'};
      const mk=t=>{const s=M.parser.parse(t,{...id,id:'c'});s.identity={...s.identity,...id};return s;};const brief={source:'season',system:'Aerobic + Anaerobic Capacity',sessionFocus:'',technical:'',weekFocus:''};
      const ladder=mk(M.session.serialize(M.parser.parse(T,{...id,id:'x'})));const withMax=mk(M.session.serialize(M.parser.parse(T,{...id,id:'y'})).replace('POST-SET','MAIN SET 2\n8 x 25 MAX @2:00\n\nPOST-SET').replace('#10-12 CL','#10-12 CL\n8 x 25 MAX @2:00'));
      const c1=SM.planTargetCheck(ladder,M.state,brief),c2=SM.planTargetCheck(withMax,M.state,brief);
      return{combo:SM.comboSystems('Aerobic + Anaerobic Capacity'),c1:{m:c1.matches,miss:c1.combo?.missing},c2:{m:c2.matches,miss:c2.combo?.missing}};},ANDY);
    assert.deepEqual(b.combo,['Development','Speed / Max']);
    assert.deepEqual(b.c1,{m:false,miss:['Speed / Max']},'the zone ladder has no top-end speed');
    assert.deepEqual(b.c2,{m:true,miss:[]},'with a MAX set it is on brief');
    // suggestions + draft for the combo brief (generated season plan: Tue 13 Oct)
    await page.evaluate(async()=>{const M=window.MSOS4,SP=M.seasonPlanner,D=M.dataRegistry;const g=SP.generateSeason({name:'Summer 2026/27',course:'SCM',seasonStart:'2026-10-12',targetMeetName:'NAGS',targetMeetDate:'2027-04-11',squads:['National','Development']});
      for(const w of g.weeklyRows)if(String(w.week_start).startsWith('2026-10-12'))w.sessions=(w.sessions||[]).map(x=>/tue/i.test(x.day||'')&&/am/i.test(x.dayPart||'AM')?{...x,primary_system:'Aerobic + Anaerobic Capacity',session_focus:'Aerobic + Anaerobic Capacity'}:x);
      for(const[type,rows]of[['season_plan',[g.seasonRow]],['weekly_plan',g.weeklyRows]]){await D.commit(D.preview(type,{rows},{version:'t',effectiveFrom:'2026-10-12',source:'test'}));}});
    const d=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology;const id={date:'2026-10-13',dayPart:'AM',squads:['National'],start:'05:30',end:'07:15'};const probe={id:'p',identity:id,blocks:[]};const b=SM.brief(probe);const dr=SM.draftFromBrief(id);const s=M.parser.parse(dr.text,{...id,id:'d'});s.identity={...s.identity,...id};return{system:b.system,draft:dr.text,check:SM.planTargetCheck(s,M.state,b).matches,html:SM.briefHtml(s)};});
    assert.match(d.system,/Aerobic \+ Anaerobic Capacity/,`brief: ${d.system}`);{
      assert.match(d.draft,/MAX/,`draft for a combo day includes top-end speed: ${d.draft}`);assert.match(d.draft,/\bDev\b/);
      assert.equal(d.check,true,'the draft from the brief is on brief');
      assert.match(d.html,/FROM YOUR PROGRAMMING · Aerobic Capacity \+ Anaerobic Capacity/);
    }
    // C
    const c=await page.evaluate(T=>{const M=window.MSOS4,SM=M.sessionMethodology;const s=M.parser.parse(T.replace('12 x 50 Scull / Drill / Swim Perfect Technique','10 x 50 Choice Kick 15sR').replace('POST-SET','POST-SET\n6 x 50 Fly Drill / Swim 10sR'),{date:'2026-10-06',dayPart:'PM',squads:['National'],id:'mine-src'});s.identity={...s.identity,date:'2026-10-06',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+1;
      return{lib:SM.LIB.length,mine:SM.mySets().map(x=>[x.section,x.text,x.from])};},ANDY);
    assert.ok(c.lib>=40,`library has more sets now (${c.lib})`);
    assert.ok(c.mine.some(([sec,t])=>sec==='WARM UP'&&/10 x 50 Choice Kick 15sR/.test(t)),JSON.stringify(c.mine));
    assert.ok(c.mine.some(([sec,t])=>sec==='POST SET'&&/6 x 50 Fly Drill \/ Swim 10sR/.test(t)));
    assert.ok(!c.mine.some(([,t])=>t==='200 Easy'),'library sets are not repeated');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('BRIEF_COMBO_MYSETS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
