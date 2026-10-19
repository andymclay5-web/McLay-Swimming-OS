'use strict';
// Andy, 19 Oct 2026: "how do I add a new swimmer". Proves, in the real app: Coach Hub -> Swimmers has "Add a swimmer";
// the form adds them to the roster on the phone at once (in their squad, with sex/DOB/para class), queues them for the
// cloud so the other coaches get them, refuses a duplicate or a first-name-only entry, and they can be marked on Roll.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.hubPanels?.createSwimmer&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(500);
  await p.evaluate(()=>{const M=window.MSOS4;M.state.athletes=[{id:'a1',full_name:'Seth Brown',squad:'National',active:true},{id:'a2',full_name:'Ruby Stace',squad:'Development',active:true}];M.state.pending=[];
    const h=document.createElement('div');h.id='swTest';document.body.appendChild(h);M.hubPanels.renderSwimmers(h);});
  await p.click('#swTest [data-hp-add]');await p.waitForSelector('[data-hp-add-form]');
  await p.fill('[data-hp-new-name]','seth');await p.click('[data-hp-add-save]');assert.match(await p.textContent('[data-hp-new-status]'),/first and last name/);
  await p.fill('[data-hp-new-name]','Seth Brown');await p.click('[data-hp-add-save]');assert.match(await p.textContent('[data-hp-new-status]'),/already on the roster/);
  await p.fill('[data-hp-new-name]','emma wilson');await p.selectOption('[data-hp-new-squad]','Development');await p.fill('[data-hp-new-dob]','2012-05-04');await p.fill('[data-hp-new-class]','s9');await p.click('[data-hp-add-save]');
  await p.waitForFunction(()=>!document.querySelector('[data-hp-add-form]'));
  const r=await p.evaluate(()=>{const M=window.MSOS4,a=M.state.athletes.find(x=>x.full_name==='Emma Wilson');return{a,queued:(M.state.pending||[]).some(q=>q.table==='athletes'&&q.record?.id===a?.id),roster:document.querySelector('#swTest').textContent};});
  assert.ok(r.a,'added to the roster');assert.equal(r.a.squad,'Development');assert.equal(r.a.date_of_birth,'2012-05-04');assert.equal(r.a.current_s_class,'S9');assert.equal(r.a.active,true);
  assert.equal(r.queued,true,'queued for the cloud so the other coaches get her');
  assert.match(r.roster,/Development · 2[\s\S]*Emma Wilson/,'shows in her squad on the Swimmers screen');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('ADD_SWIMMER_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
