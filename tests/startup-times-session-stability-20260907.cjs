const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'..','engines','startup-gate.js'),'utf8');

let resolveReady;const readyPromise=new Promise(r=>resolveReady=r);
let baseRenderCount=0,saveUiCount=0,networkPulls=0,applies=0,invalidates=0;
let idleCallbacks=[];
const listeners={};
const work=(id,identity)=>({id,identity,blocks:[{id:`${id}-b`,items:[{id:`${id}-i`,kind:'set',reps:1,distance:100}]}]});
const state={
  canonicalSessions:{
    sat:work('sat',{date:'2026-09-05',dayPart:'AM',start:'05:30'}),
    sunam:work('sunam',{date:'2026-09-06',dayPart:'AM',start:'07:00'}),
    sunpm:work('sunpm',{date:'2026-09-06',dayPart:'PM',start:'16:00'}),
    monam:work('monam',{date:'2026-09-07',dayPart:'AM',start:'05:30'}),
    emptyShell:{id:'emptyShell',identity:{date:'2026-09-07',dayPart:'PM',start:'12:00'},blocks:[]},
    mondayFuture:work('mondayFuture',{date:'2026-09-07',dayPart:'PM',start:'19:30'})
  },
  settings:{selectedSessionId:'sat',view:'board'},_evidenceBridge:{}
};
const board={innerHTML:''};
const document={
  hidden:false,readyState:'loading',
  querySelector(sel){return sel==='#boardView'?board:null;},
  addEventListener(name,fn){listeners[name]=fn;},
  removeEventListener(name,fn){if(listeners[name]===fn)delete listeners[name];}
};
const MSOS4={
  state,
  ui:{renderCurrent(){baseRenderCount++;}},
  storageEngine:{ready:false,readyPromise,saveUi(){saveUiCount++;}},
  cloud:{
    async pullEvidence(){networkPulls++;return{tables:{results_pb_board:[{id:'pb1'}]}};},
    applyEvidence(payload){applies++;state.lastApplied=payload;return state;}
  },
  nav:{activateView(){}},
  performanceEngine:{invalidate(){invalidates++;}},
  waPointsEngine:{invalidate(){invalidates++;}}
};
const context={
  MSOS4,
  MSOSEvidenceIndex:{invalidate(){invalidates++;}},
  MSOSEngines:{Coordinator:{clearCache(){invalidates++;}}},
  document,
  Intl,Date,Promise,console,
  requestAnimationFrame(fn){fn();},
  requestIdleCallback(fn){idleCallbacks.push(fn);return idleCallbacks.length;},
  cancelIdleCallback(){},
  setTimeout,clearTimeout
};
context.globalThis=context;
vm.runInNewContext(source,context,{filename:'startup-gate.js'});
const G=MSOS4.startupGate;
assert(G,'startup gate missing');
assert.strictEqual(G.sessionStartKey(state.canonicalSessions.sunpm),'2026-09-06T16:00');
assert.strictEqual(G.latestStartedSession('2026-09-07T18:00').id,'monam','latest worked Monday AM session should win while an empty shell and later Monday PM are excluded');
assert.strictEqual(G.hasWorkout(state.canonicalSessions.emptyShell),false,'empty canonical shell must not become startup session');
assert.strictEqual(G.latestStartedSession('2026-09-06T12:00').id,'sunam','latest already-started session should win');

(async()=>{
  const bootPayload=await MSOS4.cloud.pullEvidence();
  assert.strictEqual(bootPayload.deferredByStartupGate,true);
  assert.strictEqual(networkPulls,0,'startup evidence pull hit network');
  assert.strictEqual(applies,0,'startup evidence placeholder was applied by the gate');

  MSOS4.storageEngine.ready=true;resolveReady();await Promise.resolve();await Promise.resolve();
  G.selectLatestStarted('2026-09-07T18:00');
  assert.strictEqual(state.settings.selectedSessionId,'monam');
  assert(saveUiCount>0,'startup selection was not persisted to UI state');

  state.settings.selectedSessionId='sat';
  MSOS4.ui.renderCurrent();
  assert.strictEqual(state.settings.selectedSessionId,'sat','ordinary render changed explicit session selection');
  const rendersBeforeDeferred=baseRenderCount;
  await G.runDeferredEvidenceNow();
  assert.strictEqual(networkPulls,1,'deferred evidence pull did not run exactly once');
  assert.strictEqual(applies,1,'deferred evidence was not applied exactly once');
  assert.strictEqual(state.settings.selectedSessionId,'sat','background evidence changed explicit session selection');
  assert.strictEqual(baseRenderCount,rendersBeforeDeferred,'deferred evidence refresh forced an operational rerender');
  assert(state._evidenceBridge.contentRevision===1,'evidence cache revision was not advanced');
  assert(invalidates>=3,'evidence/performance caches were not invalidated');

  await MSOS4.cloud.pullEvidence();
  assert.strictEqual(networkPulls,2,'later explicit evidence pull remained blocked');
  console.log('startup stability contract PASS');
})().catch(e=>{console.error(e);process.exit(1);});
