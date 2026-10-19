'use strict';
// Andy, 19 Oct 2026: "other coaches need to be able to ... display that capture ... some sort of priority or rank ...
// someone else is on, so you have to wait for them to go off ... any coach has a capture of any swimmer, they get a
// chance to talk about it ... if I've taken a capture, I could just ask another coach to discuss what they see".
// Decided: the next coach waiting goes up automatically; 3 minutes untouched comes off.
// Real app on three phones (Andy = owner and drives the Board, Jordan and Kaleb = assistants) + the real tv.html, against
// a stand-in for supabase/20261019_tv_shared_slot.sql with the same rules. Proves:
//  1. Jordan puts a capture up -> on the TV with his name; Andy's Board stays underneath.
//  2. Kaleb sends one while Jordan's is up -> Kaleb waits (told so); Jordan's phone says Kaleb is waiting.
//  3. Jordan takes his down -> Kaleb's goes up automatically; Kaleb's phone says he's on.
//  4. Andy (owner) sends one -> it goes straight up; Kaleb's phone is told and clears.
//  5. Left 3 minutes untouched -> comes off the TV by itself.
//  6. Andy hands a capture to Jordan from the clip ("Ask a coach") -> coach chat message to Jordan carrying the clip.
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
    await tv.addInitScript(()=>{window.MSOS_TV_POLL_MS=250;});await tv.goto(BASE+'tv.html');
    const phone=async(tok,email,role,drive)=>{const ctx=await browser.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await wire(p);p.on('pageerror',e=>errors.push(email+': '+e.message));
      await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.tvLink?.slot&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
      await p.evaluate(({tok,email,role,drive,ORG})=>{const M=window.MSOS4;M.store.saveAuth({access_token:tok,refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-'+email.split('@')[0],email}});M.state.settings.organisationId=ORG;
        if(role!=='owner'){M.state.settings.activeRole='assistant';M.state.settings.assistantSquads=['National'];}
        const s=M.parser.parse('MAIN SET\n8 x 100 Free Threshold 15s rest',{date:'2026-10-19',dayPart:'PM',squads:['National']});s.id='slot-sess';s.identity={...s.identity,date:'2026-10-19',dayPart:'PM',squads:['National'],title:'Mon PM'};M.store.putSession(M.state,s);M.state.settings.selectedSessionId=s.id;
        M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true},{id:'will',full_name:'William Callow',squad:'National',active:true}];
        M.state.captures=[{id:'cap-andy',session_id:s.id,capture_type:'note',text_content:'Andy: hips dropping on the breath',athlete_ids:['ash'],created_at:new Date().toISOString()},{id:'cap-jordan',session_id:s.id,capture_type:'note',text_content:'Jordan: great streamline',athlete_ids:['will'],created_at:new Date().toISOString()},{id:'cap-kaleb',session_id:s.id,capture_type:'note',text_content:'Kaleb: late breath off the wall',athlete_ids:['ash'],created_at:new Date().toISOString()}];
        M.store.save(M.state);M.nav.show('board');if(drive)localStorage.setItem('msos-tv-control',JSON.stringify({screenId:'screen-1',label:'Pool TV'}));},{tok,email,role,drive,ORG});
      await p.waitForFunction(()=>window.MSOS4.tvLink.slot().supported===true,{timeout:10000});return p;};
    const andy=await phone('tok-andy','andy@x.nz','owner',true),jordan=await phone('tok-jordan','jordan@x.nz','assistant',false),kaleb=await phone('tok-kaleb','kaleb@x.nz','assistant',false);
    await andy.evaluate(()=>window.MSOS4.tvLink.takeControl({id:'screen-1',label:'Pool TV'}));
    await tv.waitForSelector('.tv-board .tv-block',{timeout:10000});
    const tvOverlay=()=>tv.evaluate(()=>document.querySelector('.tv-overlay')?.textContent||'');
    // 1. Jordan puts a capture up
    await jordan.evaluate(()=>window.MSOS4.tvDisplay.showCapture('cap-jordan','corner'));
    await tv.waitForFunction(()=>/great streamline[\s\S]*Assistant coach|Jordan/.test(document.querySelector('.tv-overlay')?.textContent||''),{timeout:10000});
    assert.match(await tvOverlay(),/Jordan: great streamline/);assert.ok(await tv.$('.tv-board .tv-block'),"Andy's Board stays underneath");
    // 2. Kaleb sends one while Jordan's is up -> waits
    await kaleb.evaluate(()=>window.MSOS4.tvDisplay.showCapture('cap-kaleb','corner'));
    await kaleb.waitForFunction(()=>window.MSOS4.tvLink.slot().state==='queued',{timeout:10000});
    assert.match(await kaleb.evaluate(()=>window.MSOS4.tvDisplay.slotLine()),/Waiting/);
    await jordan.waitForFunction(()=>/waiting/.test(window.MSOS4.tvDisplay.slotLine()),{timeout:10000});
    assert.match(await tvOverlay(),/great streamline/,'Jordan still on until he is done');
    // 3. Jordan takes his down -> Kaleb's goes up automatically
    await jordan.evaluate(()=>window.MSOS4.tvDisplay.clear());
    await tv.waitForFunction(()=>/late breath off the wall/.test(document.querySelector('.tv-overlay')?.textContent||''),{timeout:10000});
    await kaleb.waitForFunction(()=>window.MSOS4.tvLink.slot().state==='showing',{timeout:10000});
    // 4. Andy (owner) goes straight up
    await andy.evaluate(()=>window.MSOS4.tvDisplay.showCapture('cap-andy','full'));
    await tv.waitForFunction(()=>/hips dropping/.test(document.querySelector('.tv-overlay')?.textContent||''),{timeout:10000});
    assert.equal(await andy.evaluate(()=>window.MSOS4.tvLink.slot().state),'showing');
    await kaleb.waitForFunction(()=>window.MSOS4.tvLink.slot().state==='idle'&&!window.MSOS4.tvDisplay.current(),{timeout:10000});
    // 5. 3 minutes untouched -> off by itself
    clockShift=181000;
    await tv.waitForFunction(()=>!document.querySelector('.tv-overlay')||!document.querySelector('.tv-overlay').textContent,{timeout:10000});
    await andy.waitForFunction(()=>!window.MSOS4.tvDisplay.current(),{timeout:10000});
    clockShift=0;
    // 6. hand a capture to Jordan from the clip
    await andy.evaluate(async()=>{const M=window.MSOS4;await M.coachChat.refreshRoster();const wrap=document.createElement('span');document.body.appendChild(wrap);await M.tvDisplay.handoff('cap-andy',wrap);});
    await andy.click('[data-tv-handoff-to="u-jordan"]');await andy.waitForTimeout(500);
    const m=messages.at(-1);assert.ok(m,'a coach chat message was sent');assert.equal(m.recipient_id,'u-jordan');assert.equal(m.capture_id,'cap-andy');assert.match(m.body,/Ashley Brown[\s\S]*TV/);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('TV_SHARED_SLOT_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
