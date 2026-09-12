'use strict';
// Regression coverage for three roster-hygiene fixes Andy asked for after reviewing his real live
// roster (12 Sept 2026):
//
// 1. engines/stability-identity-bh.js's placeholder-athlete purge only ever matched "Swimmer <x>" --
//    but app.js's own embedded guardian tests also use synthetic fixture names like "Meet A"/"Meet B",
//    which can leak into real persisted roster storage via the exact same mutate-then-restore-in-a-
//    finally-block mechanism that caused the original "Swimmer A/B" contamination this purge exists to
//    fix (see M.state.guardian.fieldIncidents). Andy reported seeing exactly this ("swim meet a, swim
//    meet b") on his real roster.
// 2. engines/data-registry.js's swimmers importer used to default a missing `active` column to `true`
//    on every row, which meant re-importing a swimmers CSV with no active/inactive column silently
//    reactivated every previously-deactivated athlete (including one who left the squad).
// 3. v4-correct.js's C.enforceRoster used to hardcode a specific athlete's name (Sophie Newlove) and
//    re-force her active:false on every single state load/render forever, with no way to reactivate her
//    without editing code. It's now a one-time migration (C.migrateLegacyDeactivations) -- she becomes a
//    normal active:false record, editable like any other athlete, not a permanent code-level rule.
//
// Each test proves the ACTUAL bug (via a scratch copy reproducing the old, pre-fix behaviour) fails,
// and the real, currently-shipped file passes.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const SCRATCH_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'msos-task66-68-'));

function loadInSandbox(filePath,extraGlobals={}){
  const code=fs.readFileSync(filePath,'utf8');
  const sandbox={console,require,module:{exports:{}},...extraGlobals};
  sandbox.global=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{filename:filePath});
  return sandbox;
}

// ---------- Test 1: placeholder purge must catch "Meet A"/"Meet B", not just "Swimmer <x>" ----------
function runPurgeTest(bhSourcePath){
  const M={state:{athletes:[
    {id:'ma',full_name:'Meet A',active:true},
    {id:'mb',full_name:'Meet B',active:true},
    {id:'real',full_name:'Charlotte Murphy',active:true},
  ],attendance:[],adaptationProfiles:[],adaptationOverrides:[],trainingTestResults:[],coachResults:[],athleteAchievements:[],timedSets:[],captures:[],settings:{}},access:{}};
  loadInSandbox(bhSourcePath,{MSOS4:M});
  return M;
}

function testMeetPlaceholderPurge_failBeforePassAfter(){
  // Buggy version: the ORIGINAL placeholderName, matching only "Swimmer <x>" -- reproduces the exact
  // gap this fix closes, not a paraphrase of it.
  const buggySrc=fs.readFileSync(path.join(root,'engines/stability-identity-bh.js'),'utf8')
    .replace(
      /const EXACT_PLACEHOLDER_NAMES=[\s\S]*?const placeholderName=name=>\{[\s\S]*?\};/,
      "const placeholderName=name=>/^swimmer\\s+[a-z0-9]+$/i.test(String(name||'').replace(/\\s+/g,' ').trim());"
    );
  assert.ok(!buggySrc.includes('EXACT_PLACEHOLDER_NAMES'),'sanity: buggy scratch copy must not contain the widened matcher');
  const buggyPath=path.join(SCRATCH_DIR,'stability-identity-bh.buggy.js');
  fs.writeFileSync(buggyPath,buggySrc);

  const buggyM=runPurgeTest(buggyPath);
  assert.equal(buggyM.state.athletes.length,3,'BEFORE fix: old "Swimmer <x>"-only matcher must fail to catch "Meet A"/"Meet B" -- reproducing the real gap');
  assert.ok(buggyM.state.athletes.some(a=>a.full_name==='Meet A'),'BEFORE fix: "Meet A" must still be present (bug reproduced)');

  const realM=runPurgeTest(path.join(root,'engines/stability-identity-bh.js'));
  assert.equal(realM.state.athletes.length,1,`AFTER fix: real file must purge both "Meet A" and "Meet B" -- got ${realM.state.athletes.map(a=>a.full_name).join(', ')}`);
  assert.equal(realM.state.athletes[0].full_name,'Charlotte Murphy','AFTER fix: a real athlete name must never be touched by the widened purge');
  console.log('MEET_PLACEHOLDER_PURGE_PASS');
}

