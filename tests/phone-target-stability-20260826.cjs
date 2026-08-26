'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    const setup=await page.evaluate(()=>{
      const M=MSOS4;
      const source=`WARM-UP\n12 x 50 Choice\n8 x 50 Drill\n8 x 50 Kick\n\nPRE-SET\n8 x 50 Choice\n8 x 50 Drill\n\nMAIN SET\n4 x 100 Freestyle Development 10s Rest\n8 x 50 Choice\n8 x 50 Drill\n\nWARM-DOWN\n8 x 50 Easy`;
      const s=M.parser.parse(source,{id:'phone-target-stability',date:'2026-08-26',dayPart:'PM',squads:['National'],course:'SCM',title:'Phone target stability'});
      M.state.canonicalSessions[s.id]=s;M.state.settings.selectedSessionId=s.id;M.state.settings.view='board';M.state.settings.boardFocusMode=false;
      M.state.athletes=M.state.athletes||[];M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id);
      M.state.trainingTestTypes=M.state.trainingTestTypes||[];
      let tt=M.state.trainingTestTypes.find(x=>String(x.test_key||'').toLowerCase()==='t400_freestyle');if(!tt){tt={id:'phone-t400-free',test_key:'t400_freestyle'};M.state.trainingTestTypes.push(tt)}
      M.state.trainingTestResults=(M.state.trainingTestResults||[]).filter(x=>x.test_type_id!==tt.id||!String(x.athlete_id||'').startsWith('phone-ath-'));
      for(let i=1;i<=8;i++){
        const id=`phone-ath-${i}`;let a=M.state.athletes.find(x=>x.id===id);if(!a){a={id,full_name:`Phone Swimmer ${i}`,squad:'National',active:true};M.state.athletes.push(a)}a.active=true;a.squad='National';a.legacy_pace={t400:`${4+i}:40.0`,course:'SCM',t400_date:'2026-08-01'};
        M.state.attendance.push({session_id:s.id,athlete_id:id,status:'present'});
        M.state.trainingTestResults.push({athlete_id:id,test_type_id:tt.id,result_seconds:280+i*5,pool_course:'SCM',valid_for_anchor:true});
      }
      M.store.save(M.state);M.ui.renderCurrent();
      const item=s.blocks.flatMap(b=>b.items||[]).find(x=>x.kind==='set'&&Number(x.distance)===100&&/Development/i.test(x.raw||x.text||''));
      return{sessionId:s.id,itemId:item?.id||'',boardStateBuild:M.boardStateEngine?.build||''};
    });
    assert.ok(setup.itemId,'Target test item missing');
    assert.match(setup.boardStateBuild,/phone-stable-d$/,'Phone-stable Board state owner is not loaded');
    const selector=`#boardView [data-item="${setup.itemId}"]`,row=page.locator(selector);assert.equal(await row.count(),1,'Target row missing');
    await row.scrollIntoViewIfNeeded();await page.evaluate(()=>scrollBy(0,-180));
    const beforeOpen=await row.evaluate(el=>el.getBoundingClientRect().top);assert.ok(Math.abs(beforeOpen)>20,'Target row did not move into a useful deck position');
    await page.evaluate(()=>{window.__targetCounts=[];const host=document.querySelector('#boardView');window.__targetObserver=new MutationObserver(()=>{const box=host.querySelector('[data-msos-target-matrix]');if(!box)return;const n=box.querySelectorAll('.msos-target-card').length;if(n>0&&window.__targetCounts.at(-1)!==n)window.__targetCounts.push(n);});window.__targetObserver.observe(host,{subtree:true,childList:true});});
    await row.locator('[data-msos-times]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-msos-target-matrix] .msos-target-card').length===8,{timeout:5000});
    const counts=await page.evaluate(()=>{window.__targetObserver?.disconnect();return window.__targetCounts.slice();});
    assert.deepEqual(counts,[8],`Target panel painted partial groups: ${JSON.stringify(counts)}`);
    const beforeStroke=await row.evaluate(el=>el.getBoundingClientRect().top),beforeScroll=await page.evaluate(()=>scrollY);
    const stroke=page.locator('[data-msos-target-matrix] [data-msos-fast-stroke]').first();assert.equal(await stroke.count(),1,'Stroke control missing from target matrix');const sb=await stroke.boundingBox();assert.ok(sb&&sb.y>=0&&sb.y+sb.height<=844,`Stroke pill is not phone-visible: ${JSON.stringify(sb)}`);
    await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);if(!el?.closest?.('[data-msos-fast-stroke]'))throw new Error('Visible stroke control is not the hit target');el.closest('[data-msos-fast-stroke]').click();},{x:sb.x+sb.width/2,y:sb.y+sb.height/2});
    await page.waitForSelector('.msos-stroke-menu',{timeout:3000});assert.equal(await page.evaluate(()=>scrollY),beforeScroll,'Opening the visible stroke chooser scrolled the Board');
    const bk=page.locator('.msos-stroke-menu button',{hasText:'Bk'});assert.equal(await bk.count(),1,'Backstroke choice missing');const bb=await bk.boundingBox();assert.ok(bb&&bb.y>=0&&bb.y+bb.height<=844,`Backstroke choice is not phone-visible: ${JSON.stringify(bb)}`);
    await page.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);if(!el||el.tagName!=='BUTTON'||el.textContent.trim()!=='Bk')throw new Error('Visible Backstroke choice is not the hit target');el.click();},{x:bb.x+bb.width/2,y:bb.y+bb.height/2});
    await page.waitForFunction(id=>{const s=MSOS4.currentSession(),o=(MSOS4.state.adaptationOverrides||[]).find(x=>x.sessionId===s.id&&x.itemId===id&&x.active!==false);return o?.patch?.stroke==='Backstroke';},setup.itemId,{timeout:3000});
    await page.waitForFunction(()=>document.querySelectorAll('[data-msos-target-matrix] .msos-target-card').length===8,{timeout:3000});await page.waitForTimeout(120);
    const afterStroke=await page.locator(selector).evaluate(el=>el.getBoundingClientRect().top),afterScroll=await page.evaluate(()=>scrollY);
    assert.ok(Math.abs(afterStroke-beforeStroke)<=4,`Visible stroke change moved Board row ${beforeStroke.toFixed(1)} -> ${afterStroke.toFixed(1)}`);
    assert.equal(afterScroll,beforeScroll,`Visible stroke change changed scrollY ${beforeScroll} -> ${afterScroll}`);
    console.log('PHONE_TARGET_STABILITY_PASS');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});