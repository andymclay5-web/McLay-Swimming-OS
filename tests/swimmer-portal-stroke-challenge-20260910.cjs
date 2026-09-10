'use strict';
// Real coaching failure this fixes (Andy's own voice-memo spec, build-list item 8, plus his direct follow-up):
// "the swim[m]er portal, they need to be able to challenge their stroke selection... they'd ask, oh, can I do
// backstroke? And I'd say yes or no depending on the evidence I had" -- then, once a swimmer trains alone
// ("Matthew will be doing his sessions when I'm not thinking about swimming"), waiting for Andy to next open his
// feedback inbox doesn't work: "if the parameters fit and it makes sense their logic, then... they can do it
// right there." Before this fix, swimmer-portal.js never showed a swimmer which stroke had been resolved as
// their "#1" choice for a set, had no dedicated way to challenge it, and even once a structured challenge
// existed it only ever went into the generic review queue with no instant answer. This drives the REAL
// swimmer-portal.js end to end through the same minimal DOM stub used by tests/swimmer-finish-line-picker-
// 20260910.cjs: a session with one item that has a resolved #1 stroke and one that doesn't (confirming the pill
// only renders where it applies), confirming a stroke challenge is submitted via the instant-verdict RPC
// (msos_swimmer_submit_stroke_challenge) with the item's real block/item ids and the swimmer's proposed stroke
// and reason, and confirming the swimmer is shown the real approved/check-with-Andy verdict immediately --
// never left guessing whether anything happened.
const assert=require('node:assert/strict');
const path=require('node:path');

function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|select|textarea|label|option|small)\b([^>]*)>/g;
  let m;
  while((m=re.exec(html))){
    const attrs={};
    const attrRe=/([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while((am=attrRe.exec(m[2])))attrs[am[1]]=am[2]??'';
    nodes.push({tag:m[1],attrs,raw:m[0]});
  }
  return nodes;
}
function makeNode(tag){
  const node={
    tagName:tag,className:'',dataset:{},style:{},textContent:'',value:'',hidden:false,disabled:false,onclick:null,
    _appended:[],_html:'',_parsed:[],_nodeCache:{},
    set innerHTML(v){this._html=v;this._parsed=parseFragment(v);this._nodeCache={};},
    get innerHTML(){return this._html},
    append(...k){this._appended.push(...k)},appendChild(k){this._appended.push(k);return k},
    remove(){this._removed=true},addEventListener(type,fn){if(type==='click')this.onclick=fn;},removeEventListener(){},
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
const ROOT=makeNode('div');
global.document={
  querySelector(sel){return sel==='#portal'?ROOT:null;},
  createElement:tag=>makeNode(tag),
  head:makeNode('head'),
  body:makeNode('body'),
  addEventListener(){},
};
global.window=global;
global.location={search:'',pathname:'/swimmer-portal.html',href:'https://example.test/swimmer-portal.html'};
global.localStorage=(()=>{const m=new Map();m.set('msos_swimmer_device_token_v1','dev-1');m.set('msos_swimmer_athlete_id_v1','ath-matthew');return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};})();
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{platform:'test',userAgent:'test'},configurable:true});
global.history={replaceState(){}};

const athlete={id:'ath-matthew',full_name:'Matthew Example',squad:'Development'};
const sessionToday={id:'sess-today',date:'2026-09-10',slot:'AM',squad:'Development',course:'SCM',title:'Development AM',metres:600,delivery:'',zones:{},strokes:{},tags:{},finished:false,
  blocks:[{id:'b-main',label:'Main set',metres:600,items:[
    {id:'i-numberone',label:'4x100 #1 Stroke',metres:400,tags:[],target:null,stroke:'Breaststroke'},
    {id:'i-plain',label:'4x50 Freestyle Easy',metres:200,tags:[],target:null,stroke:''},
  ]}]};

const submittedActions=[];
const strokeChallengeCalls=[];
global.MCLAY_CONFIG={supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'};
global.fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body||'{}');
  if(url.includes('/rpc/msos_claim_swimmer_invite'))return{ok:true,text:async()=>JSON.stringify({device_token:'dev-1',athlete_id:athlete.id})};
  if(url.includes('/rpc/msos_swimmer_portal_snapshot'))return{ok:true,text:async()=>JSON.stringify({payload:{athlete,session:sessionToday,sessions:[sessionToday],performance:{course:'SCM',events:[]},training:{},tests:[],meet:[],sharedEvidence:[]}})};
  if(url.includes('/rpc/msos_swimmer_session_actions_snapshot'))return{ok:true,text:async()=>JSON.stringify([])};
  if(url.includes('/rpc/msos_swimmer_submit_session_action')){submittedActions.push(body);return{ok:true,text:async()=>JSON.stringify({ok:true})};}
  if(url.includes('/rpc/msos_swimmer_submit_stroke_challenge')){
    strokeChallengeCalls.push(body);
    // 'Freestyle' simulates the RPC itself failing outright (e.g. not deployed yet / genuine network error) --
    // everything else simulates a normal instant-check response, approved only for 'Backstroke'.
    if(body.p_proposed_stroke==='Freestyle')return{ok:false,status:500,text:async()=>JSON.stringify({message:'Secure access failed'})};
    const approved=body.p_proposed_stroke==='Backstroke';
    return{ok:true,text:async()=>JSON.stringify({id:'act-1',approved,
      reason:approved?'Ranked evidence agrees: Backstroke is the highest World Aquatics points stroke.':'Ranked evidence: Breaststroke (420 pts) outranks Butterfly (300 pts) — that doesn\'t match the #1-by-points logic. Check with Andy.',
      appliedToBoard:approved})};
  }
  return{ok:true,text:async()=>'null'};
};

