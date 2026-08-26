'use strict';
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
global.addEventListener=()=>{};

const athletes=Array.from({length:70},(_,i)=>({id:`a${i}`,full_name:`Swimmer ${i}`,sex:i%2?'F':'M',squad:i<30?'National':'Development',modifications:[0,7,13,21,34].includes(i)?'adapted':''}));
const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'],distances=[50,100,200,400,800,1500],rows=[];
for(let i=0;i<athletes.length;i++)for(let j=0;j<84;j++)rows.push({id:`r${i}-${j}`,athlete_id:athletes[i].id,distance:distances[j%distances.length],stroke:strokes[j%strokes.length],course:'SCM',result_seconds:24+(i%9)+(j%17)*3,wa_points:0});
const base=[];for(const sex of ['M','F'])for(const stroke of strokes)for(const distance of distances){if(stroke==='IM'&&![200,400].includes(distance))continue;if(stroke!=='Freestyle'&&distance>200)continue;base.push({id:`wa-${sex}-${distance}-${stroke}`,course:'SCM',sex,distance,stroke,base_seconds:Math.max(20,distance*.24+(stroke==='Breaststroke'?8:stroke==='Backstroke'?4:stroke==='Butterfly'?3:0)),table_version:'fixture',active:true});}
const attendance=athletes.slice(0,17).map((a,i)=>({session_id:'stress',athlete_id:a.id,status:[0,5,10,15].includes(i)?'modified':'present'}));
const adaptationProfiles=athletes.filter((_,i)=>[0,5,10,15].includes(i)).map(a=>({athlete_id:a.id,default_volume_ratio:.67,active:true}));
const state={athletes,attendance,adaptationProfiles,resultsPbBoard:rows,resultsEventHistory:rows.slice(0,1800).map((r,i)=>({...r,id:`h${i}`})),coachResults:rows.slice(0,900).map((r,i)=>({...r,id:`c${i}`})),worldAquaticsBaseTimes:base,adaptationOverrides:[],settings:{view:'board',storageRevision:1},_refs:{},_evidenceBridge:{hydratedAt:'fixture'}};
const util={text:v=>String(v??'').replace(/\s+/g,' ').trim(),clock:s=>{s=Number(s);const m=Math.floor(s/60),x=s-m*60;return m?`${m}:${x.toFixed(1).padStart(4,'0')}`:x.toFixed(1);}};
global.MSOS4={state,util,pathway:{isPara:a=>!!(a?.current_s_class||a?.current_sb_class||a?.current_sm_class||/para|s\d|sb\d|sm\d/i.test(String(a?.modifications||'')))},dataRegistry:{activeRowsSync:type=>type==='wa_points'?state.worldAquaticsBaseTimes:[],activeMeta:type=>type==='wa_points'?{id:'fixture-wa',version:'fixture'}:null},engineBridge:{ensurePathwayAthlete:()=>0}};
require('../engines/evidence-index.js');
require('../engines/wa-points.js');
const Aerobic=require('../engines/aerobic.js');global.MSOSEngines.Aerobic=Aerobic;
const RacePace=require('../engines/race-pace.js');global.MSOSEngines.RacePace=RacePace;
const Modification=require('../engines/modification.js');global.MSOSEngines.Modification=Modification;
require('../engines/performance.js');
const Coordinator=require('../engines/coordinator.js');global.MSOSEngines.Coordinator=Coordinator;

const session={id:'stress',identity:{course:'SCM',squads:['National','Development']}};
const item={id:'rp50',kind:'set',reps:4,distance:50,stroke:'Choice',cycleSeconds:75,raw:'4 x 50 #1 Stroke @ 1:15 — Odd 200 Pace / Even Drill',repInstructions:[
 {rep:1,label:'200 Pace',raceIntent:{distance:200,eventDistance:200,workDistance:50}},
 {rep:2,label:'Drill'},
 {rep:3,label:'200 Pace',raceIntent:{distance:200,eventDistance:200,workDistance:50}},
 {rep:4,label:'Drill'}
]};
const present=athletes.slice(0,17);
const tGroup=performance.now();
const modified=present.filter(a=>attendance.find(r=>r.athlete_id===a.id)?.status==='modified'||Modification.profile(a,state).ratio<.98||String(a.modifications||'').trim());
const modIds=new Set(modified.map(a=>a.id)),group=present.filter(a=>!modIds.has(a.id));
const groupMs=performance.now()-tGroup;

const stage=[];const tTargets=performance.now();
for(const a of group){
 const t0=performance.now();
 const stroke=global.MSOS4.performanceEngine.selectStrokeForContext(a,item,state,session,{});
 const t1=performance.now();
 const target=Coordinator.targetForItem(session,item,a,state);
 const t2=performance.now();
 stage.push({id:a.id,strokeMs:t1-t0,targetMs:t2-t1,status:target?.status,stroke:stroke?.stroke});
 assert.ok(['rep_race','missing','ok'].includes(target?.status),`unexpected target status ${target?.status} for ${a.id}`);
}
const targetMs=performance.now()-tTargets,total=groupMs+targetMs,worst=stage.sort((a,b)=>(b.strokeMs+b.targetMs)-(a.strokeMs+a.targetMs))[0];
assert.ok(group.length>=10,'fixture must keep a realistic whole-group target list');
assert.ok(total<1500,`full Times path took ${total.toFixed(1)}ms for ${group.length} swimmers / ${rows.length+2700} evidence rows`);
const tCached=performance.now();group.forEach(a=>Coordinator.targetForItem(session,item,a,state));const cached=performance.now()-tCached;
assert.ok(cached<100,`cached Times target path took ${cached.toFixed(1)}ms`);
console.log(`DECK_TIMES_FULL_PATH_PASS group=${groupMs.toFixed(1)}ms targets=${targetMs.toFixed(1)}ms total=${total.toFixed(1)}ms cached=${cached.toFixed(1)}ms swimmers=${group.length} rows=${rows.length+2700} worst=${worst.id}:${(worst.strokeMs+worst.targetMs).toFixed(1)}ms`);
