'use strict';
// Real coaching failure this pins: Andy's build-list item 7 -- "finish session early tied to real boundary
// semantics". Before this fix, swimmer-portal.js's "Finish session" submitted a completely generic feedback
// form (submitAction('finish','','',...) -- empty itemId/blockId), even though the exact same RPC and columns
// (p_item_id/p_block_id) already exist and are already used by Challenge/Edit to point at a real line in the
// swimmer's own published session. So Andy had no way to know WHICH line a swimmer actually reached when they
// finished early -- only a vague "Stopped early" dropdown value -- disconnected from the real session
// structure his board's own "End swimmer's session here" boundary tool (engines/athlete-session-bd.js) uses.
//
// Fix: the Finish modal now lists the swimmer's own real session lines (from the same published blocks/items
// sessionView() already renders) and, when one is picked, submits its REAL block_id/item_id -- the same ids
// the coach board's boundary picker understands -- plus a human-readable stoppedAtLabel for context.
//
// This drives the REAL swimmer-portal.js end to end through the same minimal DOM stub used by
// tests/swimmer-portal-session-picker-20260910.cjs, picking a specific line from the Finish modal and
// confirming the submitted action carries that line's real ids, and confirming the "everything, full session"
// default still submits with empty ids (unchanged behaviour for a normal completed session).
const assert=require('node:assert/strict');
const path=require('node:path');

function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|select|textarea|label|option)\b([^>]*)>/g;
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
global.localStorage=(()=>{const m=new Map();m.set('msos_swimmer_device_token_v1','dev-1');m.set('msos_swimmer_athlete_id_v1','ath-ruby');return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};})();
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{platform:'test',userAgent:'test'},configurable:true});
global.history={replaceState(){}};

const athlete={id:'ath-ruby',full_name:'Ruby Stace',squad:'Development'};
const sessionToday={id:'sess-today',date:'2026-09-10',slot:'AM',squad:'Development',course:'SCM',title:'Threshold AM',metres:800,delivery:'',zones:{},strokes:{},tags:{},finished:false,
  blocks:[{id:'b-main',label:'Main set',metres:800,items:[
    {id:'i-set1',label:'4x100 Threshold',metres:400,tags:[],target:null},
    {id:'i-set2',label:'4x100 Build',metres:400,tags:[],target:null},
  ]}]};

const submittedActions=[];
global.MCLAY_CONFIG={supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'};
global.fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body||'{}');
  if(url.includes('/rpc/msos_claim_swimmer_invite'))return{ok:true,text:async()=>JSON.stringify({device_token:'dev-1',athlete_id:athlete.id})};
  if(url.includes('/rpc/msos_swimmer_portal_snapshot'))return{ok:true,text:async()=>JSON.stringify({payload:{athlete,session:sessionToday,sessions:[sessionToday],performance:{course:'SCM',events:[]},training:{},tests:[],meet:[],sharedEvidence:[]}})};
  if(url.includes('/rpc/msos_swimmer_session_actions_snapshot'))return{ok:true,text:async()=>JSON.stringify([])};
  if(url.includes('/rpc/msos_swimmer_submit_session_action')){submittedActions.push(body);return{ok:true,text:async()=>JSON.stringify({ok:true})};}
  return{ok:true,text:async()=>'null'};
};

require(require('node:path').join(__dirname,'..','swimmer-portal.js'));

(async()=>{
  await new Promise(r=>setTimeout(r,20));

  const finishBtn=ROOT.querySelectorAll('[data-finish-session]')[0];
  assert.ok(finishBtn,'Finish action must be available on the session view');

  // --- Pick a specific line ("4x100 Build") from the Finish modal -------------------------------------------
  finishBtn.onclick();
  let modalNode=global.document.body._appended.at(-1);
  let stoppedAtSelect=modalNode.querySelectorAll('[name=stoppedAt]')[0];
  assert.ok(stoppedAtSelect,'the Finish modal must offer a "which line did you get to" picker built from the real published session');
  stoppedAtSelect.value='b-main::i-set2'; // real block_id::item_id pair, exactly as the code builds it
  let saveBtn=modalNode.querySelectorAll('[data-save]')[0];
  await saveBtn.onclick();

  assert.equal(submittedActions.length,1,'exactly one finish action must have been submitted');
  assert.equal(submittedActions[0].p_action_type,'finish');
  assert.equal(submittedActions[0].p_block_id,'b-main',`the real block_id must be submitted, got: ${JSON.stringify(submittedActions[0])}`);
  assert.equal(submittedActions[0].p_item_id,'i-set2',"the real item_id for the line the swimmer actually picked must be submitted, not left empty");
  assert.equal(submittedActions[0].p_payload.stoppedAtLabel,'Main set · 4x100 Build','a human-readable label for the picked line must accompany the ids');

  // --- Default ("everything, full session") must still submit with empty ids, unchanged -----------------------
  finishBtn.onclick();
  modalNode=global.document.body._appended.at(-1);
  saveBtn=modalNode.querySelectorAll('[data-save]')[0];
  await saveBtn.onclick();

  assert.equal(submittedActions.length,2);
  assert.equal(submittedActions[1].p_block_id,null,'the default "everything" choice must submit with no block_id, same as a normal completed session');
  assert.equal(submittedActions[1].p_item_id,null,'the default "everything" choice must submit with no item_id, same as a normal completed session');

  console.log('SWIMMER_FINISH_LINE_PICKER_PASS', JSON.stringify(submittedActions.map(a=>({block:a.p_block_id,item:a.p_item_id}))));
})().catch(err=>{console.error('SWIMMER_FINISH_LINE_PICKER_FAIL',err);process.exit(1);});
