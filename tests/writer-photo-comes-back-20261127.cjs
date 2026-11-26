'use strict';
// 27 Nov 2026 (Andy, 6:49 am: "trying to take a photo of the session ... As soon as I click the tick for adding the
// photo, it just takes me back to the last saved session or last night's session"). Android can close MSOS while its
// camera is open. Proves:
//  - the writer has "Take photo" and "Choose from your photos";
//  - if MSOS reloads after the photo button was tapped, the writer opens again on the same session, on the photo tab,
//    saying what happened (it does not leave him on last night's Board);
//  - same if the page lived but the writer was gone when he came back;
//  - a photo that does arrive clears it, so nothing reopens later.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const errors=[];try{
  const ctx=await b.newContext({serviceWorkers:'block',viewport:{width:390,height:844},timezoneId:'Pacific/Auckland'});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await ctx.route(/\/functions\/v1\//,r=>r.fulfill({status:500,json:{error:'offline in test'}}));
  const ready=()=>p.waitForFunction(()=>window.MSOS4?.storageEngine?.ready&&window.MSOS4?.actions?.openNewSession&&window.MSOS4?.calendar,{timeout:30000});
  await p.goto(BASE);await ready();await p.waitForTimeout(1000);
  await p.evaluate(()=>window.MSOS4.actions.openNewSession());await p.waitForSelector('#modalHost #coreRaw');
  const slotId=await p.$eval('#coreSlot',s=>s.value);
  await p.click('[data-core-tab="photo"]');
  assert.ok(await p.isVisible('label:has(#coreFile)'),'Take photo');assert.ok(await p.isVisible('label:has(#coreFilePick)'),'Choose from your photos');
  assert.equal(await p.$eval('#coreFilePick',x=>x.hasAttribute('capture')),false,'the chooser does not force the camera');
  // tap Take photo (the chooser opens; the phone then closes MSOS)
  const fc=p.waitForEvent('filechooser');await p.click('label:has(#coreFile)');await fc;
  // 1) the phone reloaded MSOS
  await p.reload();await ready();
  await p.waitForSelector('#modalHost #coreRaw',{state:'attached',timeout:10000});
  const after=await p.evaluate(()=>({slot:document.querySelector('#coreSlot').value,photoTab:!document.querySelector('#corePhoto').hidden,status:document.querySelector('#coreStatus').textContent}));
  assert.equal(after.slot,slotId,'same session');assert.ok(after.photoTab,'photo tab open');assert.match(after.status,/closed MSOS while the camera was open/);
  // 2) the page lived, the writer was gone on return
  const fc2=p.waitForEvent('filechooser');await p.click('label:has(#coreFile)');await fc2;
  await p.evaluate(()=>{document.querySelector('#modalHost').innerHTML='';});
  await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
  await p.waitForSelector('#modalHost #coreRaw',{state:'attached',timeout:6000});
  // 3) a photo that arrives clears the note
  const fc3=p.waitForEvent('filechooser');await p.click('label:has(#coreFilePick)');const chooser=await fc3;
  await chooser.setFiles({name:'session.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')});
  await p.waitForFunction(()=>/Photo|photo/.test(document.querySelector('#coreStatus')?.textContent||'')&&!localStorage.getItem('msos-writer-photo-pending'),null,{timeout:8000});
  await p.reload();await ready();await p.waitForTimeout(3000);
  assert.equal(await p.$('#modalHost #coreRaw'),null,'nothing reopens once the photo came through');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('WRITER_PHOTO_COMES_BACK_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
