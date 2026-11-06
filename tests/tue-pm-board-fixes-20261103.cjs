'use strict';
// Andy, Tue 3 Nov 2026 PM session, live Board: "I see a couple of issues so far" -> "All" of:
//  1. Warm-up "20 mins / 100free / 15 burpees / 100 IM / 5 push ups" read 115m: "15 burpees" counted as 15m and
//     "100free" dropped. Now 100 Free + 100 IM = 200m, burpees and push-ups kept as notes. "MOD 3 · Charlotte 115m ·
//     Matt 115m · Conor 115m" showed on a block where nobody's work differed.
//  2. Squad 8x50 Fins MAX @2:30 -> Charlotte 5x50 @4:00, Conor 4x50 @5:00: max-effort reps now keep the squad send-off.
//  3. Conor's #1 stroke showed "Auto": no ranking points (para, no class / no sex recorded) -> his own PBs pick Breaststroke.
//  4. Brief "Anaerobic Power · Race-specific speed" + a MAX main set was flagged "off brief".
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const SESSION='WARM UP\n20 mins\n100free\n15 burpees\n100 IM\n5 push ups\n\nPRE SET\n8 x 50 #1 drill 10 sr\n8 x 25 Fins 15m MAX @ 0:45\n\nMAIN SET\n8 x 50 Fins MAX #1 max @ 2:30';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const p=await (await b.newContext({timezoneId:'Pacific/Auckland'})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOSEngines?.Coordinator&&window.MSOS4?.performanceEngine&&window.MSOS4?.sessionMethodology,{timeout:30000});await p.waitForTimeout(400);
  const r=await p.evaluate(t=>{const M=window.MSOS4,E=window.MSOSEngines;
    const ch={id:'ch',full_name:'Charlotte Murphy',squad:'National',active:true},co={id:'athlete-conor-fischer',full_name:'Conor Fischer',squad:'Development',active:true,membership_type:'Transferred para swimmer',modifications:'Para swimmer'};
    M.state.athletes=[ch,co];M.state.adaptationProfiles=[{id:'p',athlete_id:'ch',default_volume_ratio:0.6,active:true,activation_mode:'always'},{id:'q',athlete_id:co.id,default_volume_ratio:0.5,active:true,activation_mode:'always'}];
    M.state.resultsPbBoard=[['SCM','Breaststroke',100,114.5],['SCM','Breaststroke',200,239.41],['SCM','IM',100,123.51],['LCM','Backstroke',50,79.31]].map(([course,stroke,distance,s])=>({athlete_id:co.id,full_name:'Conor Fischer',course,stroke,distance,pb_seconds:s,pb_time:String(s),pb_date:'2026-08-30'}));
    M.state.settings.storageRevision=(M.state.settings.storageRevision||0)+11;
    const s=M.parser.parse(t,{id:'tue',date:'2026-11-03',dayPart:'PM',squads:['National'],course:'SCM'});s.id='tue';
    const wu=s.blocks[0],main=s.blocks.find(x=>x.type==='main_set'),max=main.items.find(i=>i.kind==='set');
    const wuSets=wu.items.filter(i=>i.kind==='set'),wuMetres=wuSets.reduce((n,i)=>n+i.reps*i.distance,0);
    const notes=wu.items.filter(i=>i.kind==='cue').map(i=>i.raw);
    const pr=a=>E.Coordinator.prescription(s,max,a,M.state).item;
    const vol=a=>M.boardModVolume?.blockVolume?.(wu,a,s);
    return{wuMetres,wuStrokes:wuSets.map(i=>i.stroke),notes,chMax:{reps:pr(ch).reps,cyc:pr(ch).cycleSeconds},coMax:{reps:pr(co).reps,cyc:pr(co).cycleSeconds},
      wuSame:[vol(ch),vol(co)],conor:M.performanceEngine.selectStrokeForContext(co,max,M.state,s).stroke,label:M.boardEngine.strokeLabel?.(s,max,co)||'',
      brief:M.sessionMethodology.evaluate(s,M.state)?.plan};},SESSION);
  assert.equal(r.wuMetres,200,`warm-up is 100 Free + 100 IM: ${JSON.stringify(r)}`);assert.deepEqual(r.wuStrokes,['Freestyle','IM']);
  for(const n of ['20 mins','15 burpees','5 push ups'])assert.ok(r.notes.includes(n),`${n} kept as a note: ${JSON.stringify(r.notes)}`);
  assert.deepEqual(r.wuSame,[200,200],'a 20-minute circuit is the same for everyone, so nobody is listed as modified there');//'Charlotte\'s warm-up is the squad\'s, so she is not listed as modified there');
  assert.equal(r.chMax.cyc,150,'Charlotte keeps @2:30 on max 50s');assert.ok(r.chMax.reps<8);
  assert.equal(r.coMax.cyc,150,'Conor keeps @2:30 on max 50s');assert.ok(r.coMax.reps<8);
  assert.equal(r.conor,'Breaststroke');assert.match(r.label,/^Br/);
  if(r.brief?.checked)assert.equal(r.brief.matches,true,'a speed brief with a max main set is on brief');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TUE_PM_BOARD_FIXES_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