// ---------- Test 2: swimmers import must not reactivate an athlete when the source row has no `active` column ----------
function runImportPreservesActive(registrySourcePath){
  const U={
    stableId:(...parts)=>`id-${parts.filter(Boolean).join('-')}`,
    text:v=>String(v??'').replace(/\s+/g,' ').trim(),
  };
  const M={util:U,state:{athletes:[{id:'id-athlete-Departed Swimmer',full_name:'Departed Swimmer',squad:'National',active:false}]},dataRegistry:null};
  loadInSandbox(registrySourcePath,{MSOS4:M});
  const D=M.dataRegistry;
  assert.ok(D,'sandbox sanity: engines/data-registry.js must attach M.dataRegistry');
  // A raw swimmers row with NO active/inactive column at all -- e.g. Andy's own external roster
  // spreadsheet, re-imported to correct the squad, that has never had an active column.
  const row=D.normalizeRow('swimmers',{full_name:'Departed Swimmer',squad:'Intermediate'},{});
  return row;
}

function testImportDoesNotReactivate_failBeforePassAfter(){
  const registrySrc=fs.readFileSync(path.join(root,'engines/data-registry.js'),'utf8');
  const buggySrc=registrySrc.replace(
    "if(type==='swimmers')return{...base,id:base.id||base.athlete_id||U.stableId?.('athlete',alias(r,'full_name','athlete_name','swimmer_name','name')),full_name:alias(r,'full_name','athlete_name','swimmer_name','name'),squad:alias(r,'squad','group','team'),sex:alias(r,'sex','gender'),date_of_birth:alias(r,'date_of_birth','dob','birth_date'),classification:alias(r,'classification','para_classification')};",
    "if(type==='swimmers')return{...base,id:base.id||base.athlete_id||U.stableId?.('athlete',alias(r,'full_name','athlete_name','swimmer_name','name')),full_name:alias(r,'full_name','athlete_name','swimmer_name','name'),squad:alias(r,'squad','group','team'),sex:alias(r,'sex','gender'),date_of_birth:alias(r,'date_of_birth','dob','birth_date'),classification:alias(r,'classification','para_classification'),active:base.active===undefined?true:base.active};"
  );
  assert.notEqual(buggySrc,registrySrc,'sanity: scratch replace must have actually restored the old always-default-true behaviour');
  const buggyPath=path.join(SCRATCH_DIR,'data-registry.buggy.js');
  fs.writeFileSync(buggyPath,buggySrc);

  const buggyRow=runImportPreservesActive(buggyPath);
  assert.equal(buggyRow.active,true,'BEFORE fix: old code must silently default the normalised row to active:true even with no source active column -- reproducing the real bug');

  const realRow=runImportPreservesActive(path.join(root,'engines/data-registry.js'));
  assert.equal(realRow.active,undefined,'AFTER fix: normalized row must carry no active field at all when the source row has none, so upsert leaves the existing athlete\'s active flag untouched');
  console.log('IMPORT_PRESERVES_ACTIVE_PASS');

  // Full-circle check: run the real normalizeRow() output for the re-import through the SAME merge
  // strategy data-registry.js's own (private, unexported) upsert() uses -- `{...old,...incoming}`, keyed
  // by id -- to prove the fix survives an actual merge against existing state, not just in isolation.
  const mergeLikeUpsert=(existing,incoming)=>{const map=new Map();for(const r of existing)map.set(r.id,r);for(const r of incoming){const old=map.get(r.id);map.set(r.id,old?{...old,...r}:r);}return[...map.values()];};
  const existingAthletes=[{id:'id-athlete-Departed Swimmer',full_name:'Departed Swimmer',squad:'National',active:false}];
  const merged=mergeLikeUpsert(existingAthletes,[realRow])[0];
  assert.equal(merged.squad,'Intermediate','the squad correction from the new import must still apply');
  assert.equal(merged.active,false,'AFTER fix: re-importing to fix the squad must NOT silently reactivate a departed swimmer');
  console.log('IMPORT_UPSERT_PRESERVES_ACTIVE_PASS');
}

