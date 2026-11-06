'use strict';
// Andy, Sat 7 Nov 2026 06:45, photo of the pool TV: "Youtube video needs to fill the whole box. Now I've left the page it
// has reset on phone asking for new prompt but the videos playing over and over still but I can't control anything."
//  1. The YouTube frame is given the box size in pixels (the TV's browser ignored 100%, as it did for clips on 15 Oct).
//  2. When the phone has lost what it put up, the TV panel still shows "On the TV now" with "Take it off the TV".
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const USERS={'tok-andy':{id:'u-andy',owner:true},'tok-jordan':{id:'u-jordan'},'tok-kaleb':{id:'u-kaleb'}};
const sha=s=>crypto.createHash('sha256').update(String(s||'')).digest('hex');
let clockShift=0;const now=()=>Date.now()+clockShift;
const scr={id:'screen-1',hash:'',org:ORG,label:'Pool TV',rev:0,frame:null,overlay:null,by:null,byName:null,touched:0,orev:0,queue:[],dev:null};
const messages=[];
function tidy(){if(scr.overlay&&now()-scr.touched>180000){scr.overlay=null;scr.by=null;scr.byName=null;scr.orev++;}
  if(!scr.overlay&&scr.queue.length){const n=scr.queue.shift();scr.overlay=n.overlay;scr.by=n.user;scr.byName=n.name;scr.touched=now();scr.orev++;}}
function server(name,b,user){
  if(name==='msos_tv_pair_request'){if(!scr.hash)scr.hash=sha(b.p_secret);return{status:'paired',label:'Pool TV'};}
  if(name==='msos_tv_frame'){if(sha(b.p_secret)!==scr.hash)return{status:'unknown'};tidy();if((b.p_rev||0)>=scr.rev&&b.p_orev===scr.orev)return{status:'same',rev:scr.rev,orev:scr.orev};
    return{status:'frame',rev:scr.rev,frame:scr.frame,slot:true,orev:scr.orev,overlay:scr.overlay,overlay_by:scr.byName};}
  if(!user)throw Object.assign(new Error('Coach sign-in required'),{status:400});
  if(name==='msos_tv_list')return[{id:scr.id,label:scr.label,last_seen_at:new Date().toISOString(),controller_device:scr.dev}];
  if(name==='msos_tv_publish'){if(!b.p_take&&scr.dev&&scr.dev!==b.p_device)return{ok:false,controller:'x'};scr.dev=b.p_device;scr.frame=b.p_frame;scr.rev++;return{ok:true,rev:scr.rev};}
  if(name==='msos_tv_slot_state'){tidy();return{showing:!!scr.overlay,by:scr.by,by_name:scr.byName,mine:scr.by===user.id,overlay_id:scr.overlay?.id,touched_at:new Date(scr.touched-clockShift).toISOString(),rev:scr.orev,queue:scr.queue.map(q=>({user:q.user,name:q.name,id:q.overlay?.id})),owner:!!user.owner};}
  if(name==='msos_tv_slot_put'){tidy();scr.queue=scr.queue.filter(q=>q.user!==user.id);
    if(!scr.overlay||scr.by===user.id||user.owner){const rep=scr.overlay&&scr.by!==user.id?scr.byName:null;scr.overlay=b.p_overlay;scr.by=user.id;scr.byName=b.p_name;scr.touched=now();scr.orev++;return{status:'showing',replaced:rep};}
    scr.queue.push({user:user.id,name:b.p_name,overlay:b.p_overlay});return{status:'queued',position:scr.queue.length,showing_by:scr.byName};}
  if(name==='msos_tv_slot_clear'){scr.queue=scr.queue.filter(q=>q.user!==user.id);if(scr.overlay&&(scr.by===user.id||user.owner)){scr.overlay=null;scr.by=null;scr.byName=null;scr.orev++;}tidy();return{ok:true};}
  if(name==='mclay_chat_roster')return[{user_id:'u-andy',display_name:'Andy',role:'owner'},{user_id:'u-jordan',display_name:'Jordan',role:'assistant_coach'},{user_id:'u-kaleb',display_name:'Kaleb',role:'assistant_coach'}];
  throw new Error('unknown '+name);}
