'use strict';
const assert=require('assert');
const Portal=require('../rebuild/engine-portal.js');
const Projection=require('../engines/performance-projection.js');
let fails=0;function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const call=(obj,method,input)=>obj[method](...(input?.args||[]));
const proxy=(client,target,methods)=>Object.freeze(Object.fromEntries(methods.map(m=>[m,(...args)=>client.query(target,m,{args})])));
function core(){
 const portal=Portal.create({clock:()=> '2026-08-18T17:10:00+12:00'}),I={};
 portal.register({id:'entity-registry',version:'fixture',queries:{resolveAthlete:i=>call(I.entities,'resolveAthlete',i)}});
 portal.register({id:'results-pathway',version:'fixture',queries:{profile:i=>call(I.pathway,'profile',i),eventAnswer:i=>call(I.pathway,'eventAnswer',i)}});
 portal.register({id:'standards-records',version:'fixture',queries:{statusForResult:i=>call(I.standards,'statusForResult',i),classificationStatus:i=>call(I.standards,'classificationStatus',i)}});
 portal.register({id:'evidence-publication',version:'fixture',queries:{operationalMeetResults:i=>call(I.publication,'operationalMeetResults',i),provisional:i=>call(I.publication,'provisional',i)}});
 portal.register({id:'race-model',version:'fixture',queries:{target:i=>call(I.race,'target',i),compare:i=>call(I.race,'compare',i)}});
 portal.register({id:'performance-projection',version:Projection.VERSION,calls:{query:{'entity-registry':['resolveAthlete'],'results-pathway':['profile','eventAnswer'],'standards-records':['statusForResult','classificationStatus'],'evidence-publication':['operationalMeetResults','provisional'],'race-model':['target','compare']}},queries:{athlete:i=>call(I.projection,'athlete',i),provisionalMeetSignals:i=>call(I.projection,'provisionalMeetSignals',i),raceTarget:i=>call(I.projection,'raceTarget',i),compareRace:i=>call(I.projection,'compareRace',i),meetBoard:i=>call(I.projection,'meetBoard',i)}});
 portal.register({id:'meet-performance-surface',version:'1',kind:'surface',calls:{query:{'performance-projection':['athlete','provisionalMeetSignals','raceTarget','compareRace','meetBoard']}}});
 portal.register({id:'app-shell',version:'1',kind:'shell'});
 I.entities={resolveAthlete:r=>r==='molly'?{id:'molly',full_name:'Molly'}:null};
 I.pathway={profile:()=>({status:'ok',pbs:[{result_seconds:63.8}]}),eventAnswer:()=>({status:'ok'})};
 I.standards={statusForResult:(a,e,s)=>({status:'ok',achieved:s<=62?[{id:'nzsc',label:'NZSC',standard_kind:'qualifying',standard_seconds:62,gap:{achieved:true}}]:[],nationalQualifying:s<=62?[{id:'nzsc',label:'NZSC',standard_seconds:62,gap:{achieved:true}}]:[],records:[],next:null}),classificationStatus:()=>({status:'not_para'})};
 I.publication={operationalMeetResults:()=>[{id:'p',athlete_id:'molly',pool_course:'SCM',distance:100,stroke:'Freestyle',result_seconds:61.8,result_status:'finished',permanent_eligible:false,publication_status:'operational_only'}],provisional:()=>({count:1})};
 I.race={target:spec=>({status:'ok',target_seconds:spec.targetSeconds,event:{course:'SCM',distance_m:100,stroke:'Freestyle'},model:{id:'m'},segments:[]}),compare:()=>({status:'ok',segments:[]})};
 const client=portal.client('performance-projection');I.projection=Projection.create({entities:proxy(client,'entity-registry',['resolveAthlete']),pathway:proxy(client,'results-pathway',['profile','eventAnswer']),standards:proxy(client,'standards-records',['statusForResult','classificationStatus']),publication:proxy(client,'evidence-publication',['operationalMeetResults','provisional']),raceModel:proxy(client,'race-model',['target','compare'])});portal.seal();return{portal,surface:portal.client('meet-performance-surface'),shell:portal.client('app-shell')};
}

test('surface obtains provisional performance signal only through Performance Projection',()=>{const c=core(),x=c.surface.query('performance-projection','athlete',{args:['molly',{course:'SCM'}]});assert.equal(x.provisional_meet.signals[0].result_seconds,61.8);assert.equal(x.provisional_meet.signals[0].national_qualifying[0].id,'nzsc');const trail=c.portal.auditTrail();assert(trail.some(r=>r.caller==='meet-performance-surface'&&r.target==='performance-projection'));assert(trail.some(r=>r.caller==='performance-projection'&&r.target==='evidence-publication'));assert(trail.some(r=>r.caller==='performance-projection'&&r.target==='standards-records'));assert(!trail.some(r=>r.caller==='meet-performance-surface'&&r.target==='standards-records'))});
test('verified Pathway read remains a separate declared dependency',()=>{const c=core();c.surface.query('performance-projection','athlete',{args:['molly',{}]});assert(c.portal.auditTrail().some(r=>r.caller==='performance-projection'&&r.target==='results-pathway'&&r.operation==='profile'))});
test('race model access is routed and not calculated in projection',()=>{const c=core(),x=c.surface.query('performance-projection','raceTarget',{args:['molly',{course:'SCM',distance:100,stroke:'Freestyle',targetSeconds:60}]});assert.equal(x.status,'ok');assert(c.portal.auditTrail().some(r=>r.caller==='performance-projection'&&r.target==='race-model'&&r.operation==='target'))});
test('app shell cannot bypass projection to read Standards',()=>{const c=core();assert.throws(()=>c.shell.query('standards-records','statusForResult',{args:[]}),e=>e.code==='CALL_NOT_ALLOWED')});
test('portal audit does not store provisional result time payload',()=>{const c=core();c.surface.query('performance-projection','athlete',{args:['molly',{}]});const json=JSON.stringify(c.portal.auditTrail());assert(!/61\.8|63\.8/.test(json))});
if(fails){console.error(`\n${fails} Performance Projection portal regression(s) failed`);process.exit(1)}console.log('\nALL PERFORMANCE PROJECTION PORTAL REGRESSIONS PASS');
