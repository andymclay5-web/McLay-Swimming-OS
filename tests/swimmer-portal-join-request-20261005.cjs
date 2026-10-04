'use strict';
// 5 Oct 2026 -- "sort the swimmer access reverse" (Andy, verbatim): "short term we should still use QR or
// link to set up while trialing but at a point we want that to shift to swimmers purchase etc." This is the
// SWIMMER-side half of that build -- see tests/swimmer-link-requests-coach-ui-20261005.cjs for the coach
// review screen this feeds. supabase/20261005_swimmer_initiated_link_requests.sql adds the join-code/
// request RPCs (mclay_join_code_roster, mclay_request_swimmer_link); swimmer-portal.js adds a `?join=<code>`
// entry point (a coach-shared link/QR, matching Andy's own stated short-term scope -- NOT an open, self-
// serve "pick any coach" flow, which is the later, separately-deferred app-store redesign) that signs the
// swimmer in with the SAME passwordless email flow the 4 Oct coach-initiated invite already uses, then lets
// them pick themselves off that squad's roster (never type a new name, so no duplicate athlete record is
// created) and submit a request -- nothing is granted until a coach approves it.
//
// Same real-HTML-fragment-parsing DOM stub as tests/swimmer-portal-real-account-20261004.cjs (this file's
// own closest sibling test), driving the REAL swimmer-portal.js end to end through a mocked fetch.
//
// Proves: (1) a fresh ?join=<code> link with no prior session asks for an email first, with copy specific
// to requesting squad access (not the coach-invite copy); after sign-in it fetches the roster for that code
// and lists it; (2) a returning, already-signed-in swimmer skips sign-in entirely and goes straight to the
// roster; (3) an empty roster shows a clear message rather than a dead end; (4) picking yourself submits
// the request and shows the pending screen; (5) a server-side rejection on submit (e.g. a duplicate pending
// request) surfaces its real message and stays on the roster rather than silently advancing; (6) the
// existing ?swimmer_invite= and ?invite= flows are untouched by this addition; (7) fail-before/pass-after.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');

const repoRoot=path.join(__dirname,'..');
const portalPath=path.join(repoRoot,'swimmer-portal.js');
const portalSrc=fs.readFileSync(portalPath,'utf8');

function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|select|textarea|label|input|h1|section)\b([^>]*)>/g;
  let m;
  while((m=re.exec(html))){
    const attrs={};
    const attrRe=/([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while((am=attrRe.exec(m[2]))){attrs[am[1]]=am[2]??'';}
    nodes.push({tag:m[1],attrs,raw:m[0]});
  }
  return nodes;
}
function makeNode(tag){
  const node={
    tagName:tag,className:'',dataset:{},style:{},textContent:'',value:'',hidden:false,disabled:false,onclick:null,
    _appended:[],_html:'',_parsed:[],_nodeCache:{},_listeners:{},
    set innerHTML(v){this._html=v;this._parsed=parseFragment(v);this._nodeCache={};},
    get innerHTML(){return this._html},
    append(...k){this._appended.push(...k)},appendChild(k){this._appended.push(k);return k},
    remove(){this._removed=true},
    addEventListener(type,fn){if(type==='click')this.onclick=fn;this._listeners[type]=fn;},
    removeEventListener(){},
    closest:()=>null,getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    querySelectorAll(sel){
      const m=/^\[([\w-]+)(?:=([\w-]+))?\]$/.exec(sel);
      if(!m)return[];
      const attr=m[1],val=m[2];
      return this._parsed.filter(p=>attr in p.attrs&&(val===undefined||p.attrs[attr]===val)).map(p=>{
        if(this._nodeCache[p.raw])return this._nodeCache[p.raw];
        const b=makeNode(p.tag);
        b.dataset={};
        for(const [k,v] of Object.entries(p.attrs)){
          if(k==='value')b.value=v;
          if(k.startsWith('data-')){const camel=k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());b.dataset[camel]=v;}
        }
        this._nodeCache[p.raw]=b;
        return b;
      });
    },
    querySelector(sel){const list=this.querySelectorAll(sel);return list[0]||null;},
  };
  return node;
}

