'use strict';
// Real coaching failure this pins: Andy's own spec, point 1 -- a swimmer needs to be able to select any of
// their own sessions from Andy's calendar, not just whatever single session was published when the QR was
// generated. swimmer-portal.js (the actual swimmer-facing page) previously had no concept of more than one
// session at all: `session()` was hardcoded to `pld().session`, a single frozen object, and every action
// (Finish, Challenge, Edit) submitted against it.
//
// Fix: the coach now publishes payload.sessions (a real list, engines/swimmer-invite-bn.js's sessionsFor),
// and swimmer-portal.js adds a picker so the swimmer can switch which one they're looking at -- each with its
// own targets/blocks, and Finish/Challenge/Edit correctly following whichever one is currently selected.
//
// This drives the REAL swimmer-portal.js file end to end through a minimal DOM stub (no jsdom in this
// project -- see tests/swimmer-generate-qr-overall-timeout-20260910.cjs for the same technique), picking a
// second session from the rendered picker and confirming the page actually switches to it: different blocks
// rendered, and a subsequent Finish action submitted against the NEWLY selected session's id, not the
// original one.
const assert=require('node:assert/strict');
const path=require('node:path');

// --- minimal DOM: enough real element/attribute behaviour to drive swimmer-portal.js's actual render+click
// cycle, without a full HTML parser. Unlike the swimmer-invite-bn.js harness (which only ever needs stable
// handles to a handful of known selectors), this page re-renders its whole root on every draw() and queries
// with querySelectorAll across many dynamically-created buttons, so this stub does a real (if small) parse of
// the tags the page actually emits: button/nav/section/div with data-* attributes and text content.
function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|select|textarea|label)\b([^>]*)>/g;
  let m;
  while((m=re.exec(html))){
    const attrs={};
    const attrRe=/([\w-]+)(?:="([^"]*)")?/g;
    let am;
    while((am=attrRe.exec(m[2]))){if(am[1]!=='class'||true)attrs[am[1]]=am[2]??'';}
    nodes.push({tag:m[1],attrs,raw:m[0]});
  }
  return nodes;
}
function makeNode(tag){
  const node={
    tagName:tag,className:'',dataset:{},style:{},textContent:'',value:'',hidden:false,disabled:false,onclick:null,
    _appended:[],_html:'',_parsed:[],_nodeCache:{},
    // Each fresh render (innerHTML set) invalidates the node cache -- new content means new elements, exactly
    // like a real DOM replacing its children. WITHIN one render, repeated querySelectorAll calls must return
    // the SAME element objects (keyed by their exact raw opening tag, which is unique per distinct data-*
    // value here) so that onclick handlers the page assigns via one querySelectorAll survive being looked up
    // again later by the test -- otherwise every call would hand back a disposable lookalike with no handler.
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
  blocks:[{id:'b-today',label:'Main',metres:800,items:[{id:'i-today-1',label:'8x100 Threshold',metres:800,tags:[],target:null}]}]};
const sessionTomorrow={id:'sess-tomorrow',date:'2026-09-11',slot:'PM',squad:'Development',course:'SCM',title:'IM PM',metres:1200,delivery:'',zones:{},strokes:{},tags:{},finished:false,
  blocks:[{id:'b-tmrw',label:'Main',metres:1200,items:[{id:'i-tmrw-1',label:'6x200 IM',metres:1200,tags:[],target:null}]}]};

const submittedActions=[];
global.MCLAY_CONFIG={supabaseUrl:'https://example.test',supabaseAnonKey:'anon-key'};
global.fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body||'{}');
  if(url.includes('/rpc/msos_claim_swimmer_invite'))return{ok:true,text:async()=>JSON.stringify({device_token:'dev-1',athlete_id:athlete.id})};
  if(url.includes('/rpc/msos_swimmer_portal_snapshot'))return{ok:true,text:async()=>JSON.stringify({payload:{athlete,session:sessionToday,sessions:[sessionToday,sessionTomorrow],performance:{course:'SCM',events:[]},training:{},tests:[],meet:[],sharedEvidence:[]}})};
  if(url.includes('/rpc/msos_swimmer_session_actions_snapshot'))return{ok:true,text:async()=>JSON.stringify([])};
  if(url.includes('/rpc/msos_swimmer_submit_session_action')){submittedActions.push(body);return{ok:true,text:async()=>JSON.stringify({ok:true})};}
  return{ok:true,text:async()=>'null'};
};

require(require('node:path').join(__dirname,'..','swimmer-portal.js'));

(async()=>{
  // start() is async and self-invoked at module load; give it a tick to finish its RPC chain and first draw.
  await new Promise(r=>setTimeout(r,20));

  const picker=ROOT.querySelectorAll('[data-pick-session]');
  assert.equal(picker.length,2,`the picker must render one button per calendar session, got ${picker.length}`);

  // Default view must be today's session -- its own block must be on screen, tomorrow's must not.
  assert.match(ROOT.innerHTML,/8x100 Threshold/,"the default session view must show today's own set");
  assert.doesNotMatch(ROOT.innerHTML,/6x200 IM/,"tomorrow's set must not appear until the swimmer picks it");

  // Pick tomorrow's session from the picker.
  const tomorrowBtn=picker.find(b=>b.dataset.pickSession==='sess-tomorrow');
  assert.ok(tomorrowBtn,'tomorrow\'s session must be one of the picker buttons');
  await tomorrowBtn.onclick();

  assert.match(ROOT.innerHTML,/6x200 IM/,'after picking tomorrow, its own set must now be on screen');
  assert.doesNotMatch(ROOT.innerHTML,/8x100 Threshold/,"switching sessions must replace the view, not just add to it");

  // Finishing a session now must submit against the SELECTED session (tomorrow), not the original default.
  const finishBtn=ROOT.querySelectorAll('[data-finish-session]')[0];
  assert.ok(finishBtn,'Finish action must still be available on the newly selected session');
  // finishSession() opens a modal via document.body.append -- drive it the same way the real UI would: find
  // the save handler MSOS attached to the modal's [data-save] button and invoke it directly.
  finishBtn.onclick();
  const modalNode=global.document.body._appended.at(-1);
  const saveBtn=modalNode.querySelectorAll('[data-save]')[0];
  await saveBtn.onclick();

  assert.equal(submittedActions.length,1,'exactly one finish action must have been submitted');
  assert.equal(submittedActions[0].p_session_id,'sess-tomorrow',`the finish action must target the SELECTED session (tomorrow), not the original default one, got: ${JSON.stringify(submittedActions[0])}`);

  console.log('SWIMMER_PORTAL_SESSION_PICKER_PASS', `${picker.length} sessions in picker · finish submitted against ${submittedActions[0].p_session_id}`);
})().catch(err=>{console.error('SWIMMER_PORTAL_SESSION_PICKER_FAIL',err);process.exit(1);});