// ---------- Test 3: the Sophie rule must be a one-time migration, not a forever-recurring one ----------
function makeNode(overrides={}){
  const node={textContent:'',innerHTML:'',disabled:false,hidden:false,value:'',dataset:{},style:{setProperty(){},getPropertyValue:()=>''},classList:{toggle(){},add(){},remove(){},contains:()=>false},onclick:null,_listeners:{},addEventListener(evt,fn){(node._listeners[evt]=node._listeners[evt]||[]).push(fn)},removeEventListener(){},dispatch(evt){(node._listeners[evt]||[]).forEach(fn=>fn({target:node}));if(evt==='click'&&typeof node.onclick==='function')node.onclick({target:node})},querySelector:()=>makeNode(),querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0,left:0,width:0,height:0}),closest:()=>null,remove(){},appendChild(){},insertAdjacentHTML(){},...overrides};
  return node;
}
function freshBrowserGlobals(seedState){
  const store={[  'mclay_swimming_os_v4']:JSON.stringify(seedState)};
  global.document={querySelector:()=>makeNode(),querySelectorAll:()=>[],addEventListener(){},body:makeNode(),documentElement:makeNode(),createElement:()=>makeNode(),readyState:'complete'};
  global.window=global;
  global.localStorage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=v},removeItem:k=>{delete store[k]}};
  Object.defineProperty(global,'navigator',{value:{},configurable:true});
  global.history={state:null,pushState(s){global.history.state=s},replaceState(s){global.history.state=s},back(){}};
  global.location={hash:''};
  global.MSOS4={};
}
function bustCache(){
  delete require.cache[require.resolve(path.join(root,'app.js'))];
  delete require.cache[require.resolve(path.join(root,'v4-correct.js'))];
}

function testSophieOneTimeMigration_failBeforePassAfter(){
  const seed={schema:4,build:'test',canonicalSessions:{},athletes:[{id:'soph',full_name:'Sophie Newlove',active:true,squad:'National'}],attendance:[],captures:[],timedSets:[],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],adaptationOverrides:[],coachResults:[],athleteAchievements:[],meets:[],meetEntries:[],meetRaces:[],meetEvidence:[],settings:{selectedSessionId:'',selectedSquad:'',selectedAthleteId:'',pathwayCourse:'SCM',timingRoster:[],view:'board',scrollY:0,keepAwake:false,activeRole:'owner',activeUserAthleteId:'',assistantId:'',assistantPermissions:[],assistantSquads:[],surfaceMode:'training',currentMeetId:'',displayMode:'coach',liveRevision:0},pending:[],guardian:{runs:[]}};

  bustCache();
  freshBrowserGlobals(seed);
  require(path.join(root,'app.js'));
  require(path.join(root,'v4-correct.js')); // boot-time migration runs here against the seeded Sophie row
  const M=global.MSOS4;
  const soph=()=>M.state.athletes.find(a=>a.id==='soph');
  assert.equal(soph().active,false,'migration must deactivate Sophie once on boot, same as before');

  // Simulate Andy reactivating her later through the new roster-edit control (Task #68).
  soph().active=true;

  // REAL fix: running enforceRoster()/ensureState() again (as every subsequent render/state-establish
  // does) must NOT flip her back -- the migration already ran once and is guarded.
  M.correct.enforceRoster();
  assert.equal(soph().active,true,'AFTER fix: a later render/state-establish must not silently re-deactivate a swimmer the coach just reactivated');

  // BEFORE fix: reproduce the OLD recurring per-render rule directly (this is exactly what
  // C.enforceRoster used to do, per this file's own git history) and show it WOULD have re-flipped her.
  const isSophie=a=>/^sophie?newlove$/.test(String(a?.full_name||'').toLowerCase().replace(/[^a-z0-9]+/g,''));
  const oldEnforceRoster=()=>{let changed=false;for(const a of M.state.athletes||[]){if(isSophie(a)&&a.active!==false){a.active=false;changed=true;}}return changed;};
  oldEnforceRoster();
  assert.equal(soph().active,false,'BEFORE fix: the old recurring per-render rule must re-force her inactive even right after being reactivated -- reproducing the real complaint (no way to reactivate her without editing code)');

  console.log('SOPHIE_ONE_TIME_MIGRATION_PASS');
}

