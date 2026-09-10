'use strict';
// Real coaching failure this pins (architecture/RUNTIME_AUDIT_20260909.md §5): the Finish-review modal's four
// textareas called C.saveFinishDraft directly on every keystroke -- which calls the shared M.store.save, a
// full-app-state serialize plus IndexedDB write, itself only debounced 40ms by engines/storage.js's
// scheduleFull. That 40ms window is far shorter than real typing cadence, so in practice it fires on nearly
// every character rather than coalescing -- reported live as typing latency in Finish review.
//
// The fix is deliberately LOCAL to the Finish-review modal (v4-correct.js's C.openFinishReview), not a change
// to the shared 40ms debounce in engines/storage.js: that 40ms window exists so an urgent write (attendance, a
// capture) survives an abrupt phone background/close, and widening it globally would trade this bug for a worse
// one (lost coaching data). Instead, keystrokes now schedule a save 400ms after the coach pauses typing, while
// closing or confirming the modal still flushes the latest text immediately (no debounce on exit paths).
//
// v4-correct.js is DOM-heavy (builds the modal via host.innerHTML) with no jsdom available in this environment
// (house convention -- see tests/modified-target-authority-20260909.cjs). This test fully loads the real
// app.js + v4-correct.js against a small stateful fake DOM (a selector registry, so the same fake textarea/
// button nodes are returned consistently across calls, unlike a fresh-node-per-call stub) so it can actually
// open the real Finish-review modal, fire real 'input' events, and observe how many times the real
// M.store.save is actually invoked -- a genuine behavioral proof, not a source-text paraphrase.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');

function makeNode(overrides={}){
  const node={
    textContent:'',innerHTML:'',disabled:false,hidden:false,value:'',
    dataset:{},
    style:{setProperty(){},getPropertyValue:()=>''},
    classList:{toggle(){},add(){},remove(){},contains:()=>false},
    onclick:null,
    _listeners:{},
    addEventListener(evt,fn){(node._listeners[evt]=node._listeners[evt]||[]).push(fn)},
    removeEventListener(){},
    dispatch(evt){(node._listeners[evt]||[]).forEach(fn=>fn({target:node}));if(evt==='click'&&typeof node.onclick==='function')node.onclick({target:node})},
    querySelector(sel){return registry.get(sel)||makeNode()},
    querySelectorAll(sel){return registry.get(sel+'[]')||[]},
    getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),
    closest:()=>null,remove(){},appendChild(){},insertAdjacentHTML(){},
    ...overrides,
  };
  return node;
}

// A selector registry lets the fake DOM return the SAME node instance across repeated querySelector calls --
// required for a stateful modal (fire an 'input' event on a node fetched earlier, then read its value back via
// a later querySelector call, and have them be the same object).
const registry=new Map();
const modalHost=makeNode();
const modalNode=makeNode();
const wellField=makeNode({value:''});
const reinforceField=makeNode({value:''});
const athletesField=makeNode({value:''});
const carryField=makeNode({value:''});
const closeBtn=makeNode();
const confirmBtn=makeNode();
registry.set('#modalHost',modalHost);
registry.set('.modal',modalNode);
registry.set('#v4FinishWell',wellField);
registry.set('#v4FinishReinforce',reinforceField);
registry.set('#v4FinishAthletes',athletesField);
registry.set('#v4FinishCarry',carryField);
registry.set('textarea[]',[wellField,reinforceField,athletesField,carryField]);
registry.set('[data-close-v4-finish]',closeBtn);
registry.set('[data-v4-finish-confirm]',confirmBtn);
modalHost.querySelector=sel=>sel==='.modal'?modalNode:makeNode();

const bodyNode=makeNode();
global.document={querySelector:sel=>registry.get(sel)||makeNode(),querySelectorAll:()=>[],addEventListener(){},body:bodyNode,documentElement:makeNode(),createElement:()=>makeNode(),readyState:'complete'};
global.window=global;
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
if(!global.navigator)Object.defineProperty(global,'navigator',{value:{},configurable:true});
global.history={state:null,pushState(state){global.history.state=state},replaceState(state){global.history.state=state},back(){}};
global.location={hash:''};
global.MSOS4={};
require(path.join(root,'app.js'));
require(path.join(root,'v4-correct.js'));
const M=global.MSOS4;
M.ensureState();

