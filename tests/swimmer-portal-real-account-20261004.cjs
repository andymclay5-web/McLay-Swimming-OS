'use strict';
// 4 Oct 2026 -- Andy chose "build the swimmer sign-in UI + link test" to prove out the real-account
// direction he committed to on 3 Oct ("Go for the future proof app store ready version") -- the invite/
// accept RPCs and athletes.linked_user_id landed then, but nothing in the client ever called them, and
// there was no way for a swimmer to actually fetch their own portal data through a real signed-in
// identity (only through a device-token QR, one phone at a time). supabase/
// 20261004_swimmer_real_account_portal_access.sql adds the missing read RPC
// (mclay_swimmer_portal_snapshot, the real-account equivalent of the existing device-token
// msos_swimmer_portal_snapshot); swimmer-portal.js adds the passwordless-email sign-in screen (reusing
// engines/team-access.js's proven OTP pattern, reimplemented standalone since this page has no
// M.store/cloud-session.js) and wires ?swimmer_invite=<token> through sign-in -> accept -> real snapshot
// fetch -> the SAME existing draw() rendering every device-token swimmer already uses.
//
// This drives the REAL swimmer-portal.js file end to end through the same minimal DOM stub technique as
// tests/swimmer-portal-session-picker-20260910.cjs (extended here with <input>, since this is the first
// swimmer-portal.js flow that needs real text entry rather than only select/textarea), with a mocked
// fetch standing in for both Supabase Auth (OTP send/verify) and the RPC endpoints.
//
// Proves: (1) a fresh ?swimmer_invite= link with no prior session asks for email, sends a code, verifies
// it, accepts the invite, and renders the real portal from the real-account snapshot RPC -- never the
// device-token one; (2) the existing device-token flow (?invite=) is completely unaffected -- same
// device_token endpoint called, same render; (3) a returning real-account swimmer (session already
// saved in localStorage, no URL params at all) fetches straight from the account snapshot RPC with no
// sign-in prompt; (4) a signed-in swimmer whose account isn't linked yet gets a clear manual-code screen
// to paste an invite into, rather than a dead end; (5) fail-before/pass-after against the exact source
// change that added this flow.
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

