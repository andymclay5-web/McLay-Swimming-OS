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

assert.equal(P.PILOTS.length,2,'pilot roster should contain only the two confirmed Ashburton AquaGym swimmers');
assert.deepEqual(P.PILOTS.map(x=>x.name),['Matthew Robertson','Molly McKernan']);
assert(P.PILOTS.every(x=>x.club==='AquaGym'&&x.location==='Ashburton'&&x.remote===true&&x.confirmed===true),'both pilots must be confirmed AquaGym Ashburton remote swimmers');

const matt=P.resolve(state,'matthew-robertson');
assert.equal(matt.entry.confirmed,true);
assert.equal(matt.remote,true,'Matthew is a remote-coaching pilot even when he attends an AquaGym session');
assert.equal(matt.athlete.id,'mat');
assert.equal(matt.session.id,'nat');
assert.equal(matt.attended,true);

const molly=P.resolve(state,'molly-mckernan');
assert.equal(molly.entry.confirmed,true);
assert.equal(molly.remote,true);
assert.equal(molly.athlete.id,'mol');
assert.equal(molly.session.id,'dev','remote pilot should receive the newest squad-matching canonical session');
assert.equal(molly.attended,false,'opening a remote prescription must not fabricate attendance');

const unknown=P.resolve(state,'erin-mcbain');
assert.equal(unknown.status,'unknown-pilot');
assert.equal(unknown.entry,null,'occasional Ashburton visitors must not be promoted into remote-coaching accounts by assumption');
assert.equal(unknown.athlete,null);
assert.equal(unknown.session,null);

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

console.log('pilot-bn: Matthew + Molly remote coaching identity, non-attendance, self-report provenance, storage isolation and TV read-only checks passed');
