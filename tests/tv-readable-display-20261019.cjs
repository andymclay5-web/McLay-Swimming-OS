'use strict';
// Andy, 19 Oct 2026 (first pool TV night): "The screen ... tiny, probably thirty-two inches ... adaptable for whatever
// the screen is" / one block per page, big writing, modified swimmers on the right / "a button where I could swap between
// black and white or white and black" / "add a bigger screen as the second screen ... not that clear on how that works" /
// the item on the TV must "stay up to 15 minutes" when he leaves the app.
// Real tv.html (and the real app for the phone side). Proves:
//  1. One block per screen, never smaller than the readable minimum (3.2% of the screen height); a block too long for
//     that is split into pages, every page fits the screen, and the pages turn by themselves.
//  2. Short blocks are drawn bigger than long ones (the type grows to fill the screen).
//  3. Landscape: modified swimmers sit in a column on the right of the squad's work; portrait: underneath.
//  4. The TV's look comes from its own settings: dark = white on black; a bigger text step makes the type bigger.
//  5. Phone: each TV has Black-on-white / White-on-black, A-/A+ and "Shows: same as ..." controls (msos_tv_set), and
//     adding a second TV makes it show the same as the first without taking the first over.
//  6. Phone: leaving the app no longer takes the item off the TV (the TV holds it up to 15 minutes).
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const names=['Ash','Will','Luke','Coral','Molly','Elsie','Awatea','Matt K','Lily','Sam'];
const tg=()=>names.map((n,i)=>({n,t:`1:1${i}.${i}`}));
const set=(w,mods)=>({k:'set',id:w,work:w,cue:'Aerobic power · hold stroke count',targets:tg(),mods});
const longMain={id:'main',code:'MAIN',title:'Main Set',distance:3600,active:true,rows:Array.from({length:12},(_,i)=>set(`${i+2} x 100 Free`,i%3===0?[{work:`${i+1} x 100 Free`,cue:'@1:50',people:[{n:'Charlotte',t:'1:41'}]}]:undefined))};
const shortWu={id:'wu',code:'WU',title:'Warm-up',distance:400,rows:[{k:'set',id:'w1',work:'400 Free',cue:''}]};
const frame=(mode,blocks)=>({tvv:'',mode,session:{title:'Mon PM · National',distance:4000},nav:[{code:'WU'},{code:'MAIN',active:true}],blocks});
async function tvPage(browser,{w,h,mode,blocks,display}){const p=await browser.newPage({viewport:{width:w,height:h}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.MSOS_TV_TURN_MS=600;});
  await p.route(/\/rest\/v1\/rpc\//,r=>{const n=r.request().url().split('/rpc/')[1];if(n==='msos_tv_pair_request')return r.fulfill({json:{status:'paired',label:'Pool TV'}});
    return r.fulfill({json:{status:'frame',rev:1,frame:frame(mode,blocks),slot:true,orev:0,overlay:null,display}});});
  await p.routeWebSocket(/realtime/,()=>{});
  await p.goto(BASE+'tv.html');await p.waitForFunction(()=>window.MSOS_TV?.page,{timeout:10000});p.errors=errors;return p;}
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    // ---- 1 & 2: a long main set on a 720p TV ----
    const tv=await tvPage(browser,{w:1280,h:720,mode:'set',blocks:[longMain],display:{theme:'light',size:0}});
    const pages=await tv.evaluate(()=>window.MSOS_TV.pages());const min=720*0.032;
    assert.ok(pages.length>=2,`a long set is split into pages (${pages.length})`);
    assert.ok(pages.every(p=>p.px>=min-0.5),`never below the readable minimum: ${pages.map(p=>p.px)}`);
    assert.equal(pages.reduce((n,p)=>n+p.units,0),12,'every line of the set is on a page, once');
    const seen=new Set();for(let i=0;i<pages.length+1;i++){const st=await tv.evaluate(()=>({no:window.MSOS_TV.page.no,fits:document.getElementById('tv').scrollHeight<=innerHeight+2,blocks:document.querySelectorAll('.tv-block').length,label:document.querySelector('.tv-page')?.textContent}));
      assert.ok(st.fits,`page ${st.no} fits the screen`);assert.equal(st.blocks,1);assert.equal(st.label,`${st.no}/${pages.length}`);seen.add(st.no);await tv.waitForTimeout(650);}
    assert.equal(seen.size,pages.length,'the pages turn by themselves');
    // ---- 3: modified swimmers on the right in landscape ----
    const geo=await tv.evaluate(()=>{const row=document.querySelector('.tv-row.has-mods');const m=row.querySelector('.tv-main').getBoundingClientRect(),x=row.querySelector('.tv-mods').getBoundingClientRect();return{mainRight:m.right,modLeft:x.left,top:Math.abs(m.top-x.top),heads:document.querySelector('.tv-colheads')?.textContent};});
    assert.ok(geo.modLeft>=geo.mainRight-1&&geo.top<20,`modified column sits to the right: ${JSON.stringify(geo)}`);assert.match(geo.heads,/SQUAD\s*MODIFIED/);
    await tv.close();
    const portrait=await tvPage(browser,{w:1080,h:1920,mode:'set',blocks:[longMain],display:{}});
    const pgeo=await portrait.evaluate(()=>{const row=document.querySelector('.tv-row.has-mods');return{mainBottom:row.querySelector('.tv-main').getBoundingClientRect().bottom,modTop:row.querySelector('.tv-mods').getBoundingClientRect().top};});
    assert.ok(pgeo.modTop>=pgeo.mainBottom-1,'portrait: modified swimmers underneath');await portrait.close();
    // ---- 2: WHOLE turns through the blocks; the short warm-up is drawn bigger than the long main set ----
    const whole=await tvPage(browser,{w:1920,h:1080,mode:'whole',blocks:[shortWu,{...longMain,active:false,rows:longMain.rows.slice(0,9).map(r=>({...r,targets:undefined}))}],display:{theme:'dark',size:0}});
    const wp=await whole.evaluate(()=>window.MSOS_TV.pages());assert.deepEqual(wp.map(p=>p.block),['wu','main']);assert.ok(wp[0].px>wp[1].px,`short block bigger: ${wp.map(p=>p.px)}`);
    // ---- 4: dark look, and a bigger text step ----
    const look=await whole.evaluate(()=>({dark:document.body.classList.contains('tv-dark'),bg:getComputedStyle(document.body).backgroundColor,fg:getComputedStyle(document.body).color}));
    assert.ok(look.dark&&look.bg==='rgb(0, 0, 0)'&&look.fg==='rgb(255, 255, 255)',`white on black: ${JSON.stringify(look)}`);
    const before=wp[1].px;await whole.evaluate(()=>{window.MSOS_TV.applyDisplay({theme:'light',size:2});window.MSOS_TV.fit();});
    const after=await whole.evaluate(()=>({px:window.MSOS_TV.pages()[1].px,light:document.body.classList.contains('tv-light'),bg:getComputedStyle(document.body).backgroundColor}));
    assert.ok(after.light&&after.bg==='rgb(255, 255, 255)','back to black on white');assert.ok(after.px>before,`A+ makes the type bigger (${before} -> ${after.px})`);
    const errs=[...whole.errors];await whole.close();assert.deepEqual(errs,[]);
    // ---- 5 & 6: the phone ----
    const phone=await browser.newPage({viewport:{width:390,height:844}});const perr=[];phone.on('pageerror',e=>perr.push(e.message));
    const calls=[];let screens=[{id:'tv-a',label:'Pool TV',last_seen_at:new Date().toISOString(),controller_device:null,follows:null,display:{}}];
    await phone.route(/\/rest\/v1\//,async r=>{const url=r.request().url(),name=(url.split('/rpc/')[1]||'').split('?')[0],b=JSON.parse(r.request().postData()||'{}');calls.push({name,b});
      if(name==='msos_tv_list')return r.fulfill({json:screens});
      if(name==='msos_tv_pair'){screens=screens.concat({id:'tv-b',label:b.p_label,last_seen_at:new Date().toISOString(),follows:null,display:{}});return r.fulfill({json:{id:'tv-b',label:b.p_label}});}
      if(name==='msos_tv_set'){const s=screens.find(x=>x.id===b.p_screen);if('follows' in b.p_patch)s.follows=b.p_patch.follows||null;s.display={...s.display,...('theme' in b.p_patch?{theme:b.p_patch.theme}:{}),...('size' in b.p_patch?{size:b.p_patch.size}:{})};return r.fulfill({json:{ok:true,id:s.id,follows:s.follows,display:s.display}});}
      if(name==='msos_tv_publish')return r.fulfill({json:{ok:true,rev:1}});
      if(name==='msos_tv_slot_state')return r.fulfill({json:{showing:true,mine:true,touched_at:new Date().toISOString(),hold_s:900,open_s:180,queue:[]}});
      if(name==='msos_tv_slot_put')return r.fulfill({json:{status:'showing'}});
      return r.fulfill({json:[]});});
    await phone.routeWebSocket(/realtime/,()=>{});
    await phone.goto(BASE);await phone.waitForFunction(()=>window.MSOS4?.tvLink?.fillPanel&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await phone.evaluate(ORG=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-andy',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy',email:'a@x.nz'}});M.state.settings.organisationId=ORG;
      M.cloud.fetch=async(path,opt)=>{const res=await fetch(M.store.config().supabaseUrl+path,{method:opt?.method||'GET',headers:{'Content-Type':'application/json'},body:opt?.body});return res.json();};
      M.tvLink.takeControl({id:'tv-a',label:'Pool TV'});},ORG);
    await phone.evaluate(()=>{const host=document.createElement('div');host.id='panelTest';document.body.appendChild(host);return window.MSOS4.tvLink.fillPanel(host,()=>window.MSOS4.tvLink.fillPanel(host));});
    await phone.waitForSelector('#panelTest [data-tv-theme="tv-a"]');
    assert.match(await phone.textContent('#panelTest [data-tv-theme="tv-a"]'),/Black on white/);
    await phone.click('#panelTest [data-tv-theme="tv-a"]');await phone.waitForFunction(()=>/White on black/.test(document.querySelector('#panelTest [data-tv-theme="tv-a"]')?.textContent||''));
    assert.deepEqual(calls.filter(c=>c.name==='msos_tv_set').at(-1).b,{p_screen:'tv-a',p_patch:{theme:'dark'}});
    await phone.click('#panelTest [data-tv-size="tv-a"][aria-label="Bigger text"]');await phone.waitForFunction(()=>/Text \+1/.test(document.querySelector('#panelTest .tv-size')?.textContent||''));
    assert.deepEqual(calls.filter(c=>c.name==='msos_tv_set').at(-1).b.p_patch,{size:1});
    // a second TV: it follows the first; this phone keeps driving the first
    const r=await phone.evaluate(()=>window.MSOS4.tvLink.pair('XYZ123',''));
    assert.equal(r.follows,'tv-a');assert.equal(await phone.evaluate(()=>window.MSOS4.tvLink.status().control.screenId),'tv-a','still driving the first TV');
    assert.equal(calls.find(c=>c.name==='msos_tv_pair').b.p_label,'TV 2');
    await phone.evaluate(()=>window.MSOS4.tvLink.fillPanel(document.getElementById('panelTest')));await phone.waitForSelector('#panelTest [data-tv-follow="tv-b"]');
    assert.match(await phone.textContent('#panelTest'),/TV 2[\s\S]*shows the same as Pool TV/);
    await phone.selectOption('#panelTest [data-tv-follow="tv-b"]','');await phone.waitForFunction(()=>true);await phone.waitForTimeout(300);
    assert.deepEqual(calls.filter(c=>c.name==='msos_tv_set').at(-1).b,{p_screen:'tv-b',p_patch:{follows:''}});
    // 6: leaving the app keeps the item up
    await phone.evaluate(async()=>{const M=window.MSOS4;M.tvLink.chooseScreen('tv-a');M.tvDisplay.showLink('https://youtu.be/dQw4w9WgXcQ','corner','Clip');for(let i=0;i<40&&M.tvLink.slot().state!=='showing';i++)await new Promise(r=>setTimeout(r,150));});
    assert.equal(await phone.evaluate(()=>window.MSOS4.tvLink.slot().state),'showing');
    const n=calls.length;await phone.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('pagehide'));});await phone.waitForTimeout(400);
    assert.ok(!calls.slice(n).some(c=>c.name==='msos_tv_slot_clear'),'leaving the app does not take it off the TV');
    assert.ok(await phone.evaluate(()=>!!window.MSOS4.tvDisplay.current()),'still on the TV');
    assert.match(await phone.evaluate(()=>window.MSOS4.tvDisplay.slotLine()),/stays up 1[45]:\d\d · other coaches can replace it in [23]:\d\d/);
    assert.deepEqual(perr,[],perr.join('\n'));
    console.log('TV_READABLE_DISPLAY_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
