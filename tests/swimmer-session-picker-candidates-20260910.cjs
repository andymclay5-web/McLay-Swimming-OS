'use strict';
// Real coaching failure this pins: Andy's own spec, point 1 -- "he can select any session thts been entered
// through the same calendar I use". Before this fix, a swimmer's individually-projected session (targets,
// send-offs, squad-vs-individual modifications) was ALWAYS computed against whatever session happened to be
// open on Andy's own device at the moment he tapped "Generate 15-minute QR" (M.currentSession(), a single,
// hardcoded dependency threaded through presentSessionIds/commonArgs/viewFor/projectionFor). There was no way
// for a swimmer to see any other session from the calendar at all -- not tomorrow's, not a different squad's,
// nothing.
//
// Fix: engines/swimmer-training-bd.js's projectionFor(ath, session) now takes an optional explicit session
// (falling back to current() so every existing caller is unaffected), and a new candidateSessionsFor(ath)
// selects the real sessions from Andy's own calendar (M.state.canonicalSessions) that actually apply to this
// athlete -- matching one of their squads, within a sensible date window -- which is what
// engines/swimmer-invite-bn.js's sessionsFor(a) now uses to build the swimmer-portal picker list.
//
// This test loads the REAL architecture engines (architecture/athlete-session-core.js,
// architecture/training-history-core.js, architecture/athlete-observation-core.js,
// architecture/athlete-report-core.js -- the same ones athlete-report.test.js already exercises directly) so
// the projections asserted on here are genuine engine output, not a mock standing in for it.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

global.MSOSArchitecture={
  AthleteSession:require(path.join(root,'architecture','athlete-session-core.js')),
  TrainingHistory:require(path.join(root,'architecture','training-history-core.js')),
  AthleteObservation:require(path.join(root,'architecture','athlete-observation-core.js')),
  AthleteReport:require(path.join(root,'architecture','athlete-report-core.js')),
};

const today=new Date();
const iso=d=>d.toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};

const ruby={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development',date_of_birth:'2013-01-18'};

// Two real sessions for Ruby's own squad, inside the picker's default window (today +/- a few days).
const sessionToday={id:'sess-today',identity:{date:iso(today),dayPart:'AM',title:'Threshold AM',squads:['Development'],course:'SCM',start:'06:00',end:'08:00'},
  blocks:[{id:'b-today',title:'Main',items:[{id:'i-today-1',kind:'set',reps:8,distance:100,stroke:'Freestyle',raw:'8 x 100 Threshold @ 1:25'}]}],finish:null};
const sessionTomorrow={id:'sess-tomorrow',identity:{date:iso(addDays(today,1)),dayPart:'PM',title:'IM PM',squads:['Development'],course:'SCM',start:'16:00',end:'18:00'},
  blocks:[{id:'b-tmrw',title:'Main',items:[{id:'i-tmrw-1',kind:'set',reps:6,distance:200,stroke:'IM',raw:'6 x 200 IM'}]}],finish:null};
// Outside the default 10-day forward window -- must NOT appear in Ruby's picker.
const sessionTooFar={id:'sess-too-far',identity:{date:iso(addDays(today,20)),dayPart:'AM',title:'Far future',squads:['Development'],course:'SCM',start:'06:00'},
  blocks:[{id:'b-far',title:'Main',items:[{id:'i-far-1',kind:'set',reps:4,distance:100,stroke:'Freestyle',raw:'4 x 100'}]}],finish:null};
// A different squad entirely -- must NOT appear in Ruby's picker even though it's today.
const sessionWrongSquad={id:'sess-wrong-squad',identity:{date:iso(today),dayPart:'AM',title:'National AM',squads:['National'],course:'SCM',start:'05:00'},
  blocks:[{id:'b-nat',title:'Main',items:[{id:'i-nat-1',kind:'set',reps:10,distance:100,stroke:'Freestyle',raw:'10 x 100'}]}],finish:null};

global.MSOS4={
  ui:{},
  state:{
    canonicalSessions:{[sessionToday.id]:sessionToday,[sessionTomorrow.id]:sessionTomorrow,[sessionTooFar.id]:sessionTooFar,[sessionWrongSquad.id]:sessionWrongSquad},
    athletes:[ruby],attendance:[],attendanceSnapshots:{},athleteSessionBoundaries:[],squadSessionBoundaries:[],captures:[],
    settings:{},
  },
  currentSession:()=>null, // nothing "open" on the coach's device right now -- the picker must still work
  MSOSEngines:undefined,
};
global.MSOSEngines={}; // engine namespace referenced as g.MSOSEngines -- fine empty, unused by the code under test
global.document={readyState:'complete',querySelector:()=>null,addEventListener(){}};
global.requestAnimationFrame=()=>{};

require(path.join(root,'engines','swimmer-training-bd.js'));
const X=global.MSOS4.swimmerTrainingBG;
assert.ok(X,'swimmer-training-bd.js must install onto M.swimmerTrainingBG');

// --- candidateSessionsFor: squad + date-window filtering ---------------------------------------------------
const candidates=X.candidateSessionsFor(ruby);
const ids=candidates.map(s=>s.id);
assert.deepEqual(ids,['sess-today','sess-tomorrow'],`Ruby's picker must contain exactly her own squad's in-window sessions, sorted soonest-first, got: ${JSON.stringify(ids)}`);
assert.ok(!ids.includes('sess-too-far'),'a session 20 days out must not flood the picker');
assert.ok(!ids.includes('sess-wrong-squad'),"another squad's session must never appear on Ruby's picker, even on the same day");

// --- projectionFor(ath, session): genuinely per-session, not silently reusing current() ---------------------
const projToday=X.projectionFor(ruby,sessionToday);
const projTomorrow=X.projectionFor(ruby,sessionTomorrow);
assert.ok(projToday&&projTomorrow,'projectionFor must return a real projection for each explicit session');
assert.equal(projToday.sourceSessionId,'sess-today');
assert.equal(projTomorrow.sourceSessionId,'sess-tomorrow');
assert.notEqual(projToday.sourceSessionId,projTomorrow.sourceSessionId,'two different explicit sessions must not collapse onto the same projection');
assert.ok(projToday.blocks?.[0]?.items?.some(i=>/Threshold/i.test(i.raw||i.label||JSON.stringify(i))),"today's projection must carry today's own set, not tomorrow's");
assert.ok(projTomorrow.blocks?.[0]?.items?.some(i=>/IM/i.test(i.raw||i.label||JSON.stringify(i))),"tomorrow's projection must carry tomorrow's own set, not today's");

// --- backward compatibility: omitting the session argument still falls back to current() --------------------
global.MSOS4.currentSession=()=>sessionToday;
const projDefault=X.projectionFor(ruby);
assert.equal(projDefault?.sourceSessionId,'sess-today','projectionFor(ath) with no explicit session must still default to current(), unchanged from before this fix');

console.log('SWIMMER_SESSION_PICKER_CANDIDATES_PASS', `${ids.length} candidate sessions · sourceSessionIds ${projToday.sourceSessionId}/${projTomorrow.sourceSessionId} distinct`);
