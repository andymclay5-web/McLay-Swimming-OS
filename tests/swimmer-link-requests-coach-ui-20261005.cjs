'use strict';
// 5 Oct 2026 -- "sort the swimmer access reverse" (Andy, verbatim): "short term we should still use QR or
// link to set up while trialing but at a point we want that to shift to swimmers purchase etc." This is the
// COACH-side half of that build -- see tests/swimmer-portal-join-request-20261005.cjs for the swimmer-facing
// join flow this feeds. supabase/20261005_swimmer_initiated_link_requests.sql adds the join-code/request
// RPCs; this proves the new "Swimmer join requests" button + modal in engines/swimmer-invite-bn.js actually
// drives them: showing the org's join link/QR, listing pending requests, approving/declining them, rotating
// the link, and the pending-count badge that stands in for a real push alert this round (see that file's own
// header comment for why a true push alert isn't buildable here without a DB trigger or an edge-function
// change -- not done without Andy's sign-off).
//
// Same minimal DOM-stub technique as tests/swimmer-real-account-invite-ui-20261004.cjs (no jsdom in this
// project), extended two ways this test genuinely needs: (1) querySelector also finds elements reached via
// append() (not only ones parsed out of an innerHTML string), since the pending-requests list and the badge
// are built with document.createElement()+append() rather than a single innerHTML template; (2) remove()
// actually detaches a node from its parent's children, since decide() removes a row from the list and the
// test checks the list is empty afterwards.
const assert=require('node:assert/strict');
const path=require('node:path');

function attrKey(sel){const m=/^\[data-([a-z0-9-]+)\]$/.exec(sel);if(!m)return null;return m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
function findAppended(node,sel){
  const key=attrKey(sel);if(!key)return null;
  for(const kid of node._appended||[]){
    if(!kid)continue;
    if(kid.dataset&&kid.dataset[key]!==undefined)return kid;
    const nested=findAppended(kid,sel);if(nested)return nested;
  }
  return null;
}
function makeNode(tag){
  const node={
    tagName:tag,className:'',dataset:{},style:{setProperty(){},getPropertyValue:()=>''},
    textContent:'',value:'',hidden:false,disabled:false,onclick:null,width:0,height:0,
    _cache:{},_appended:[],_hasContent:false,_parent:null,_removed:false,
    set innerHTML(v){this._html=v;this._cache={};this._hasContent=true;},
    get innerHTML(){return this._html||''},
    get children(){return this._appended.filter(k=>!k._removed)},
    addEventListener(){},removeEventListener(){},
    append(...kids){for(const k of kids){k._parent=node;node._appended.push(k);}},
    appendChild(k){k._parent=node;node._appended.push(k);return k},
    remove(){this._removed=true;if(this._parent){const idx=this._parent._appended.indexOf(this);if(idx>=0)this._parent._appended.splice(idx,1);}},
    closest:()=>null,
    getContext(){throw new Error('no 2d context in this test stub');},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    querySelector(sel){
      const found=findAppended(this,sel);if(found)return found;
      if(!this._hasContent)return null;
      if(!this._cache[sel])this._cache[sel]=makeNode('div');
      return this._cache[sel];
    },
    querySelectorAll(){return [];},
  };
  return node;
}
const modalHost=makeNode('div');
const athletesHead=makeNode('div');
global.document={
  readyState:'complete',
  body:makeNode('body'),
  addEventListener(){},
  createElement:tag=>makeNode(tag),
  querySelector(sel){
    if(sel==='#modalHost')return modalHost;
    if(sel==='#athletesView .cn-owner-actions')return athletesHead;
    return null;
  },
};
global.window=global;
global.location={href:'https://example.test/app.html'};
global.requestAnimationFrame=fn=>fn();
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});

global.MSOSEngines={Evidence:{t400Rows:()=>[],course:()=>'',seconds:()=>0}};

