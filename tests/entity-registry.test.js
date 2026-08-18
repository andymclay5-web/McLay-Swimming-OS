'use strict';
const assert=require('assert');
const E=require('../engines/entity-registry.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
function sources(){return[
 {id:'current',priority:100,trust:'current',data:{athletes:[
  {id:'ath-mckenzie',full_name:'McKenzie Drage',squad:'National',sex:'F',date_of_birth:'2010-01-10',current_s_class:'S8',active:true},
  {id:'ath-alexandra',full_name:'Alexandra Hanson',squad:'Development',sex:'F',active:true},
  {id:'ath-luke-thw',full_name:'Luke Thwaites',squad:'National',sex:'M',active:true},
  {id:'ath-old',full_name:'Historical Swimmer',squad:'National',active:false}
 ],squads:[{id:'sq-national',name:'National'},{id:'sq-development',name:'Development'}]}},
 {id:'legacy',priority:20,trust:'legacy',data:{athletes:[
  {id:'old-mk',full_name:'McKenzie Drage'},
  {id:'old-alex',full_name:'Alex Hanson'},
  {id:'old-luke',full_name:'Luke Thwaites'}
 ]}}
]}
const aliases=[{canonicalName:'Alexandra Hanson',aliases:['Alex Hanson']}];

test('canonical athlete identity unifies source IDs and explicit aliases without fuzzy guessing',()=>{const r=E.create({sources:sources(),aliases});assert.equal(r.resolveAthlete('old-mk').id,'ath-mckenzie');assert.equal(r.resolveAthlete('Alex Hanson').id,'ath-alexandra');assert.equal(r.sourceAthleteId('legacy','old-alex'),'ath-alexandra')});
test('without explicit alias Alexandra and Alex remain separate identities',()=>{const r=E.create({sources:sources(),aliases:[]});assert.equal(r.resolveAthlete('old-alex').id,'old-alex');assert.equal(r.resolveAthlete('ath-alexandra').id,'ath-alexandra')});
test('current stronger source wins canonical fields while provenance retains both sources',()=>{const r=E.create({sources:sources(),aliases}),a=r.resolveAthlete('McKenzie Drage');assert.equal(a.id,'ath-mckenzie');assert.equal(a.sex,'F');assert.deepEqual(new Set(a._entity.sources),new Set(['current','legacy']))});
test('squad membership is canonical and roster is date-aware',()=>{const r=E.create({sources:sources(),aliases,memberships:[{id:'move',athlete_id:'ath-alexandra',squad_id:'sq-national',start_date:'2026-09-01',active:true}]});assert(r.roster('National',{asOfDate:'2026-08-18'}).some(x=>x.id==='ath-mckenzie'));assert(!r.roster('National',{asOfDate:'2026-08-18'}).some(x=>x.id==='ath-alexandra'));assert(r.roster('National',{asOfDate:'2026-09-02'}).some(x=>x.id==='ath-alexandra'))});
test('inactive swimmers remain resolvable history but are excluded from active roster by default',()=>{const r=E.create({sources:sources(),aliases});assert.equal(r.resolveAthlete('Historical Swimmer').active,false);assert(!r.roster('National').some(x=>x.id==='ath-old'));assert(r.roster('National',{includeInactive:true}).some(x=>x.id==='ath-old'))});
test('profile dimensions are derived from one athlete identity',()=>{const r=E.create({sources:sources(),aliases}),d=r.dimensions('McKenzie Drage',{asOfDate:'2026-08-18'});assert.equal(d.sex,'F');assert.equal(d.age,16);assert.equal(d.classification.s,'S8');assert(d.squadIds.includes('sq-national'))});
test('returned data is cloned so consumers cannot mutate registry truth',()=>{const r=E.create({sources:sources(),aliases}),a=r.resolveAthlete('McKenzie Drage');a.full_name='Changed';assert.equal(r.resolveAthlete('McKenzie Drage').full_name,'McKenzie Drage');const snap=r.snapshot();snap.athletes[0].active=false;assert.equal(r.resolveAthlete('McKenzie Drage').active,true)});
test('names are not used as UI state addresses once canonical id exists',()=>{const r=E.create({sources:sources(),aliases});const id=r.athleteId('McKenzie Drage');assert.equal(id,'ath-mckenzie');assert.equal(r.resolveAthlete(id).full_name,'McKenzie Drage')});
if(fails){console.error(`\n${fails} Entity Registry regression(s) failed`);process.exit(1)}console.log('\nALL ENTITY REGISTRY REGRESSIONS PASS');