function bootFixture({search='',localStorageSeed={}}={}){
  const ROOT=makeNode('div');
  global.document={
    querySelector(sel){return sel==='#portal'?ROOT:(sel==='#sp-style'?null:null);},
    createElement:tag=>makeNode(tag),
    head:makeNode('head'),
    body:makeNode('body'),
    addEventListener(){},
  };
  global.window=global;
  global.location={search,pathname:'/swimmer-portal.html',href:`https://example.test/swimmer-portal.html${search}`};
  const replaceStateCalls=[];
  global.history={replaceState(...a){replaceStateCalls.push(a);}};
  const store=new Map(Object.entries(localStorageSeed));
  global.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  if(!global.navigator)Object.defineProperty(global,'navigator',{value:{platform:'test',userAgent:'test'},configurable:true});
  global.MCLAY_CONFIG={supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'};
  return{ROOT,store,replaceStateCalls};
}

const rosterRows=[
  {organisation_id:'org-1',organisation_name:'Riverside Swim Club',athlete_id:'ath-ruby',athlete_full_name:'Ruby Stace'},
  {organisation_id:'org-1',organisation_name:'Riverside Swim Club',athlete_id:'ath-sam',athlete_full_name:'Sam Keel'},
];

async function flush(n=10){for(let i=0;i<n;i++)await new Promise(r=>setTimeout(r,0));}

function makeFetchRecorder(opts={}){
  const calls=[];
  const fetchImpl=async(url,reqOpts)=>{
    const body=JSON.parse(reqOpts.body||'{}');
    const auth=reqOpts.headers?.Authorization||'';
    calls.push({url:String(url),body,auth});
    if(url.includes('/auth/v1/otp'))return{ok:true,text:async()=>'{}'};
    if(url.includes('/auth/v1/verify'))return{ok:true,text:async()=>JSON.stringify({access_token:'real-access-tok',refresh_token:'real-refresh-tok',expires_in:3600,user:{email:body.email}})};
    if(url.includes('/rpc/mclay_join_code_roster')){
      if(opts.rosterFails)return{ok:false,text:async()=>JSON.stringify({message:opts.rosterFails})};
      return{ok:true,text:async()=>JSON.stringify(opts.roster===undefined?rosterRows:opts.roster)};
    }
    if(url.includes('/rpc/mclay_request_swimmer_link')){
      if(opts.requestFails)return{ok:false,text:async()=>JSON.stringify({message:opts.requestFails})};
      return{ok:true,text:async()=>JSON.stringify([{request_id:'req-1',organisation_id:'org-1',athlete_id:body.target_athlete_id,status:'pending'}])};
    }
    if(url.includes('/rpc/mclay_swimmer_portal_snapshot'))return{ok:true,text:async()=>'null'};
    if(url.includes('/rpc/mclay_accept_swimmer_invite'))return{ok:true,text:async()=>'null'};
    if(url.includes('/rpc/msos_claim_swimmer_invite'))return{ok:true,text:async()=>JSON.stringify({device_token:'dev-1',athlete_id:'ath-ruby'})};
    if(url.includes('/rpc/msos_swimmer_portal_snapshot'))return{ok:true,text:async()=>JSON.stringify({payload:{athlete:{id:'ath-ruby',full_name:'Ruby Stace'},session:null,sessions:[],performance:{events:[]},training:{},tests:[],meet:[],sharedEvidence:[]}})};
    if(url.includes('/rpc/msos_swimmer_session_actions_snapshot'))return{ok:true,text:async()=>'[]'};
    return{ok:true,text:async()=>'null'};
  };
  return{calls,fetchImpl};
}

async function runFreshJoinLinkAsksForEmailThenShowsRoster(){
  const{ROOT}=bootFixture({search:'?join=ABCDE12345'});
  const{calls,fetchImpl}=makeFetchRecorder();
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.match(ROOT.innerHTML,/request access to this squad/i,'a fresh join link must show join-specific copy, not the coach-invite copy');
  assert.match(ROOT.innerHTML,/Send sign-in code/);
  const emailInput=ROOT.querySelectorAll('[data-account-email]')[0];
  emailInput.value='ruby@example.test';
  const sendBtn=ROOT.querySelectorAll('[data-account-send]')[0];
  await sendBtn.onclick();
  await flush();
  assert.ok(calls.some(c=>c.url.includes('/auth/v1/otp')&&c.body.email==='ruby@example.test'));

  const codeInput=ROOT.querySelectorAll('[data-account-code]')[0];
  codeInput.value='654321';
  const verifyBtn=ROOT.querySelectorAll('[data-account-verify]')[0];
  await verifyBtn.onclick();
  await flush();

  const rosterCall=calls.find(c=>c.url.includes('/rpc/mclay_join_code_roster'));
  assert.ok(rosterCall,'after signing in via a join link, the roster for that join code must be fetched');
  assert.equal(rosterCall.body.join_code,'ABCDE12345');
  assert.equal(rosterCall.auth,'Bearer real-access-tok','the roster fetch must use the real signed-in token, not the anon key');
  assert.equal(calls.filter(c=>c.url.includes('/rpc/mclay_accept_swimmer_invite')).length,0,'a join-code link must never call the coach-invite accept RPC');

  assert.match(ROOT.innerHTML,/Riverside Swim Club/,'the roster screen must name the organisation the code resolved to');
  const picks=ROOT.querySelectorAll('[data-join-pick]');
  assert.equal(picks.length,2,'both roster rows must be offered as pick buttons');
  assert.match(ROOT.innerHTML,/Ruby Stace/);
  assert.match(ROOT.innerHTML,/Sam Keel/);
  console.log('SWIMMER_PORTAL_JOIN_FRESH_SIGNIN_TO_ROSTER_PASS');
}

async function runPickingSelfSubmitsRequestAndShowsPending(){
  const{ROOT}=bootFixture({search:'',localStorageSeed:{msos_swimmer_account_session_v1:JSON.stringify({access_token:'saved-tok',refresh_token:'saved-refresh',expires_at:Math.floor(Date.now()/1000)+3600,email:'ruby@example.test'})}});
  const{calls,fetchImpl}=makeFetchRecorder();
  global.fetch=fetchImpl;
  global.location.search='?join=ABCDE12345';
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.equal(calls.filter(c=>c.url.includes('/auth/v1/')).length,0,'an already signed-in swimmer opening a join link must never be asked to sign in again');
  assert.ok(calls.some(c=>c.url.includes('/rpc/mclay_join_code_roster')),'a returning signed-in swimmer must go straight to fetching the roster');
  const picks=ROOT.querySelectorAll('[data-join-pick]');
  assert.equal(picks.length,2);
  const rubyPick=picks.find(p=>p.dataset.joinPick==='ath-ruby');
  assert.ok(rubyPick,'the pick button must carry the real athlete id so the request is unambiguous');
  await rubyPick.onclick();
  await flush();

  const reqCall=calls.find(c=>c.url.includes('/rpc/mclay_request_swimmer_link'));
  assert.ok(reqCall,'picking yourself must call mclay_request_swimmer_link');
  assert.equal(reqCall.body.join_code,'ABCDE12345');
  assert.equal(reqCall.body.target_athlete_id,'ath-ruby');
  assert.equal(reqCall.auth,'Bearer saved-tok');
  assert.match(ROOT.innerHTML,/Request sent/i,'after submitting, the swimmer must see a clear pending state');
  assert.match(ROOT.innerHTML,/coach needs to approve/i,'the pending screen must explain a coach decision is still needed -- nothing is granted yet');
  console.log('SWIMMER_PORTAL_JOIN_PICK_SELF_SUBMITS_PENDING_PASS');
}

async function runEmptyRosterShowsClearMessage(){
  const{ROOT}=bootFixture({search:'?join=EMPTY00001'});
  const{fetchImpl}=makeFetchRecorder({roster:[]});
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();
  const emailInput=ROOT.querySelectorAll('[data-account-email]')[0];
  emailInput.value='newbie@example.test';
  await ROOT.querySelectorAll('[data-account-send]')[0].onclick();
  await flush();
  ROOT.querySelectorAll('[data-account-code]')[0].value='111111';
  await ROOT.querySelectorAll('[data-account-verify]')[0].onclick();
  await flush();

  assert.match(ROOT.innerHTML,/No swimmers found on this roster yet/i,'an empty roster must show a clear message, not a dead end or an empty screen');
  assert.equal(ROOT.querySelectorAll('[data-join-pick]').length,0);
  console.log('SWIMMER_PORTAL_JOIN_EMPTY_ROSTER_PASS');
}

async function runServerRejectionOnSubmitStaysOnRosterWithRealMessage(){
  const{ROOT}=bootFixture({search:'',localStorageSeed:{msos_swimmer_account_session_v1:JSON.stringify({access_token:'saved-tok',refresh_token:'saved-refresh',expires_at:Math.floor(Date.now()/1000)+3600,email:'ruby@example.test'})}});
  const{fetchImpl}=makeFetchRecorder({requestFails:'You already have a pending request for this swimmer.'});
  global.fetch=fetchImpl;
  global.location.search='?join=ABCDE12345';
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();
  const rubyPick=ROOT.querySelectorAll('[data-join-pick]').find(p=>p.dataset.joinPick==='ath-ruby');
  await rubyPick.onclick();
  await flush();

  assert.match(ROOT.innerHTML,/already have a pending request/i,'a server-side rejection must surface its own real message');
  assert.doesNotMatch(ROOT.innerHTML,/Request sent/i,'a failed submit must never show the pending screen');
  assert.ok(ROOT.querySelectorAll('[data-join-pick]').length>0,'a failed submit must return the swimmer to the roster so they can try again');
  console.log('SWIMMER_PORTAL_JOIN_REQUEST_SERVER_ERROR_PASS');
}

async function runExistingInviteAndDeviceFlowsUnaffected(){
  {
    const{ROOT}=bootFixture({search:'?swimmer_invite=inv-tok-1'});
    const{calls,fetchImpl}=makeFetchRecorder();
    global.fetch=fetchImpl;
    delete require.cache[require.resolve(portalPath)];
    require(portalPath);
    await flush();
    assert.match(ROOT.innerHTML,/A coach has set up your real swimmer account access/i,'a ?swimmer_invite= link must still show the original coach-invite copy, not the join copy');
    assert.equal(calls.filter(c=>c.url.includes('/rpc/mclay_join_code_roster')).length,0);
  }
  {
    const{ROOT}=bootFixture({search:'?invite=qr-tok-1'});
    const{calls,fetchImpl}=makeFetchRecorder();
    global.fetch=fetchImpl;
    delete require.cache[require.resolve(portalPath)];
    require(portalPath);
    await flush();
    assert.ok(calls.some(c=>c.url.includes('/rpc/msos_claim_swimmer_invite')),'the plain device-token QR flow must still run exactly as before');
    assert.match(ROOT.innerHTML,/Ruby Stace/);
  }
  console.log('SWIMMER_PORTAL_JOIN_EXISTING_FLOWS_UNAFFECTED_PASS');
}

function runFailBefore(){
  assert.match(portalSrc,/loadJoinRoster/,'sanity: the real source must contain this fix\'s own new code');
  // Anchored one line earlier than the new feature's own explanatory comment: showAccountScreen()'s
  // default-patch object itself was modified in place (joinCode/joinOrgName/joinRoster added to its
  // existing defaults) rather than only appended after, so truncating at the comment alone would leave
  // that one already-edited line behind and trip the "genuinely lacks" check below on 'joinCode'.
  const hookStart=portalSrc.indexOf("  function showAccountScreen(patch){ACCOUNT_UI=");
  assert.ok(hookStart>0,'could not locate the new join-request block in the real source to remove for fail-before');
  const preFixSrc=portalSrc.slice(0,hookStart);
  assert.doesNotMatch(preFixSrc,/joinCode|loadJoinRoster|mclay_join_code_roster|mclay_request_swimmer_link|startJoinRequestFlow/,'pre-fix reconstruction must genuinely lack the swimmer-initiated join flow');
  console.log('SWIMMER_PORTAL_JOIN_FAILBEFORE_PASS');
}

(async function(){
  await runFreshJoinLinkAsksForEmailThenShowsRoster();
  await runPickingSelfSubmitsRequestAndShowsPending();
  await runEmptyRosterShowsClearMessage();
  await runServerRejectionOnSubmitStaysOnRosterWithRealMessage();
  await runExistingInviteAndDeviceFlowsUnaffected();
  runFailBefore();
  process.exit(0);
})().catch(err=>{console.error('SWIMMER_PORTAL_JOIN_FAIL',err);process.exit(1);});
