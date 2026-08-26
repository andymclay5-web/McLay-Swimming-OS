'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const raw=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - 12:40 PM 20/08/2026 Page 1
2026 South Island Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 1 Mixed 12 & Under 50 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 06:15 PM
2 Rival One M11 North Canterbury 35.12
3 Aqua One M11 Aquagym 34.56
4 Rival Two W12 Jasi 33.90
Event 2 Mixed 12 & Under 50 SC Meter Backstroke
Heat 1 of 1 Finals Starts at 06:18 PM
1 Rival Three W11 Dragon 41.33
4 Aqua Two W12 Aquagym 39.22
5 Rival Four M12 Wharenui 38.77`;

const bodyClass={add(){},remove(){}};
const head={appendChild(){}};
global.document={
  readyState:'loading',
  body:{classList:bodyClass,appendChild(){}},
  head,
  getElementById(){return null},
  createElement(){return{dataset:{},className:'',id:'',textContent:'',innerHTML:'',firstElementChild:null,querySelector(){return null},querySelectorAll(){return[]}}},
  querySelector(){return null},
  querySelectorAll(){return[]},
  addEventListener(){}
};
global.MutationObserver=class{observe(){}};
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn()};
global.CSS={escape:v=>String(v)};
global.navigator={};

global.MSOS4={
  util:{
    text:v=>String(v??'').replace(/\s+/g,' ').trim(),
    escape:v=>String(v??''),
    clock:s=>Number(s).toFixed(2),
    now:()=>new Date(0).toISOString()
  },
  ui:{},
  store:{save:s=>s},
  storageEngine:{saveUi:()=>true},
  state:{
    settings:{view:'meet'},
    athletes:[
      {id:'a1',full_name:'Aqua One',active:true},
      {id:'a2',full_name:'Aqua Two',active:true}
    ],
    meetImports:[{id:'meet-source-1',text:raw,size:raw.length}],
    meetFieldDeck:{
      source_id:'meet-source-1',title:'2026 South Island Championships',races:[
        {event_number:1,event:'Mixed 12 & Under 50 SC Meter Freestyle',distance:50,stroke:'Freestyle',heat:1,lane:3,seed_time:'34.56',seed_seconds:34.56,athlete_id:'a1',athlete_name:'Aqua One',relay:false},
        {event_number:2,event:'Mixed 12 & Under 50 SC Meter Backstroke',distance:50,stroke:'Backstroke',heat:1,lane:4,seed_time:'39.22',seed_seconds:39.22,athlete_id:'a2',athlete_name:'Aqua Two',relay:false}
      ]
    }
  }
};
global.MSOSEngines={
  Evidence:{
    stroke:v=>String(v||''),pbRows:()=>[],distance:r=>Number(r?.distance)||0,rowStroke:r=>r?.stroke||'',course:r=>r?.course||'SCM',seconds:r=>Number(r?.seconds)||0
  },
  RacePace:{}
};

require('../engines/meet-program-ba.js');
const P=global.MSOS4.meetProgramBA;
assert.ok(P,'Meet programme projection should initialise');

const parsed=P.parseProgramme(raw,'meet-source-1');
assert.equal(parsed.events.length,2);
assert.equal(parsed.heats.length,2);
assert.equal(parsed.heats[0].rows.length,3,'full heat must retain rival swimmers as well as AquaGym');
assert.equal(parsed.heats[1].rows.length,3,'second event must retain every programme lane');
assert.deepEqual(parsed.heats[0].rows.map(r=>r.seed_time),['35.12','34.56','33.90']);
assert.deepEqual(parsed.heats[1].rows.map(r=>r.seed_time),['41.33','39.22','38.77']);
assert.equal(parsed.heats[0].rows.find(r=>r.name==='Aqua One').is_aquagym,true);
assert.equal(parsed.heats[0].rows.find(r=>r.name==='Rival One').is_aquagym,false);

let selected=P.selectedProgramme();
assert.equal(selected.src.source_id,'meet-source-1');
assert.equal(selected.ev.event_number,1);
assert.equal(global.MSOS4.state.meetProgramBA.selectedEventNumber,1);

assert.equal(P.selectEvent('meet-source-1',2,{scroll:false}),true);
selected=P.selectedProgramme();
assert.equal(selected.ev.event_number,2,'event tab selection must select only the requested event context');
assert.equal(global.MSOS4.state.meetProgramBA.selectedEventNumber,2);

P.setNow('meet-source-1|1|1');
assert.equal(global.MSOS4.state.meetProgramBA.nowKey,'meet-source-1|1|1');
assert.equal(global.MSOS4.state.meetProgramBA.selectedEventNumber,1,'NOW must drive selected event back to E1');
P.setNow('meet-source-1|2|1');
assert.equal(global.MSOS4.state.meetProgramBA.nowKey,'meet-source-1|2|1');
assert.equal(global.MSOS4.state.meetProgramBA.selectedEventNumber,2,'crossing the event boundary must move the active event tab to E2');

const source=fs.readFileSync(path.join(__dirname,'..','engines','meet-program-ba.js'),'utf8');
assert.match(source,/data-ba-event=/,'event tab controls must exist in the Meet programme projection');
assert.match(source,/data-ba-source=/,'session tabs must exist when multiple sessions are loaded');
assert.match(source,/h\.rows\.map\(row=>rowHtml\(h,row\)\)/,'selected event must still render every row in each heat');
assert.match(source,/row\.seed_time/,'programme rows must display supplied seed times');
assert.match(source,/function moveNow\(delta\).*setNow\(heatKey\(hs\[i\]\)\)/s,'Next/Previous Heat must route through setNow so crossing events updates the active tab');
assert.doesNotMatch(source,/M\.adapt|Aerobic|targetForItem/,'Meet programme projection must not take over training prescription engines');

console.log('MEET_PROGRAM_EVENT_TABS_PASS events=2 fullRows=6 seeds=6 nowCrosses=E1->E2');
