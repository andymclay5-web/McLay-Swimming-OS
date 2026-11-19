'use strict';
// Andy + Mike, Thu 19 Nov 2026: Mike's phone showed "Free · Back · Breast · Fly" while Andy's showed
// "Choice · IM · Free · Back" for stroke exposure -- two screens counting strokes two ways. Their rule:
//  - session distance / session stroke mix: IM is its own stroke ("on the session distance it will be IM");
//  - swimmer stroke volumes (swimmer page, reports): IM is shown as IM AND split four ways into Fly / Back / Breast /
//    Free ("if he is looking at how much butterfly he's done, the IM fly component should also count");
//  - "Choice" is gone: work with no stroke named counts as Freestyle.
// Proves both owners (engines/dosage.js for the session, engines/stroke-balance.js for swimmer volumes) on one session,
// and that swimmer totals never count IM twice.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SRC="WARM-UP\n400 Choice\n4 x 100 IM 10sR\n\nMAIN SET\n4 x 100 Back 10sR\n2 x 200 Free 10sR\n\nWARM-DOWN\n200 Easy";
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.strokeBalance&&window.MSOS4?.dosageEngine,{timeout:30000});await p.waitForTimeout(500);
  const r=await p.evaluate((SRC)=>{const M=window.MSOS4,D=M.dosageEngine,B=M.strokeBalance;const today=new Date(Date.now()-86400000).toISOString().slice(0,10);
    const s=M.parser.parse(SRC,{date:today,dayPart:'AM',squads:['National'],course:'SCM'});s.id='stroke-rule';s.identity={...s.identity,date:today,dayPart:'AM',squads:['National']};
    M.state.canonicalSessions={[s.id]:s};const ath={id:'athlete-matthew-robertson',full_name:'Matthew Robertson',squad:'National',active:true};M.state.athletes=[ath];
    M.state.attendance=[{id:'a1',session_id:s.id,athlete_id:ath.id,status:'present'}];M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+1;
    // session level: one stroke per piece of work, IM its own, no Choice
    const sess={};const walk=(items,m)=>{for(const n of items||[]){if(n.kind==='group'){walk(n.items,m*Math.max(1,Number(n.rounds)||1));continue;}if(n.kind!=='set')continue;const d=Math.max(1,Number(n.reps)||1)*(Number(n.distance)||0)*m;const st=D.strokeFrom(n);sess[st]=(sess[st]||0)+d;}};
    for(const bl of s.blocks)walk(bl.items,1);
    const sum=B.summary(ath,M.state,{days:7});
    return{sess,strokes:D.STROKES,raw:sum.raw,totalRaw:sum.totalRaw,report:B.REPORT_STROKES,analysis:M.analysis?.strokeFor?.({stroke:'Choice',raw:'400 Choice'})};},SRC);
  assert.deepEqual(r.strokes,['Freestyle','Backstroke','Breaststroke','Butterfly','IM','#1 Stroke'],'no Choice stroke at session level (#1 Stroke is each swimmer\'s own, so it is not Free)');
  assert.deepEqual(r.sess,{Freestyle:400+400+200,IM:400,Backstroke:400},'session: Choice and Easy count as Free, IM stays IM: '+JSON.stringify(r.sess));
  assert.equal(r.analysis,'Freestyle','"400 Choice" reads as Freestyle');
  assert.deepEqual(r.report,['Freestyle','Backstroke','Breaststroke','Butterfly','IM']);
  assert.deepEqual(r.raw,{Freestyle:1000+100,Backstroke:400+100,Breaststroke:100,Butterfly:100,IM:400},'swimmer: IM shown as IM and a quarter in each stroke: '+JSON.stringify(r.raw));
  assert.equal(r.totalRaw,1800,'swimmer total is the session metres, IM not counted twice');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('STROKE_COUNTING_IM_CHOICE_PASS',JSON.stringify(r.raw));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
