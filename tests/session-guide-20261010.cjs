'use strict';
// Andy, 10 Oct 2026: "Needs to be able to give more guidance, be like ai helping you write a session that
// fits with my methodology, what I would expect out of a session and the components that make up the
// session" -- with his written methodology (docs/METHODOLOGY_McLay_20261010.md).
//
// Proves in a real browser:
//  A. Parser / dosage now read his shorthand as his document requires (each was wrong before):
//     "2 Rounds: 300 Reg 10sR / 200 Dev 10sR / 100 OL 10sR" = 1200m (was 600: lines became a breakdown);
//     "5 Rounds: 200 OL 10sR / 100 AT 10sR" = 1500m (was 1000); "AT" = Threshold (was unrecognised);
//     "8 x 100 #1-4 Overload #5-8 Threshold" and "12 x 100 #1-3 Dev / #4-6 OL / #7-9 AT / #10-12 CL" dose
//     per rep (were all one zone). The English word "at" never becomes Threshold.
//  B. Every library component parses to the zones it is tagged with.
//  C. "Draft from brief" builds a session from his components that matches the brief and fits the slot.
//  D. Suggestions list his components for the brief and "Add" inserts under the right heading.
//  E. Progression checks: race pace before any build; two fast sections back to back.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.sessionMethodology?.draftFromBrief,{timeout:20000});
    await page.waitForTimeout(500);
    // A
    const a=await page.evaluate(()=>{const M=window.MSOS4,D=M.dosageEngine;const f=t=>{const s=M.parser.parse('MAIN SET\n'+t,{date:'2026-10-13',id:'a'});const d=D.session(s,M.state,{delivered:false});return{total:M.session.total(s),sys:Object.fromEntries(Object.entries(d.systems).filter(([,v])=>v.metres).map(([k,v])=>[k,v.metres]))};};
      return{reg3:f('2 Rounds:\n300 Reg 10sR\n200 Dev 10sR\n100 OL 10sR'),ol2:f('5 Rounds:\n200 OL 10sR\n100 AT 10sR'),at:f('4 x 100 AT 10sR'),olat:f('8 x 100 10sR\n#1-4 Overload\n#5-8 Threshold'),ladder:f('12 x 100 10sR\n#1-3 Dev\n#4-6 OL\n#7-9 AT\n#10-12 CL'),word:f('4 x 50 kick at 200 pace @1:15'),breakdown:f('400 #1\n75 Drill\n25 Swim')};});
    assert.deepEqual(a.reg3,{total:1200,sys:{Regeneration:600,Development:400,Overload:200}});
    assert.deepEqual(a.ol2,{total:1500,sys:{Overload:1000,Threshold:500}});
    assert.deepEqual(a.at,{total:400,sys:{Threshold:400}});
    assert.deepEqual(a.olat.sys,{Overload:400,Threshold:400});
    assert.deepEqual(a.ladder.sys,{Development:300,Overload:300,Threshold:300,Clearance:300});
    assert.ok(!a.word.sys.Threshold,'the word "at" must never classify as Threshold');
    assert.equal(a.breakdown.total,400,'a real breakdown (400 = 4 x (75 drill + 25 swim)) still counts once (CLAUDE.md 2.24a)');
    // B
    const b=await page.evaluate(()=>{const M=window.MSOS4,D=M.dosageEngine,bad=[];for(const c of M.sessionMethodology.LIB){if(!c.fits)continue;const s=M.parser.parse('MAIN SET\n'+c.text,{date:'2026-10-13',id:c.id});const d=D.session(s,M.state,{delivered:false});const got=Object.entries(d.systems).filter(([,v])=>v.metres).map(([k])=>k);for(const z of c.fits)if(!got.includes(z))bad.push(`${c.id} missing ${z} (got ${got})`);}return bad;});
    assert.deepEqual(b,[],`library tags must match the parser: ${b.join('; ')}`);
    // C
    const c=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology;const id={date:'2026-10-13',dayPart:'PM',squads:['National'],start:'18:30',end:'20:00'};const d=SM.draftFromBrief(id);const s=M.parser.parse(d.text,{...id,id:'draft'});s.identity={...s.identity,...id};const plan=SM.evaluate(s).plan;const lib=SM.LIB.map(x=>x.text);const lines=d.text.split('\n\n').map(x=>x.split('\n').slice(1).join('\n'));return{d,matches:plan.matches,planned:plan.plannedSystem,minutes:d.minutes,limit:d.limit,allFromLib:d.text.split('\n\n').every(sec=>{const body=sec.split('\n').slice(1).join('\n');return lib.some(t=>body.includes(t.split('\n')[0]));})};});
    assert.equal(c.planned,'Race pace');assert.equal(c.matches,true,`a draft from the Tue PM brief must be on brief: ${c.d.text}`);
    assert.ok(c.minutes<=c.limit,`draft must fit the slot (${c.minutes}/${c.limit})`);
    assert.ok(c.allFromLib,'every section of the draft comes from his component library');
    assert.doesNotMatch(c.d.text,/100 Scull\n\nWARM DOWN|100 Scull\n\nPOST/,'a reset never ends the main set');
    // D
    await page.evaluate(()=>window.MSOS4.actions.openNewSession({date:'2026-10-13'}));await page.waitForSelector('#coreSlot');
    await page.evaluate(()=>{const sel=document.querySelector('#coreSlot');const o=[...sel.options].find(x=>/PM .*National/.test(x.textContent));sel.value=o.value;sel.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n8 x 200 free steady @3:00\nWARM DOWN\n200 easy');await page.waitForTimeout(800);
    assert.ok(await page.$('[data-msos-insert="rp-25"]'),'race-pace components are suggested for an Anaerobic Power brief');
    await page.tap('[data-msos-insert="rp-25"]');await page.waitForTimeout(500);
    assert.match(await page.inputValue('#coreRaw'),/MAIN SET\n8 x 200 free steady @3:00\n6 x 25 @1:00\n#1 Build\n#2-6 @100 Pace\nWARM DOWN/,'Add inserts at the end of the main set');
    page.once('dialog',d=>d.accept());await page.tap('[data-msos-start="draft"]');await page.waitForTimeout(600);
    assert.match(await page.inputValue('#coreRaw'),/^WARM UP[\s\S]*PRE SET[\s\S]*MAIN SET[\s\S]*@100 Pace[\s\S]*WARM DOWN/);
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
    // E
    const e=await page.evaluate(()=>{const M=window.MSOS4,SM=M.sessionMethodology;const mk=t=>{const s=M.parser.parse(t,{date:'2026-10-13',dayPart:'PM',squads:['National'],id:'e'});s.identity={...s.identity,date:'2026-10-13',dayPart:'PM',squads:['National'],start:'18:30',end:'20:00'};return SM.assess(s,M.state,SM.brief(s),SM.evaluate(s).plan).filter(x=>x.kind==='progression').map(x=>x.text);};
      return{cold:mk('WARM UP\n400 free\nMAIN SET\n6 x 50 @100 Pace @1:30\nWARM DOWN\n200 easy'),backToBack:mk('WARM UP\n400 free\nPRE SET\n4 x 50 Build @1:00\nMAIN SET\n6 x 25 @100 Pace @1:00\n8 x 25 MAX @2:00\nWARM DOWN\n200 easy'),good:mk('WARM UP\n400 free\nPRE SET\n4 x 50 Build @1:00\nMAIN SET\n6 x 25 @100 Pace @1:00\n6 x 100 Dev 10sR\n4 x 50 @100 Pace @2:30\nWARM DOWN\n200 easy')};});
    assert.ok(e.cold.some(x=>/before any build or pre-set/.test(x)),`cold race pace: ${e.cold}`);
    assert.ok(e.backToBack.some(x=>/back to back/.test(x)),`back to back: ${e.backToBack}`);
    assert.deepEqual(e.good,[],`a well-sequenced session raises no progression flags: ${e.good}`);
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('SESSION_GUIDE_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
