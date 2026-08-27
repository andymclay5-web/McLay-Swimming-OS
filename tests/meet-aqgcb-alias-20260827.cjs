'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const code=fs.readFileSync('engines/meet-field-au.js','utf8');
const document={
  getElementById(){return null},
  createElement(){return {id:'',textContent:'',dataset:{},style:{}}},
  head:{appendChild(){}}
};
const MSOS4={
  ui:{},
  state:{athletes:[
    {id:'elsie',full_name:'Elsie Knowles',active:true},
    {id:'conor',full_name:'Conor Fischer',active:true}
  ]},
  util:{text:v=>String(v??'').replace(/\s+/g,' ').trim()}
};
const sandbox={globalThis:null,MSOS4,document,window:{},indexedDB:{},URL,setTimeout,console};
sandbox.globalThis=sandbox;
vm.runInNewContext(code,sandbox,{filename:'meet-field-au.js'});

const parse=MSOS4.meetFieldPatch.parseHytekProgramme;
const src=`North Canterbury Swimming HY-TEK's MEET MANAGER 8.0 - 12:40 PM 27/08/2026 Page 1
2026 South Island Short Course Championships - 28/08/2026 to 30/08/2026
Meet Program - Session 1
Event 6 Mixed 50 SC Meter Butterfly
Heat 1 of 2 Finals Starts at 09:15 AM
4 Elsie Knowles W12 AQGCB 41.62
5 Rival Swimmer W12 OTHR 40.12
Event 7 Mixed 100 SC Meter Freestyle
Heat 1 of 1 Finals Starts at 09:22 AM
3 Conor Fischer M14 AquaGym 1:01.25`;
const out=parse(src);
assert.equal(out.title,'2026 South Island Short Course Championships');
assert.equal(out.session,'Session 1');
assert.equal(out.races.length,2,'AQGCB and AquaGym rows must both be retained');
assert.deepEqual([...out.swimmers].sort(),['Conor Fischer','Elsie Knowles']);
assert.equal(out.races.some(r=>r.source_name==='Rival Swimmer'),false,'other clubs must remain filtered out');
assert.equal(MSOS4.meetFieldPatch.isAquaGymClub('AQGCB'),true);
assert.equal(MSOS4.meetFieldPatch.isAquaGymClub('Aqua Gym Canterbury'),true);
console.log('MEET_AQGCB_ALIAS_PASS');
