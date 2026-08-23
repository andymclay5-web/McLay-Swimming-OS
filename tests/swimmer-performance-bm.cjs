'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');

const athlete={id:'fixture-athlete',full_name:'Fixture Athlete',active:true};
const strokes=['Freestyle','Backstroke','Breaststroke','Butterfly','IM'];
const eventDefs=[
  [50,'Freestyle',28.00],[100,'Freestyle',61.00],[200,'Freestyle',132.00],[400,'Freestyle',278.00],[800,'Freestyle',575.00],
  [50,'Backstroke',32.00],[100,'Backstroke',70.00],[200,'Backstroke',150.00],
  [50,'Breaststroke',36.00],[100,'Breaststroke',80.00],[200,'Breaststroke',175.00],
  [200,'IM',145.00],[400,'IM',298.76]
];
const rows=eventDefs.map(([distance,stroke,seconds],i)=>({
  id:`pb-${i}`,athlete_id:athlete.id,course:'SCM',distance,stroke,result_seconds:seconds,result_date:'2026-07-01'
}));
// Same event history must feed season movement but still dedupe to one displayed event.
rows.push({id:'im400-early',athlete_id:athlete.id,course:'SCM',distance:400,stroke:'IM',result_seconds:305.51,result_date:'2026-04-09'});
// A slower duplicate must never replace the PB.
rows.push({id:'free100-old',athlete_id:athlete.id,course:'SCM',distance:100,stroke:'Freestyle',result_seconds:63.00,result_date:'2026-02-01'});

function standardFor(pb){
  if(pb.distance===400&&pb.stroke==='IM')return [{_label:'NZ Short Course',_seconds:295.00,_kind:'qualifying'}];
  if(pb.distance===200&&pb.stroke==='IM')return [];
  return [{_label:'Next loaded benchmark',_seconds:Math.max(1,pb.result_seconds-2),_kind:'qualifying'}];
}

const Evidence={
  pbRows:()=>rows,
  course:r=>r.course,
  distance:r=>r.distance,
  rowStroke:r=>r.stroke,
  seconds:r=>r.result_seconds
};
const pathwayEvents=eventDefs.map(([distance,stroke,seconds])=>({
  pb:{course:'SCM',distance,stroke,result_seconds:seconds},
  qualifying:standardFor({distance,stroke,result_seconds:seconds}),
  deeper:[]
}));
const ranked=eventDefs.map(([distance,stroke,seconds],i)=>({course:'SCM',distance,stroke,seconds,points:600-i,pointSystem:'WA'}));

const MSOS4={
  ui:{renderAthletes:()=>{}},
  state:{settings:{selectedAthleteId:athlete.id,pathwayCourse:'SCM'},athletes:[athlete]},
  access:{role:()=> 'owner'},
  performanceEngine:{rankedEvents:()=>ranked,scoreSystem:()=> 'WA'},
  pathway:{profile:()=>({events:pathwayEvents})},
  util:{escape:String,clock:n=>Number(n).toFixed(2)},
  currentSession:()=>({identity:{course:'SCM'}})
};
const context={
  console,MSOS4,MSOSEngines:{Evidence},
  document:{readyState:'complete',querySelector:()=>null,addEventListener:()=>{}},
  requestAnimationFrame:fn=>fn(),
  addEventListener:()=>{},
  Date,
};
context.globalThis=context;
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'../engines/swimmer-performance-bm.js'),'utf8');
vm.runInContext(source,context,{filename:'swimmer-performance-bm.js'});

const engine=context.MSOS4.swimmerPerformanceBM;
assert.ok(engine,'swimmer performance engine installed');
assert.equal(engine.checks().noAthleteSpecialCases,true);
const model=engine.modelFor(athlete,'SCM');
assert.equal(model.events.length,13,'all 13 valid SCM events remain visible; no top-N slice');
assert.equal(new Set(model.events.map(e=>e.key)).size,13,'events are deduped by course/distance/stroke');
const im400=model.events.find(e=>e.distance===400&&e.stroke==='IM');
assert.ok(im400,'400 IM is retained in the generic event model');
assert.equal(im400.pbSeconds,298.76,'400 IM uses fastest verified PB');
assert.equal(im400.next._label,'NZ Short Course');
assert.ok(Math.abs(im400.next.gapSeconds-3.76)<1e-9,'exact NZSC gap is computed from PB and loaded benchmark');
assert.ok(Math.abs(im400.season.improvement-6.75)<1e-9,'season progression is event-specific first swim to best swim');
const im200=model.events.find(e=>e.distance===200&&e.stroke==='IM');
assert.ok(im200&&!im200.next,'missing benchmark remains missing rather than being invented');
assert.match(engine.gapText(im200),/No faster loaded benchmark/);
assert.ok(!source.includes('Matthew Callow'),'production projection contains no Matthew-specific branch');
assert.ok(!source.includes('.slice(0,12)'),'production all-event projection does not silently cap events at twelve');
console.log('SWIMMER_PERFORMANCE_BM_PASS');