function bootFixture({role='owner',rpcImpls={}}={}){
  athletesHead._appended.length=0;modalHost._appended.length=0;
  const calls=[];
  global.MSOS4={
    ui:{},
    state:{settings:{selectedAthleteId:null,organisationId:'org-fixture'},athletes:[],captures:[],meetEntries:[],trainingTestResults:[]},
    access:{role:()=>role},
    store:{config:()=>({supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'}),auth:()=>({access_token:'owner-tok'})},
    currentSession:()=>null,
    cloud:{org:()=>'org-fixture'},
    nav:{openLayer(){},dismissLayer(){}},
  };
  global.fetch=async(url,opts)=>{
    const body=JSON.parse(opts.body||'{}');
    const u=String(url);
    calls.push({url:u,body,auth:opts.headers?.Authorization||''});
    for(const[name,impl]of Object.entries(rpcImpls)){
      if(u.includes(`/rpc/${name}`))return impl(body);
    }
    if(u.includes('/rpc/mclay_org_join_code'))return{ok:true,text:async()=>JSON.stringify('ABCDE12345')};
    if(u.includes('/rpc/mclay_rotate_org_join_code'))return{ok:true,text:async()=>JSON.stringify('ZZZZZ99999')};
    if(u.includes('/rpc/mclay_list_swimmer_link_requests'))return{ok:true,text:async()=>JSON.stringify([])};
    if(u.includes('/rpc/mclay_decide_swimmer_link_request'))return{ok:true,text:async()=>JSON.stringify([{organisation_id:'org-fixture',athlete_id:'ath-1',status:body.approve?'approved':'declined'}])};
    return{ok:true,text:async()=>'null'};
  };
  delete require.cache[require.resolve(path.join(__dirname,'..','engines','swimmer-invite-bn.js'))];
  require(path.join(__dirname,'..','engines','swimmer-invite-bn.js'));
  return{calls};
}

async function flush(){await null;await null;}

async function runButtonInstallsAndOpensModalShowingJoinLinkAndRequests(){
  const pendingRows=[{request_id:'req-1',athlete_id:'ath-1',athlete_full_name:'Casey Lane',requester_email:'casey@example.test',created_at:'2026-10-05T00:00:00Z'}];
  const{calls}=bootFixture({rpcImpls:{mclay_list_swimmer_link_requests:()=>({ok:true,text:async()=>JSON.stringify(pendingRows)})}});
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  assert.ok(btn,'installLinkRequestsButton() must append the "Swimmer join requests" button for an owner');
  assert.equal(btn.textContent,'Swimmer join requests');
  await flush();
  const badge=athletesHead._appended.find(n=>n.dataset.bnLinkRequests)?._appended?.find(k=>k.dataset?.bnLinkBadge);
  assert.ok(badge,'a pending request must show a count badge on the button -- the stated MVP substitute for a real push alert');
  assert.equal(badge.textContent,'1');

  btn.onclick();
  const wrap=modalHost._appended.at(-1);
  assert.ok(wrap,'clicking the button must open the join-requests modal into #modalHost');
  await flush();

  const codeCall=calls.find(c=>c.url.includes('/rpc/mclay_org_join_code'));
  assert.ok(codeCall,'opening the modal must fetch (or create) the organisation join code');
  assert.equal(codeCall.body.target_org,'org-fixture');

  const urlBox=wrap.querySelector('[data-bn-link-url]');
  assert.equal(urlBox.hidden,false,'the join link must be shown once the code is fetched');
  assert.match(urlBox.textContent,/swimmer-portal\.html\?join=ABCDE12345/,'the shown link must carry the real join code as the swimmer-portal entry point');

  const list=wrap.querySelector('[data-bn-link-list]');
  const rows=list.children;
  assert.equal(rows.length,1,'the pending request must be listed');
  assert.match(rows[0].innerHTML,/Casey Lane/);
  assert.match(rows[0].innerHTML,/casey@example\.test/);
  console.log('SWIMMER_LINK_REQUESTS_OPEN_PASS');
}

async function runApprovingCallsDecideRpcAndRemovesRow(){
  const pendingRows=[{request_id:'req-1',athlete_id:'ath-1',athlete_full_name:'Casey Lane',requester_email:'casey@example.test',created_at:'2026-10-05T00:00:00Z'}];
  const{calls}=bootFixture({rpcImpls:{mclay_list_swimmer_link_requests:()=>({ok:true,text:async()=>JSON.stringify(pendingRows)})}});
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  btn.onclick();
  await flush();
  const wrap=modalHost._appended.at(-1);
  const list=wrap.querySelector('[data-bn-link-list]');
  const row=list.children[0];
  const approveBtn=row.querySelector('[data-approve]');
  assert.ok(approveBtn.onclick,'the row must have an Approve handler wired');
  await approveBtn.onclick();

  const decideCall=calls.find(c=>c.url.includes('/rpc/mclay_decide_swimmer_link_request'));
  assert.ok(decideCall,'approving must call mclay_decide_swimmer_link_request');
  assert.equal(decideCall.body.request_id,'req-1');
  assert.equal(decideCall.body.approve,true);
  assert.equal(list.children.length,0,'the approved request must be removed from the pending list');
  console.log('SWIMMER_LINK_REQUESTS_APPROVE_PASS');
}

async function runDecliningCallsDecideRpcWithApproveFalse(){
  const pendingRows=[{request_id:'req-2',athlete_id:'ath-2',athlete_full_name:'Jordan Pike',requester_email:'jordan@example.test',created_at:'2026-10-05T00:00:00Z'}];
  const{calls}=bootFixture({rpcImpls:{mclay_list_swimmer_link_requests:()=>({ok:true,text:async()=>JSON.stringify(pendingRows)})}});
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  btn.onclick();
  await flush();
  const wrap=modalHost._appended.at(-1);
  const list=wrap.querySelector('[data-bn-link-list]');
  const row=list.children[0];
  const declineBtn=row.querySelector('[data-decline]');
  await declineBtn.onclick();

  const decideCall=calls.find(c=>c.url.includes('/rpc/mclay_decide_swimmer_link_request'));
  assert.equal(decideCall.body.request_id,'req-2');
  assert.equal(decideCall.body.approve,false);
  assert.equal(list.children.length,0,'the declined request must be removed from the pending list too');
  console.log('SWIMMER_LINK_REQUESTS_DECLINE_PASS');
}

async function runNewLinkRotatesTheCode(){
  const{calls}=bootFixture();
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  btn.onclick();
  await flush();
  const wrap=modalHost._appended.at(-1);
  const urlBox=wrap.querySelector('[data-bn-link-url]'),rotateBtn=wrap.querySelector('[data-bn-link-rotate]'),status=wrap.querySelector('[data-bn-link-status]');
  assert.match(urlBox.textContent,/join=ABCDE12345/);
  await rotateBtn.onclick();
  const rotateCall=calls.find(c=>c.url.includes('/rpc/mclay_rotate_org_join_code'));
  assert.ok(rotateCall,'"New link" must call mclay_rotate_org_join_code');
  assert.equal(rotateCall.body.target_org,'org-fixture');
  assert.match(urlBox.textContent,/join=ZZZZZ99999/,'the modal must show the newly rotated code');
  assert.match(status.textContent,/new link ready/i);
  console.log('SWIMMER_LINK_REQUESTS_ROTATE_PASS');
}

async function runNonOwnerNeverGetsTheButton(){
  bootFixture({role:'assistant_coach'});
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  assert.equal(btn,undefined,'only the owner should see the swimmer join-requests review button');
  console.log('SWIMMER_LINK_REQUESTS_NON_OWNER_PASS');
}

async function runZeroPendingShowsNoBadgeAndEmptyState(){
  const{calls}=bootFixture({rpcImpls:{mclay_list_swimmer_link_requests:()=>({ok:true,text:async()=>JSON.stringify([])})}});
  const btn=athletesHead._appended.find(n=>n.dataset.bnLinkRequests);
  await flush();
  const badge=btn._appended.find(k=>k.dataset?.bnLinkBadge);
  assert.equal(badge,undefined,'with zero pending requests there must be no count badge');
  btn.onclick();
  await flush();
  const wrap=modalHost._appended.at(-1);
  const list=wrap.querySelector('[data-bn-link-list]');
  assert.match(list.innerHTML,/no pending requests/i);
  void calls;
  console.log('SWIMMER_LINK_REQUESTS_EMPTY_PASS');
}

function runFailBefore(){
  const fs=require('node:fs');
  const invitePath=path.join(__dirname,'..','engines','swimmer-invite-bn.js');
  const src=fs.readFileSync(invitePath,'utf8');
  assert.match(src,/installLinkRequestsButton/,'sanity: the real source must contain this fix\'s own new code');
  const hookStart=src.indexOf('  // 5 Oct 2026 -- Andy\'s "sort the swimmer access reverse" direction: the REVERSE of');
  assert.ok(hookStart>0,'could not locate the new swimmer join-requests section in the real source to remove for fail-before');
  const preFixSrc=src.slice(0,hookStart);
  assert.doesNotMatch(preFixSrc,/mclay_org_join_code|mclay_list_swimmer_link_requests|mclay_decide_swimmer_link_request|installLinkRequestsButton|linkRequestsModal/,'pre-fix reconstruction must genuinely lack the swimmer join-requests review UI');
  console.log('SWIMMER_LINK_REQUESTS_FAILBEFORE_PASS');
}

(async function(){
  await runButtonInstallsAndOpensModalShowingJoinLinkAndRequests();
  await runApprovingCallsDecideRpcAndRemovesRow();
  await runDecliningCallsDecideRpcWithApproveFalse();
  await runNewLinkRotatesTheCode();
  await runNonOwnerNeverGetsTheButton();
  await runZeroPendingShowsNoBadgeAndEmptyState();
  runFailBefore();
  process.exit(0);
})().catch(err=>{console.error('SWIMMER_LINK_REQUESTS_FAIL',err);process.exit(1);});
