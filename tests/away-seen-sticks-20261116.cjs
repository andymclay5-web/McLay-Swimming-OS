'use strict';
// Andy, Mon 16 Nov 2026: "that while you're away bit pops up, but it's saying the same thing every time. On Monday night,
// some stuff that Jordan added, but I've already gone okay... If I acknowledge it, it doesn't come up again unless I go
// looking for it... I want it to be new every time. I don't want to just keep seeing the old thing."
// Root cause: what he had seen was kept only in memory -- the UI save that survives closing the app did not include it,
// so every reopen popped the same cards. Proves:
//  1. Got it -> closed app -> reopened: nothing pops; the bell's history still has it.
//  2. Jordan adds one more note to the same session: only that new note pops, not the old ones again.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}});
  const boot=async()=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE);
    await p.waitForFunction(()=>window.MSOS4?.awayInbox&&window.MSOS4?.storageEngine?.ready,{timeout:30000});await p.waitForTimeout(600);
    await p.evaluate(()=>{const M=window.MSOS4;M.awayInbox.maybePop=()=>{};M.store.auth=()=>({access_token:'t',user:{id:'andy'}});});return p;};
  const seed=(p,notes)=>p.evaluate(notes=>{const M=window.MSOS4;const s=M.parser.parse('MAIN SET\n8 x 100 Dev 10sR',{id:'mon-pm'});s.id='mon-pm';s.identity={date:'2026-11-16',dayPart:'PM',squads:['Development']};M.state.canonicalSessions['mon-pm']=s;
    M.state.athletes=[{id:'ath-k',full_name:'Kaleb Smith',squad:'Development',active:true}];
    M.state.captures=notes.map((t,i)=>({id:`jn${i}`,session_id:'mon-pm',athlete_id:'ath-k',capture_type:'text',text_content:t,created_by:'jordan',created_at:new Date(Date.now()-(10-i)*6e4).toISOString()}));},notes);
  let p=await boot();await seed(p,['Kaleb breathing late','Good underwaters']);
  const first=await p.evaluate(()=>window.MSOS4.awayInbox.unseen().map(x=>[x.kind,x.notes?.length||0]));
  assert.deepEqual(first,[['notes',2]],JSON.stringify(first));
  // He taps Got it
  await p.evaluate(()=>{const M=window.MSOS4;M.awayInbox.open({items:M.awayInbox.unseen()});});await p.click('[data-away-ok]');
  assert.equal(await p.evaluate(()=>window.MSOS4.awayInbox.unseen().length),0);
  await p.waitForTimeout(1500);await p.close();
  // Closes the app and opens it again
  p=await boot();await seed(p,['Kaleb breathing late','Good underwaters']);
  assert.equal(await p.evaluate(()=>window.MSOS4.awayInbox.unseen().length),0,'what he already saw does not come back after reopening');
  assert.equal(await p.evaluate(()=>window.MSOS4.awayInbox.items().filter(x=>x.kind==='notes').length),1,'it is still there when he goes looking (the bell)');
  // Jordan adds one more note
  await seed(p,['Kaleb breathing late','Good underwaters','Kaleb kicking from the knees']);
  const fresh=await p.evaluate(()=>window.MSOS4.awayInbox.unseen().map(x=>x.notes.map(c=>c.text_content)));
  assert.deepEqual(fresh,[['Kaleb kicking from the knees']],'only the new note pops, not the old ones again');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('AWAY_SEEN_STICKS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
