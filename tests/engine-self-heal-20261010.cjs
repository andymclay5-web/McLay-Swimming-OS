'use strict';
// Andy, 10 Oct 2026, phone screenshot: Plan next season showed "Season planner engine not loaded" (and his
// session calendar stayed empty for October) on the same build that loads both engines in a clean browser
// -- the season-planner / standard-timetable scripts did not run on that device's page load.
//
// Proves, in a real phone-sized browser: when both scripts fail to load on page load (simulated by aborting
// their first request), (1) opening Plan next season loads them again and shows the planner, (2) Coach Hub
// loads the timetable again and lists today's sessions, (3) the session calendar does the same, and
// (4) when a re-load also fails, the Plan screen says so with what the browser saw and a Reload button,
// never a dead-end line.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

async function boot(page,{failAlways=false}={}){
  const seen={sp:0,tt:0};
  await page.route(/engines\/(season-planner|standard-timetable)\.js/,route=>{const k=/season-planner/.test(route.request().url())?'sp':'tt';seen[k]++;if(failAlways||seen[k]===1)return route.abort();return route.continue();});
  await page.goto(BASE,{waitUntil:'load'});
  await page.waitForFunction(()=>window.MSOS4?.storageEngine?.ready===true&&window.MSOS4?.dataAdminUI?.ensureEngine,{timeout:15000});
  await page.waitForTimeout(500);
  return seen;
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    {
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await boot(page);
      assert.equal(await page.evaluate(()=>!!window.MSOS4.seasonPlanner||!!window.MSOS4.standardTimetable),false,'setup: both engines must be missing after the failed first load');
      await page.evaluate(()=>window.MSOS4.dataAdminUI.openPlanner());
      await page.waitForSelector('#pnName',{timeout:8000});
      assert.equal(await page.evaluate(()=>!!window.MSOS4.seasonPlanner&&!!window.MSOS4.standardTimetable),true,'Plan next season must load both engines again');
      await page.evaluate(()=>window.MSOS4.nav.show('board',{restoreScroll:false}));
      await page.tap('[data-nav="hub"]');await page.waitForSelector('[data-hub-days]');await page.waitForTimeout(800);
      const today=await page.evaluate(()=>new Date().toLocaleDateString('en-US',{timeZone:'Pacific/Auckland',weekday:'long'}));
      if(today!=='Sunday')assert.ok(await page.$('[data-hub-days] .hub-slot'),'Coach Hub must list timetable sessions once the engine is back');
      assert.deepEqual(errors,[],`page errors: ${errors.join(' | ')}`);
      await page.close();
    }
    {
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await boot(page);
      await page.tap('[data-nav="hub"]');await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(()=>!!window.MSOS4.standardTimetable),true,'opening Coach Hub alone must reload the timetable engine');
      await page.close();
    }
    {
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await boot(page);
      await page.evaluate(()=>window.MSOS4.ui.openSessionCalendar());await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(()=>!!window.MSOS4.standardTimetable),true,'opening the session calendar must reload the timetable engine');
      await page.close();
    }
    {
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await boot(page,{failAlways:true});
      await page.evaluate(()=>window.MSOS4.dataAdminUI.openPlanner());
      await page.waitForFunction(()=>/didn't load on this device/.test(document.querySelector('#dataView')?.innerText||''),{timeout:8000});
      const txt=await page.evaluate(()=>document.querySelector('#dataView').innerText);
      assert.match(txt,/season-planner\.js:.*could not download/,`the failure box must say what the browser saw: ${txt}`);
      assert.match(txt,/Reload app/);
      await page.close();
    }
    console.log('ENGINE_SELF_HEAL_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