// Build one real session with one block so openFinishReview has something to operate on.
const session={id:'sess-1',identity:{title:'Thursday AM',date:'2026-09-09',dayPart:'AM'},blocks:[{id:'blk-1',title:'Main set',type:'main_set',items:[{id:'it-1',kind:'set',reps:1,distance:400}]}],changes:[],finish:null,metadata:{},updatedAt:M.util.now()};
M.state.canonicalSessions=M.state.canonicalSessions||{};
M.state.canonicalSessions[session.id]=session;
M.state.settings.selectedSessionId=session.id;
M.state.attendance=[];
M.access.setRole?.('owner');

let saveCalls=0;
const origSave=M.store.save;
M.store.save=state=>{saveCalls++;if(process.env.DEBUG_SAVE_TRACE)console.trace('save call #'+saveCalls);return origSave(state)};

M.correct.openFinishReview('blk-1');
assert.equal(typeof modalHost.innerHTML,'string','openFinishReview must render the Finish-review modal into #modalHost');

// Fixture sanity: opening the modal itself must not have triggered any draft save yet.
assert.equal(saveCalls,0,'fixture sanity: opening Finish review must not itself trigger a state save');

// THE FIX: five rapid keystrokes (each recreating the whole textarea's value, as a real typing burst would)
// must NOT each trigger their own full-state save -- only one save should fire, and only after the debounce
// window elapses (or the modal is closed/finished).
async function wait(ms){return new Promise(r=>setTimeout(r,ms))}

(async()=>{
  wellField.value='W';wellField.dispatch('input');
  await wait(30);
  wellField.value='We';wellField.dispatch('input');
  await wait(30);
  wellField.value='Wen';wellField.dispatch('input');
  await wait(30);
  wellField.value='Went';wellField.dispatch('input');
  await wait(30);
  wellField.value='Went well';wellField.dispatch('input');
  assert.equal(saveCalls,0,`five keystrokes within a normal typing burst (each well inside the debounce window) must not have triggered any save yet -- got ${saveCalls}`);

  await wait(500); // past the 400ms debounce
  assert.equal(saveCalls,1,`after the coach pauses typing, exactly one debounced save must fire (coalescing the whole burst), not one per keystroke -- got ${saveCalls}`);
  assert.equal(M.state.settings.finishDrafts?.[session.id]?.wentWell,'Went well','the coalesced save must still capture the LATEST typed text, not an early/stale keystroke');

  // Typing again, then closing immediately (well inside the debounce window) must flush the latest text right
  // away, not lose it or wait another 400ms.
  saveCalls=0;
  reinforceField.value='Keep pace form';reinforceField.dispatch('input');
  assert.equal(saveCalls,0,'a fresh keystroke must not save immediately -- it should still be debounced up to the point of an explicit close/finish');
  closeBtn.dispatch('click');
  // 2, not 1: flushDraftSave() fires one save, and M.actions.closeModal()'s own nav-layer bookkeeping
  // (M.nav.dismissLayer) fires a second, unrelated save -- both legitimate, pre-existing, immediate writes; the
  // point of this assertion is that NEITHER is a leftover/duplicate debounced draft save (which would make this
  // 3, or make it fire again ~400ms later).
  assert.equal(saveCalls,2,`closing the modal must flush the pending debounced draft save immediately (plus the unrelated, pre-existing nav-layer save closeModal always does) -- got ${saveCalls}`);
  assert.equal(M.state.settings.finishDrafts?.[session.id]?.reinforce,'Keep pace form','closing must save the exact text on screen at close time');
  await wait(500);
  assert.equal(saveCalls,2,'no further save may fire later from a leftover debounce timer that flushDraftSave should already have cleared');

  console.log('FINISH_REVIEW_TYPING_DEBOUNCE_PASS');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
