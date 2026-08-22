'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const P=require('./pilot-link');

const state={
  athletes:[
    {id:'mat',full_name:'Matthew Robertson',squad:'National',active:true},
    {id:'mol',full_name:'Molly McKernan',squad:'Development',active:true}
  ],
  canonicalSessions:{
    nat:{id:'nat',identity:{date:'2026-08-22',dayPart:'AM',squads:['National']}},
    dev:{id:'dev',identity:{date:'2026-08-22',dayPart:'AM',squads:['Development']}},
    old:{id:'old',identity:{date:'2026-08-20',dayPart:'PM',squads:['Development']}}
  },
  attendance:[
    {session_id:'nat',athlete_id:'mat',status:'present'}
  ],
  settings:{selectedSessionId:'nat'}
};

const matt=P.resolve(state,'matthew-robertson');
assert.equal(matt.entry.confirmed,true);
assert.equal(matt.athlete.id,'mat');
assert.equal(matt.session.id,'nat');
assert.equal(matt.attended,true);

const molly=P.resolve(state,'molly-mckernan');
assert.equal(molly.entry.confirmed,true);
assert.equal(molly.remote,true);
assert.equal(molly.athlete.id,'mol');
assert.equal(molly.session.id,'dev','remote pilot should receive the newest squad-matching canonical session');
assert.equal(molly.attended,false,'opening a remote prescription must not fabricate attendance');

const ash=P.resolve(state,'erin-mcbain');
assert.equal(ash.status,'candidate-needs-confirmation');
assert.equal(ash.entry.confirmed,false);
assert.equal(ash.athlete,null,'unconfirmed candidate must not expose swimmer data');
assert.equal(ash.candidateMatch,null);

const exact={...state,athletes:[...state.athletes,{id:'erin',full_name:'Erin McBain',squad:'Development',active:true}]};
const erin=P.resolve(exact,'erin-mcbain');
assert.equal(erin.athlete,null,'candidate must stay locked even when an exact active roster name exists');
assert.equal(erin.candidateMatch.id,'erin','exact roster match may be surfaced only as a confirmation candidate');
assert.equal(erin.status,'candidate-needs-confirmation');
assert.equal(erin.session,null,'unconfirmed candidate must not receive session data');

const portal=fs.readFileSync(__dirname+'/swimmer-portal-bm.js','utf8');
assert(/athlete_self_report/.test(portal),'portal must preserve athlete self-report provenance');
assert(!/attendance\.push\s*\(/.test(portal),'portal must not fabricate attendance');
assert(!/enableProduction\s*\(/.test(portal),'pilot portal must not enable production writes');

const tv=fs.readFileSync(__dirname+'/tv-overlay-bm.js','utf8');
assert(/pullShadow\s*\(/.test(tv),'TV pilot should use read-only coach-cloud refresh');
assert(!/\.flush\s*\(/.test(tv)&&!/enableProduction\s*\(/.test(tv),'TV pilot must not write to production cloud');

for(const htmlName of ['portal.html','tv.html']){
  const html=fs.readFileSync(__dirname+'/'+htmlName,'utf8');
  const storage=html.indexOf('./pilot-storage.js'),app=html.indexOf('../app.js');
  assert(storage>=0&&app>=0&&storage<app,`${htmlName} must isolate storage before loading app.js`);
}

console.log('pilot-bm: confirmed swimmer linking, remote non-attendance, candidate lock, self-report provenance, storage isolation and TV read-only checks passed');
