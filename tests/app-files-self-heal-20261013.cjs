'use strict';
// Andy, 13 Oct 2026, 10:38pm, phone screenshots: Coach Hub > Input data, Reports & analysis and Swimmers opened with
// nothing under the title, and "coach chat on my phone still doesn't work, it did on Jordan's" -- the chat button
// was not even in the bar. Same build worked on Jordan's phone and in a clean browser: on Andy's phone those app
// files did not run when the page opened (the same failure the 10 Oct season-planner self-heal handled for two
// files only). Now ANY app file that fails to download is fetched again at start-up, and a Hub screen whose file
// is missing says so and fetches it -- never a blank screen.
// Simulated by failing the first download of each file.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const FILES=/engines\/(input-data|hub-panels|coach-chat|coach-chat-ui)\.js/;
async function boot(browser,{always=false}={}){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const seen={};
  await page.route(FILES,route=>{const k=route.request().url().match(FILES)[1];seen[k]=(seen[k]||0)+1;if(always||seen[k]===1)return route.abort();return route.continue();});
  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.coachLoopUI,{timeout:20000});
  return{page,errors,seen};
}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    // 1. One failed download each: everything comes back on its own.
    {const{page,errors,seen}=await boot(browser);
      await page.waitForFunction(()=>window.MSOS4.inputData&&window.MSOS4.hubPanels&&window.MSOS4.coachChatUI,{timeout:15000});
      assert.ok(Object.values(seen).every(n=>n>=2),`each failed file was fetched again: ${JSON.stringify(seen)}`);
      assert.equal(await page.evaluate(()=>document.querySelector('[data-sticky-chat]')?.hidden),false,'the chat button is there');
      await page.evaluate(()=>{window.MSOS4.nav.show('hub');window.MSOS4.coachLoopUI.openHubPanel('input');});await page.waitForSelector('[data-id-card="t400"]',{timeout:5000});
      await page.evaluate(()=>window.MSOS4.coachLoopUI.openHubPanel('reports'));await page.waitForSelector('[data-hp-reports]',{timeout:5000});
      await page.click('[data-sticky-chat]');await page.waitForSelector('.cc-backdrop:not([hidden])',{timeout:5000});
      const heal=await page.evaluate(()=>window.MSOS4.state.settings.lastScriptHeal);
      assert.deepEqual(heal.failed,[],JSON.stringify(heal));assert.ok(heal.healed.length>=3,JSON.stringify(heal));
      assert.equal(await page.$('[data-script-heal]'),null,'no warning when everything recovered');
      assert.deepEqual(errors,[],errors.join(' | '));await page.close();}
    // 2. A file that never downloads: the coach is told, with a Reload button -- never a blank screen.
    {const{page}=await boot(browser,{always:true});
      await page.waitForSelector('[data-script-heal]',{timeout:20000});
      assert.match(await page.textContent('[data-script-heal]'),/didn't load on this phone[\s\S]*input-data\.js/);
      await page.evaluate(()=>{document.querySelector('[data-script-heal]')?.remove();window.MSOS4.nav.show('hub');window.MSOS4.coachLoopUI.openHubPanel('input');});
      await page.waitForFunction(()=>/didn't load on this phone|Loading this screen/.test(document.querySelector('[data-hub-panel-body]')?.textContent||''),{timeout:8000});
      await page.waitForSelector('[data-hub-panel-body] [data-hub-reload]',{timeout:8000});
      await page.close();}
    console.log('APP_FILES_SELF_HEAL_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
