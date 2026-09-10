'use strict';
// Real coaching failure this pins: Andy's build-list item 3 -- "full info visibility (results/training
// volumes/strokes/energy systems)". engines/swimmer-training-bd.js already computed real 7/30-day training
// accumulation, performance<->training links and upcoming sessions (its own render()), but that render()
// targeted a legacy DOM selector ([data-msos-ath-panel="training"]) the LIVE coach-view
// (engines/swimmer-instant-open-cn.js, which fully replaces [data-cn-panel] per tab) never creates. So that
// whole card was dead: Andy and swimmers only ever saw the single current session's blocks/chips, never any
// analysis of training volumes over time, and never any link between a swimmer's performance and the work
// behind it -- exactly the gap item 3 calls out.
//
// Fix: swimmer-training-bd.js now exports windowHtml/performanceHtml/nextHtml alongside viewFor, and
// swimmer-instant-open-cn.js's trainingHtml(a) -- the function that ACTUALLY renders into the live training
// tab -- calls them directly, appending real ACCUMULATION / PERFORMANCE <-> TRAINING / WHAT'S NEXT sections
// after the current-session card.
//
// This drives the REAL architecture engines + both real engine files end to end (no mocked projection/view
// data) and asserts the live trainingHtml(a) output now contains genuine 7-day accumulated metres and an
// upcoming session pulled from the same calendar Andy uses -- content that was previously unreachable no
// matter what data existed, because nothing ever rendered it.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

global.MSOSArchitecture={
  AthleteSession:require(path.join(root,'architecture','athlete-session-core.js')),
  TrainingHistory:require(path.join(root,'architecture','training-history-core.js')),
  AthleteObservation:require(path.join(root,'architecture','athlete-observation-core.js')),
  AthleteReport:require(path.join(root,'architecture','athlete-report-core.js')),
};
global.MSOSEngines={Evidence:{}};

const today=new Date();
const iso=d=>d.toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};

const ruby={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development',date_of_birth:'2013-01-18'};

// Finished yesterday, attended -- must count into the 7/30-day accumulation windows as real delivered metres.
const sessionYesterday={id:'sess-yesterday',identity:{date:iso(addDays(today,-1)),dayPart:'AM',title:'Threshold AM',squads:['Development'],course:'SCM',start:'06:00',end:'08:00'},
  blocks:[{id:'b-y',title:'Main',items:[{id:'i-y-1',kind:'set',reps:8,distance:100,stroke:'Freestyle',zone:'Threshold',raw:'8 x 100 Threshold @ 1:25'}]}],finish:{}};
// Today's session -- the coach currently has this open on his own device (M.currentSession()).
const sessionToday={id:'sess-today',identity:{date:iso(today),dayPart:'PM',title:'Sprint PM',squads:['Development'],course:'SCM',start:'16:00',end:'18:00'},
  blocks:[{id:'b-t',title:'Main',items:[{id:'i-t-1',kind:'set',reps:4,distance:50,stroke:'Freestyle',zone:'Overload',raw:'4 x 50 Sprint'}]}],finish:null};
// Tomorrow -- not finished, must surface under WHAT'S NEXT.
const sessionTomorrow={id:'sess-tomorrow',identity:{date:iso(addDays(today,1)),dayPart:'AM',title:'IM AM',squads:['Development'],course:'SCM',start:'06:00'},
  blocks:[{id:'b-tmrw',title:'Main',items:[{id:'i-tmrw-1',kind:'set',reps:6,distance:200,stroke:'IM',raw:'6 x 200 IM'}]}],finish:null};

global.MSOS4={
  ui:{},
  performanceEngine:{},
  state:{
    canonicalSessions:{[sessionYesterday.id]:sessionYesterday,[sessionToday.id]:sessionToday,[sessionTomorrow.id]:sessionTomorrow},
    athletes:[ruby],
    attendance:[{session_id:sessionYesterday.id,athlete_id:ruby.id,status:'present'},{session_id:sessionToday.id,athlete_id:ruby.id,status:'present'}],
    attendanceSnapshots:{},athleteSessionBoundaries:[],squadSessionBoundaries:[],captures:[],
    settings:{selectedAthleteId:ruby.id,loopAthleteTab:'training',view:'athletes'},
  },
  currentSession:()=>sessionToday,
};
global.document={
  readyState:'complete',
  querySelector:()=>null,querySelectorAll:()=>[],
  createElement:()=>({style:{}}),
  head:{appendChild(){}},
  addEventListener(){},
};
global.requestAnimationFrame=()=>{};
global.addEventListener=()=>{}; // globalThis.addEventListener, used for the 'pageshow' listener

require(path.join(root,'engines','swimmer-training-bd.js'));
require(path.join(root,'engines','swimmer-instant-open-cn.js'));

const T=global.MSOS4.swimmerTrainingBG,X=global.MSOS4.swimmerInstantOpenCN;
assert.ok(T,'swimmer-training-bd.js must install onto M.swimmerTrainingBG');
assert.ok(X?.trainingHtml,'swimmer-instant-open-cn.js must install and export trainingHtml');
assert.equal(typeof T.windowHtml,'function','swimmer-training-bd.js must export windowHtml for reuse');
assert.equal(typeof T.performanceHtml,'function','swimmer-training-bd.js must export performanceHtml for reuse');
assert.equal(typeof T.nextHtml,'function','swimmer-training-bd.js must export nextHtml for reuse');

const html=X.trainingHtml(ruby);

// Today's own session must still render exactly as before (this fix must not disturb the existing card).
assert.match(html,/Sprint PM/,"the current session's own block must still render");

// The previously-dead accumulation card must now be part of the LIVE training tab output.
assert.match(html,/ACCUMULATION/,'the live training tab must now include the accumulation card');
assert.match(html,/LAST 7 DAYS/);
assert.match(html,/800m/,"yesterday's finished, attended 800m session must count into the 7-day window");
assert.match(html,/PERFORMANCE ↔ TRAINING/,'the live training tab must now include the performance<->training link card');
assert.match(html,/WHAT'S NEXT/,'the live training tab must now include the upcoming-sessions card');
assert.match(html,/IM AM/,"tomorrow's session from Andy's own calendar must surface under WHAT'S NEXT");

console.log('SWIMMER_TRAINING_ACCUMULATION_LIVE_PASS');
