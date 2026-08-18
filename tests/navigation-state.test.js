'use strict';
const assert=require('assert');
const Nav=require('../rebuild/navigation-state.js');

let failures=0;
function test(name,fn){try{fn();console.log(`PASS ${name}`)}catch(e){failures++;console.error(`FAIL ${name}\n  ${e.stack||e.message}`)}}
console.log(`Navigation State ${Nav.VERSION}`);

test('owner navigation starts at Calendar root rather than arbitrary selected session',()=>{
  const nav=Nav.create({month:'2026-08'});assert.deepStrictEqual(nav.route(),{type:'calendar',month:'2026-08',date:'',occurrenceId:'',sessionId:'',detailType:'',detailId:'',modalName:'',scrollY:0});assert.strictEqual(nav.canBack(),false);
});

test('Calendar -> Day -> exact Board -> Back returns same Day -> Back returns Calendar',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.setScroll(144);nav.openBoard({date:'2026-08-18',occurrenceId:'occ-am',sessionId:'session-am'});assert.strictEqual(nav.route().sessionId,'session-am');let b=nav.back();assert.strictEqual(b.handled,true);assert.strictEqual(b.frame.type,'day');assert.strictEqual(b.frame.date,'2026-08-18');assert.strictEqual(b.frame.scrollY,144);b=nav.back();assert.strictEqual(b.frame.type,'calendar');assert.strictEqual(nav.back().handled,false);
});

test('Board never guesses session or occurrence identity from current UI state',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');assert.throws(()=>nav.openBoard({date:'2026-08-18',sessionId:'s'}),/occurrence id/);assert.throws(()=>nav.openBoard({date:'2026-08-18',occurrenceId:'o'}),/session id/);assert.throws(()=>nav.openBoard({date:'2026-08-19',occurrenceId:'o',sessionId:'s'}),/must match selected Day view/);
});

test('modal closes before leaving Board and underlying Board context is unchanged',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.openBoard({date:'2026-08-18',occurrenceId:'occ-am',sessionId:'session-am'});nav.setScroll(600);nav.openModal('capture-note',{meta:{itemId:'set-1'}});assert.strictEqual(nav.current().type,'modal');const b=nav.back();assert.strictEqual(b.frame.type,'board');assert.strictEqual(b.frame.sessionId,'session-am');assert.strictEqual(b.frame.scrollY,600);
});

test('screen off or resume does not rebuild or move the active Board route',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.openBoard({date:'2026-08-18',occurrenceId:'occ-am',sessionId:'session-am'});nav.setScroll(820);nav.markInteractive();const before=nav.snapshot(),resume=nav.resume();assert.strictEqual(resume.changed,false);assert.deepStrictEqual(nav.snapshot(),before);assert.strictEqual(nav.route().scrollY,820);
});

test('background hydration cannot replace date session or scroll after user interaction',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.openBoard({date:'2026-08-18',occurrenceId:'occ-am',sessionId:'session-am'});nav.setScroll(420);nav.markInteractive();const foreign=Nav.create({month:'2026-08'});foreign.openDate('2026-08-17');foreign.openBoard({date:'2026-08-17',occurrenceId:'old-occ',sessionId:'old-session'});const result=nav.applyExternalSnapshot(foreign.snapshot(),{source:'background_sync'});assert.strictEqual(result.applied,false);assert.strictEqual(nav.route().date,'2026-08-18');assert.strictEqual(nav.route().sessionId,'session-am');assert.strictEqual(nav.route().scrollY,420);
});

test('startup restore is allowed before first interaction and preserves exact previous route',()=>{
  const old=Nav.create({month:'2026-08'});old.openDate('2026-08-18');old.openBoard({date:'2026-08-18',occurrenceId:'occ-am',sessionId:'session-am'});old.setScroll(333);const fresh=Nav.create({month:'2026-08'}),result=fresh.applyExternalSnapshot(old.snapshot(),{source:'startup'});assert.strictEqual(result.applied,true);assert.strictEqual(fresh.route().sessionId,'session-am');assert.strictEqual(fresh.route().scrollY,333);
});

test('opening a later date never mutates or replaces the earlier route history implicitly',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.openBoard({date:'2026-08-18',occurrenceId:'occ18',sessionId:'session18'});nav.back();nav.back();nav.openDate('2026-08-19');nav.openBoard({date:'2026-08-19',occurrenceId:'occ19',sessionId:'session19'});assert.strictEqual(nav.route().sessionId,'session19');nav.back();assert.strictEqual(nav.route().date,'2026-08-19');nav.back();assert.strictEqual(nav.route().type,'calendar');
});

test('detail navigation preserves exact parent session context without owning session content',()=>{
  const nav=Nav.create({month:'2026-08'});nav.openDate('2026-08-18');nav.openBoard({date:'2026-08-18',occurrenceId:'occ',sessionId:'session'});nav.openDetail({detailType:'swimmer',detailId:'athlete-coral'});const route=nav.route();assert.strictEqual(route.detailId,'athlete-coral');assert.strictEqual(route.sessionId,'session');assert(!JSON.stringify(nav.snapshot()).includes('blocks'));assert(!JSON.stringify(nav.snapshot()).includes('workout'));
});

test('root Back is unhandled so host/browser may exit only when MSOS history is exhausted',()=>{
  const nav=Nav.create({month:'2026-08'}),b=nav.back();assert.strictEqual(b.handled,false);assert.strictEqual(b.exit,true);assert.strictEqual(b.frame.type,'calendar');
});

if(failures){console.error(`\n${failures} Navigation State regression(s) failed`);process.exit(1)}
console.log('\nALL NAVIGATION STATE REGRESSIONS PASS');
