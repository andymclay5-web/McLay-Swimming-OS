'use strict';
// Andy, Tue 17 Nov 2026: "Coach Hub with all of the swimmers, each swimmer is having to scroll down, it's no good. If we
// want to modify a swimmer, it should be an open-up box rather than having every single swimmer in the whole programme
// coming up there ... Lots of buttons you can't even push." With his real-size roster (74 swimmers) proves:
//  1. Coach Hub > Swimmers opens on Find + Squad: no swimmer list until he types or picks; typing lists only matches.
//  2. Data & references > Manage swimmers: same; a match is one line, a tap opens that swimmer's box; saving works.
//  3. The poolside Capture / Chat / Edit / Finish bar is not over the hub (it stays on the Board).
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const NAMES=['Matthew Callow','Matthew Robertson','Matthew Kofoed','Charlotte Murphy','McKenzie Drage','Amber Proudfoot','Conor Fischer','Ruby Stace','Elsie Knowles','Luke Thompson','William Callow','Ashley Brown','Awatea Calman','Coral Sturla','Sophie Newlove','Thomas Cave','Archie Cave','Seth Knights','Otto Nairn','Alex Gibson'];
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.coachLoopUI?.openHubPanel,{timeout:30000});await p.waitForTimeout(500);
  await p.evaluate(NAMES=>{const M=window.MSOS4,sq=['National','Development','Intermediate','Fitness'];const extra=Array.from({length:54},(_,i)=>`Swim Mate${String.fromCharCode(65+(i%26))}${i}`.replace(/\d+$/,m=>'-'+m));
    M.state.athletes=[...NAMES,...extra].map((n,i)=>({id:`ath-${i}`,full_name:n,squad:sq[i%4],active:true}));
    const s=M.parser.parse('MAIN SET\n8 x 100 Free',{date:new Date().toISOString().slice(0,10),dayPart:'AM',squads:['National'],course:'SCM'});s.id='s1';M.store.putSession(M.state,s);M.state.settings.selectedSessionId='s1';M.store.save(M.state);
    M.nav.show('hub');M.coachLoopUI.openHubPanel('swimmers');},NAMES);
  // 1. Coach Hub > Swimmers
  await p.waitForSelector('[data-hp-q]',{timeout:15000});
  assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-hp-card]').length),0,'no list until he searches');
  assert.match(await p.evaluate(()=>document.querySelector('[data-hp-roster]').innerText),/Type a name or pick a squad — 74 swimmers/);
  await p.fill('[data-hp-q]','matthew');await p.waitForFunction(()=>document.querySelectorAll('[data-hp-card]').length===3,{timeout:5000});
  assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('[data-hp-card] > span:first-child > b')].map(x=>x.firstChild.textContent.trim()).sort()),['Matthew Callow','Matthew Kofoed','Matthew Robertson']);
  const sticky=await p.evaluate(()=>{const s=document.querySelector('.sticky-actions');return!s||s.hidden||getComputedStyle(s).display==='none';});
  assert.equal(sticky,true,'the poolside bar is not over Coach Hub');if(process.env.SHOT)await p.screenshot({path:process.env.SHOT});
  // 2. Data & references > Manage swimmers
  await p.evaluate(()=>window.MSOS4.nav.show('data'));await p.waitForSelector('[data-roster-q]',{timeout:10000});
  assert.equal(await p.evaluate(()=>document.querySelectorAll('[data-roster-id]').length),0,'Manage swimmers lists nobody until he searches');
  await p.fill('[data-roster-q]','charlotte');await p.waitForFunction(()=>document.querySelectorAll('[data-roster-id]').length===1,{timeout:5000});
  assert.equal(await p.evaluate(()=>document.querySelector('[data-roster-id]').open),true,'a single match opens straight into its box');
  // 17 Nov 2026 (Andy's phone: the box showed only "Name in results" + Save): every field is visible, none drawn over another
  const boxes=await p.evaluate(()=>[...document.querySelectorAll('[data-roster-id] .roster-edit-body > *')].map(e=>{const r=e.getBoundingClientRect();return{k:Object.keys(e.dataset)[0]||e.tagName,x:r.x,y:r.y,w:r.width,h:r.height}}));
  assert.equal(boxes.length,6,JSON.stringify(boxes));
  for(const a of boxes)for(const b2 of boxes)if(a!==b2)assert.ok(a.x+a.w<=b2.x+1||b2.x+b2.w<=a.x+1||a.y+a.h<=b2.y+1||b2.y+b2.h<=a.y+1,`${a.k} overlaps ${b2.k}: ${JSON.stringify(boxes)}`);
  await p.fill('[data-roster-id] [data-roster-aliases]','Charlotte T Murphy');await p.selectOption('[data-roster-id] [data-roster-sex]','F');/* 17 Nov: Zakhar had no sex, so race pace could not give times */await p.click('[data-roster-id] [data-roster-save]');await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(()=>window.MSOS4.state.athletes.find(a=>a.full_name==='Charlotte Murphy').source_profile?.results_aliases?.map(x=>x.name)),['Charlotte T Murphy']);
  assert.equal(await p.evaluate(()=>window.MSOS4.state.athletes.find(a=>a.full_name==='Charlotte Murphy').sex),'F','sex is set from the swimmer box');
  assert.equal(await p.evaluate(()=>(window.MSOS4.state.pending||[]).filter(x=>x.table==='athletes').at(-1)?.record?.sex),'F','and sent to the cloud');
  await p.selectOption('[data-roster-sq]','Fitness');await p.fill('[data-roster-q]','');await p.waitForTimeout(200);
  const fit=await p.evaluate(()=>[...document.querySelectorAll('[data-roster-id]')].map(d=>[d.open,d.querySelector('summary').textContent]));
  assert.ok(fit.length>5&&fit.every(([o,t])=>!o&&/· Fitness/.test(t)),'a squad lists one closed line per swimmer: '+JSON.stringify(fit.slice(0,3)));
  assert.equal(await p.evaluate(()=>{const s=document.querySelector('.sticky-actions');return!s||s.hidden;}),true,'nor over Data & references');
  await p.evaluate(()=>window.MSOS4.nav.show('board'));await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>!document.querySelector('.sticky-actions').hidden),true,'the poolside bar is still on the Board');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('HUB_FIND_SWIMMER_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
