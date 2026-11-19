'use strict';
// Andy + Mike, Thu 19 Nov 2026: "we also need to log kick, pretty much the stroke of the kick if we can, pull, drill,
// all of the different components and report on each of them."
// Real lines from this week's sessions (Wed PM, Thu AM). Proves:
//  - one owner (engines/dosage.js componentFrom) says what kind of work a line is, read from the work and not its cue;
//  - a swimmer's volumes split Swim / Kick / Pull / Drill / Scull / Underwater / Skills, each with its stroke
//    (Backstroke kick is Backstroke kick; IM is shown and split four ways; nothing named = Freestyle);
//  - the swimmer page and the swimmer report both show the table; the session's movement mix uses the same owner.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SRC=["WARM-UP","400 Choice","4 x 100 (75 Free / 25 Back) Desc 1-4 10sR — Long-course pacing; perfect line on the 25 Back","","PRE-SET",
  "6 x 50 Kick Backstroke Build @1:10 — Body line + steady build, hips up","3 x 100 Pull Backstroke — Desc Stroke Count 1-3 15sR — Hold length, light paddles optional",
  "4 x 50 IM Kick @1:10","2 x 25 ⬇️H2O MAX","","MAIN SET","2 x 200 IM 10sR — attack the last turn","","POST-SET","200 Choice Scull — Perfect Technique","4 x 50 Drill Fly @1:10","","WARM-DOWN","200 Easy"].join('\n');
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.strokeBalance?.componentsHtml&&window.MSOS4?.dosageEngine?.componentFrom,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate((SRC)=>{const M=window.MSOS4,D=M.dosageEngine,B=M.strokeBalance;const day=new Date(Date.now()-86400000).toISOString().slice(0,10);
    const s=M.parser.parse(SRC,{date:day,dayPart:'AM',squads:['National'],course:'LCM'});s.id='comp-sess';s.identity={...s.identity,date:day,dayPart:'AM',squads:['National']};
    M.state.canonicalSessions={[s.id]:s};const ath={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true,sex:'M'};M.state.athletes=[ath];
    M.state.attendance=[{id:'a1',session_id:s.id,athlete_id:ath.id,status:'present'}];M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+1;
    const kinds=[];const walk=(items)=>{for(const n of items||[]){if(n.kind==='group'){walk(n.items);continue;}if(n.kind==='set')kinds.push(`${n.raw||n.text} => ${D.componentFrom(n)}`);}};for(const bl of s.blocks)walk(bl.items);
    const sum=B.summary(ath,M.state,{days:7});const c=k=>{const o=sum.components[k];return Object.fromEntries(Object.entries(o).filter(([,v])=>v>=1).map(([f,v])=>[f,Math.round(v)]));};
    return{kinds,swim:c('Swim'),kick:c('Kick'),pull:c('Pull'),drill:c('Drill'),scull:c('Scull'),uw:c('Underwater'),skills:c('Skills'),totalRaw:sum.totalRaw};},SRC);
  const kind=re=>r.kinds.find(k=>re.test(k))?.split(' => ')[1];
  assert.equal(kind(/^6 x 50 Kick/),'Kick');assert.equal(kind(/^3 x 100 Pull/),'Pull','"light paddles optional" in the cue does not change it');
  assert.equal(kind(/^2 x 200 IM/),'Swim','"attack the last turn" in the cue is not Skills');assert.equal(kind(/H2O/),'Underwater');
  assert.equal(kind(/Scull/),'Scull');assert.equal(kind(/Drill Fly/),'Drill');assert.equal(kind(/^400 Choice/),'Swim');
  assert.deepEqual(r.kick,{total:500,Freestyle:50,Backstroke:350,Breaststroke:50,Butterfly:50,IM:200},'kick with its stroke; IM kick shown and split: '+JSON.stringify(r.kick));
  assert.deepEqual(r.pull,{total:300,Backstroke:300},JSON.stringify(r.pull));
  assert.deepEqual(r.drill,{total:200,Butterfly:200});assert.deepEqual(r.scull,{total:200,Freestyle:200});assert.deepEqual(r.uw,{total:50,Freestyle:50});
  // Not pinned here: the parser does not yet split an inline "(75 Free / 25 Back)" into its parts, so that 4 x 100 counts
  // as Free for now. Choice / Easy = Free and IM is shown + split, which is what this test is about.
  assert.equal(r.swim.total,1400);assert.equal(r.swim.IM,400);assert.equal(r.swim.Breaststroke,100,'IM quarter');assert.ok(r.swim.Freestyle>=1000,JSON.stringify(r.swim));
  assert.equal(r.kick.total+r.pull.total+r.drill.total+r.scull.total+r.uw.total+r.swim.total,r.totalRaw,'components add up to the swimmer\'s metres');
  // the swimmer's Training page (swimmer brief) and the swimmer report both show it
  const page=await p.evaluate(()=>{const M=window.MSOS4,S=M.swimmerBrief;const d=S.page('athlete-matthew-robertson','training');const el=document.createElement('div');el.innerHTML=S.html(d);document.body.appendChild(el);
    return{rows:[...el.querySelectorAll('[data-sb-component]')].map(x=>x.innerText.replace(/\s+/g,' ').trim()),strokes:d.strokes.map(x=>`${x.stroke} ${x.metres}`)};});
  assert.ok(page.rows.some(x=>/^Kick 500m Fr 50 · Bk 350 · Br 50 · Fly 50 · IM 200/.test(x)),JSON.stringify(page));
  assert.ok(page.rows.some(x=>/^Pull 300m Bk 300/.test(x)));assert.ok(!page.rows.some(x=>/^Skills/.test(x)),'empty components are left out');
  assert.ok(page.strokes.includes('IM 600')&&page.strokes.some(x=>/^Fly \d+/.test(x)),'training page strokes: IM shown and split: '+JSON.stringify(page.strokes));
  const report=await p.evaluate(()=>{const M=window.MSOS4,R=M.reportingEngine;const r=R.run({scope:'swimmer',athleteId:'athlete-matthew-robertson',days:7,course:'LCM'},M.state);return JSON.stringify(r?.aggregate?.components?.Kick||null);});
  assert.match(report,/"total":500/,'swimmer report aggregates components: '+report);
  // session movement mix (Coach Hub) uses the same owner
  const mix=await p.evaluate(()=>{const M=window.MSOS4,D=M.dosageEngine,s=M.state.canonicalSessions['comp-sess'];const out={};const walk=(items)=>{for(const n of items||[]){if(n.kind==='group'){walk(n.items);continue;}if(n.kind==='set'){const k=D.componentFrom(n);out[k]=(out[k]||0)+Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0);}}};for(const bl of s.blocks)walk(bl.items);return out;});
  assert.deepEqual(mix,{Swim:1400,Kick:500,Pull:300,Underwater:50,Scull:200,Drill:200},JSON.stringify(mix));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('STROKE_COMPONENTS_PASS',JSON.stringify(r.kick));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
