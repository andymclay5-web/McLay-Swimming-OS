'use strict';
// Andy, 3 Nov 2026: "Jordan's link has expired. We don't really want him to have to hit a link each time. He should
// be able to just download it and have it on his phone, and any update is triggered through that."
// Server side (supabase/functions/msos-coach-join): an accepted link now keeps signing that coach in while he is on
// the team. App side, proved here:
//  1. After joining in Safari, the coach is shown how to put MSOS on his home screen, and his link is copied.
//  2. The home-screen copy, opened signed out, asks for the link straight away; "Paste link" signs him in with one tap.
//  3. The sign-in screen no longer tells him a link only works once.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const TOKEN='0123456789abcdef0123456789abcdef';
const stub=()=>{const M=window.MSOS4;const J=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});const real=window.fetch;window.__calls=[];
  window.fetch=async(u,o={})=>{u=String(u);window.__calls.push(u);
    if(/msos-coach-join/.test(u))return J({email:'jordan1153@outlook.com',token_hash:'h',display_name:'Jordan',assigned_squads:['National'],rejoin:true,organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a'});
    if(/auth\/v1\/verify/.test(u))return J({access_token:'tok-j',refresh_token:'r',expires_in:3600,user:{id:'c17493ac',email:'jordan1153@outlook.com'}});
    if(/rpc\/mclay_my_membership/.test(u))return J([{organisation_id:'9d40beff-e632-414d-9daa-7ee78104ad2a',role:'assistant_coach',display_name:'Jordan',assigned_squads:['National'],active:true}]);
    return real(u,o);};
  M.cloud.turnOnSync=async()=>({ok:true});M.cloud.pullTeamRoster=async()=>{};M.cloud.pullTeamSessions=async()=>{};};
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const errors=[];
  // 1. Joining in Safari
  const c1=await b.newContext({viewport:{width:390,height:844},userAgent:IPHONE,permissions:['clipboard-read','clipboard-write']});const p=await c1.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.teamAccess?.joinScreen&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(400);
  await p.evaluate(stub);await p.evaluate(t=>{window.MSOS4.store.saveAuth({});window.MSOS4.teamAccess.joinScreen(t);},TOKEN);
  await p.click('[data-coach-join-go]');await p.waitForSelector('[data-coach-install]',{timeout:10000});
  const install=await p.textContent('[data-coach-install]');
  assert.match(install,/Add to Home Screen/);assert.match(install,/Paste link/);assert.match(install,/Updates arrive inside the app/);
  const clip=await p.evaluate(()=>navigator.clipboard.readText());assert.match(clip,new RegExp(`coach_invite=${TOKEN}`),'his join link is copied for the home-screen copy');

  // 2. The home-screen copy opens signed out
  const c2=await b.newContext({viewport:{width:390,height:844},userAgent:IPHONE,permissions:['clipboard-read','clipboard-write']});const q=await c2.newPage();q.on('pageerror',e=>errors.push(e.message));
  await q.addInitScript(()=>{try{Object.defineProperty(navigator,'standalone',{get:()=>true});}catch{}const mm=window.matchMedia.bind(window);window.matchMedia=s=>/display-mode:\s*standalone/.test(s)?{matches:true,media:s,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(s);});
  await q.goto(BASE);await q.waitForFunction(()=>window.MSOS4?.teamAccess&&window.MSOS4?.storageEngine?.ready,{timeout:25000});
  await q.evaluate(stub);
  await q.waitForSelector('[data-coach-signin]',{timeout:10000});
  const text=await q.textContent('[data-coach-signin]');
  assert.match(text,/keeps working for as long as you're on the team/);assert.doesNotMatch(text,/works once/);
  await q.evaluate(t=>navigator.clipboard.writeText(`Join here: http://x/index.html?coach_invite=${t}`),TOKEN);
  await q.click('[data-coach-signin-paste]');
  await q.waitForFunction(()=>/Done — signed in as jordan1153@outlook.com/.test(document.querySelector('[data-coach-signin-status]')?.textContent||''),{timeout:10000});
  const after=await q.evaluate(()=>({signedIn:window.MSOS4.teamAccess.isSignedIn(),install:!!document.querySelector('[data-coach-install]'),role:window.MSOS4.access.role()}));
  assert.equal(after.signedIn,true);assert.equal(after.role,'assistant');assert.equal(after.install,false,'already on the home screen: no install step');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('COACH_INSTALL_ONCE_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
