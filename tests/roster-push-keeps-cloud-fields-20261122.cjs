'use strict';
// 22 Nov 2026: Zakhar's sex was set in the cloud (Andy: "zakhar is male"), then disappeared again. Andy's phone never
// had it, and every Roll sent his whole phone-side swimmer row (sex:null) to make sure the swimmer existed for
// attendance -- wiping the cloud's sex. Proves:
//  - Roll's "make sure the swimmer exists" send is insert-only (ignore-duplicates): it never changes a cloud row;
//  - a coach's edit (Manage swimmers) still merges, but a field this phone doesn't know is left out, not sent as null;
//  - the owner's phone fills a blank sex / birth date / class from the cloud, never replaces one it has, adds no
//    swimmer, and doesn't redraw.
const assert=require('node:assert/strict');
const{chromium}=require('playwright');
const BASE=process.env.MSOS4_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{const b=await chromium.launch({args:['--no-sandbox']});try{const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE);await p.waitForFunction(()=>window.MSOS4?.cloud?.flushOnce&&window.MSOS4?.storageEngine?.ready,{timeout:25000});await p.waitForTimeout(500);
  const r=await p.evaluate(async()=>{const M=window.MSOS4,C=M.cloud;
    M.state.athletes=[{id:'zak',full_name:'Zakhar Voynov',squad:'Intermediate',active:true},{id:'luke',full_name:'Luke Thompson',squad:'National',active:true,sex:'M'}];
    M.state.pending=[{id:'a1',key:'attendance:zak',table:'attendance',action:'upsert',record:{id:'att-zak',athlete_id:'zak',session_id:'s1'},meta:{},at:new Date().toISOString()}];
    M.state.settings.cloudWritesEnabled=true;M.release.canWrite=()=>true;M.release.ensure=()=>{};C.ready=()=>true;
    const sent=[];C.fetch=async(path,opts)=>{sent.push({path,prefer:opts?.headers?.Prefer||'',body:opts?.body?JSON.parse(opts.body):null});return null};
    await C.flushOnce();
    const roll=sent.filter(x=>/\/athletes\?/.test(x.path));
    sent.length=0;
    const zak=M.state.athletes[0];zak.squad='National';C.stageAthlete(zak);await C.flushOnce();const edit=sent.filter(x=>/\/athletes\?/.test(x.path));
    // owner fills blanks from the cloud
    M.access.role=()=>'owner';const rev=M.state.settings.evidenceRevision||0;let redraws=0;const rc=M.ui?.renderCurrent;
    C.fetch=async()=>[{id:'zak',sex:'M',date_of_birth:'2012-03-04',current_s_class:null},{id:'luke',sex:'F',date_of_birth:'2008-01-01'},{id:'stranger',sex:'F'}];
    const fill=await C.pullTeamRoster();
    return{roll,edit,fill,zak:{...M.state.athletes[0]},luke:{...M.state.athletes[1]},count:M.state.athletes.length,revUp:(M.state.settings.evidenceRevision||0)>rev};});
  assert.equal(r.roll.length,1,'Roll makes sure Zakhar exists');assert.match(r.roll[0].prefer,/ignore-duplicates/,'insert-only: an existing cloud row is left alone');
  assert.ok(!('sex' in r.roll[0].body),'no sex:null sent: '+JSON.stringify(r.roll[0].body));
  assert.equal(r.edit.length,1);assert.match(r.edit[0].prefer,/merge-duplicates/,'a coach edit still updates the cloud');assert.equal(r.edit[0].body.squad,'National');
  assert.ok(!('sex' in r.edit[0].body)&&!('date_of_birth' in r.edit[0].body),'fields this phone does not know are left out: '+JSON.stringify(r.edit[0].body));
  assert.equal(r.zak.sex,'M','blank sex filled from the cloud');assert.equal(r.zak.date_of_birth,'2012-03-04');
  assert.equal(r.luke.sex,'M','a sex the phone already has is never replaced');assert.equal(r.luke.date_of_birth,'2008-01-01','blank birth date filled');
  assert.equal(r.count,2,'no swimmer added');assert.ok(r.fill.filled>=3&&!r.fill.athletes,'filled, no redraw signal: '+JSON.stringify(r.fill));assert.ok(r.revUp,'targets recalculate');
  assert.deepEqual(errors,[],errors.join('\n'));console.log('ROSTER_PUSH_KEEPS_CLOUD_FIELDS_PASS');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
