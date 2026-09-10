'use strict';
// Real coaching failure this pins: the other half of build-list item 7. Once a swimmer's finish action carries
// the real block_id/item_id for the line they actually reached (tests/swimmer-finish-line-picker-20260910.cjs),
// Andy still had no way to turn that into an actual training-record boundary except re-reading the note and
// re-finding the same line by hand on the board's own "End swimmer's session here" picker
// (engines/athlete-session-bd.js's endAtItem) -- the report and the real boundary tool were disconnected.
//
// Fix: engines/swimmer-feedback-cu.js's feedback row now offers an "Apply as session boundary" button for any
// finish action that carries a real item_id, which calls the exact same endAtItem(session, athleteId, itemId)
// the board itself uses -- so accepting a swimmer's report actually truncates their training record at that
// line, in one tap, instead of just leaving a note attached.
//
// This drives the real render()/applyBoundary() functions with a stubbed M.athleteSessionBE (asserting it is
// called with the correct real session object, athlete id and item id -- not re-implementing endAtItem itself,
// which already has its own coverage in engines/release-guardian-bd.js), and confirms the button is offered
// only when a real item_id is present (never for a "completed everything" finish, and never for
// challenge/edit_request rows, which are not session-ending actions at all).
const assert=require('node:assert/strict');
const path=require('node:path');

function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|article|section)\b([^>]*)>/g;
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
    tagName:tag,className:'',dataset:{},style:{},textContent:'',isConnected:false,disabled:false,onclick:null,
    _appended:[],_html:'',_parsed:[],_nodeCache:{},_removed:false,
    set innerHTML(v){this._html=v;this._parsed=parseFragment(v);this._nodeCache={};},
    get innerHTML(){return this._html},
    append(...k){this._appended.push(...k);for(const c of k)c.isConnected=true;},
    appendChild(k){this._appended.push(k);k.isConnected=true;return k;},
    remove(){this._removed=true;this.isConnected=false;},
    addEventListener(){},removeEventListener(){},
    closest:()=>null,
    querySelectorAll(sel){
      const m=/^\[([\w-]+)(?:=([\w-]+))?\]$/.exec(sel);
      if(!m)return[];
      const attr=m[1],val=m[2];
      return this._parsed.filter(p=>attr in p.attrs&&(val===undefined||p.attrs[attr]===val)).map(p=>{
        if(this._nodeCache[p.raw])return this._nodeCache[p.raw];
        const b=makeNode(p.tag);
        for(const [k,v] of Object.entries(p.attrs)){
          if(k.startsWith('data-')){const camel=k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());b.dataset[camel]=v;}
        }
        this._nodeCache[p.raw]=b;
        return b;
      });
    },
    querySelector(sel){return this.querySelectorAll(sel)[0]||null;},
  };
  return node;
}

const athletesRoot=makeNode('div');
const panel=makeNode('div');
global.document={
  querySelector(sel){
    if(sel==='#athletesView')return athletesRoot;
    if(sel==='#athletesView [data-cn-panel]')return panel;
    return null;
  },
  createElement:tag=>makeNode(tag),
  head:makeNode('head'),
  readyState:'complete',
  addEventListener(){},
};
global.window=global;
global.MutationObserver=class{observe(){}disconnect(){}};

const SESSION_TODAY={identity:{date:'2026-09-10',dayPart:'AM',title:'Threshold AM'}};
// Finish, with a real reached line -- must offer "Apply as session boundary".
const rowWithLine={id:'act-1',action_type:'finish',session_id:'sess-today',item_id:'i-set2',block_id:'b-main',
  payload:{stoppedAtLabel:'Main set · 4x100 Build',completion:'Stopped early',rpe:7},created_at:'2026-09-10T07:45:00Z',acknowledged_at:null};
// Finish, "everything" (no item_id) -- must NOT offer the button, nothing to apply.
const rowEverything={id:'act-2',action_type:'finish',session_id:'sess-today',item_id:null,block_id:null,
  payload:{completion:'Completed as planned'},created_at:'2026-09-10T07:30:00Z',acknowledged_at:null};
// A challenge -- never a boundary action regardless of any stray item_id.
const rowChallenge={id:'act-3',action_type:'challenge',session_id:'sess-today',item_id:'i-set1',block_id:'b-main',
  payload:{reason:'Too easy'},created_at:'2026-09-10T07:00:00Z',acknowledged_at:null};

const endAtItemCalls=[];
let renderCount=0;
global.MSOS4={
  state:{
    settings:{selectedAthleteId:'ath-ruby',loopAthleteTab:'training',view:'athletes'},
    athletes:[{id:'ath-ruby',full_name:'Ruby Stace'}],
    canonicalSessions:{'sess-today':SESSION_TODAY},
  },
  ui:{renderCurrent:()=>{renderCount++;}},
  util:{},
  toast:()=>{},
  currentSession:()=>({id:'sess-today',...SESSION_TODAY}),
  athleteSessionBE:{endAtItem:(session,athleteId,itemId)=>{endAtItemCalls.push({session,athleteId,itemId});}},
  swimmerInviteBN:{
    sessionActionsFor:async()=>[rowWithLine,rowEverything,rowChallenge],
    acknowledgeSessionAction:async()=>({ok:true}),
  },
};

require(path.join(__dirname,'..','engines','swimmer-feedback-cu.js'));

(async()=>{
  await new Promise(r=>setTimeout(r,20));

  const box=panel._appended.find(n=>n.dataset.cuFeedback==='1');
  assert.ok(box,'the feedback panel must render');

  const applyButtons=box.querySelectorAll('[data-cu-apply-boundary]');
  assert.equal(applyButtons.length,1,`exactly one row (the finish with a real reached line) must offer "Apply as session boundary", got ${applyButtons.length}`);
  assert.equal(applyButtons[0].dataset.cuApplyBoundary,'act-1','the offered button must belong to the finish action that actually carries a real item_id');

  await applyButtons[0].onclick();

  assert.equal(endAtItemCalls.length,1,'clicking Apply must call the real board boundary function exactly once');
  assert.equal(endAtItemCalls[0].session,SESSION_TODAY,'it must apply the boundary against the REAL canonical session object, not a stub');
  assert.equal(endAtItemCalls[0].athleteId,'ath-ruby','it must apply the boundary for the correct swimmer');
  assert.equal(endAtItemCalls[0].itemId,'i-set2',"it must apply the boundary at the swimmer's own reported line, not a different one");
  assert.ok(renderCount>=1,'the coach UI must re-render after the boundary is applied, so the board reflects the truncated record immediately');

  console.log('SWIMMER_FEEDBACK_APPLY_BOUNDARY_PASS');
})().catch(err=>{console.error('SWIMMER_FEEDBACK_APPLY_BOUNDARY_FAIL',err);process.exit(1);});
