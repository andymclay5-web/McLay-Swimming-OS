'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const code=fs.readFileSync('engines/meet-field-au.js','utf8');
const document={getElementById(){return null},createElement(){return {id:'',textContent:'',dataset:{},style:{}}},head:{appendChild(){}}};
const MSOS4={ui:{},state:{athletes:[
  {id:'matt',full_name:'Matthew Callow',active:true},
  {id:'charlotte',full_name:'Charlotte Murphy',active:true},
  {id:'elsie',full_name:'Elsie Knowles',active:true},
  {id:'conor',full_name:'Conor Fischer',active:true}
]},util:{text:v=>String(v??'').replace(/\s+/g,' ').trim()}};
const sandbox={globalThis:null,MSOS4,document,window:{},indexedDB:{},URL,setTimeout,console};sandbox.globalThis=sandbox;
vm.runInNewContext(code,sandbox,{filename:'meet-field-au.js'});

const parse=MSOS4.meetFieldPatch.parseHytekProgramme;
const src=`Moana Pool - Site License HY-TEK's MEET MANAGER 8.0 - 4:41 PM 26/08/2026 Page 1
South Island SCM Championships 2026 - 28/08/2026 to 30/08/2026
Meet Program - Friday Morning - warmup from 7.30am
Event 1 Men 12 & Over 200 SC Meter IM
Heat 4 of 5 Prelims Starts at 08:27 AM
4 Matthew Callow 13 AQGCB 2:19.53
5 Rival Swimmer 15 NEPOT 2:20.04
Event 4 Women 12 & Over 100 SC Meter Backstroke
Heat 1 of 7 Prelims Starts at 09:06 AM
3 Charlotte Murphy S6/Sb6/Sm6 18 AQGCB 1:52.23
Heat 2 Prelims (#4 Women 12 & Over 100 SC Meter Backstroke)
2 Elsie Knowles 14 AQGCB 1:33.63
Event 9 Men 12 & Over 200 SC Meter Breaststroke
Heat 1 of 3 Prelims Starts at 10:07 AM
3 Conor Fischer S7/Sb7/Sm7 16 AQGCB 4:11.19
Event 11 Men 12 & Over 1500 SC Meter Freestyle
Heat 2 of 2 Finals - Swimming with Finals
5 Rival Finalist 18 WHACB 16:25.09`;
const out=parse(src);
assert.equal(out.title,'South Island SCM Championships 2026');
assert.equal(out.session,'Friday Morning - warmup from 7.30am');
assert.equal(out.races.length,4,'SISC AQGCB rows must be retained while other clubs stay filtered');
assert.deepEqual([...out.swimmers].sort(),['Charlotte Murphy','Conor Fischer','Elsie Knowles','Matthew Callow']);
assert.equal(out.races.find(r=>r.source_name==='Matthew Callow').heat,4);
assert.equal(out.races.find(r=>r.source_name==='Matthew Callow').start_time,'08:27 AM');
assert.equal(out.races.find(r=>r.source_name==='Charlotte Murphy').classification,'S6/Sb6/Sm6');
assert.equal(out.races.find(r=>r.source_name==='Conor Fischer').classification,'S7/Sb7/Sm7');
assert.equal(out.races.some(r=>/Rival/.test(r.source_name)),false,'other clubs must remain filtered out');
assert.equal(MSOS4.meetFieldPatch.isAquaGymClub('AQGCB'),true);
console.log('MEET_SISC_FORMAT_PASS');
