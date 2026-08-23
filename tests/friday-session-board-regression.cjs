'use strict';
const assert=require('node:assert/strict');

global.window=global;
global.scrollY=0;
global.requestAnimationFrame=fn=>{if(typeof fn==='function')fn();return 1;};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
global.document={addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},body:{dataset:{}}};
global.location={hash:'',href:'https://friday.test/'};
global.history={state:null,replaceState(){},pushState(){},back(){}};
global.addEventListener=()=>{};
global.removeEventListener=()=>{};

require('../app.js');
require('../v4-correct.js');
require('../v4-poolside-core.js');

const source=`WARM-UP
4 x 250
Makeup: 100 IM / 100 Free / 50 #1 Hands by Side
Rest · 15 sec
4 x 100 Kick @ 2:20
Descend 1—4
4 x 75 Fins @ 1:45
Makeup: 25 Swim / 25 Kick + Streamline Build / 25 Max Distance Underwater
400 FOB
Fly Kick on Back in Streamline
Increase Distance Underwater Every 100

MAIN SET
400 Regeneration
3 x 200 Development
Rest · 10 sec
3 x 100 IM @ 1:45
Descend 1—3
4 x 150 Overload to Threshold
Rest · 30 sec
100 #1 Drill @ 2:30
100 #1 Build @ 2:00
3 x 50 #1 @ 200 Pace
#1 @ 1:00
#2 @ 1:15
#3 @ 1:30
100 #1 @ 200 Pace @ 2:00
4 x 25 @ 0:45
Makeup: 12.5 Kayak Kick / 12.5 Slip / Hold Body Line
Reset Body Line
100 #1 Build @ 2:00
3 x 50 #1 @ 200 Pace
#1 @ 1:00
#2 @ 1:15
#3 @ 1:30
100 #1 @ 200 Pace @ 2:00
4 x 25 @ 0:45
Makeup: 12.5 Kayak Kick / 12.5 Slip / Hold Body Line
Reset Body Line

POST-SET
5 x 200 Pull
Rest · 10 sec

WARM-DOWN
200 Easy
TOTAL 6200m`;

const M=global.MSOS4;
const session=M.parser.parse(source,{id:'friday-contract',date:'2026-08-22',dayPart:'AM',course:'SCM',squads:['National','Development']});
const diagnosticMain=session.blocks.find(b=>b.type==='main_set');
console.log('FRIDAY_MAIN_ITEMS',diagnosticMain.items.map(x=>`${x.kind}:${x.reps||1}x${x.distance||0}:${x.raw||x.text||''}`).join(' | '));
assert.deepEqual(session.blocks.map(M.session.blockDistance),[2100,2900,1000,200],'Friday block totals expose exactly where parser lost work');
assert.equal(M.session.total(session),6200,'exact Friday source must parse to written 6200m');
assert.equal(Number(session.metadata.explicitTotal),6200);

const main=diagnosticMain;
const dev=main.items.find(x=>x.kind==='set'&&x.reps===3&&x.distance===200);
assert.equal(dev.zone,'Development','3x200 Development lost its authored zone');
assert.equal(dev.restSeconds,10,'3x200 Development lost authored 10 sec rest');

const olThr=main.items.find(x=>x.kind==='set'&&x.reps===4&&x.distance===150);
assert.deepEqual(olThr.repPattern.map(x=>x.zone),['Overload','Overload','Threshold','Threshold'],'Overload to Threshold must resolve 2 OL / 2 THR');
assert.equal(olThr.restSeconds,30);

const im=main.items.find(x=>x.kind==='set'&&x.reps===3&&x.distance===100&&x.stroke==='IM');
assert.equal(im.cycleSeconds,105);

const drill=main.items.find(x=>x.kind==='set'&&x.reps===1&&x.distance===100&&/#1 Drill/i.test(x.raw));
const build=main.items.find(x=>x.kind==='set'&&x.reps===1&&x.distance===100&&/#1 Build/i.test(x.raw));
const fifties=main.items.find(x=>x.kind==='set'&&x.reps===3&&x.distance===50);
assert.ok(drill&&build&&fifties,'Friday single-line / variable-interval fixtures missing');

const Evidence=require('../engines/evidence.js');
global.MSOSEngines={Evidence};
const Aerobic=require('../engines/aerobic.js');global.MSOSEngines.Aerobic=Aerobic;
const RacePace=require('../engines/race-pace.js');global.MSOSEngines.RacePace=RacePace;
const Modification=require('../engines/modification.js');global.MSOSEngines.Modification=Modification;
const Coordinator=require('../engines/coordinator.js');global.MSOSEngines.Coordinator=Coordinator;
require('../engines/board.js');
const B=M.boardEngine;

assert.equal(B.workLabel(dev),'3×200 DEV');
assert.match(B.cueText(dev),/Rest · 10 sec/);
assert.equal(B.workLabel(olThr),'4×150');
assert.match(B.cueText(olThr),/2 OL \/ 2 THR/);
assert.match(B.cueText(olThr),/Rest · 30 sec/);
assert.equal(B.workLabel(drill),'100 #1 Drill @ 2:30');
assert.equal(B.workLabel(build),'100 #1 Build @ 2:00');
assert.equal(B.workLabel(fifties),'3×50 #1 @ 200 Pace');
assert.match(B.cueText(fifties),/#1 @ 1:00 · #2 @ 1:15 · #3 @ 1:30/);
assert.equal(B.timingIntent(im),true,'explicit IM interval must expose Times/stroke controls');
assert.equal(B.timingIntent(dev),true,'aerobic work must expose Times/stroke controls');

console.log('FRIDAY_SESSION_BOARD_REGRESSION_PASS');
