'use strict';
// Andy, 3 Nov 2026, after looking at Matthew's session on his phone: "The bones of the session are basically
// right, but it doesn't show any of the detail, how we're doing it, what we're trying to achieve. He's just
// got distances that show up. So he needs to be able to see the purpose, the how it's done, all of that stuff."
// The portal payload (engines/swimmer-invite-bn.js safeSession) carried only each set's label, metres and target.
// It now also carries the session purpose (plan brief), each block's own lines, each set's cues / #1 pattern /
// zone / rest and the whole session text -- with any line naming another swimmer left out -- and the real
// swimmer-portal.js page renders them.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{
  const ctx=await b.newContext();const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.swimmerInvite?.safeSession||window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(400);
  const payload=await p.evaluate(()=>{const M=window.MSOS4;
    const t='WARM UP\n400 Free easy, long strokes\n\nMAIN SET\nPurpose: hold your stroke when it hurts\n4 x 100 Free Threshold @1:30\nHold stroke count, strong walls\n#1 Build\nCharlotte: 2 x 100 instead\n\nWARM DOWN\n200 Easy';
    const s=M.parser.parse(t,{id:'detail',date:'2026-11-03',dayPart:'PM',squads:['National'],course:'SCM'});s.id='detail';s.currentSource={text:t};
    M.state.athletes=[{id:'a-matt',full_name:'Matthew Robertson',squad:'National',active:true},{id:'a-ch',full_name:'Charlotte Murphy',squad:'National',active:true}];
    M.state.canonicalSessions=[s];
    const X=Object.values(M).find(v=>v&&typeof v==='object'&&typeof v.safeSession==='function');
    return X.safeSession(M.state.athletes[0],s);});
  assert.ok(payload,'payload built');
  const main=payload.blocks.find(x=>/main/i.test(x.label)),set=main.items[0];
  assert.deepEqual(main.notes,['Purpose: hold your stroke when it hurts'],'block purpose line travels with the block');
  assert.equal(set.how.zone,'Threshold');assert.ok(set.how.cues.includes('Hold stroke count, strong walls'),JSON.stringify(set.how));
  assert.ok(set.how.pattern.some(x=>/#1 Build/.test(x)),JSON.stringify(set.how));
  assert.match(payload.sourceText,/Purpose: hold your stroke/);assert.doesNotMatch(payload.sourceText,/Charlotte/,'another swimmer\'s line never reaches his phone');
  assert.doesNotMatch(JSON.stringify(payload),/Charlotte/);
  assert.ok(payload.purpose===null||typeof payload.purpose==='object');
  payload.purpose=payload.purpose||{system:'Aerobic Power',sessionFocus:'Threshold holding stroke',technical:'Breakouts',weekFocus:'',phase:''};

  const q=await ctx.newPage();q.on('pageerror',e=>errors.push(e.message));
  await q.route('**/rest/v1/rpc/msos_swimmer_portal_snapshot',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({athlete_id:'a-matt',payload:{athlete:{id:'a-matt',full_name:'Matthew Robertson'},session:payload,sessions:[payload]}})}));
  await q.route('**/rest/v1/rpc/msos_swimmer_session_actions_snapshot',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await q.addInitScript(()=>{try{localStorage.setItem('msos_swimmer_device_token_v1','test-device');}catch{}});
  await q.goto(new URL('swimmer-portal.html',BASE).href);
  await q.waitForSelector('.sp-session-item',{timeout:15000});
  const view=await q.evaluate(()=>({purpose:document.querySelector('.sp-purpose')?.innerText||'',notes:document.querySelector('.sp-block-notes')?.innerText||'',how:[...document.querySelectorAll('.sp-how')].map(x=>x.innerText).join('|'),whole:document.querySelector('.sp-whole pre')?.textContent||'',body:document.body.innerText}));
  assert.match(view.purpose,/What we're working on/i);assert.match(view.purpose,/Threshold|Aerobic|Anaerobic/);
  assert.match(view.notes,/hold your stroke when it hurts/);
  assert.match(view.how,/Hold stroke count, strong walls/);assert.match(view.how,/#1 Build/);assert.match(view.how,/Threshold/);
  assert.match(view.whole,/4 x 100 Free Threshold @1:30/);assert.doesNotMatch(view.body,/Charlotte/);
  assert.deepEqual(errors,[],errors.join('\n'));console.log('SWIMMER_PORTAL_SESSION_DETAIL_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
