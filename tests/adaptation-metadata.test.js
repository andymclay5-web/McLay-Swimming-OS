'use strict';
const assert=require('assert');
const Truth=require('../engines/session-truth.js');
const Entities=require('../engines/entity-registry.js');
const Adapt=require('../engines/adaptation.js');
let fails=0;
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){fails++;console.error('FAIL',name,'\n ',e.stack||e.message)}}
const identity={id:'adapt-meta',date:'2026-08-18',dayPart:'AM',course:'SCM',squads:['National','Development'],venue:'AquaGym'};
const entities=Entities.create({sources:[{id:'athletes',priority:100,trust:'verified',data:{athletes:[{id:'charlotte',full_name:'Charlotte Murphy',active:true},{id:'mk',full_name:'McKenzie Drage',active:true}]}}]});
const engine=Adapt.create({evidence:entities});

test('condensed repeating pattern drops ghost rep instructions beyond new rep count',()=>{const s=Truth.parse('Pre set\n12 x 50 #1 @ 1:10\n1 Scull / 1 Drill / 1 Swim',identity),item=s.blocks[0].items[0],r=engine.forItem(s,item,'charlotte'),x=r.prescription;assert.equal(x.reps,6);assert.equal(x.repInstructions.length,6);assert.deepEqual(x.repInstructions.map(v=>v.rep),[1,2,3,4,5,6]);assert(!x.repInstructions.some(v=>v.rep>6))});
test('unchanged 16 x 50 phase structure does not become a fake modification just because phase metadata was added',()=>{const s=Truth.parse(`Post set\n16 x 50 @ 1:15\n8 x 50 Bands Only\n4 Build\n4 Descend 1-4\n8 x 50 Swim\nDescend 1-4 twice\n#4 + #8 @ 100 Pace`,identity),item=s.blocks[0].items[0],r=engine.forItem(s,item,'mk');assert.equal(r.prescription.phases.length,2);assert.equal(r.prescription.phases[0].reps,8);assert.equal(r.prescription.phases[1].reps,8);assert.equal(r.sameAsGroup,true)});
if(fails){console.error(`\n${fails} adaptation metadata regression(s) failed`);process.exit(1)}console.log('\nALL ADAPTATION METADATA REGRESSIONS PASS');
