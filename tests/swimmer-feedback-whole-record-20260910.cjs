'use strict';
// Real coaching failure this pins: the coach-facing "Swimmer Feedback" panel (engines/swimmer-feedback-cu.js)
// used to call M.swimmerInviteBN.sessionActionsFor(ath, currentSessionId()) -- scoping visible feedback to
// ONLY whatever session Andy currently has open on HIS OWN device. Now that swimmers can pick any of their
// calendar sessions (the session-picker feature) and submit Challenge/Edit/Finish feedback against ANY of
// them, a swimmer's feedback tied to a different day than whatever Andy happened to have open would silently
// never appear here at all -- directly breaking Andy's own framing that feedback must "carry to his record".
//
// This test proves: with the coach currently viewing sess-a on his device, feedback the athlete submitted
// against BOTH sess-a and sess-b still renders (whole-record fetch, not scoped to the current session), each
// row is labelled with which session it belongs to (so Andy can tell them apart), unreviewed rows are counted
// in an "unseen" badge, and rows are ordered most-recent-first.
const assert=require('node:assert/strict');
const path=require('node:path');

function parseFragment(html){
  const nodes=[];
  const re=/<(button|div|p|small|article|section)\b([^>]*)>/g;
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
    tagName:tag,className:'',dataset:{},style:{},textContent:'',isConnected:false,
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

const SESSION_A={identity:{date:'2026-09-10',dayPart:'AM',title:'Threshold AM'}};
const SESSION_B={identity:{date:'2026-09-11',dayPart:'PM',title:'IM PM'}};
const ROWS=[
  {id:'act-1',action_type:'finish',session_id:'sess-a',payload:{completion:'Completed as planned',rpe:6},created_at:'2026-09-10T07:30:00Z',acknowledged_at:'2026-09-10T08:00:00Z'},
  {id:'act-2',action_type:'challenge',session_id:'sess-b',payload:{reason:'Too easy'},created_at:'2026-09-11T18:15:00Z',acknowledged_at:null},
  {id:'act-3',action_type:'edit_request',session_id:'sess-b',payload:{change:'Swapped fly for free'},created_at:'2026-09-11T17:00:00Z',acknowledged_at:null},
];

global.MSOS4={
  state:{
    settings:{selectedAthleteId:'ath-ruby',loopAthleteTab:'training',view:'athletes'},
    athletes:[{id:'ath-ruby',full_name:'Ruby Stace'}],
    canonicalSessions:{'sess-a':SESSION_A,'sess-b':SESSION_B},
  },
  util:{},
  currentSession:()=>({id:'sess-a',...SESSION_A}), // coach currently has SESS-A open on his own device
  swimmerInviteBN:{
    sessionActionsFor:async(a,sessionId)=>{
      // Pin the actual bug: the real fix must call this with NO session id (whole-record fetch). If the
      // caller ever regresses to passing a session id, only that one session's rows should come back --
      // simulate the server-side filter so a caller-side regression would be caught by a wrong result set.
      if(sessionId)return ROWS.filter(r=>r.session_id===sessionId);
      return ROWS;
    },
    acknowledgeSessionAction:async()=>({ok:true}),
  },
};

require(path.join(__dirname,'..','engines','swimmer-feedback-cu.js'));

(async()=>{
  // install() schedules render() via setTimeout(0) since view==='athletes' && loopAthleteTab==='training'.
  await new Promise(r=>setTimeout(r,20));

  const box=panel._appended.find(n=>n.dataset.cuFeedback==='1');
  assert.ok(box,'the feedback panel must render into the live [data-cn-panel] on the athlete training tab');

  const html=box.innerHTML;
  assert.match(html,/Threshold AM/,"feedback tied to sess-a (the coach's currently-open session) must appear");
  assert.match(html,/IM PM/,"feedback tied to sess-b (a DIFFERENT session than the coach currently has open) must also appear -- this is the whole-record fix");

  // Each row must show which session it belongs to, not just a bare timestamp -- otherwise Andy has no way to
  // tell apart two rows from two different days once feedback can span multiple sessions.
  assert.match(html,/2026-09-10 · AM · Threshold AM/,"the sess-a row must be labelled with its own session");
  assert.match(html,/2026-09-11 · PM · IM PM/,"the sess-b rows must be labelled with their own session");

  // Unseen badge: 2 of the 3 rows are unacknowledged.
  assert.match(html,/SWIMMER FEEDBACK · 2 new/,'the eyebrow must show a count of unreviewed feedback');

  // Most-recent-first ordering: act-2 (17:00 the next day... actually 18:15) then act-3 (17:00) then act-1 (earliest).
  const posChallenge=html.indexOf('Challenge'),posEdit=html.indexOf('Edit request'),posFinish=html.indexOf('Session finish');
  assert.ok(posChallenge>-1&&posEdit>-1&&posFinish>-1,'all three feedback rows must render');
  assert.ok(posChallenge<posEdit&&posEdit<posFinish,'rows must render most-recent-first');

  console.log('SWIMMER_FEEDBACK_WHOLE_RECORD_PASS');
})().catch(err=>{console.error('SWIMMER_FEEDBACK_WHOLE_RECORD_FAIL',err);process.exit(1);});