async function wire(page){await page.route(/\/rest\/v1\/(rpc\/(msos_tv_|mclay_chat_roster)|coach_messages)/,async route=>{const req=route.request(),url=req.url(),auth=(req.headers().authorization||'').replace(/^Bearer /,''),user=USERS[auth]||null;
  if(/coach_messages/.test(url)){if(req.method()==='POST'){const m={...JSON.parse(req.postData()||'{}'),id:`m${messages.length+1}`,created_at:new Date().toISOString()};messages.push(m);return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify([m])});}return route.fulfill({status:200,contentType:'application/json',body:'[]'});}
  const name=url.split('/rpc/')[1].split('?')[0],b=JSON.parse(req.postData()||'{}');
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(server(name,b,user))});}catch(e){await route.fulfill({status:e.status||400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});}
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
  try{
    const tvCtx=await browser.newContext({viewport:{width:1280,height:720}});const tv=await tvCtx.newPage();await wire(tv);tv.on('pageerror',e=>errors.push('tv: '+e.message));
    await tv.route(/youtube\.com/,r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body style="background:#000"></body></html>'}));
    await tv.addInitScript(()=>{window.MSOS_TV_POLL_MS=250;});await tv.goto(BASE+'tv.html');
    const ctx=await browser.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await wire(p);p.on('pageerror',e=>errors.push('andy: '+e.message));
    const setup=async()=>{await p.waitForFunction(()=>window.MSOS4?.tvLink?.slot&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
      await p.evaluate(({ORG})=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-andy',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy',email:'andy@x.nz'}});M.state.settings.organisationId=ORG;
        if(!M.state.canonicalSessions['yt-sess']){const s=M.parser.parse('MAIN SET\n8 x 100 Free Threshold 15s rest',{date:'2026-11-07',dayPart:'AM',squads:['National']});s.id='yt-sess';M.store.putSession(M.state,s);}M.state.settings.selectedSessionId='yt-sess';
        M.store.save(M.state);M.nav.show('board');localStorage.setItem('msos-tv-control',JSON.stringify({screenId:'screen-1',label:'Pool TV'}));},{ORG});
      await p.waitForFunction(()=>window.MSOS4.tvLink.slot().supported===true,{timeout:10000});};
    await p.goto(BASE);await setup();
    await p.evaluate(()=>window.MSOS4.tvLink.takeControl({id:'screen-1',label:'Pool TV'}));
    await tv.waitForSelector('.tv-board .tv-block',{timeout:10000});
    // 1. a YouTube video in the corner fills the corner box (sized in pixels, the TV's browser ignores 100%)
    await p.evaluate(()=>window.MSOS4.tvDisplay.showLink('https://www.youtube.com/watch?v=Fmuz03Dq26o','corner','How to do the Caeleb Dressel Freestyle Breakout'));
    await tv.waitForSelector('.tv-overlay.tvo-corner iframe',{timeout:10000});await tv.waitForTimeout(400);
    const fitR=await tv.evaluate(()=>{const o=document.querySelector('.tv-overlay').getBoundingClientRect(),f=document.querySelector('.tv-overlay iframe');return{ow:Math.floor(o.width),oh:Math.floor(o.height),w:+f.getAttribute('width'),h:+f.getAttribute('height'),sw:f.style.width,sh:f.style.height};});
    assert.equal(fitR.w,fitR.ow,JSON.stringify(fitR));assert.equal(fitR.h,fitR.oh,JSON.stringify(fitR));assert.equal(fitR.sw,`${fitR.ow}px`);
    // 2. the phone loses what it put up (page reset) -- the video stays on the TV, and the TV panel can still take it off
    await p.evaluate(()=>{const M=window.MSOS4;M.state.settings.tvOverlay=null;M.store.save(M.state);});
    await p.reload();await setup();
    assert.equal(await p.evaluate(()=>window.MSOS4.tvDisplay.current()),null);
    await p.waitForFunction(()=>window.MSOS4.tvLink.slot().onTv?.canTake===true,{timeout:25000});
    assert.ok(await tv.$('.tv-overlay iframe'),'still on the TV after the phone reset');
    await p.evaluate(()=>window.MSOS4.tvDisplay.openControls());
    await p.waitForSelector('[data-tv-takeoff]',{timeout:5000});
    assert.match(await p.evaluate(()=>document.querySelector('[data-tv-controls]').textContent),/On the TV now:\s*something you put up/);
    await p.click('[data-tv-takeoff]');
    await tv.waitForFunction(()=>!document.querySelector('.tv-overlay iframe'),{timeout:10000});
    assert.ok(await tv.$('.tv-board .tv-block'),'the Board is back');
    assert.equal(scr.overlay,null);
    assert.deepEqual(errors,[],errors.join('\n'));console.log('TV_YOUTUBE_FILL_TAKE_OFF_PASS');
  }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
