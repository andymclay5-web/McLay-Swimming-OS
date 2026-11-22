'use strict';
// 23 Nov 2026 (Andy: the YouTube search "needs to be a little bit more tied to swimming ... maybe stroke specific" and
// "elite swimmer push-off breakouts ... gave me a 1 hour long clip. That's no help to me poolside"). Proves the phone
// side: stroke and focus buttons shape the search, it always says swimming, it asks for clips of 5 minutes or less, and
// each result shows its length. (The server keeps only short clips -- supabase/functions/msos-video-search.)
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const p=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})).newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.tvDisplay?.videoQuery,{timeout:30000});await p.waitForTimeout(500);
  const q=await p.evaluate(()=>{const T=window.MSOS4.tvDisplay;return[T.videoQuery('elite push-off breakouts','Fly','Breakout'),T.videoQuery('Katie Ledecky'),T.videoQuery('','Breast','Turn'),T.videoQuery('swimming starts','','Start')]});
  assert.deepEqual(q,['swimming butterfly elite push-off breakouts','swimming Katie Ledecky','swimming breaststroke turn','swimming starts']);
  const asked=[];await p.evaluate(()=>{const M=window.MSOS4;M.cloud.fetch=async(path,opt)=>{window.__asked=(window.__asked||[]).concat([{path,body:JSON.parse(opt.body)}]);return{videos:[{url:'https://www.youtube.com/watch?v=aaaaaaaaaaa',id:'aaaaaaaaaaa',title:'Fly breakout drill',channel:'Swim Channel',seconds:74},{url:'https://www.youtube.com/watch?v=bbbbbbbbbbb',id:'bbbbbbbbbbb',title:'Underwater fly kick',channel:'Coach X',seconds:212}]}};
    M.state.settings.view='board';M.nav?.show?.('board');});
  await p.waitForSelector('[data-tv-pill]',{state:'attached',timeout:10000});await p.evaluate(()=>document.querySelector('[data-tv-pill]').click());
  await p.waitForSelector('[data-vq-stroke="Fly"]');await p.fill('[data-tv-q]','elite push-off');await p.click('[data-vq-stroke="Fly"]');await p.click('[data-vq-focus="Breakout"]');
  assert.equal(await p.inputValue('[data-tv-q]'),'elite push-off','typed words are kept when a button is tapped');
  await p.click('[data-tv-find]');await p.waitForSelector('[data-tv-yt="1"]',{timeout:5000});
  const sent=await p.evaluate(()=>window.__asked);assert.equal(sent.length,1);assert.equal(sent[0].body.query,'swimming butterfly breakout elite push-off');assert.equal(sent[0].body.maxSeconds,300);
  const txt=await p.evaluate(()=>document.querySelector('[data-tv-controls]').innerText);assert.match(txt,/Swim Channel · 1:14/);assert.match(txt,/Coach X · 3:32/);
  assert.equal(await p.getAttribute('[data-vq-stroke="Fly"]','aria-pressed'),'true');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_VIDEO_SEARCH_SWIMMING_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
