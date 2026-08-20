'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=process.cwd();
const normStroke=v=>{const s=String(v||'').trim().toLowerCase();if(['free','freestyle','fr'].includes(s))return'Freestyle';if(['back','backstroke','bk'].includes(s))return'Backstroke';if(['breast','breaststroke','br'].includes(s))return'Breaststroke';if(['fly','butterfly'].includes(s))return'Butterfly';if(['im','medley','individual medley'].includes(s))return'IM';return String(v||'').trim();};
const sec=v=>{if(typeof v==='number')return v;const s=String(v||'').trim();if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);const m=s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);return m?Number(m[1])*60+Number(m[2]):NaN;};
const hash=s=>{let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const evidence={stroke:normStroke,course:r=>String(r?.course||r?.pool_course||'').toUpperCase(),distance:r=>Number(r?.distance||r?.event_distance),rowStroke:r=>normStroke(r?.stroke||r?.event_stroke),seconds:r=>Number(r?.result_seconds??r?.time_seconds??r?.seconds),points:r=>Number(r?.wa_points??r?.world_aquatics_points??r?.fina_points??r?.points)};
const sandbox={console,structuredClone,Date,Math,JSON,Map,Set,WeakMap,Promise,CustomEvent:function(){},dispatchEvent(){},addEventListener(){},indexedDB:{},MSOSEngines:{Evidence:evidence},MSOS4:{state:{settings:{},_refs:{}},util:{seconds:sec,clock:s=>String(s),stableId:(p,...x)=>`${p}-${hash(x.join('|'))}`,uid:p=>`${p}-fixture`,hash,escape:String},access:{role:()=> 'owner'}}};
sandbox.globalThis=sandbox;
const run=file=>vm.runInNewContext(fs.readFileSync(`${root}/${file}`,'utf8'),sandbox,{filename:file});
run('engines/data-registry.js');
run('engines/wa-base-times-2026.js');
run('engines/wa-points.js');

const W=sandbox.MSOS4.waPointsEngine,D=sandbox.MSOS4.dataRegistry;
assert.equal(W.tableInfo().rows,70,'official built-in WA base-time set must contain 70 individual sex/course/event rows');
const ashley={id:'ashley',sex:'F'},pb={course:'SCM',distance:50,stroke:'Freestyle',result_seconds:31.05,wa_points:999};
const rank=W.pointsFor(ashley,pb,sandbox.MSOS4.state);
assert.equal(rank.points,397,'active WA base-time calculator must override stale stored result points');
assert.equal(rank.calculated,true,'rank must be calculated from active base time');
assert.match(rank.tableVersion,/WA active 2026/i,'active table version must be exposed');
assert.equal(W.calculate(22.83,31.05),397,'WA formula must truncate, not round');

const parsed=D.parseText('course,sex,distance,stroke,base_seconds\nSCM,F,100,Freestyle,50.25','wa-base.csv');
assert.equal(D.detect(parsed),'wa_points','WA base-time file should auto-route to WA points owner');
const waPreview=D.preview('wa_points',parsed,{version:'WA fixture'});
assert.equal(waPreview.validCount,1,'valid WA row should pass preview');
assert.equal(waPreview.def.mode,'replace','WA reference update must be a versioned replacement');
assert.ok(waPreview.def.impact.includes('performance')&&waPreview.def.impact.includes('race_pace'),'WA update must invalidate downstream performance/race pace');

const qt=D.parseText('standard_name,course,sex,age_group,distance,stroke,time\nNAGS 2027,SCM,F,14,100,Breaststroke,1:21.50','NAGS-2027-QT.csv');
assert.equal(D.detect(qt),'meet_qualifying','qualifying-time file should auto-route to Pathway / Meet');
const qtPreview=D.preview('meet_qualifying',qt,{version:'NAGS 2027'});
assert.equal(qtPreview.validCount,1,'qualifying standard should pass preview');
assert.ok(qtPreview.def.impact.includes('pathway')&&qtPreview.def.impact.includes('reports'),'QT update must invalidate pathway and reports');

const refBridge=fs.readFileSync(`${root}/engines/reference-bridge.js`,'utf8');
assert.match(refBridge,/recoverLegacyMissing/,'reference bridge must retain a legacy-evidence recovery path');
assert.match(refBridge,/mclay_swimming_v374_heavy_cache/,'legacy result/reference cache must be merged even when the v4 reference DB already exists');
assert.match(refBridge,/await recoverLegacyMissing\(\)/,'reference boot must recover legacy evidence before declaring itself booted');

console.log('reference-data regression: PASS');
