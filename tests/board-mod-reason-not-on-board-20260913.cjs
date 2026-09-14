'use strict';
// Real coaching failure this fixes (Andy's own words, 13 Sept 2026): "all the explanation of why on the mod
// side don't need to show n the board" -- engines/board.js's modCell() rendered a verbose adaptationReason +
// evidenceProvenance explanation (e.g. "67% load fallback · no fair performance comparator", "Load fallback ·
// 600→400 single continuous work") on every modified swimmer's row, added on 9/11 Sept so a coach could tell
// "correctly protected" apart from "modification pipeline did nothing" -- but poolside, reading a paragraph
// of reasoning per modified swimmer per set is exactly the clutter Andy is describing.
//
// Fixed by dropping the `.msos-mod-reason` element from modCell's Board rendering entirely. This is a display
// change only: engines/modification.js still computes and attaches adaptationReason (and
// relativeStimulusEvidence/relativeStimulusPlan) to every adapted item exactly as before -- proven below by
// checking adaptItem() directly -- and engines/session-methodology.js's own flagged-for-review summary reads
// that data independently of anything board.js renders, so it is unaffected (see
// tests/modified-target-authority-20260909.cjs, updated alongside this fix, for the now-obsolete assertions
// this replaces).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

global.window=global;
global.scrollY=0;
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
global.location={hash:'',href:'https://mod-reason.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');

global.MSOSEngines={};
global.MSOSEngines.Evidence=require('../engines/evidence.js');
global.MSOSEngines.RacePace=require('../engines/race-pace.js');
global.MSOSEngines.Aerobic=require('../engines/aerobic.js');
global.MSOSEngines.Modification=require('../engines/modification.js');
global.MSOSEngines.Coordinator=require('../engines/coordinator.js');
require('../engines/board.js');

function checkModCell(M){
  const session={id:'s1',identity:{course:'SCM'}};
  const charlotte={id:'cm',full_name:'Charlotte Murphy',sex:'F'};
  M.state.athletes=[charlotte];
  M.state.resultsPbBoard=[{athlete_id:'cm',distance:400,stroke:'Freestyle',course:'SCM',result_seconds:320,wa_points:600}];
  M.state.adaptationOverrides=[];M.state.adaptationProfiles=[];

  // A load-fallback case: distance-limited so adaptItem must fall through to the reps-fallback branch that
  // sets a long, coach-facing adaptationReason ("Load fallback · ..."/"NN% load fallback · ...").
  const item={id:'i1',kind:'set',reps:6,distance:100,raw:'6 x 100 Freestyle',text:'6 x 100 Freestyle',stroke:'Freestyle',cycleSeconds:null,restSeconds:15,repPattern:[],repInstructions:[],cues:[],equipment:[],composition:[],raceIntent:null};
  const adapted=global.MSOSEngines.Modification.adaptItem(item,charlotte,M.state,session);
  assert.ok(text(adapted.adaptationReason),'fixture sanity: adaptItem must still record a reason -- modification.js itself must be untouched by this fix');

  const html=M.boardEngine.modCell(session,item,[charlotte]);
  assert.ok(html&&html.length,'modCell must still render something for a genuinely modified swimmer');
  assert.doesNotMatch(html,/msos-mod-reason/,'the Board must no longer render a .msos-mod-reason explanation element');
  assert.doesNotMatch(html,text(adapted.adaptationReason)===''?/$^/:new RegExp(escapeRe(adapted.adaptationReason)),`the Board must not print the literal reason text ("${adapted.adaptationReason}") anywhere in the modified row`);

  // What the coach still needs must remain: the swimmer's name/link, the Edit button, and the modified work label.
  assert.match(html,/msos-name/,'the swimmer name link must still be present');
  assert.match(html,/msos-mod-edit/,'the Edit button must still be present so a coach can still see full detail on tap');
  assert.match(html,/<b>/,'the modified work-label headline must still be present');
}
function text(v){return String(v??'').replace(/\s+/g,' ').trim()}
function escapeRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

checkModCell(global.MSOS4);
console.log('BOARD_MOD_REASON_NOT_ON_BOARD_PASS');

// Fail-before/pass-after: revert board.js's modCell to its exact pre-fix shape (reason line restored) in a
// scratch copy, boot a SEPARATE isolated sandbox against it, and confirm the same check correctly fails.
const boardPath=path.join(__dirname,'..','engines','board.js');
const realSrc=fs.readFileSync(boardPath,'utf8');

const fixedBlock=`  function modCell(session,item,mods){
    if(!mods.length)return'';const groups=new Map();
    for(const a of mods){const prescription=E.Coordinator.prescription?.(session,item,a,M.state),actual=prescription?.item||E.Modification.adaptItem(item,a,M.state,session),changed=!E.Modification.samePrescription(item,actual),needsTarget=targetIntent(actual),showTiming=timingIntent(actual);if(!changed&&!showTiming)continue;const key=modGroupKey(actual);if(!groups.has(key))groups.set(key,{actual,members:[]});groups.get(key).members.push({a,needsTarget,showTiming,target:prescription?.target||null});}
    return[...groups.values()].map(group=>{const {actual,members}=group,cue=cueText(actual),people=members.map(m=>modPerson(session,item,m,mods,actual)).join('');
      return\`<div class="msos-mod-row" data-msos-mod-group="\${esc(item.id)}"><div class="msos-mod-top">\${people}</div><b>\${esc(workLabel(actual))}</b>\${cue?\`<small class="msos-mod-cue">\${esc(cue)}</small>\`:''}</div>\`;}).join('');
  }`;
