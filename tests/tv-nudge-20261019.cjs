'use strict';
// Andy, 19 Oct 2026 (first pool TV night): "any button push took probably 30 seconds to actually show on the TV ...
// within a couple of seconds to 3-5 seconds at the most."
// Real tv.html + real app (a coach phone), joined through a stand-in for Supabase Realtime that relays broadcasts
// between sockets like the real one. Proves:
//  1. The TV joins its own channel, named by the key msos_tv_frame hands it (sha256 of 'msos-tv-nudge:'+screen id).
//  2. A coach phone's nudge reaches the TV and the TV fetches its new frame straight away (well under a second),
//     instead of waiting for its next check.
//  3. While the channel is up the TV checks only every 5 s (less pool wifi traffic); the nudge carries no Board data.
//  4. The channel drops -> the TV goes back to checking every 1.5 s and reconnects by itself.
//  5. The phone nudges after every Board publish and every shared-slot change (source check of the owner).
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
const KEY=crypto.createHash('sha256').update('msos-tv-nudge:screen-1').digest('hex').slice(0,32);
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
  try{const hub={sockets:new Map(),joins:[],broadcasts:[]};// topic -> set of sockets
    const attach=async page=>page.routeWebSocket(/realtime\/v1\/websocket/,ws=>{const mine=new Set();
      ws.onMessage(raw=>{const m=JSON.parse(String(raw));
        if(m.event==='phx_join'){hub.joins.push(m.topic);mine.add(m.topic);(hub.sockets.get(m.topic)||hub.sockets.set(m.topic,new Set()).get(m.topic)).add(ws);ws.send(JSON.stringify({topic:m.topic,event:'phx_reply',ref:m.ref,join_ref:m.join_ref,payload:{status:'ok',response:{postgres_changes:[]}}}));}
        else if(m.event==='heartbeat')ws.send(JSON.stringify({topic:'phoenix',event:'phx_reply',ref:m.ref,payload:{status:'ok',response:{}}}));
        else if(m.event==='broadcast'){hub.broadcasts.push(m);if(!mine.has(m.topic))return;for(const s of hub.sockets.get(m.topic)||[])if(s!==ws)s.send(JSON.stringify({topic:m.topic,event:'broadcast',ref:null,payload:m.payload}));}});
      ws.onClose(()=>{for(const t of mine)hub.sockets.get(t)?.delete(ws);});hub.last=ws;});
    // ---- the TV ----
    const tv=await browser.newPage({viewport:{width:1280,height:720}});tv.on('pageerror',e=>errors.push(e.message));
    const screen={rev:1,frame:{tvv:'',mode:'whole',session:{title:'Mon PM · National',distance:4000},blocks:[{code:'WU',title:'Warm-up',distance:800,rows:[{k:'set',work:'800 Free',cue:''}]}]}};
    const polls=[];
    await tv.route(/\/rest\/v1\/rpc\//,async r=>{const name=r.request().url().split('/rpc/')[1];const b=JSON.parse(r.request().postData()||'{}');
      if(name==='msos_tv_pair_request')return r.fulfill({json:{status:'paired',label:'Pool TV'}});
      if(name==='msos_tv_frame'){polls.push(Date.now());if((b.p_rev||0)>=screen.rev&&b.p_orev===0)return r.fulfill({json:{status:'same',rev:screen.rev,orev:0,label:'Pool TV',nudge:KEY}});
        return r.fulfill({json:{status:'frame',rev:screen.rev,frame:screen.frame,slot:true,orev:0,overlay:null,nudge:KEY}});}
      return r.fulfill({status:404,json:{message:'unknown'}});});
    await attach(tv);
    await tv.goto(BASE+'tv.html');
    await tv.waitForFunction(()=>window.MSOS_TV?.live?.up===true,{timeout:10000});
    // ---- 1 ----
    assert.ok(hub.joins.includes(`realtime:msos-tv-${KEY}`),'TV joined its own channel');
    await tv.waitForFunction(()=>/Warm-up/.test(document.getElementById('tv').textContent));
    // ---- 3: relaxed checking while live ----
    const n0=polls.length;await tv.waitForTimeout(3200);assert.ok(polls.length-n0<=1,`TV checks every 5 s while live (${polls.length-n0} checks in 3.2 s)`);
    // ---- 2: a phone nudges ----
    const phone=await browser.newPage({viewport:{width:390,height:844}});phone.on('pageerror',e=>errors.push(e.message));
    await phone.route(/\/rest\/v1\//,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));await attach(phone);
    await phone.goto(BASE);await phone.waitForFunction(()=>window.MSOS4?.liveSync&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await phone.evaluate(ORG=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-andy',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy',email:'a@x.nz'}});M.state.settings.organisationId=ORG;M.liveSync.restart();},ORG);
    await phone.waitForFunction(()=>window.MSOS4.liveSync.live(),{timeout:10000});
    screen.rev=2;screen.frame={...screen.frame,blocks:[{code:'MS',title:'Main Set',distance:2000,rows:[{k:'set',work:'10 x 200 Free',cue:''}]}]};
    const sentAt=Date.now(),before=polls.length;
    assert.equal(await phone.evaluate(()=>window.MSOS4.liveSync.nudgeTv('screen-1')),true);
    await tv.waitForFunction(()=>/Main Set/.test(document.getElementById('tv').textContent),{timeout:2000});
    const took=Date.now()-sentAt;assert.ok(took<1000,`TV showed the change ${took} ms after the nudge`);assert.ok(polls.length>before);
    assert.equal(await tv.evaluate(()=>window.MSOS_TV.live.nudges),1);
    const b=hub.broadcasts.at(-1);assert.equal(b.topic,`realtime:msos-tv-${KEY}`);assert.deepEqual(Object.keys(b.payload.payload),['at'],'nudge carries no Board data');
    // ---- 4: channel drops -> fast checking again, then reconnects ----
    for(const s of hub.sockets.get(`realtime:msos-tv-${KEY}`)||[])await s.close().catch(()=>{});
    await tv.waitForFunction(()=>window.MSOS_TV.live.up===false,{timeout:3000});
    const n1=polls.length;await tv.waitForTimeout(250);
    await tv.waitForFunction(()=>window.MSOS_TV.live.up===true,{timeout:8000});
    // ---- 5: the phone's TV owner nudges after publish and slot changes ----
    const src=fs.readFileSync(path.join(__dirname,'..','engines','tv-link.js'),'utf8');
    assert.match(src,/lastFrame=frame;nudge\(c\.screenId\)/,'nudge after a Board publish');
    assert.match(src,/msos_tv_slot_put'[^\n]*nudge\(id\)/,'nudge after putting something on top');
    assert.match(src,/msos_tv_slot_clear',\{p_screen:id\}\);nudge\(id\)/,'nudge after taking it down');
    assert.ok(n1>=0);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('TV_NUDGE_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
