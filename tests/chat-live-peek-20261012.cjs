'use strict';
// Andy, 12 Oct 2026 (voice): coach chat "needs to overlay everything ... the chat bubble that comes over the top,
// you get notified live, so when you're on the board it's right there". Proves in a real browser: a message from
// another coach arriving while the app is open pops up over the Board (sender + start of message) and opens that
// conversation when tapped; your own messages, old history and the conversation you're already reading never pop.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(BASE,{waitUntil:'load'});
    await page.waitForFunction(()=>window.MSOS4?.coachChatUI?.maybePeek&&window.MSOS4?.coachChat?._ingestForTest,{timeout:20000});
    await page.evaluate(()=>{const M=window.MSOS4;const a=M.store.auth;M.store.auth=()=>({...(a?.()||{}),user:{id:'andy'}});M.nav.show('board');});
    const K='window.MSOS4.coachChat';
    const now=()=>new Date().toISOString();
    // Old history: never pops.
    await page.evaluate(()=>window.MSOS4.coachChat._ingestForTest({id:'old1',sender_id:'jordan',sender_name:'Jordan',recipient_id:null,channel:'all',body:'from last week',created_at:'2026-10-01T00:00:00Z'}));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>!!document.querySelector('[data-chat-peek]:not([hidden])')),false,'old history does not pop up');
    // Own message: never pops.
    await page.evaluate(t=>window.MSOS4.coachChat._ingestForTest({id:'mine1',sender_id:'andy',sender_name:'Andy',recipient_id:null,channel:'all',body:'mine',created_at:t}),now());
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>!!document.querySelector('[data-chat-peek]:not([hidden])')),false);
    // New message from Jordan while on the Board: pops up over it.
    await page.evaluate(t=>window.MSOS4.coachChat._ingestForTest({id:'new1',sender_id:'jordan',sender_name:'Jordan',recipient_id:null,channel:'all',body:'Lane 3 needs another coach for the kick set',created_at:t}),now());
    await page.waitForSelector('[data-chat-peek]:not([hidden])');
    assert.match(await page.textContent('[data-chat-peek]'),/Jordan · Whole group[\s\S]*Lane 3 needs another coach/);
    assert.equal(await page.evaluate(()=>window.MSOS4.state.settings.view),'board','the pop-up never changes the screen');
    await page.tap('[data-chat-peek]');await page.waitForSelector('[data-chat-messages]');
    assert.match(await page.textContent('[data-chat-thread]'),/Whole group[\s\S]*Lane 3 needs another coach/,'tap opens that conversation');
    // Reading that conversation: no pop-up for the next message in it.
    await page.evaluate(t=>window.MSOS4.coachChat._ingestForTest({id:'new2',sender_id:'jordan',sender_name:'Jordan',recipient_id:null,channel:'all',body:'thanks',created_at:t}),now());
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.MSOS4.coachChatUI.lastPeek?.id),'new1','no pop-up for the conversation already open');
    assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
    console.log('CHAT_LIVE_PEEK_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
