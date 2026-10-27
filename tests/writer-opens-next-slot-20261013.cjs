'use strict';
// Andy, 13 Oct 2026, 7:10am, after coaching Development AM: "Trying to write tonight's but keeps popping back to AM".
// The writer opened on the AM slot by the clock (and on the morning's saved draft). Proves with the clock at 7:10am
// in Auckland: with the AM Development session written, + opens on tonight's Development slot; switching slot keeps
// what's been typed; a written-and-finished morning slot's draft is not restored over tonight.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({timezoneId:'Pacific/Auckland',viewport:{width:390,height:844}});
  const page=await ctx.newPage();await page.clock.install({time:new Date('2026-10-13T07:10:00+13:00')});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.calendar,{timeout:20000});await page.waitForTimeout(600);
    await page.evaluate(async()=>{const M=window.MSOS4;await M.calendar.load();const s=M.parser.parse('WARM UP\n4 x 300 (200 Free / 100 Reverse IM)\nMAIN SET\n8 x 100 Dev 10sR',{date:'2026-10-13',dayPart:'AM',squads:['Development']});s.id='dev-am';s.identity={...s.identity,date:'2026-10-13',dayPart:'AM',squads:['Development'],start:'05:30',end:'07:00'};M.store.putSession(M.state,s);M.state.settings.selectedSessionId='dev-am';
      localStorage.setItem('mclay_swimming_os_v4_poolside_draft_e',JSON.stringify({date:'2026-10-13',slotId:'nope',text:'stale',at:new Date().toISOString()}));M.store.save(M.state);});
    await page.evaluate(()=>window.MSOS4.actions.openNewSession());await page.waitForSelector('#coreSlot');await page.waitForTimeout(400);
    const label=await page.evaluate(()=>document.querySelector('#coreSlot').selectedOptions[0].textContent);
    assert.match(label,/^PM · 18:30-20:00 · Development/,`opens on tonight's Development slot, got ${label}`);
    await page.fill('#coreRaw','WARM UP\n400 free\nMAIN SET\n6 x 200 Dev 10sR');
    const am=await page.evaluate(()=>[...document.querySelectorAll('#coreSlot option')].find(o=>/^AM .*National/.test(o.textContent)).value);
    await page.selectOption('#coreSlot',am);await page.waitForTimeout(300);
    assert.match(await page.inputValue('#coreRaw'),/6 x 200 Dev 10sR/,'switching slot never throws away what was typed');
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
    // Andy (13 Oct, 7:26am): "the session that I choose on the session picker is the session that I write" -- + writes
    // the picked session, on any date (a whole week in advance): empty -> writer on that date and slot; written -> Edit.
    await page.evaluate(async()=>{const M=window.MSOS4;const slots=M.calendar.slots('2026-10-15');const sl=slots.find(x=>x.dayPart==='AM'&&(x.squads||[x.squad]).includes('National'));const id=M.calendar.identityFromSlot(sl);const s={id:'thu-am-empty',kind:'session',identity:{...id},blocks:[],metadata:{}};M.state.canonicalSessions[s.id]=s;M.selectSession('thu-am-empty');M.store.save(M.state);});
    await page.click('#newSessionBtn');await page.waitForSelector('#coreSlot');await page.waitForTimeout(400);
    assert.match(await page.textContent('#coreTruth'),/^2026-10-15 AM · National · 05:30-07:15 · Parakiore/,'+ writes the picked Thursday AM session at Parakiore');
    // 27 Oct 2026 (Andy, 7pm: "trying to write the session for tonight, and it keeps just showing as this morning"):
    // a written session that has already FINISHED (this morning's, at 7:10am after a 7:00 finish) is not the one
    // being written -- + opens the writer on the next unwritten slot. A written session still ahead opens Edit.
    await page.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';window.MSOS4.selectSession('dev-am');});
    await page.click('#newSessionBtn');await page.waitForSelector('#coreSlot');await page.waitForTimeout(400);
    assert.match(await page.textContent('#coreTruth'),/^2026-10-13 (?:AM · National|PM)/,'a finished written session: + opens the writer on the next unwritten slot that has not finished (AM National runs to 7:20), not Edit of the morning');
    await page.evaluate(()=>{const M=window.MSOS4;document.querySelector('#modalHost').innerHTML='';const t=M.state.canonicalSessions['thu-am-empty'];const s=M.parser.parse('MAIN SET\n8 x 100 Dev 10sR',{...t.identity});s.id='thu-am-written';s.identity={...t.identity};M.state.canonicalSessions[s.id]=s;M.selectSession('thu-am-written');M.store.save(M.state);});
    await page.click('#newSessionBtn');await page.waitForSelector('#sessionEditText');
    assert.match(await page.inputValue('#sessionEditText'),/8 x 100 Dev 10sR/,'a written picked session still ahead opens Edit');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('WRITER_OPENS_NEXT_SLOT_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
