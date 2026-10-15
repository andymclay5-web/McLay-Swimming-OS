'use strict';
// Andy, 16 Oct 2026, 7:11am at the pool: "It's not letting me finish session -- it says add a time, note or capture
// each time I press Finish." That is the Meet's "Complete race" message: the Meet had taken over the shared bottom
// bar's Finish button and never handed it back. Root cause (engines/meet-ops-av.js chrome()): it remembered
// "training's" handlers from the first time it ran; when the app was still starting up on the Meet view, the bar had
// no handlers yet, so the second run remembered the Meet's own handlers as training's -- and every later return to
// the Board put "Complete race" back on Finish. Proves the start-up order that caused it now leaves the training
// Finish working, and that a normal Meet -> Board round trip still swaps correctly both ways.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.meetOpsEngine&&window.MSOS4?.ui?.bindSticky,{timeout:25000});await p.waitForTimeout(800);
  const r=await p.evaluate(()=>{const M=window.MSOS4,toasts=[];const t=M.toast;M.toast=m=>{toasts.push(String(m));return t?.(m)};
    const s=M.parser.parse('MAIN SET\n4 x 100 Free',{date:'2026-10-16',dayPart:'AM',squads:['National']});s.id='fin-sess';M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;M.store.save(M.state);
    let finished=0;const real=M.actions.finishBlock;M.actions.finishBlock=id=>{finished++;};
    const bar=k=>document.querySelector(`[data-sticky-${k}]`);
    // the start-up order from the field: the bar has no handlers yet while the app is on the Meet view
    for(const k of ['note','edit','finish'])bar(k).onclick=null;
    M.state.settings.view='meet';M.ui.configureRoleChrome();M.ui.configureRoleChrome();
    M.state.settings.view='board';M.ui.configureRoleChrome();
    bar('finish').click();
    const out={afterStartup:{text:bar('finish').textContent,finished,toasts:[...toasts]}};
    // the app's view setting says Meet while the Board is what's on screen: the bar must stay training's
    finished=0;toasts.length=0;M.state.settings.view='meet';M.ui.configureRoleChrome();bar('finish').click();
    out.staleMeetView={text:bar('finish').textContent,finished,toasts:[...toasts]};M.state.settings.view='board';M.ui.configureRoleChrome();
    // normal round trip
    M.nav.show('meet');out.onMeet=bar('finish').textContent;M.nav.show('board');finished=0;toasts.length=0;bar('finish').click();
    out.roundTrip={text:bar('finish').textContent,finished,toasts:[...toasts]};M.actions.finishBlock=real;return out;});
  assert.equal(r.afterStartup.text,'Finish');
  assert.equal(r.afterStartup.finished,1,'Finish on the Board finishes the session');
  assert.ok(!r.afterStartup.toasts.some(x=>/Add a time, note or capture/.test(x)),`no Meet race message: ${r.afterStartup.toasts}`);
  assert.equal(r.staleMeetView.finished,1,`Board on screen -> Finish finishes the session even if the view setting says Meet (${JSON.stringify(r.staleMeetView)})`);
  assert.ok(!r.staleMeetView.toasts.some(x=>/Add a time/.test(x)));
  assert.match(r.onMeet,/Complete race/,'on Meet the button is still the race button');
  assert.equal(r.roundTrip.finished,1,'and back on the Board it finishes the session again');
  assert.ok(!r.roundTrip.toasts.some(x=>/Add a time/.test(x)));
  assert.deepEqual(errors,[],errors.join('\n'));console.log('FINISH_NOT_MEET_RACE_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
