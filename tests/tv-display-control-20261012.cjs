'use strict';
// Andy, 12 Oct 2026 (voice): "once you've got that TV link for the session, you should control it from the board
// ... take a video of a swimmer and show that in a little box window in the corner of the board, or take over the
// whole board ... go to YouTube and find a video". Proves in a real browser with two tabs (coach phone on the Board,
// TV on the TV Board; same-browser live channel -- the cross-device row carries the same payload):
//  A. The Board has a TV button; from it the coach puts a session capture on the TV in the corner.
//  B. The TV shows it on top of the Board, in the corner; switching to full screen fills the TV; a YouTube link
//     plays in place; "Take it off" clears it. The session and Roll are untouched.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext();
  const coach=await ctx.newPage({viewport:{width:390,height:844}});const tv=await ctx.newPage();
  await coach.setViewportSize({width:390,height:844});await tv.setViewportSize({width:1280,height:720});
  const errors=[];for(const p of [coach,tv])p.on('pageerror',e=>errors.push(e.message));
  const ready=p=>p.waitForFunction(()=>window.MSOS4?.tvDisplay?.showCapture&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
  try{
    await coach.goto(BASE);await ready(coach);await coach.waitForTimeout(600);
    await coach.evaluate(()=>{const M=window.MSOS4;const s=M.parser.parse('MAIN SET\n8 x 100 free @1:30',{date:'2026-10-12',dayPart:'PM',squads:['National']});s.id='tv-sess';s.identity={...s.identity,date:'2026-10-12',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
      M.state.athletes=[{id:'william',full_name:'William Callow',squad:'National',active:true}];
      M.state.captures=(M.state.captures||[]).concat([{id:'cap-note-1',session_id:s.id,capture_type:'note',text_content:'Hold the streamline past the flags',athlete_ids:['william'],created_at:new Date().toISOString()}]);
      M.store.save(M.state);M.nav.show('board');});
    await tv.goto(BASE);await ready(tv);await tv.waitForTimeout(600);
    await tv.evaluate(()=>{const M=window.MSOS4;M.state.settings.selectedSessionId='tv-sess';M.nav.show('tv');});
    await tv.waitForTimeout(400);
    // A
    await coach.waitForSelector('[data-tv-pill]:not([hidden])');
    const before=await coach.evaluate(()=>JSON.stringify(window.MSOS4.currentSession().blocks));
    await coach.click('[data-tv-pill]');await coach.waitForSelector('[data-tv-controls]');
    assert.match(await coach.textContent('[data-tv-controls]'),/From this session[\s\S]*Note · William Callow[\s\S]*Hold the streamline/);
    await coach.click('[data-tv-cap="cap-note-1"][data-tv-m="corner"]');
    // B
    await tv.waitForSelector('[data-tv-overlay].tvo-corner',{timeout:5000});
    assert.match(await tv.textContent('[data-tv-overlay]'),/William Callow[\s\S]*Hold the streamline past the flags/);
    assert.ok(await tv.$('#tvView .msos-tv-top'),'the Board is still on the TV underneath');
    await coach.click('[data-tv-mode="full"]');
    await tv.waitForSelector('[data-tv-overlay].tvo-full',{timeout:5000});
    await coach.fill('[data-tv-url]','https://youtu.be/dQw4w9WgXcQ');await coach.click('[data-tv-link="corner"]');
    await tv.waitForFunction(()=>/youtube\.com\/embed\/dQw4w9WgXcQ/.test(document.querySelector('[data-tv-overlay] iframe')?.src||''),{timeout:5000});
    await coach.click('[data-tv-clear]');
    await tv.waitForFunction(()=>!document.querySelector('[data-tv-overlay]'),{timeout:5000});
    assert.equal(await coach.evaluate(()=>JSON.stringify(window.MSOS4.currentSession().blocks)),before,'the session is untouched');
    assert.equal(await coach.evaluate(()=>window.MSOS4.state.settings.view),'board');
    // Show on TV from inside an opened capture.
    await coach.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
    await coach.evaluate(()=>{const b=document.createElement('button');b.setAttribute('data-msos-capture','cap-note-1');document.body.appendChild(b);b.click();});
    await coach.waitForSelector('[data-tv-from-viewer] [data-tvv="corner"]');await coach.click('[data-tvv="corner"]');
    await tv.waitForSelector('[data-tv-overlay].tvo-corner',{timeout:5000});
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('TV_DISPLAY_CONTROL_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
