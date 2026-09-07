'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';

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

    const sessionId=await page.evaluate(()=>{
      const M=MSOS4;
      const identity={date:'2026-09-07',dayPart:'PM',title:'Monday PM Training Capture Acceptance',squads:['National'],venue:'AquaGym',course:'SCM',start:'18:30',end:'20:00',calendarSlotId:'acceptance-20260907-pm',calendarSource:'acceptance'};
      const id=M.util.stableId('session',identity.date,identity.dayPart,identity.start,identity.end,identity.squads.join('+'),identity.venue);
      const source='WARM-UP\n4 x 100 Free @ 1:30\nMAIN SET\n8 x 50 #1 Stroke @ 1:00\nWARM-DOWN\n200 Easy';
      const session=M.parser.parse(source,{...identity,id});
      session.identity={...session.identity,...identity};
      M.store.putSession(M.state,session);
      M.state.settings.selectedSessionId=id;
      M.state.settings.view='board';
      M.state.settings.surfaceMode='training';
      M.store.save(M.state);
      M.navigationEngine.go('board',{push:false,restore:false});
      return id;
    });

    await page.waitForSelector('#boardView.active',{timeout:5000});
    await page.waitForFunction(id=>window.MSOS4?.currentSession?.()?.id===id,sessionId,{timeout:5000});

    // Reproduce the field failure directly: Meet left a global presentation class behind.
    await page.evaluate(()=>document.body.classList.add('meet-program-ba-active'));
    const hiddenBefore=await page.locator('.sticky-actions').evaluate(n=>getComputedStyle(n).display==='none');
    assert.equal(hiddenBefore,true,'fixture must reproduce stale Meet chrome hiding Training actions');

    // Navigation owns the surface transition and must clear every Meet-only global class.
    await page.evaluate(()=>MSOS4.navigationEngine.go('board',{push:false,restore:false}));
    await page.waitForFunction(()=>!document.body.classList.contains('meet-program-ba-active'));

    const chrome=await page.evaluate(()=>{
      const sticky=document.querySelector('.sticky-actions'),cap=document.querySelector('[data-sticky-note]'),edit=document.querySelector('[data-sticky-edit]'),finish=document.querySelector('[data-sticky-finish]');
      const visible=n=>{if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return !n.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
      return {view:document.body.dataset.msosView,surface:document.body.dataset.msosSurface,meetClass:document.body.classList.contains('meet-program-ba-active'),sticky:visible(sticky),capture:visible(cap),captureText:cap?.textContent?.trim(),edit:visible(edit),finish:visible(finish)};
    });
    assert.deepEqual(chrome,{view:'board',surface:'training',meetClass:false,sticky:true,capture:true,captureText:'Capture',edit:true,finish:true});

    const beforeCount=await page.evaluate(()=>MSOS4.state.captures.length);
    await page.click('[data-sticky-note]');
    await page.waitForSelector('#captureText',{timeout:3000});
    await page.fill('#captureText','Training capture acceptance · local first');
    await page.click('[data-save-note]');
    await page.waitForFunction(n=>MSOS4.state.captures.length===n+1,beforeCount,{timeout:3000});
    const saved=await page.evaluate(()=>MSOS4.state.captures.at(-1));
    assert.equal(saved.session_id,sessionId,'Capture must remain linked to the selected Training session');
    assert.equal(saved.capture_type,'note');
    assert.match(saved.text_content,/Training capture acceptance/);

    const rev=await page.evaluate(()=>{MSOS4.store.save(MSOS4.state);return Number(MSOS4.state.settings.storageRevision)||0});
    await page.evaluate(async r=>{if(MSOS4.storageEngine?.whenPersisted)await MSOS4.storageEngine.whenPersisted(r)},rev);
    await page.waitForTimeout(250);

    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.MSOS4?.storageEngine?.hydrated?.()===true,{timeout:10000});
    await page.waitForFunction(()=>document.body.dataset.guardian==='pass',{timeout:10000});
    await page.waitForFunction(id=>window.MSOS4?.state?.settings?.selectedSessionId===id,sessionId,{timeout:5000});
    await page.waitForFunction(()=>document.body.dataset.msosView==='board',{timeout:5000});

    const afterReload=await page.evaluate(id=>{
      const sticky=document.querySelector('.sticky-actions'),cap=document.querySelector('[data-sticky-note]');
      const visible=n=>{if(!n)return false;const r=n.getBoundingClientRect(),s=getComputedStyle(n);return !n.hidden&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
      return {selected:MSOS4.state.settings.selectedSessionId,current:MSOS4.currentSession()?.id||'',meetClass:document.body.classList.contains('meet-program-ba-active'),captureVisible:visible(cap),stickyVisible:visible(sticky),saved:MSOS4.state.captures.some(x=>x.session_id===id&&/Training capture acceptance/.test(x.text_content||''))};
    },sessionId);
    assert.deepEqual(afterReload,{selected:sessionId,current:sessionId,meetClass:false,captureVisible:true,stickyVisible:true,saved:true});
    assert.deepEqual(errors,[],`browser errors: ${errors.join('\n')}`);
    console.log(`TRAINING_CAPTURE_AFTER_MEET_PASS session=${sessionId} capture=visible local-save=restored`);
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
