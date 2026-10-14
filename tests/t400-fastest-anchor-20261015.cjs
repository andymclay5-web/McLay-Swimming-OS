'use strict';
// Andy, 15 Oct 2026: "the latest time 400 ... needs to be the fastest. I've run into that problem with Ashley Brown a
// few times ... the fastest time 400 of that stroke, not the latest."
// Ashley's real T400s (live cloud): Jun 6:09.8, Mar 5:27.3 (coach-confirmed), Mar 5:27.4 (marked not valid),
// Jan 5:36.5, Oct 5:51.2. Latest-first set her aerobic targets off 6:09.8 -- about 40s too slow.
// This replaces the 31 Aug 2026 latest-first rule (PR #117) at Andy's direction. Proves, in the real app, that every
// T400 selector (the evidence engine and its index, v4-correct's and app.js's anchors) now picks the fastest valid
// test for that stroke, never a test marked not valid, never another stroke, and that the Board target follows it.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOSEngines?.Evidence?.t400Rows&&window.MSOSEngines?.Coordinator&&window.MSOS4?.targets?.t400&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.waitForTimeout(600);
    const r=await page.evaluate(()=>{const M=window.MSOS4,E=window.MSOSEngines,st=M.state;
      const keep={r:st.trainingTestResults,t:st.trainingTestTypes,a:st.athletes};
      const ash={id:'athlete-ashley-brown',full_name:'Ashley Brown',squad:'National',active:true};
      st.athletes=[...(st.athletes||[]).filter(a=>a.id!==ash.id),ash];
      st.trainingTestTypes=[{id:'tf',test_key:'t400_freestyle',name:'Timed 400 Freestyle',stroke:'Freestyle',distance:400},{id:'tb',test_key:'t400_backstroke',name:'Timed 400 Backstroke',stroke:'Backstroke',distance:400}];
      const row=(id,s,d,extra={})=>({id,athlete_id:ash.id,test_type_id:'tf',result_seconds:s,result_date:d,pool_course:'SCM',valid_for_anchor:true,...extra});
      st.trainingTestResults=[row('jun',369.8,'2026-06-01'),row('mar-ok',327.3,'2026-03-01',{pool_course:null}),row('mar-bad',327.0,'2026-03-01',{valid_for_anchor:false}),
        row('jan',336.5,'2026-01-01'),row('oct',351.2,'2025-10-01'),{...row('back',300.0,'2026-08-01'),test_type_id:'tb'}];
      try{M.performanceEngine?.invalidate?.()}catch{}
      const sec=x=>Number(x?.result_seconds);
      const out={
        evidence:sec((E.Evidence.t400Rows(ash,st,'Freestyle')||[])[0]),
        evidenceOrder:(E.Evidence.t400Rows(ash,st,'Freestyle')||[]).map(sec),
        backstroke:sec((E.Evidence.t400Rows(ash,st,'Backstroke')||[])[0]),
        targetsAnchor:sec(M.targets.t400(ash,st,'SCM','Freestyle')),
        aerobicEngine:sec(E.Aerobic?.t400?.(ash,st,'Freestyle')||(E.Evidence.t400Rows(ash,st,'Freestyle')||[])[0])};
      // Same time twice -> the newer one.
      st.trainingTestResults.push(row('jul-same',327.3,'2026-07-01'));
      out.tieId=(E.Evidence.t400Rows(ash,st,'Freestyle')||[])[0]?.id;
      st.trainingTestResults=st.trainingTestResults.filter(x=>x.id!=='jul-same');
      // The Board target follows the fastest T400: 8 x 100 Threshold paced off 5:27.3, not 6:09.8.
      const s=M.parser.parse('MAIN SET\n8 x 100 Freestyle Threshold 15s rest',{id:'t400-fast',date:'2026-10-15',dayPart:'PM',squads:['National'],venue:'AquaGym',course:'SCM'});
      const it=s.blocks[0].items[0];const p=E.Coordinator.prescription(s,it,ash,st);out.target=Number(p?.target?.seconds??p?.target);
      st.trainingTestResults=[row('only-slow',369.8,'2026-06-01')];try{M.performanceEngine?.invalidate?.()}catch{}
      const p2=E.Coordinator.prescription(s,it,ash,st);out.targetFromSlow=Number(p2?.target?.seconds??p2?.target);
      st.trainingTestResults=keep.r;st.trainingTestTypes=keep.t;st.athletes=keep.a;try{M.performanceEngine?.invalidate?.()}catch{}
      return out;});
    assert.equal(r.evidence,327.3,'evidence engine: fastest valid freestyle T400 (5:27.3), not the latest (6:09.8)');
    assert.deepEqual(r.evidenceOrder,[327.3,336.5,351.2,369.8],'fastest first; the test marked not valid is never used');
    assert.equal(r.backstroke,300,'each stroke keeps its own T400');
    assert.equal(r.targetsAnchor,327.3,'v4-correct anchor uses the fastest too');
    assert.equal(r.aerobicEngine,327.3,'aerobic engine uses the fastest');
    assert.equal(r.tieId,'jul-same','same time twice -> the newer test');
    assert.ok(Number.isFinite(r.target)&&Number.isFinite(r.targetFromSlow),`targets computed: ${JSON.stringify(r)}`);
    assert.ok(r.targetFromSlow-r.target>8,`Ashley's 100 Threshold target is set off 5:27.3 (${r.target}s), clearly faster than off 6:09.8 (${r.targetFromSlow}s)`);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('T400_FASTEST_ANCHOR_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