require(path.join(__dirname,'..','swimmer-portal.js'));

// Drives one full challenge round through the real UI: click the pill, fill the modal, save, and return the
// verdict modal that results (whatever HTML it rendered).
async function runChallenge(proposedStroke,reason){
  const strokeBtns=ROOT.querySelectorAll('[data-stroke-challenge]');
  strokeBtns[0].onclick();
  const modalNode=global.document.body._appended.at(-1);
  modalNode.querySelectorAll('[name=proposedStroke]')[0].value=proposedStroke;
  modalNode.querySelectorAll('[name=reason]')[0].value=reason;
  await modalNode.querySelectorAll('[data-save]')[0].onclick();
  return global.document.body._appended.at(-1); // the follow-up verdict modal
}

(async()=>{
  await new Promise(r=>setTimeout(r,20));

  const strokeBtns=ROOT.querySelectorAll('[data-stroke-challenge]');
  assert.equal(strokeBtns.length,1,'the stroke-challenge pill must render only for the item with a resolved #1 stroke');
  assert.equal(strokeBtns[0].dataset.strokeChallenge,'i-numberone');
  assert.equal(strokeBtns[0].dataset.block,'b-main');
  assert.equal(strokeBtns[0].dataset.currentStroke,'Breaststroke');

  // --- Approved: evidence agrees, the swimmer is told they can do it right there -----------------------------
  const approvedModal=await runChallenge('Backstroke','I feel stronger on backstroke lately');
  assert.equal(strokeChallengeCalls.length,1,'exactly one instant-verdict RPC call must have been made');
  assert.equal(strokeChallengeCalls[0].p_device_token,'dev-1');
  assert.equal(strokeChallengeCalls[0].p_session_id,'sess-today');
  assert.equal(strokeChallengeCalls[0].p_block_id,'b-main');
  assert.equal(strokeChallengeCalls[0].p_item_id,'i-numberone');
  assert.equal(strokeChallengeCalls[0].p_current_stroke,'Breaststroke');
  assert.equal(strokeChallengeCalls[0].p_proposed_stroke,'Backstroke');
  assert.equal(strokeChallengeCalls[0].p_reason,'I feel stronger on backstroke lately');
  assert.ok(approvedModal.innerHTML.includes('You can do it'),'an approved verdict must tell the swimmer they can do it right there, not leave them waiting on Andy');
  assert.ok(approvedModal.innerHTML.includes('Ranked evidence agrees'),'the real evidence reason from the RPC must be shown to the swimmer, not a generic message');
  assert.equal(submittedActions.length,0,'an approved instant verdict must not also fall back to the generic review-queue path');

  // --- Not approved: evidence disagrees, the swimmer is told to check with Andy ---------------------------------
  const checkModal=await runChallenge('Butterfly','Just want to try it');
  assert.equal(strokeChallengeCalls.length,2);
  assert.ok(checkModal.innerHTML.includes('Check with Andy'),'a rejected verdict must clearly tell the swimmer to check with Andy');
  assert.ok(checkModal.innerHTML.includes('outranks'),'the real disagreement reason must be shown, not a generic rejection');
  assert.equal(submittedActions.length,0,'a not-approved instant verdict is still handled by the RPC itself (it already logs the action) -- must not double-submit via the generic path');

  // --- The instant-check RPC itself fails outright: must fall back so the request still reaches Andy -----------
  const fallbackModal=await runChallenge('Freestyle','Coach mentioned this once');
  assert.equal(submittedActions.length,1,'when the instant-verdict RPC genuinely fails, the challenge must still reach Andy via the generic review path');
  assert.equal(submittedActions[0].p_payload.kind,'stroke');
  assert.equal(submittedActions[0].p_payload.proposedStroke,'Freestyle');
  assert.equal(submittedActions[0].p_payload.reason,'Coach mentioned this once');
  assert.ok(fallbackModal.innerHTML.includes('Sent to Andy'),'the swimmer must be told their request still went to Andy, not left thinking it silently failed');

  console.log('SWIMMER_PORTAL_STROKE_CHALLENGE_PASS');
})().catch(err=>{console.error('SWIMMER_PORTAL_STROKE_CHALLENGE_FAIL',err);process.exit(1);});