// ---------- Test 4: the new "Manage swimmers" edit control (Task #68) actually saves squad/active ----------
// Before this, the only way to change an existing swimmer's squad or active status was a full CSV/JSON
// re-import keyed by a hash of their name -- there was no single-athlete edit anywhere in the app. This
// drives the REAL engines/data-admin-ui.js save handler (not a reimplementation) against a fake #dataView
// host built to look enough like the real DOM for render()/bindRoster() to run without crashing, then
// fires a real click on the real save button node and checks the real M.state.athletes was mutated and
// M.store.save was actually called -- not just that the html string contains the right markup.
function testRosterEditSaves(){
  bustCache();
  delete require.cache[require.resolve(path.join(root,'engines/data-registry.js'))];
  delete require.cache[require.resolve(path.join(root,'engines/data-admin-ui.js'))];
  delete require.cache[require.resolve(path.join(root,'v4-correct.js'))];
  const seed={schema:4,build:'test',canonicalSessions:{},athletes:[{id:'stuck-swimmer',full_name:'Stuck Swimmer',active:true,squad:'National'}],attendance:[],captures:[],timedSets:[],trainingTestTypes:[],trainingTestResults:[],adaptationProfiles:[],adaptationOverrides:[],coachResults:[],athleteAchievements:[],meets:[],meetEntries:[],meetRaces:[],meetEvidence:[],settings:{selectedSessionId:'',selectedSquad:'',selectedAthleteId:'',pathwayCourse:'SCM',timingRoster:['stuck-swimmer'],view:'data',scrollY:0,keepAwake:false,activeRole:'owner',activeUserAthleteId:'',assistantId:'',assistantPermissions:[],assistantSquads:[],surfaceMode:'training',currentMeetId:'',displayMode:'coach',liveRevision:0},pending:[],guardian:{runs:[]}};
  freshBrowserGlobals(seed);
  require(path.join(root,'app.js'));
  require(path.join(root,'v4-correct.js'));
  require(path.join(root,'engines/data-registry.js'));
  require(path.join(root,'engines/data-admin-ui.js'));
  const M=global.MSOS4;

  // The real row this edit is meant to fix: an athlete stuck on "National" because there was no way to
  // change it short of hand-editing stored data outside the app.
  const nameInput=makeNode({value:'Stuck Swimmer'});
  const squadInput=makeNode({value:'Intermediate'}); // the coach corrects the squad here
  const activeCheckbox=makeNode({checked:true});
  const rowNode=makeNode({
    dataset:{rosterId:'stuck-swimmer'},
    querySelector(sel){
      if(sel==='[data-roster-name]')return nameInput;
      if(sel==='[data-roster-squad]')return squadInput;
      if(sel==='[data-roster-active]')return activeCheckbox;
      return makeNode();
    }
  });
  const saveButton=makeNode({closest(sel){return sel==='[data-roster-id]'?rowNode:null;}});
  const dataView=makeNode({
    querySelectorAll(sel){return sel==='[data-roster-save]'?[saveButton]:[];}
  });
  global.document.querySelector=sel=>sel==='#dataView'?dataView:makeNode();

  let saveCalls=0;
  const origSave=M.store.save;
  M.store.save=state=>{saveCalls++;return origSave(state);};

  M.dataAdminUI.render();
  assert.equal(typeof saveButton.onclick,'function','render() must wire a click handler onto the real save button');

  saveButton.dispatch('click');

  const ath=M.state.athletes.find(a=>a.id==='stuck-swimmer');
  assert.equal(ath.squad,'Intermediate','the real save handler must write the corrected squad onto the real athlete record');
  assert.equal(ath.full_name,'Stuck Swimmer','the name field must round-trip unchanged when not edited');
  assert.ok(saveCalls>=1,'saving an edit must persist via the real M.store.save, not just mutate in-memory state');
  console.log('ROSTER_EDIT_SAVES_SQUAD_PASS');

  // Second click: turn the swimmer inactive and confirm the flag sticks and stale roster refs get cleaned.
  activeCheckbox.checked=false;
  saveButton.dispatch('click');
  assert.equal(ath.active,false,'turning Active off must persist active:false on the real athlete record');
  assert.ok(!M.state.settings.timingRoster.includes('stuck-swimmer'),'deactivating a swimmer must clear them out of the Timing roster too, via the real v4-correct.js enforceRoster cleanup the save handler triggers');
  console.log('ROSTER_EDIT_SAVES_ACTIVE_PASS');
}

testMeetPlaceholderPurge_failBeforePassAfter();
testImportDoesNotReactivate_failBeforePassAfter();
testSophieOneTimeMigration_failBeforePassAfter();
testRosterEditSaves();
fs.rmSync(SCRATCH_DIR,{recursive:true,force:true});
console.log('TASK66_68_ROSTER_INTEGRITY_PASS');
