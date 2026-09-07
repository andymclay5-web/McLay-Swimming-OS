'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const WORKOUT=`WARM-UP
4 x 100 Free @ 1:30
4 x 50 Drill / Swim @ 1:00
MAIN SET
6 x 100 Free Threshold @ 1:30
8 x 50 #1 Stroke @ 1:00
WARM-DOWN
200 Easy`;

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.evaluate(()=>MSOS4.navigationEngine.go('board',{push:false,restore:false}));

    const beforeNew=await page.evaluate(()=>({role:MSOS4.access?.role?.(),canCreate:MSOS4.access?.can?.('session.create'),openType:typeof MSOS4.actions?.openNewSession,hasOnclick:typeof document.querySelector('#newSessionBtn')?.onclick,view:MSOS4.state.settings.view}));
    assert.equal(beforeNew.role,'owner','clean coach boot must resolve to Owner for session authoring');
    assert.equal(beforeNew.canCreate,true,'Owner must retain session.create');
    assert.equal(beforeNew.openType,'function','New Session action must exist');
    assert.equal(beforeNew.hasOnclick,'function','New Session button must be bound after boot');

    await page.click('#newSessionBtn');
    await page.waitForSelector('#coreSlot',{timeout:3000});
    await page.waitForFunction(()=>document.querySelectorAll('#coreSlot option').length>0,{timeout:5000});
    const slots=await page.locator('#coreSlot option').evaluateAll(opts=>opts.map(o=>({value:o.value,text:o.textContent.trim(),selected:o.selected})));
    assert.ok(slots.length>0,`Sep 7 must expose published Training slots: ${JSON.stringify(slots)}`);
    const selectedSlot=slots.find(x=>x.selected)||slots[0];
    assert.match(selectedSlot.text,/^PM\b/i,`at 15:xx NZ time the protected intake must prefer tonight's PM slot: ${JSON.stringify(slots)}`);
    const truth=await page.locator('#coreTruth').innerText();
    assert.match(truth,/2026-09-07\s+PM/i,`protected slot truth must be tonight: ${truth}`);
    assert.doesNotMatch(truth,/No published session/i);

    await page.fill('#coreRaw',WORKOUT);
    await page.waitForFunction(()=>{const b=document.querySelector('#coreCreate'),p=document.querySelector('#corePreview');return b&&!b.disabled&&p?.classList.contains('ok')},{timeout:5000});
    const preview=await page.locator('#corePreview').innerText();
    assert.match(preview,/m/,'canonical preview must show a distance before creation');
    await page.click('#coreCreate');
    await page.waitForFunction(()=>!document.querySelector('#coreSlot'),{timeout:3000});

    const created=await page.evaluate(()=>{
      const s=MSOS4.currentSession();
      const cap=document.querySelector('[data-sticky-note]'),sticky=document.querySelector('.sticky-actions');
      const visible=n=>{if(!n)return false;const r=n.getBoundingClientRect(),cs=getComputedStyle(n);return !n.hidden&&cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0};
      return {id:s?.id||'',date:s?.identity?.date||'',part:s?.identity?.dayPart||'',title:s?.identity?.title||'',view:document.body.dataset.msosView,surface:document.body.dataset.msosSurface,capture:visible(cap),sticky:visible(sticky),meetClass:document.body.classList.contains('meet-program-ba-active'),total:MSOS4.session.total(s)};
    });
    assert.ok(created.id,'created session must become selected current session');
    assert.equal(created.date,'2026-09-07');
    assert.equal(created.part,'PM','tonight session must stay bound to the PM calendar slot');
    assert.equal(created.view,'board');
    assert.equal(created.surface,'training');
    assert.ok(created.total>0,'loaded workout must have canonical distance');
    assert.equal(created.capture,true,'Capture must be present immediately after loading the session');
    assert.equal(created.sticky,true,'Training action bar must be present immediately after loading the session');
    assert.equal(created.meetClass,false,'Meet chrome must not contaminate newly loaded Training session');

    const sessionId=created.id;
    const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
    await page.evaluate(async r=>{if(MSOS4.storageEngine?.whenPersisted)await MSOS4.storageEngine.whenPersisted(r)},rev);
    await page.waitForTimeout(250);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.waitForFunction(id=>MSOS4.currentSession?.()?.id===id,sessionId,{timeout:5000});

    const restored=await page.evaluate(id=>({selected:MSOS4.state.settings.selectedSessionId,current:MSOS4.currentSession()?.id||'',date:MSOS4.currentSession()?.identity?.date||'',part:MSOS4.currentSession()?.identity?.dayPart||'',view:document.body.dataset.msosView,capture:(()=>{const n=document.querySelector('[data-sticky-note]');if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return !n.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})(),meetClass:document.body.classList.contains('meet-program-ba-active')}),sessionId);
    assert.deepEqual(restored,{selected:sessionId,current:sessionId,date:'2026-09-07',part:'PM',view:'board',capture:true,meetClass:false});
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_SESSION_LOAD_TONIGHT_PASS date=2026-09-07 selected=${selectedSlot.text} total=${created.total}m reload=restored capture=visible`);
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