const originalBlock=`  function modCell(session,item,mods){
    if(!mods.length)return'';const groups=new Map();
    for(const a of mods){const prescription=E.Coordinator.prescription?.(session,item,a,M.state),actual=prescription?.item||E.Modification.adaptItem(item,a,M.state,session),changed=!E.Modification.samePrescription(item,actual),needsTarget=targetIntent(actual),showTiming=timingIntent(actual);if(!changed&&!showTiming)continue;const key=modGroupKey(actual);if(!groups.has(key))groups.set(key,{actual,members:[]});groups.get(key).members.push({a,needsTarget,showTiming,target:prescription?.target||null});}
    return[...groups.values()].map(group=>{const {actual,members}=group,cue=cueText(actual),people=members.map(m=>modPerson(session,item,m,mods,actual)).join('');
      const reason=text(actual?.adaptationReason||''),provenance=evidenceProvenance(actual),reasonFull=reason&&provenance?\`\${reason} — \${provenance}\`:reason;
      return\`<div class="msos-mod-row" data-msos-mod-group="\${esc(item.id)}"><div class="msos-mod-top">\${people}</div><b>\${esc(workLabel(actual))}</b>\${cue?\`<small class="msos-mod-cue">\${esc(cue)}</small>\`:''}\${reasonFull?\`<small class="msos-mod-reason">\${esc(reasonFull)}</small>\`:''}</div>\`;}).join('');
  }
  function evidenceProvenance(actual){
    const plan=actual?.relativeStimulusPlan,ev=actual?.relativeStimulusEvidence;
    if(plan?.athleteSeconds&&plan?.referenceSeconds)return\`\${plan.evidenceKind==='t400'?'T400':'PB'} evidence: \${clock(plan.athleteSeconds)} vs squad median \${clock(plan.referenceSeconds)} (\${plan.referenceCount} swimmer\${plan.referenceCount===1?'':'s'})\`;
    if(ev?.athleteSeconds&&ev?.referenceSeconds)return\`\${ev.kind==='t400'?'T400':'PB'} evidence: \${ev.stroke?\`\${ev.stroke} \`:''}\${clock(ev.athleteSeconds)} vs squad median \${clock(ev.referenceSeconds)} (\${ev.referenceCount} swimmer\${ev.referenceCount===1?'':'s'})\`;
    return'';
  }`;
assert.ok(realSrc.includes(fixedBlock),'test setup error: could not locate the fixed modCell in the real file -- its wording changed in a way this test does not expect');

const buggySrc=realSrc.replace(fixedBlock,originalBlock);
assert.notEqual(buggySrc,realSrc,'test setup error: could not construct the reverted buggy source');

const sandbox={
  scrollY:0,requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 1;},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}},
  location:{hash:'',href:'https://mod-reason-buggy.test/'},
  history:{state:null,replaceState(){},pushState(){},back(){}},
  addEventListener:()=>{},removeEventListener:()=>{},console,
};
sandbox.globalThis=sandbox;sandbox.window=sandbox;
const vm=require('node:vm');
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),sandbox,{filename:'app.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-correct.js'),'utf8'),sandbox,{filename:'v4-correct.js'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','v4-poolside-core.js'),'utf8'),sandbox,{filename:'v4-poolside-core.js'});

let threw=false,threwMessage='';
try{
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','evidence.js'),'utf8'),sandbox,{filename:'evidence.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','race-pace.js'),'utf8'),sandbox,{filename:'race-pace.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','aerobic.js'),'utf8'),sandbox,{filename:'aerobic.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','modification.js'),'utf8'),sandbox,{filename:'modification.js'});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','engines','coordinator.js'),'utf8'),sandbox,{filename:'coordinator.js'});
  vm.runInContext(buggySrc,sandbox,{filename:'board.buggy.js'});
  assert.ok(sandbox.MSOS4?.boardEngine?.modCell,'test setup error: buggy board.js did not install boardEngine.modCell in the sandbox');
  checkModCell(sandbox.MSOS4);
}catch(err){threw=true;threwMessage=err.message;}
assert.ok(threw,'the buggy pre-fix modCell (reason line restored) must fail this check -- confirms the check would have caught the real, reported clutter');
assert.match(threwMessage,/must no longer render a \.msos-mod-reason/,`the buggy source should fail specifically on the msos-mod-reason assertion, got: ${threwMessage}`);

require('node:child_process').execFileSync(process.execPath,['--check',boardPath],{stdio:'pipe'});

console.log('BOARD_MOD_REASON_NOT_ON_BOARD_FAILBEFORE_PASS');
