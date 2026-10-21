'use strict';
// Andy, 19 Oct 2026 (after the first pool TV night): swimmer information on the TV for swimmer ownership --
//  "training over the last while ... the balances", "performance ... short course and long course side by side",
//  "ranking, list of events ... in order of the FINA points or World Aquatic points", and a pathway goal chosen for the
//  swimmer ("win a gold medal at New Zealand age groups", William's mum's idea) shown "at a push".
// Real app. Proves:
//  1. Training page: four weeks week by week, the energy-system balance in Rushton's groups (Anaerobic always shown)
//     and the stroke balance -- counted on what the swimmer swam.
//  2. Performance page: SC and LC side by side, each with its points, ranked by points.
//  3. Goal: picked from the swimmer's own pathway ladder (a medal standard here); the Goal page shows the target, the
//     PB, the gap and the steps on the way; Profile and Pathway lead with it; it is saved on the phone first and queued
//     for the team (msos_swimmer_goals); another coach's newer goal comes in on pull, this phone's unsent one is kept.
//  4. The phone's swimmer screen has a Goal tab with the choices; one tap sets the goal and puts the Goal page on the TV.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.swimmerGoals&&window.MSOS4?.swimmerBrief&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
  const r=await p.evaluate(async ORG=>{const M=window.MSOS4;M.state.settings.organisationId=ORG;
    M.state.athletes=[{id:'elsie',full_name:'Elsie Knowles',squad:'National',sex:'F',date_of_birth:'2011-01-01',active:true}];
    M.state.resultsPbBoard=[{id:'p1',athlete_id:'elsie',course:'SCM',distance:200,stroke:'Breaststroke',result_seconds:200.78,result_time_text:'3:20.78',result_date:'2026-08-20'},{id:'p2',athlete_id:'elsie',course:'LCM',distance:200,stroke:'Breaststroke',result_seconds:206.10,result_time_text:'3:26.10',result_date:'2026-03-01'},{id:'p3',athlete_id:'elsie',course:'SCM',distance:50,stroke:'Freestyle',result_seconds:33.0,result_time_text:'33.00',result_date:'2026-08-20'}];
    M.refs.data={...M.refs.data,pathway_standards:[{id:'s1',active:true,standard_kind:'qualifying',programme:'NZSC',course:'SCM',distance:200,stroke:'Breaststroke',sex:'F',qualifying_seconds:180.55,qualifying_time_text:'3:00.55',progression_order:10},{id:'s2',active:true,standard_kind:'medal',programme:'NZ Age Group Champs Gold',course:'SCM',distance:200,stroke:'Breaststroke',sex:'F',qualifying_seconds:172.40,qualifying_time_text:'2:52.40',progression_order:30},{id:'s3',active:true,standard_kind:'qualifying',programme:'Canterbury West Coast LC Champs',course:'LCM',distance:200,stroke:'Breaststroke',sex:'F',qualifying_seconds:190.00,qualifying_time_text:'3:10.00',progression_order:20}]};
    try{M.performanceEngine?.invalidate?.()}catch{}
    // four weeks of training (the swimmer at three sessions; one session she was away)
    const mk=(id,date,text)=>{const s=M.parser.parse(text,{date,dayPart:'PM',squads:['National']});s.id=id;s.identity={...s.identity,date,dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);return s;};
    const d=n=>{const t=new Date();t.setDate(t.getDate()-n);return t.toISOString().slice(0,10);};
    mk('t1',d(1),'MAIN SET\n8 x 100 Free Threshold 15s rest\n4 x 50 Fly race pace @1:30');mk('t2',d(9),'MAIN SET\n4 x 200 Breast Development 20s rest');mk('t3',d(16),'MAIN SET\n10 x 25 Free Max @1:00');mk('t4',d(3),'MAIN SET\n400 Free');
    M.state.attendance=[{id:'a1',session_id:'t1',athlete_id:'elsie',status:'present'},{id:'a2',session_id:'t2',athlete_id:'elsie',status:'present'},{id:'a3',session_id:'t3',athlete_id:'elsie',status:'present'},{id:'a4',session_id:'t4',athlete_id:'elsie',status:'absent'}];
    const SB=M.swimmerBrief,tr=SB.page('elsie','training'),pf=SB.page('elsie','performance');
    // 3. goal from the ladder
    const choices=M.swimmerGoals.choices('elsie',200,'Breaststroke');const gold=choices.find(c=>/Gold/.test(c.label));
    M.state.pending=[];M.cloud.sendSoon=()=>{};M.swimmerGoals.set('elsie',gold);
    const queued=M.state.pending.filter(x=>x.table==='msos_swimmer_goals').map(x=>x.record);
    const goalPage=SB.html(SB.page('elsie','goal')),profile=SB.html(SB.page('elsie','profile')),pathway=SB.html(SB.page('elsie','pathway'));
    // another coach's goal: newer wins on pull, but not over this phone's unsent one
    M.cloud.ready=()=>true;let rows=[{athlete_id:'elsie',goal:{distance:200,stroke:'Breaststroke',course:'SCM',label:'NZSC',kind:'qualifying',seconds:180.55},set_by_name:'Jordan',updated_at:'2099-01-01T00:00:00Z'}];M.cloud.fetch=async()=>rows;
    await M.swimmerGoals.pull();const keptWhilePending=M.swimmerGoals.get('elsie').goal.label;
    M.state.pending=[];await M.swimmerGoals.pull();const afterPull=M.swimmerGoals.get('elsie');
    return{tr,pf,choices:choices.map(c=>`${c.course} ${c.label} ${c.seconds}`),gold,queued,goalPage,profile,pathway,keptWhilePending,afterPull};},ORG);
  // 1. training
  assert.equal(r.tr.weeks.length,4);assert.equal(r.tr.weeks.reduce((n,w)=>n+w.sessions,0),3,'three sessions she was at');
  const groups=r.tr.balance.map(g=>g.group);assert.ok(groups.includes('Aerobic')&&groups.includes('Anaerobic'),`Rushton groups: ${groups}`);
  const an=r.tr.balance.find(g=>g.group==='Anaerobic');assert.ok(an.rows.some(x=>/Anaerobic Power/.test(x.label)&&x.metres>0),'race pace counted as Anaerobic Power');assert.ok(an.rows.some(x=>/Anaerobic Capacity/.test(x.label)&&x.metres>0),'max as Anaerobic Capacity');
  assert.ok(r.tr.strokes.some(s=>s.stroke==='Breast')&&r.tr.strokes.some(s=>s.stroke==='Free'),`stroke balance: ${JSON.stringify(r.tr.strokes)}`);
  // 2. performance
  const ev=r.pf.events.find(e=>e.event==='200 Breast');assert.ok(ev.scm&&ev.lcm,'SC and LC side by side');assert.ok(ev.scmPts>0&&ev.lcmPts>0,`points per course ${ev.scmPts}/${ev.lcmPts}`);
  const pts=r.pf.events.map(e=>e.points||0);assert.deepEqual(pts,[...pts].sort((x,y)=>y-x),'ranked by points');
  // 3. goal
  assert.ok(r.gold,`a medal standard is offered: ${r.choices}`);assert.equal(r.queued.length,1);assert.equal(r.queued[0].athlete_id,'elsie');assert.equal(r.queued[0].organisation_id,ORG);assert.equal(r.queued[0].goal.seconds,172.4);
  assert.match(r.goalPage,/GOAL[\s\S]*Gold[\s\S]*200 Breast LC[\s\S]*2:52\.40[\s\S]*PB 3:26\.10[\s\S]*33\.70s[\s\S]*to go/,'NZ Age Groups is long course: gap from the LC PB');
  assert.match(r.goalPage,/On the way[\s\S]*Canterbury West Coast LC Champs[\s\S]*3:10[\s\S]*16\.10s/,'qualifying for the meet is a step on the way');assert.doesNotMatch(r.goalPage,/NZSC/,'short course standards are not steps to a long course goal');
  assert.match(r.profile,/GOAL[\s\S]*Gold/);assert.match(r.pathway,/GOAL[\s\S]*Gold/);
  assert.match(r.keptWhilePending,/Gold/,"this phone's unsent goal is kept");assert.equal(r.afterPull.goal.label,'NZSC');assert.equal(r.afterPull.set_by_name,'Jordan');
  // 4. phone Goal tab
  await p.evaluate(()=>{window.MSOS4.state.pending=[];window.MSOS4.tvDisplay.openSwimmer('elsie','goal',{noTv:true});});
  await p.waitForSelector('[data-goal-pick]');assert.match(await p.textContent('.sb-goal-pick'),/Change the goal[\s\S]*Gold/);
  const idx=await p.evaluate(()=>[...document.querySelectorAll('[data-goal-pick]')].findIndex(b=>/Gold/.test(b.textContent)));
  await p.click(`[data-goal-pick="${idx}"]`);
  const after=await p.evaluate(()=>({goal:window.MSOS4.swimmerGoals.get('elsie').goal.label,tv:window.MSOS4.tvDisplay.current()?.swimmer}));
  assert.match(after.goal,/Gold/);assert.deepEqual({id:after.tv.id,page:after.tv.page},{id:'elsie',page:'goal'},'the Goal page goes on the TV');
  assert.equal(await p.evaluate(()=>window.MSOS4.swimmerGoals.friendly('National Age winner benchmark')),'NZ Age Groups · gold','the real benchmark names read as coach words');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SWIMMER_PAGES_GOAL_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
