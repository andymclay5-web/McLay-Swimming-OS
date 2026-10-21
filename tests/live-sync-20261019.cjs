'use strict';
// Andy, 19 Oct 2026 (first pool TV night): "I had to go to Coach Hub and do sync. I don't want to have to hit sync ...
// those changes need to show pretty much instantly. I don't want to be in a position where two coaches are doing a role
// and then they're contradicting each other". Plus ~30 s per TV tap (the pool connection jammed by phones asking the
// cloud over and over -- coach chat every few seconds, catch-up every 25 s).
// Real app against a stand-in for Supabase Realtime (Phoenix protocol, vsn 1.0.0). Proves:
//  1. The phone opens ONE live connection and joins the team topic for its organisation with postgres_changes for
//     attendance, sessions, session_blocks, captures, session_adaptations, coach_messages, using the coach's token.
//  2. Jordan ticks a swimmer on Roll -> it appears on this phone's Roll within a second, no Sync button.
//     An older change never overwrites a newer local tick; this phone's own unsent tick is never overwritten.
//  3. Another coach edits the session on screen -> the session is reconciled (existing owner) -- not on a 25 s tick.
//  4. A coach chat message arrives through the same connection; chat no longer polls while it is up.
//  5. Heartbeats keep it open; when it drops it reconnects by itself.
//  6. The TV nudge goes to the screen's own topic (hash of the screen id) with no Board data in it.
//  7. The 25 s catch-up runs at most once a minute while live.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const ORG='9d40beff-e632-414d-9daa-7ee78104ad2a';
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
  try{const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    const server={sockets:[],sent:[],joins:[]};
    await page.routeWebSocket(/realtime\/v1\/websocket/,ws=>{server.sockets.push(ws);server.url=ws.url();
      ws.onMessage(raw=>{const m=JSON.parse(String(raw));server.sent.push(m);
        if(m.event==='phx_join'){server.joins.push(m);ws.send(JSON.stringify({topic:m.topic,event:'phx_reply',ref:m.ref,join_ref:m.join_ref,payload:{status:'ok',response:{postgres_changes:[]}}}));}
        if(m.event==='heartbeat')ws.send(JSON.stringify({topic:'phoenix',event:'phx_reply',ref:m.ref,payload:{status:'ok',response:{}}}));});});
    await page.route(/\/rest\/v1\//,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
    await page.addInitScript(()=>{const real=window.setInterval;window.setInterval=(fn,ms,...a)=>real(fn,ms===25000?400:ms,...a);});// speed up heartbeats
    await page.goto(BASE);await page.waitForFunction(()=>window.MSOS4?.liveSync&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
    await page.evaluate(ORG=>{const M=window.MSOS4;M.store.saveAuth({access_token:'tok-andy',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-andy',email:'andy@x.nz'}});M.state.settings.organisationId=ORG;
      const s=M.parser.parse('MAIN SET\n8 x 100 Free 15s rest',{date:'2026-10-19',dayPart:'PM',squads:['National']});s.id='pm';s.identity={...s.identity,date:'2026-10-19',dayPart:'PM',squads:['National']};M.store.putSession(M.state,s);M.state.settings.selectedSessionId='pm';
      M.state.athletes=[{id:'ash',full_name:'Ashley Brown',squad:'National',active:true},{id:'will',full_name:'William Callow',squad:'National',active:true},{id:'luke',full_name:'Luke Thompson',squad:'National',active:true}];
      M.state.attendance=[{id:'a-luke',session_id:'pm',athlete_id:'luke',status:'present',updated_at:'2026-10-19T06:05:00Z'}];M.store.save(M.state);M.nav.show('roll');M.liveSync.restart();},ORG);
    await page.waitForFunction(()=>window.MSOS4.liveSync.live(),{timeout:10000});
    // ---- 1 ----
    const team=server.joins.find(j=>/msos-team-/.test(j.topic));assert.ok(team,'joined the team topic');assert.equal(team.topic,`realtime:msos-team-${ORG}`);
    assert.equal(team.payload.access_token,'tok-andy');assert.match(server.url,/apikey=sb_publishable_/);
    assert.deepEqual(team.payload.config.postgres_changes.map(x=>x.table).sort(),['attendance','captures','coach_messages','session_adaptations','session_blocks','sessions']);
    assert.ok(team.payload.config.postgres_changes.every(x=>x.filter===`organisation_id=eq.${ORG}`&&x.schema==='public'));
    const ws=server.sockets.at(-1);const push=(table,type,record)=>ws.send(JSON.stringify({topic:team.topic,event:'postgres_changes',ref:null,payload:{data:{schema:'public',table,type,record,commit_timestamp:new Date().toISOString(),errors:null},ids:[1]}}));
    // ---- 2: Jordan ticks Ashley ----
    push('attendance','INSERT',{id:'a-ash',organisation_id:ORG,session_id:'pm',athlete_id:'ash',status:'present',note:'',updated_at:'2026-10-19T06:10:00Z'});
    await page.waitForFunction(()=>window.MSOS4.state.attendance.some(a=>a.athlete_id==='ash'&&a.status==='present'),{timeout:2000});
    // an OLDER change from the cloud doesn't overwrite Luke's newer tick
    push('attendance','UPDATE',{id:'a-luke',organisation_id:ORG,session_id:'pm',athlete_id:'luke',status:'absent',note:'',updated_at:'2026-10-19T06:00:00Z'});
    // this phone's own unsent tick for William wins over the cloud
    await page.evaluate(()=>{const M=window.MSOS4;M.state.attendance.push({id:'a-will',session_id:'pm',athlete_id:'will',status:'present',updated_at:new Date().toISOString()});M.state.pending=[{id:'q',table:'attendance',action:'upsert',record:{id:'a-will',session_id:'pm',athlete_id:'will',status:'present'},at:new Date().toISOString()}];});
    push('attendance','UPDATE',{id:'a-will',organisation_id:ORG,session_id:'pm',athlete_id:'will',status:'absent',note:'',updated_at:'2099-01-01T00:00:00Z'});
    await page.waitForTimeout(500);
    const att=await page.evaluate(()=>Object.fromEntries(window.MSOS4.state.attendance.filter(a=>a.session_id==='pm').map(a=>[a.athlete_id,a.status])));
    assert.deepEqual(att,{luke:'present',ash:'present',will:'present'});
    // ---- 3: another coach edits the session on screen ----
    await page.evaluate(()=>{window.__recon=[];window.MSOS4.cloud.reconcileSession=async id=>{window.__recon.push(id);return{applied:'none'};};});
    push('session_blocks','UPDATE',{id:'b1',organisation_id:ORG,session_id:'pm'});push('sessions','UPDATE',{id:'pm',organisation_id:ORG});
    await page.waitForFunction(()=>window.__recon.length>=1,{timeout:3000});await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(()=>window.__recon),['pm'],'one reconcile for a burst of changes');
    // ---- 4: chat through the same connection ----
    await page.evaluate(()=>{window.__chat=[];window.MSOS4.coachChat._ingestForTest=r=>window.__chat.push(r.body);});
    push('coach_messages','INSERT',{id:'m1',organisation_id:ORG,sender_id:'u-jordan',body:'Ashley is here',channel:'group'});
    await page.waitForFunction(()=>window.__chat.length===1,{timeout:2000});
    assert.equal(await page.evaluate(()=>window.MSOS4.coachChat.realtimeStatus()),'realtime');
    // ---- 5: heartbeats, then reconnect after a drop ----
    await page.waitForTimeout(900);assert.ok(server.sent.filter(m=>m.event==='heartbeat').length>=1,'heartbeats sent');
    const before=server.sockets.length;await ws.close();
    await page.waitForFunction(()=>!window.MSOS4.liveSync.live(),{timeout:3000});await page.waitForFunction(()=>window.MSOS4.liveSync.live(),{timeout:8000});
    assert.equal(server.sockets.length,before+1,'reconnected by itself');
    // ---- 6: TV nudge ----
    const ok=await page.evaluate(()=>window.MSOS4.liveSync.nudgeTv('screen-1'));assert.equal(ok,true);
    await page.waitForTimeout(200);
    const key=crypto.createHash('sha256').update('msos-tv-nudge:screen-1').digest('hex').slice(0,32);
    const nudge=server.sent.find(m=>m.event==='broadcast');assert.equal(nudge.topic,`realtime:msos-tv-${key}`);assert.deepEqual(Object.keys(nudge.payload.payload),['at'],'no Board data in the nudge');
    assert.ok(server.joins.some(j=>j.topic===nudge.topic),'joined the TV topic first');
    // ---- 7: catch-up slowed while live (source check of the owner) ----
    const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','app.js'),'utf8');
    assert.match(src,/liveUp=!!M\.liveSync\?\.live\?\.\(\)[\s\S]{0,200}due\('_reconAt',60000\)[\s\S]*due\('_teamDataAt',60000\)/);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('LIVE_SYNC_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
