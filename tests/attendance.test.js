'use strict';
const assert=require('assert');
const Evidence=require('../engines/evidence-retrieval.js');
const Attendance=require('../engines/attendance.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function clock(){let n=0;return()=>`2026-08-18T05:20:${String(n++).padStart(2,'0')}+12:00`}
const evidence=Evidence.create({sources:[{id:'athletes',priority:100,trust:'verified',data:{athletes:[
 {id:'nat-a',full_name:'National A',squad:'National',active:true},
 {id:'nat-b',full_name:'National B',squad:'National',active:true},
 {id:'dev-a',full_name:'Development A',squad:'Development',active:true},
 {id:'fit-a',full_name:'Fitness A',squad:'Fitness',active:true},
 {id:'inactive',full_name:'Inactive Swimmer',squad:'National',active:false}
]}}]});
const sessionA={id:'tue-am',identity:{date:'2026-08-18',dayPart:'AM',squads:['National','Development']}};
const sessionB={id:'wed-am',identity:{date:'2026-08-19',dayPart:'AM',squads:['National','Development']}};
function engine(initial=null){return Attendance.create({storage:new Attendance.MemoryStorage(initial),evidence,clock:clock()})}

test('boot is read-only and does not invent an attendance roll',()=>{
 const storage=new Attendance.MemoryStorage({schema:Attendance.SCHEMA,records:[],journal:[],updatedAt:'old'}),a=Attendance.create({storage,evidence,clock:clock()});assert.equal(storage.reads,1);assert.equal(storage.writes,0);assert.equal(a.here(sessionA).length,0);assert.equal(a.summary(sessionA).here,0);
});

test('eligible roster is a suggestion from session squads, not attendance truth',()=>{
 const a=engine(),roster=a.eligibleRoster(sessionA);assert.deepEqual(roster.map(x=>x.id),['dev-a','nat-a','nat-b']);assert.equal(a.here(sessionA).length,0);assert.equal(a.summary(sessionA).eligible,3);assert.equal(a.summary(sessionA).counts.not_marked,3);
});

test('only explicit here statuses make a swimmer present on the deck',()=>{
 const a=engine();a.mark(sessionA,'nat-a','present');a.mark(sessionA,'nat-b','modified');a.mark(sessionA,'dev-a','late');assert.deepEqual(a.hereAthletes(sessionA).map(x=>x.id),['dev-a','nat-a','nat-b']);assert.equal(a.summary(sessionA).here,3);
});

test('absent and excused are never treated as here',()=>{
 const a=engine();a.mark(sessionA,'nat-a','absent');a.mark(sessionA,'nat-b','excused');assert.equal(a.here(sessionA).length,0);assert.equal(a.isHere(sessionA,'nat-a'),false);assert.equal(a.isHere(sessionA,'nat-b'),false);
});

test('yesterday attendance never leaks into a new session id',()=>{
 const a=engine();a.mark(sessionA,'nat-a','present');assert.equal(a.isHere(sessionA,'nat-a'),true);assert.equal(a.status(sessionB,'nat-a'),'not_marked');assert.equal(a.here(sessionB).length,0);
});

test('explicit cross-squad swimmer can be added even though not in suggested roster',()=>{
 const a=engine();assert(!a.eligibleRoster(sessionA).some(x=>x.id==='fit-a'));a.mark(sessionA,'fit-a','present',{note:'Coach added to this session'});assert.equal(a.isHere(sessionA,'fit-a'),true);assert(a.hereAthletes(sessionA).some(x=>x.id==='fit-a'));
});

test('inactive historical athlete cannot accidentally be put on active roll',()=>{
 const a=engine();assert(!a.eligibleRoster(sessionA).some(x=>x.id==='inactive'));assert.throws(()=>a.mark(sessionA,'inactive','present'),/Inactive athlete cannot be marked/);assert.equal(a.status(sessionA,'inactive'),'not_marked');
});

test('changing a mark is explicit, journalled and leaves one current record',()=>{
 const a=engine();a.mark(sessionA,'nat-a','present');a.mark(sessionA,'nat-a','absent',{note:'left early'});assert.equal(a.status(sessionA,'nat-a'),'absent');assert.equal(a.recordsForSession(sessionA).filter(x=>x.athlete_id==='nat-a').length,1);const h=a.history(sessionA,'nat-a');assert.equal(h.length,2);assert.deepEqual(h.map(x=>[x.from,x.to]),[['not_marked','present'],['present','absent']]);assert.equal(h[1].note,'left early');
});

test('re-marking the same status is idempotent and does not create another write or journal event',()=>{
 const storage=new Attendance.MemoryStorage(),a=Attendance.create({storage,evidence,clock:clock()});a.mark(sessionA,'nat-a','present');const writes=storage.writes,journal=a.history(sessionA,'nat-a').length;a.mark(sessionA,'nat-a','present');assert.equal(storage.writes,writes);assert.equal(a.history(sessionA,'nat-a').length,journal);
});

test('clear mark returns swimmer to not-marked without deleting the history',()=>{
 const a=engine();a.mark(sessionA,'nat-a','present');a.clearMark(sessionA,'nat-a');assert.equal(a.status(sessionA,'nat-a'),'not_marked');assert.equal(a.history(sessionA,'nat-a').length,2);assert.equal(a.here(sessionA).length,0);
});

test('attendance state contains attendance only and cannot mutate session truth',()=>{
 const session=JSON.parse(JSON.stringify(sessionA)),before=JSON.stringify(session);const a=engine();a.mark(session,'nat-a','present');assert.equal(JSON.stringify(session),before);const snap=a.snapshot();assert.equal(Object.prototype.hasOwnProperty.call(snap,'sessions'),false);assert.equal(Object.prototype.hasOwnProperty.call(snap,'selectedSessionId'),false);
});

test('summary counts current exact-session states and not-marked eligible swimmers',()=>{
 const a=engine();a.mark(sessionA,'nat-a','present');a.mark(sessionA,'nat-b','absent');const s=a.summary(sessionA);assert.equal(s.here,1);assert.equal(s.eligible,3);assert.equal(s.counts.present,1);assert.equal(s.counts.absent,1);assert.equal(s.counts.not_marked,1);
});

test('invalid status is rejected instead of becoming a new ad-hoc bucket',()=>{
 const a=engine();assert.throws(()=>a.mark(sessionA,'nat-a','maybe'),/Invalid attendance status/);assert.equal(a.status(sessionA,'nat-a'),'not_marked');
});

if(fails){console.error(`\n${fails} Attendance regression(s) failed`);process.exit(1)}
console.log('\nALL ATTENDANCE REGRESSIONS PASS');