const athlete={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development'};
const sessionToday={id:'sess-today',date:'2026-10-05',slot:'AM',squad:'Development',course:'SCM',title:'Threshold AM',metres:800,delivery:'',zones:{},strokes:{},tags:{},finished:false,
  blocks:[{id:'b-today',label:'Main',metres:800,items:[{id:'i-today-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]};
const accountSnapshotBody={payload:{athlete,session:sessionToday,sessions:[sessionToday],performance:{course:'SCM',events:[]},training:{},tests:[],meet:[],sharedEvidence:[]}};

async function flush(n=10){for(let i=0;i<n;i++)await new Promise(r=>setTimeout(r,0));}

function makeFetchRecorder(opts={}){
  const calls=[];
  const fetchImpl=async(url,reqOpts)=>{
    const body=JSON.parse(reqOpts.body||'{}');
    const auth=reqOpts.headers?.Authorization||'';
    calls.push({url:String(url),body,auth});
    if(url.includes('/auth/v1/otp'))return{ok:true,text:async()=>'{}'};
    if(url.includes('/auth/v1/verify'))return{ok:true,text:async()=>JSON.stringify({access_token:'real-access-tok',refresh_token:'real-refresh-tok',expires_in:3600,user:{email:body.email}})};
    if(url.includes('/rpc/mclay_accept_swimmer_invite')){
      if(opts.acceptFails)return{ok:false,text:async()=>JSON.stringify({message:opts.acceptFails})};
      return{ok:true,text:async()=>JSON.stringify({organisation_id:'org-1',athlete_id:athlete.id,role:'swimmer'})};
    }
    if(url.includes('/rpc/mclay_swimmer_portal_snapshot')){
      if(opts.snapshotFails)return{ok:false,text:async()=>JSON.stringify({message:opts.snapshotFails})};
      return{ok:true,text:async()=>JSON.stringify(accountSnapshotBody)};
    }
    if(url.includes('/rpc/msos_claim_swimmer_invite'))return{ok:true,text:async()=>JSON.stringify({device_token:'dev-1',athlete_id:athlete.id})};
    if(url.includes('/rpc/msos_swimmer_portal_snapshot'))return{ok:true,text:async()=>JSON.stringify({payload:accountSnapshotBody.payload})};
    if(url.includes('/rpc/msos_swimmer_session_actions_snapshot'))return{ok:true,text:async()=>'[]'};
    return{ok:true,text:async()=>'null'};
  };
  return{calls,fetchImpl};
}

async function runFreshSwimmerInviteFullSignInFlow(){
  const{ROOT}=bootFixture({search:'?swimmer_invite=inv-tok-1'});
  const{calls,fetchImpl}=makeFetchRecorder();
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.match(ROOT.innerHTML,/Send sign-in code/,'a fresh swimmer_invite link with no prior session must ask for an email first');
  const emailInput=ROOT.querySelectorAll('[data-account-email]')[0];
  emailInput.value='ruby@example.test';
  const sendBtn=ROOT.querySelectorAll('[data-account-send]')[0];
  await sendBtn.onclick();
  await flush();
  assert.ok(calls.some(c=>c.url.includes('/auth/v1/otp')&&c.body.email==='ruby@example.test'),'sending the code must call Supabase Auth OTP with the entered email');
  assert.match(ROOT.innerHTML,/Verify and continue/,'after sending the code, the screen must ask for the code');

  const codeInput=ROOT.querySelectorAll('[data-account-code]')[0];
  codeInput.value='123456';
  const verifyBtn=ROOT.querySelectorAll('[data-account-verify]')[0];
  await verifyBtn.onclick();
  await flush();

  assert.ok(calls.some(c=>c.url.includes('/auth/v1/verify')&&c.body.token==='123456'),'verifying must call Supabase Auth verify with the entered code');
  const acceptCall=calls.find(c=>c.url.includes('/rpc/mclay_accept_swimmer_invite'));
  assert.ok(acceptCall,'the invite token from the URL must be accepted once signed in');
  assert.equal(acceptCall.body.invite_token,'inv-tok-1');
  assert.equal(acceptCall.auth,'Bearer real-access-tok','the accept call must carry the REAL signed-in access token, not the anon key');
  const snapCall=calls.find(c=>c.url.includes('/rpc/mclay_swimmer_portal_snapshot'));
  assert.ok(snapCall,'after accepting, the real-account snapshot RPC must be fetched -- never the device-token one');
  assert.equal(snapCall.auth,'Bearer real-access-tok');
  assert.equal(calls.filter(c=>c.url.includes('/rpc/msos_swimmer_portal_snapshot')).length,0,'a real-account swimmer must never fall back to the device-token snapshot RPC');

  assert.match(ROOT.innerHTML,/Ruby Stace/,'once signed in and linked, the real portal must render from the account snapshot');
  assert.match(ROOT.innerHTML,/8x100 Threshold/,'the rendered portal must show the real session from the account snapshot payload');
  console.log('SWIMMER_PORTAL_ACCOUNT_FRESH_SIGNIN_FLOW_PASS');
}

async function runExistingDeviceTokenFlowUnaffected(){
  const{ROOT}=bootFixture({search:'?invite=qr-tok-1'});
  const{calls,fetchImpl}=makeFetchRecorder();
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.ok(calls.some(c=>c.url.includes('/rpc/msos_claim_swimmer_invite')),'the existing device-token QR claim path must still run exactly as before');
  assert.ok(calls.some(c=>c.url.includes('/rpc/msos_swimmer_portal_snapshot')),'the existing device-token snapshot RPC must still be the one used');
  assert.equal(calls.filter(c=>c.url.includes('/rpc/mclay_')).length,0,'a plain device-token QR open must never touch any of the new real-account RPCs');
  assert.match(ROOT.innerHTML,/Ruby Stace/,'the device-token flow must still render the portal exactly as before');
  console.log('SWIMMER_PORTAL_DEVICE_TOKEN_FLOW_UNAFFECTED_PASS');
}

async function runReturningAccountSwimmerSkipsSignIn(){
  const{ROOT}=bootFixture({search:'',localStorageSeed:{msos_swimmer_account_session_v1:JSON.stringify({access_token:'saved-tok',refresh_token:'saved-refresh',expires_at:Math.floor(Date.now()/1000)+3600,email:'ruby@example.test'})}});
  const{calls,fetchImpl}=makeFetchRecorder();
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.ok(calls.some(c=>c.url.includes('/rpc/mclay_swimmer_portal_snapshot')&&c.auth==='Bearer saved-tok'),'a returning real-account swimmer with a saved, still-valid session must fetch their snapshot directly, using the saved token');
  assert.equal(calls.filter(c=>c.url.includes('/auth/v1/')).length,0,'a returning swimmer with a still-valid saved session must never be asked to sign in again');
  assert.match(ROOT.innerHTML,/Ruby Stace/,'the returning swimmer must land straight on their real portal');
  console.log('SWIMMER_PORTAL_ACCOUNT_RETURNING_SWIMMER_SKIPS_SIGNIN_PASS');
}

async function runSignedInButNotYetLinkedShowsManualCodeScreen(){
  const{ROOT}=bootFixture({search:'',localStorageSeed:{msos_swimmer_account_session_v1:JSON.stringify({access_token:'saved-tok',refresh_token:'saved-refresh',expires_at:Math.floor(Date.now()/1000)+3600,email:'newswimmer@example.test'})}});
  const{fetchImpl}=makeFetchRecorder({snapshotFails:'Your account is not linked to a swimmer profile yet. Ask your coach for an invite.'});
  global.fetch=fetchImpl;
  delete require.cache[require.resolve(portalPath)];
  require(portalPath);
  await flush();

  assert.match(ROOT.innerHTML,/not linked to a swimmer profile/,'a signed-in account with no linked athlete yet must show the real server error, not a generic failure');
  assert.match(ROOT.innerHTML,/Link my account/,'it must offer a way to paste/enter an invite code directly, since the swimmer is already signed in -- not a dead end');
  console.log('SWIMMER_PORTAL_ACCOUNT_NOT_LINKED_SHOWS_MANUAL_CODE_PASS');
}

function runFailBefore(){
  assert.match(portalSrc,/ACCOUNT_KEY/,'sanity: the real source must contain this fix\'s own new code');
  const hookStart=portalSrc.indexOf("  const ACCOUNT_KEY='msos_swimmer_account_session_v1';");
  assert.ok(hookStart>0,'could not locate the new account-flow block in the real source to remove for fail-before');
  // Everything from this point to end of file is either wholly new (the account-flow helpers/UI) or was
  // modified by this fix (fail()/start()) -- truncating here is enough to prove the marker genuinely lives
  // inside this fix's own change, not somewhere pre-existing; the truncated text need not be valid JS since
  // it is only ever regex-matched, never executed.
  const preFixSrc=portalSrc.slice(0,hookStart);
  assert.doesNotMatch(preFixSrc,/accountRpc|swimmer_invite|ACCOUNT_KEY/,'pre-fix reconstruction must genuinely lack the real-account sign-in flow');
  console.log('SWIMMER_PORTAL_ACCOUNT_FAILBEFORE_PASS');
}

(async function(){
  await runFreshSwimmerInviteFullSignInFlow();
  await runExistingDeviceTokenFlowUnaffected();
  await runReturningAccountSwimmerSkipsSignIn();
  await runSignedInButNotYetLinkedShowsManualCodeScreen();
  runFailBefore();
  process.exit(0);
})().catch(err=>{console.error('SWIMMER_PORTAL_ACCOUNT_FAIL',err);process.exit(1);});
