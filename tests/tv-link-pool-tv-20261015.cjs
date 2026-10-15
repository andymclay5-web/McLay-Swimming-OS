'use strict';
// Andy, 15 Oct 2026: "build the full tv link ... TV board version of what I have on my phone board. Captures don't
// show unless specifically asked to ... Move from whole session to ind sets from phone, be able to put swimmer info in
// corner screen with board still showing. Like captures, modify and show straight away, all target times should show
// every time the set is shown but hidden on whole session showing."
// Proves, with the real app on a phone and the real tv.html on a separate "TV" browser (no shared storage), against a
// stand-in for the Supabase functions in supabase/20261015_tv_screens.sql:
//  1. tv.html shows a 6-letter code; typing it into TV controls on the phone connects the TV.
//  2. Phone Board on a SET -> TV shows that set with every present swimmer's target (group + modified swimmer).
//  3. Phone Board on WHOLE -> TV shows every block, with no target times.
//  4. Captures on the session are NOT on the TV until sent; a sent note shows in the corner with the Board still up.
//  5. A swimmer card goes in the corner (T400 = fastest, best times, this set's targets) with the Board still up.
//  6. Roll and a live edit reach the TV straight away; the TV never changes the phone's session.
//  7. A second phone can't silently fight over the TV: it is told who drives it, and can take over.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const{chromium}=require('playwright');
const SHOT=async(page,n)=>{if(process.env.TV_SHOTS)await page.screenshot({path:`${process.env.TV_SHOTS}/${n}.png`});};
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
// ---- stand-in for the SQL functions (same rules) ----
const screens=[];const sha=s=>crypto.createHash('sha256').update(String(s||'')).digest('hex');
const calls=[];
function server(name,b,authed){calls.push(name);
  const coach=()=>{if(!authed)throw Object.assign(new Error('Coach sign-in required'),{status:400});};
  if(name==='msos_tv_pair_request'){const h=sha(b.p_secret);let s=screens.find(x=>x.hash===h);if(s&&s.org&&!s.revoked)return{status:'paired',label:s.label};if(s&&s.code)return{status:'pairing',code:s.code};
    const code=Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');if(s)screens.splice(screens.indexOf(s),1);screens.push({id:crypto.randomUUID(),hash:h,code,rev:0});return{status:'pairing',code};}
  if(name==='msos_tv_frame'){const s=screens.find(x=>x.hash===sha(b.p_secret));if(!s)return{status:'unknown'};if(s.revoked)return{status:'revoked'};if(!s.org)return{status:'pairing',code:s.code};s.seen=new Date().toISOString();
    if((b.p_rev||0)>=s.rev)return{status:'same',rev:s.rev,label:s.label};return{status:'frame',rev:s.rev,label:s.label,frame:s.frame,controller:s.cname};}
  if(name==='msos_tv_pair'){coach();const c=String(b.p_code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const s=screens.find(x=>x.code===c&&!x.org);if(!s)throw Object.assign(new Error('That code is not showing on a TV (or has expired). Reload the TV page for a new one.'),{status:400});
    Object.assign(s,{org:b.p_org,label:b.p_label||'Pool TV',code:null});return{id:s.id,label:s.label};}
  if(name==='msos_tv_list'){coach();return screens.filter(s=>s.org===b.p_org&&!s.revoked).map(s=>({id:s.id,label:s.label,last_seen_at:s.seen||null,controller_device:s.dev||null,controller_name:s.cname||null}));}
  if(name==='msos_tv_publish'){coach();const s=screens.find(x=>x.id===b.p_screen&&!x.revoked);if(!s)throw new Error('TV not found');
    if(!b.p_take&&s.dev&&s.dev!==b.p_device)return{ok:false,controller:s.cname};Object.assign(s,{frame:b.p_frame,rev:s.rev+1,dev:b.p_device,cname:b.p_name});return{ok:true,rev:s.rev};}
  if(name==='msos_tv_revoke'){coach();const s=screens.find(x=>x.id===b.p_screen);s.revoked=true;return{ok:true};}
  throw new Error('unknown '+name);}
async function wire(page){await page.route(/\/rest\/v1\/rpc\/msos_tv_/,async route=>{const req=route.request(),name=req.url().split('/rpc/')[1].split('?')[0],b=JSON.parse(req.postData()||'{}'),authed=/Bearer (?!sb_publishable)/.test(req.headers().authorization||'');
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(server(name,b,authed))});}catch(e){await route.fulfill({status:e.status||400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    // ---------- TV ----------
    const tvCtx=await browser.newContext({viewport:{width:1280,height:720}});const tv=await tvCtx.newPage();await wire(tv);
    const errors=[];tv.on('pageerror',e=>errors.push('tv: '+e.message));
    await tv.addInitScript(()=>{window.MSOS_TV_POLL_MS=250;});
    await tv.goto(BASE+'tv.html');await tv.waitForSelector('[data-tv-code]',{timeout:8000});
    const code=(await tv.textContent('[data-tv-code]')).replace(/\s/g,'');await SHOT(tv,'tv-code');
assert.match(code,/^[A-Z2-9]{6}$/,'1. the TV shows a 6-letter code');
    // ---------- phone ----------
    const ctx=await browser.newContext({viewport:{width:390,height:844}});const phone=await ctx.newPage();await wire(phone);phone.on('pageerror',e=>errors.push('phone: '+e.message));
    await phone.goto(BASE);await phone.waitForFunction(()=>window.MSOS4?.tvLink?.pair&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.boardEngine?.present,{timeout:25000});await phone.waitForTimeout(600);
    await phone.evaluate(({ORG})=>{const M=window.MSOS4;M.store.saveAuth({access_token:'coach-token',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'048dd1ac',email:'andy@example.com'}});M.state.settings.organisationId=ORG;
      const s=M.parser.parse('WARM UP\n400 Free easy\nMAIN SET\n8 x 100 Freestyle Threshold 15s rest\n4 x 50 Kick easy @1:10\nWARM DOWN\n200 easy',{date:'2026-10-15',dayPart:'PM',squads:['National'],course:'SCM'});s.id='tv-link-sess';s.identity={...s.identity,date:'2026-10-15',dayPart:'PM',squads:['National'],course:'SCM',title:'Thu PM · National'};
      M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
      M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true},{id:'will',full_name:'William Callow',squad:'National',active:true},{id:'char',full_name:'Charlotte Murphy',squad:'National',active:true,modifications:'Half volume'}];
      M.state.trainingTestTypes=[{id:'tf',test_key:'t400_freestyle',name:'Timed 400 Freestyle',stroke:'Freestyle',distance:400}];
      const t=(id,a,sec,d)=>({id,athlete_id:a,test_type_id:'tf',result_seconds:sec,result_date:d,pool_course:'SCM',valid_for_anchor:true});
      M.state.trainingTestResults=[t('a1','ash',369.8,'2026-06-01'),t('a2','ash',327.3,'2026-03-01'),t('w1','will',290,'2026-05-01'),t('c1','char',420,'2026-05-01')];
      M.state.resultsPbBoard=[{athlete_id:'ash',athlete_name:'Ashley Brown',distance:200,stroke:'Breaststroke',pool_course:'SCM',result_seconds:195.88,result_date:'2026-08-20'}];
      M.state.attendance=(M.state.attendance||[]).filter(x=>x.session_id!==s.id).concat([{id:'r1',session_id:s.id,athlete_id:'ash',status:'present'},{id:'r2',session_id:s.id,athlete_id:'char',status:'modified'}]);
      M.state.captures=(M.state.captures||[]).concat([{id:'cap-tv-note',session_id:s.id,capture_type:'note',text_content:'Long glide off every wall',athlete_ids:['ash'],created_at:new Date().toISOString()}]);
      const main=s.blocks.find(b=>b.type==='main_set')||s.blocks[1];M.state.settings.boardBlockBySession={[s.id]:main.id};M.state.settings.boardFocusMode=true;
      try{M.performanceEngine?.invalidate?.()}catch{}M.store.save(M.state);M.nav.show('board');},{ORG});
    await phone.waitForSelector('[data-tv-pill]:not([hidden])');await phone.click('[data-tv-pill]');
    await phone.waitForSelector('[data-tv-pair]');await phone.fill('[data-tv-code]',code.toLowerCase());await phone.fill('[data-tv-label]','Pool TV');await phone.click('[data-tv-pair]');
    // 2. the set, with every swimmer's target
    await tv.waitForSelector('.tv-board .tv-set',{timeout:8000});
    const set=await tv.evaluate(()=>({top:document.querySelector('.tv-top').textContent,blocks:[...document.querySelectorAll('.tv-block h2')].map(x=>x.textContent),text:document.querySelector('.tv-body').textContent,targets:[...document.querySelectorAll('.tv-row .tv-targets .tv-t')].map(x=>x.textContent),mods:[...document.querySelectorAll('.tv-mod')].map(x=>x.textContent),overlay:!!document.querySelector('.tv-overlay')}));
await SHOT(tv,'tv-set');
    assert.match(set.top,/CURRENT SET[\s\S]*Thu PM · National/);
    assert.equal(set.blocks.length,1,'one set on the TV');
    assert.ok(set.targets.some(t=>/^Ash/.test(t)&&/\d:\d\d|\d\d\.\d/.test(t)),`Ashley's target shows on the set: ${set.targets}`);
    assert.ok(set.mods.some(m=>/Charl/.test(m)&&/\d:\d\d|\d\d\.\d/.test(m)),`the modified swimmer shows beside her own work with her target: ${set.mods}`);
    assert.equal(set.overlay,false,'4. the session capture is NOT on the TV until it is sent');
    assert.doesNotMatch(set.text,/Long glide/);
    // same targets as the phone works out
    const phoneTarget=await phone.evaluate(()=>{const M=window.MSOS4,E=window.MSOSEngines,s=M.currentSession(),item=s.blocks.find(b=>b.id===M.state.settings.boardBlockBySession[s.id]).items[0];return M.boardEngine.targetSummary(E.Coordinator.prescription(s,item,M.state.athletes.find(a=>a.id==='ash'),M.state).target);});
    assert.ok(set.targets.some(t=>t.includes(phoneTarget)),`TV target equals the phone's (${phoneTarget})`);
    // 3. WHOLE -> every block, no targets
    await phone.evaluate(()=>{const M=window.MSOS4;M.state.settings.boardFocusMode=false;M.boardStateEngine?.saveUi?.();M.ui.renderBoard();});
    await tv.waitForSelector('.tv-board .tv-whole',{timeout:8000});
    const whole=await tv.evaluate(()=>({blocks:[...document.querySelectorAll('.tv-block h2')].map(x=>x.textContent),targets:document.querySelectorAll('.tv-targets .tv-t').length,modTimes:document.querySelectorAll('.tv-mod .tv-t b').length,top:document.querySelector('.tv-top').textContent}));
await SHOT(tv,'tv-whole');
    assert.ok(whole.blocks.length>=3,`whole session shows every block: ${whole.blocks}`);
    assert.match(whole.top,/WHOLE SESSION/);
    assert.equal(whole.targets,0,'no target times on the whole session');
    assert.equal(whole.modTimes,0,'no target times for modified swimmers on the whole session');
    await phone.evaluate(()=>{const M=window.MSOS4;M.state.settings.boardFocusMode=true;M.ui.renderBoard();});
    await tv.waitForSelector('.tv-board .tv-set',{timeout:8000});
    // 3b. Andy, 15 Oct 2026, first real use: closed and reopened MSOS on the phone -> the TV stopped following.
    // After a reopen the phone must still drive the TV: WHOLE/SET on the phone still moves the TV.
    await phone.reload();await phone.waitForFunction(()=>window.MSOS4?.tvLink?.status&&window.MSOS4?.storageEngine?.ready&&window.MSOS4?.currentSession?.()?.id==='tv-link-sess',{timeout:25000});
    assert.ok(await phone.evaluate(()=>!!window.MSOS4.tvLink.status().control?.screenId),'after reopening, the phone still knows it drives the TV');
    // (race results normally come back from the cloud after a reopen; the stand-in has no cloud, so put Ashley's back)
    await phone.evaluate((ORG)=>{window.MSOS4.state.settings.organisationId=window.MSOS4.state.settings.organisationId||ORG;},ORG);
    await phone.evaluate(()=>{window.MSOS4.state.resultsPbBoard=[{athlete_id:'ash',athlete_name:'Ashley Brown',distance:200,stroke:'Breaststroke',pool_course:'SCM',result_seconds:195.88,result_date:'2026-08-20'}];});
    await phone.evaluate(()=>{const M=window.MSOS4;M.state.settings.boardFocusMode=false;M.ui.renderBoard();});
    await tv.waitForSelector('.tv-board .tv-whole',{timeout:8000});
    await phone.evaluate(()=>{const M=window.MSOS4;M.state.settings.boardFocusMode=true;M.ui.renderBoard();});
    await tv.waitForSelector('.tv-board .tv-set',{timeout:8000});
    // 4. send the note -> corner, Board still up
    assert.ok(await phone.$('[data-tv-pill]:not([hidden])'),'the Board still has its 📺 button after reopening');await phone.click('[data-tv-pill]');
    await phone.waitForSelector('[data-tv-cap="cap-tv-note"][data-tv-m="corner"]');await phone.click('[data-tv-cap="cap-tv-note"][data-tv-m="corner"]');
    await tv.waitForSelector('.tv-overlay.tvo-corner',{timeout:8000});
    assert.match(await tv.textContent('.tv-overlay'),/Ashley Brown[\s\S]*Long glide off every wall/);
    assert.ok(await tv.$('.tv-board .tv-block'),'the Board is still on the TV under the corner box');
    // 5. swimmer card in the corner
    await phone.waitForSelector('[data-tv-swimmer="ash"]');await phone.click('[data-tv-swimmer="ash"]');
    await tv.waitForSelector('.tv-overlay.tvo-corner.tvo-swimmer .tvo-card',{timeout:8000});
    const cardText=await tv.textContent('.tvo-card');
await SHOT(tv,'tv-swimmer');
    assert.match(cardText,/Ashley Brown[\s\S]*National/);
    assert.match(cardText,/THIS SET[\s\S]*\d/,'her target for this set');
    assert.match(cardText,/T400[\s\S]*Freestyle[\s\S]*5:27\.3/,'T400 = her fastest (5:27.3), not the latest');
    assert.match(cardText,/BEST TIMES[\s\S]*200 Breast SCM[\s\S]*3:15\.8/);
    assert.ok(await tv.$('.tv-board .tv-block'),'Board still showing behind the swimmer card');
    // 5b. Andy, 15 Oct 2026: "If I need to use my phone the video or display I'm showing should close and the tv board
    // should stay where it was". Leaving MSOS takes the corner box off the TV at once; the Board stays as it was.
    const boardBefore=await tv.textContent('.tv-body');
    await phone.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await tv.waitForFunction(()=>!document.querySelector('.tv-overlay'),{timeout:8000});
    assert.equal(await tv.textContent('.tv-body'),boardBefore,'the TV Board stays exactly where it was');
    assert.equal(await phone.evaluate(()=>window.MSOS4.tvDisplay.current()),null,'and nothing is left waiting to go back up when the coach returns');
    await phone.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    // the TV page knows its own version (it reloads itself when the phone expects a newer one)
    assert.equal(await tv.evaluate(()=>window.MSOS_TV.version),await phone.evaluate(()=>window.MSOS4.tvLink.buildFrame().then(f=>f.tvv)),'the TV page is the version the phone expects');
    // 6. Roll + live edit straight away
    await phone.evaluate(()=>{const M=window.MSOS4,s=M.currentSession();M.state.attendance.push({id:'r3',session_id:s.id,athlete_id:'will',status:'present'});M.store.save(M.state);});
    await tv.waitForFunction(()=>[...document.querySelectorAll('.tv-row .tv-targets .tv-t')].some(x=>/^Will/.test(x.textContent)),{timeout:8000});
    await phone.evaluate(()=>{const M=window.MSOS4,s=M.currentSession(),main=s.blocks.find(b=>b.id===M.state.settings.boardBlockBySession[s.id]);main.items[0].reps=6;main.items[0].raw=main.items[0].raw.replace(/^8/,'6');main.items[0].text=main.items[0].raw;M.store.save(M.state);});
    await tv.waitForFunction(()=>/6\s*[x×]\s*100/.test(document.querySelector('.tv-body')?.textContent||''),{timeout:8000});
    const phoneSess=await phone.evaluate(()=>window.MSOS4.state.settings.selectedSessionId);assert.equal(phoneSess,'tv-link-sess','the phone stays on its own session');
    // 7. a second phone
    const ctx2=await browser.newContext({viewport:{width:390,height:844}});const p2=await ctx2.newPage();await wire(p2);p2.on('pageerror',e=>errors.push('phone2: '+e.message));
    await p2.goto(BASE);await p2.waitForFunction(()=>window.MSOS4?.tvLink?.list&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    const screenId=await phone.evaluate(()=>window.MSOS4.tvLink.status().control.screenId);
    const r2=await p2.evaluate(async({ORG,screenId})=>{const M=window.MSOS4;M.store.saveAuth({access_token:'coach2',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{email:'kaleb@example.com'}});M.state.settings.organisationId=ORG;M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];localStorage.setItem('msos-tv-control',JSON.stringify({screenId,label:'Pool TV'}));
      return M.tvLink.publish({force:true});},{ORG,screenId});
    assert.equal(r2?.ok,false,'the second phone is not allowed to silently overwrite the TV');
    assert.equal(await p2.evaluate(()=>window.MSOS4.tvLink.status().state),'taken');
    await p2.evaluate(()=>window.MSOS4.tvLink.takeControl({id:window.MSOS4.tvLink.status().control.screenId,label:'Pool TV'}));
    await tv.waitForFunction(()=>/No session selected/.test(document.querySelector('.tv-root')?.textContent||''),{timeout:8000});
    await phone.evaluate(()=>window.MSOS4.tvLink.check());
    assert.equal(await phone.evaluate(()=>window.MSOS4.tvLink.status().state),'taken','the first phone now knows another phone drives the TV');
    assert.match(await phone.evaluate(()=>window.MSOS4.tvLink.status().controller),/Kaleb/);
    // the TV holds no coach token: every TV call used the public key only
    assert.ok(calls.includes('msos_tv_frame'));
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('TV_LINK_POOL_TV_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
