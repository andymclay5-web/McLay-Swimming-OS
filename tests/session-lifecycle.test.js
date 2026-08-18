'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const L=require('../engines/session-lifecycle.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function clock(){let n=0;return()=>`2026-08-18T08:00:${String(n++).padStart(2,'0')}.000+12:00`}
const identity={date:'2026-08-18',dayPart:'AM',start:'05:20',end:'07:20',venue:'AquaGym',course:'SCM',squads:['National'],title:'Tuesday AM'};
const parse=(src,id='session-tue-am')=>Truth.parse(src,{...identity,id});

test('boot is strictly read-only',()=>{
 const initial={schema:L.SCHEMA,sessions:[],drafts:[],selectedSessionId:null,updatedAt:'old'};const storage=new L.MemoryStorage(initial);const life=L.create({storage,clock:clock()});assert.equal(storage.reads,1);assert.equal(storage.writes,0);assert.deepEqual(life.snapshot(),initial);
});

test('a stale draft cannot hijack the selected saved session on boot',()=>{
 const a=parse('Main set\n4 x 100 Free','saved-a'),b=parse('Main set\n5 x 100 Free','saved-b');const seed=new L.MemoryStorage();let life=L.create({storage:seed,clock:clock()});life.createSession(a);life.createSession(b);life.selectSession('saved-a');life.createDraft({id:'stale-draft',identity,source:'Main set\n99 x 100 Free'});assert.equal(life.selectedId(),'saved-a');const writes=seed.writes;life=L.create({storage:seed,clock:clock()});assert.equal(seed.writes,writes);assert.equal(life.selectedId(),'saved-a');assert.equal(life.getDraft('stale-draft').source,'Main set\n99 x 100 Free');
});

test('saving and reopening a draft never makes it authoritative',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});const d=life.createDraft({id:'draft-1',identity,source:'Main set\n4 x 100 Free'});assert.equal(life.selectedId(),null);life.updateDraft(d.id,{source:'Main set\n5 x 100 Free'});assert.equal(life.selectedId(),null);assert.equal(life.listSessions().length,0);assert.equal(life.getDraft(d.id).source,'Main set\n5 x 100 Free');
});

test('explicit Create from draft saves canonical truth, removes draft and selects session',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createDraft({id:'draft-create',identity,source:'Main set\n4 x 100 Free'});const canonical=parse('Main set\n4 x 100 Free');const rec=life.createFromDraft('draft-create',canonical);assert.equal(rec.id,'session-tue-am');assert.equal(life.selectedId(),'session-tue-am');assert.equal(life.getDraft('draft-create'),null);assert.equal(Truth.totalDistance(life.selected().current),400);assert.equal(life.selected().journal[0].type,'create');
});

test('same session id cannot be silently recreated; replacement must be explicit',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createSession(parse('Main set\n4 x 100 Free'));assert.throws(()=>life.createSession(parse('Main set\n8 x 100 Free')),/Explicit replacement required/);assert.equal(Truth.totalDistance(life.selected().current),400);const replacement=parse('Main set\n8 x 100 Free');life.replaceSession('session-tue-am',replacement,{note:'coach explicitly replaced plan'});assert.equal(Truth.totalDistance(life.selected().current),800);assert.equal(life.selected().journal.at(-1).type,'replace');
});

test('original plan is immutable across edit and replacement transactions',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});const first=parse('Main set\n4 x 100 Free');life.createSession(first);life.applyEdit('session-tue-am',parse('Main set\n5 x 100 Free'),{note:'live edit'});life.replaceSession('session-tue-am',parse('Main set\n6 x 100 Free'),{note:'explicit replacement'});const rec=life.selected();assert.equal(Truth.totalDistance(rec.originalPlan),400);assert.equal(Truth.totalDistance(rec.current),600);assert.equal(rec.revision,3);assert.deepEqual(rec.journal.map(x=>x.type),['create','edit','replace']);
});

test('caller mutation after create cannot mutate stored original or current truth',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});const c=parse('Main set\n4 x 100 Free');life.createSession(c);c.blocks[0].items[0].reps=99;c.identity.venue='Somewhere Else';const rec=life.selected();assert.equal(Truth.totalDistance(rec.originalPlan),400);assert.equal(Truth.totalDistance(rec.current),400);assert.equal(rec.identity.venue,'AquaGym');
});

test('ordinary edit cannot change session identity',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createSession(parse('Main set\n4 x 100 Free'));const changed=Truth.parse('Main set\n4 x 100 Free',{...identity,id:'session-tue-am',date:'2026-08-19'});assert.throws(()=>life.applyEdit('session-tue-am',changed),/identity cannot change/i);assert.equal(life.selected().identity.date,'2026-08-18');
});

test('identity change requires the explicit identity transaction',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createSession(parse('Main set\n4 x 100 Free'));life.changeIdentity('session-tue-am',{...identity,date:'2026-08-19'},{note:'coach deliberately moved session'});const rec=life.selected();assert.equal(rec.identity.date,'2026-08-19');assert.equal(rec.current.identity.date,'2026-08-19');assert.equal(rec.journal.at(-1).type,'identity_change');
});

test('boot never reparses raw source or upgrades canonical truth behind the coach',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});const locked=parse('Main set\n4 x 100 Free');locked.originalSource={text:'Main set\n8 x 100 Free',hash:'different-source'};life.createSession(locked);assert.equal(Truth.totalDistance(life.selected().current),400);const writes=storage.writes;const reopened=L.create({storage,clock:clock()});assert.equal(storage.writes,writes);assert.equal(Truth.totalDistance(reopened.selected().current),400);assert.equal(reopened.selected().current.originalSource.text,'Main set\n8 x 100 Free');
});

test('draft activity and session replacement preserve unrelated attendance data byte-for-byte',()=>{
 const attendance=[{session_id:'session-tue-am',athlete_id:'ath-1',status:'present',updated_at:'2026-08-18T05:22:00+12:00'}];const storage=new L.MemoryStorage({...L.blankState(),attendance});const life=L.create({storage,clock:clock()});life.createDraft({id:'d',identity,source:'Main set\n4 x 100 Free'});life.createFromDraft('d',parse('Main set\n4 x 100 Free'));life.replaceSession('session-tue-am',parse('Main set\n5 x 100 Free'));assert.deepEqual(storage.value.attendance,attendance);
});

test('selecting another session is explicit and a no-op reselect does not write',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createSession(parse('Main set\n4 x 100 Free','a'));life.createSession(parse('Main set\n5 x 100 Free','b'));assert.equal(life.selectedId(),'b');life.selectSession('a');assert.equal(life.selectedId(),'a');const writes=storage.writes;life.selectSession('a');assert.equal(storage.writes,writes);
});

test('superseding a session is explicit and preserves its full history',()=>{
 const storage=new L.MemoryStorage(),life=L.create({storage,clock:clock()});life.createSession(parse('Main set\n4 x 100 Free','old'));life.createSession(parse('Main set\n5 x 100 Free','new'));life.selectSession('old');life.markSuperseded('old',{bySessionId:'new',note:'explicit replacement record'});assert.equal(life.getSession('old').status,'superseded');assert.equal(life.getSession('old').originalPlan.blocks[0].items[0].reps,4);assert.equal(life.selectedId(),'new');
});

if(fails){console.error(`\n${fails} Session Lifecycle regression(s) failed`);process.exit(1)}
console.log('\nALL SESSION LIFECYCLE REGRESSIONS PASS');
