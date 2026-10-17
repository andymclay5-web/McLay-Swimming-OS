'use strict';
// Andy, 16 Oct 2026: "still having to reload app if I leave, I need to be able to leave for up to 10 mins and come
// back to where I was straight away without reloading."
// Proves, in the real app on a phone-sized screen:
//  1. When the phone throws MSOS out of memory while it's in the background (Chrome then reloads the page and sets
//     document.wasDiscarded), the coach is put back exactly where they were: same session, same set on the Board,
//     same scroll position, and the swimmer screen open again -- without re-sending anything to the pool TV.
//  2. A deliberate reload is NOT treated that way (no surprise restore).
//  3. Coming back after more than 30s away gives the coach 20 quiet seconds before background catch-up runs.
//  4. The Connection screen records each return.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ready=p=>p.waitForFunction(()=>window.MSOS4?.resume&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.tvDisplay?.openSwimmer&&document.querySelector('#boardView'),{timeout:25000});
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:700}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE);await ready(page);await page.waitForTimeout(600);
    const setup=await page.evaluate(()=>{const M=window.MSOS4;const lines=['WARM UP','400 Free'];for(let i=0;i<14;i++)lines.push(`4 x 100 Free Development 15s rest`);lines.push('MAIN SET','8 x 50 #1 @ 1:15','4 x 200 Free Threshold 20s rest','PRE SET','4 x 25 Fins @ 1:30','WARM DOWN','200 easy');
      const s=M.parser.parse(lines.join('\n'),{date:'2026-10-16',dayPart:'AM',squads:['National']});s.id='resume-sess';s.identity={...s.identity,date:'2026-10-16',dayPart:'AM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
      M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true}];M.state.attendance=[{id:'r1',session_id:s.id,athlete_id:'ash',status:'present'}];
      const pre=s.blocks.find(b=>/pre/i.test(b.title||b.type));M.state.settings.boardBlockBySession={[s.id]:pre.id};M.state.settings.boardFocusMode=false;M.store.save(M.state);M.nav.show('board');M.ui.renderCurrent();return{pre:pre.id};});
    await page.waitForTimeout(400);await page.evaluate(()=>window.scrollTo(0,600));await page.waitForTimeout(200);
    await page.evaluate(()=>window.MSOS4.tvDisplay.openSwimmer('ash','training',{noTv:true}));await page.waitForSelector('[data-tv-swimmer-screen]');
    const y0=await page.evaluate(()=>window.scrollY);assert.ok(y0>300,`scrolled down the Board (${y0})`);
    // leave the app
    await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    // ---- 1. the phone throws the page out; Chrome reloads it on return ----
    await page.addInitScript(()=>{Object.defineProperty(document,'wasDiscarded',{value:true,configurable:true});});
    await page.reload();await ready(page);
    await page.waitForFunction(()=>!!window.MSOS4.resume.restored,{timeout:8000});await page.waitForTimeout(500);
    const back=await page.evaluate(()=>{const M=window.MSOS4,s=M.currentSession();return{sid:s?.id,block:M.state.settings.boardBlockBySession?.[s.id],focus:M.state.settings.boardFocusMode,view:M.state.settings.view,y:window.scrollY,
      swimmer:!!document.querySelector('[data-tv-swimmer-screen]'),tab:document.querySelector('[data-sw-tab].on')?.dataset.swTab,overlay:M.tvDisplay.current(),log:M.resume.log().at(-1)};});
    assert.equal(back.sid,'resume-sess','same session');
    assert.equal(back.block,setup.pre,'same set chosen on the Board');
    assert.equal(back.focus,false,'still on WHOLE');
    assert.equal(back.view,'board');
    assert.ok(Math.abs(back.y-y0)<40,`same scroll position (${back.y} vs ${y0})`);
    assert.equal(back.swimmer,true,'the swimmer screen is open again');assert.equal(back.tab,'training','on the same tab');
    assert.equal(back.overlay,null,'nothing re-sent to the pool TV');
    assert.match(back.log.kind,/reloaded by the phone/);
    assert.equal(await page.evaluate(()=>window.MSOS4.resume.isQuiet()),true,'background catch-up waits after a restore');
    await page.close();
    // ---- 2. a deliberate reload is not a restore ----
    const p2=await ctx.newPage();p2.on('pageerror',e=>errors.push(e.message));await p2.goto(BASE);await ready(p2);
    await p2.evaluate(()=>{window.MSOS4.tvDisplay.openSwimmer('ash','pathway',{noTv:true});Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await p2.reload();await ready(p2);await p2.waitForTimeout(1200);
    assert.equal(await p2.evaluate(()=>!!window.MSOS4.resume.restored),false,'a deliberate reload starts fresh');
    assert.equal(await p2.evaluate(()=>!!document.querySelector('[data-tv-swimmer-screen]')),false);
    // ---- 3. kept alive: back after >30s -> 20 quiet seconds; the team-sync tick checks it ----
    const quiet=await p2.evaluate(async()=>{const real=Date.now;Date.now=()=>real()-60000;Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));Date.now=real;
      Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));return{quiet:window.MSOS4.resume.isQuiet(),log:window.MSOS4.resume.log().at(-1)};});
    assert.equal(quiet.quiet,true,'20 quiet seconds after coming back');assert.equal(quiet.log.kind,'kept alive');assert.ok(quiet.log.awayMs>=59000);
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
    assert.match(src,/_teamSyncTimer=setInterval\(\(\)=>\{[\s\S]{0,300}M\.resume\?\.isQuiet\?\.\(\)\)return;/,'the background catch-up tick waits during the quiet window');
    // ---- 4. Connection screen shows the returns ----
    await p2.evaluate(()=>window.MSOS4.nav.show('connection'));await p2.waitForTimeout(400);
    assert.match(await p2.evaluate(()=>document.body.textContent),/Coming back to the app[\s\S]*min away · kept alive/);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('RESUME_WHERE_I_WAS_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
